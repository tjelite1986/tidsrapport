#!/usr/bin/env bash
# deploy.sh — deploy the pushed HEAD commit to the Pi, deterministically.
#
# Problem this solves: `git push` only builds an image once CI finishes, and
# `gh run watch` can return early on a just-registered run while `gh run list
# --limit 1` may resolve a stale run — so a manual `compose pull` can grab the
# OLD `latest` digest and `up -d` no-ops ("Running", not "Recreated"), leaving
# the new code undeployed but looking deployed.
#
# This script keys off the current HEAD sha: it finds THAT commit's CI run,
# polls it to a terminal state, requires success, then pulls + recreates and
# verifies the running image id actually changed.
#
# Usage: scripts/deploy.sh            # deploy current HEAD
#        COMPOSE_DIR=... scripts/deploy.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-/home/thomas/docker2/tidsrapport}"
CONTAINER="${CONTAINER:-tidsrapport}"
POLL_SECS="${POLL_SECS:-20}"

cd "$REPO_DIR"
SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
echo "Deploying $SHORT ($(git log -1 --format=%s))"

# Make sure the commit is actually pushed, else CI will never run for it.
if ! git branch -r --contains "$SHA" 2>/dev/null | grep -q .; then
  echo "ERROR: HEAD ($SHORT) is not on any remote branch — push first." >&2
  exit 1
fi

# Find the CI run for THIS sha (scan recent runs, not --limit 1).
echo "Locating CI run for $SHORT ..."
RID=""
for _ in $(seq 1 15); do
  RID="$(gh run list --limit 20 --json databaseId,headSha \
        -q "[.[] | select(.headSha == \"$SHA\")][0].databaseId" 2>/dev/null || true)"
  [ -n "$RID" ] && [ "$RID" != "null" ] && break
  sleep 5
done
if [ -z "$RID" ] || [ "$RID" = "null" ]; then
  echo "ERROR: no CI run found for $SHA after waiting." >&2
  exit 1
fi
echo "CI run: $RID — polling to completion ..."

# Poll to terminal state.
while true; do
  ST="$(gh run view "$RID" --json status,conclusion -q '.status+" "+(.conclusion // "")' 2>/dev/null || true)"
  case "$ST" in
    "completed "*) break ;;
  esac
  printf '  %s\r' "$ST"
  sleep "$POLL_SECS"
done
CONC="${ST#* }"
echo "CI final: $ST"
[ "$CONC" = "success" ] || { echo "ERROR: CI did not succeed ($CONC); not deploying." >&2; exit 1; }

# Deploy. The host docker daemon — never a remote one.
unset DOCKER_HOST
PREV="$(docker inspect "$CONTAINER" --format '{{.Image}}' 2>/dev/null || echo none)"
echo "Pulling + recreating from $COMPOSE_DIR ..."
( cd "$COMPOSE_DIR" && docker compose pull && docker compose up -d )
sleep 5
NEW="$(docker inspect "$CONTAINER" --format '{{.Image}}' 2>/dev/null || echo none)"

echo "prev image: $PREV"
echo "new  image: $NEW"
if [ "$PREV" = "$NEW" ]; then
  echo "NOTE: image unchanged — either already current (e.g. Watchtower beat us) or nothing new to deploy."
else
  echo "OK: container recreated on the new image."
fi
docker ps --filter "name=$CONTAINER" --format 'status: {{.Status}}'
echo "Tip: after a UI change, hard-refresh the PWA to clear the cached JS bundle."
