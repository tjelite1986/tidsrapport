# Traefik-setup

Den här guiden visar hur man sätter upp Traefik som reverse proxy med automatiska TLS-certifikat, och sedan kopplar Tidsrapport till det.

## Innehåll

- [Förutsättningar](#förutsättningar)
- [Katalogstruktur](#katalogstruktur)
- [1. Skapa Docker-nätverket](#1-skapa-docker-nätverket)
- [2. Skapa acme.json](#2-skapa-acmejson)
- [3. Traefik-konfiguration (traefik.yml)](#3-traefik-konfiguration-traefikyml)
- [4. Starta Traefik](#4-starta-traefik)
- [5. Starta Tidsrapport med Traefik](#5-starta-tidsrapport-med-traefik)
- [Felsökning](#felsökning)

---

## Förutsättningar

- Docker och Docker Compose installerat
- Ett domännamn med DNS-hantering via Cloudflare (eller annan provider som stöds av Traefik)
- Portar 80 och 443 öppna i brandväggen/routern

---

## Katalogstruktur

```
traefik/
├── docker-compose.yml   # Traefik-containern
├── traefik.yml          # Statisk Traefik-konfiguration
└── acme.json            # Certifikatlagring (skapas manuellt, chmod 600)
```

---

## 1. Skapa Docker-nätverket

Traefik och alla tjänster den proxar måste vara på samma Docker-nätverk.

```bash
docker network create traefik
```

Kontrollera att nätverket finns:

```bash
docker network ls | grep traefik
```

---

## 2. Skapa acme.json

`acme.json` är filen där Traefik lagrar TLS-certifikat från Let's Encrypt. Den måste skapas manuellt med rätt rättigheter — annars vägrar Traefik starta.

```bash
touch acme.json
chmod 600 acme.json
```

Filen ska vara tom från början. Traefik fyller i den automatiskt när den hämtar certifikat.

---

## 3. Traefik-konfiguration (traefik.yml)

Skapa filen `traefik.yml` i samma katalog som Traefik-compose-filen.

### Alternativ A — Cloudflare DNS-challenge (rekommenderat för wildcard-certifikat)

```yaml
api:
  dashboard: true
  insecure: false

entryPoints:
  http:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: https
          scheme: https
          permanent: true
  https:
    address: ":443"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: traefik

certificatesResolvers:
  cloudflare:
    acme:
      email: din-epost@example.com
      storage: /acme.json
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"

serversTransport:
  insecureSkipVerify: true
```

### Alternativ B — HTTP-challenge (enklare, kräver att port 80 är publik)

```yaml
api:
  dashboard: true
  insecure: false

entryPoints:
  http:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: https
          scheme: https
          permanent: true
  https:
    address: ":443"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: traefik

certificatesResolvers:
  letsencrypt:
    acme:
      email: din-epost@example.com
      storage: /acme.json
      httpChallenge:
        entryPoint: http
```

---

## 4. Starta Traefik

Skapa en `docker-compose.yml` för Traefik:

```yaml
services:
  traefik:
    image: traefik:v3
    container_name: traefik
    restart: unless-stopped
    networks:
      - traefik
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/traefik.yml:ro
      - ./acme.json:/acme.json
    # Valfritt – miljövariabler för Cloudflare DNS-challenge
    environment:
      - CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
    labels:
      - "traefik.enable=true"
      # Valfritt – Traefik dashboard (skyddat med basic auth)
      - "traefik.http.routers.traefik-secure.rule=Host(`traefik.example.com`)"
      - "traefik.http.routers.traefik-secure.entrypoints=https"
      - "traefik.http.routers.traefik-secure.tls=true"
      - "traefik.http.routers.traefik-secure.tls.certresolver=cloudflare"
      - "traefik.http.routers.traefik-secure.service=api@internal"
      # HTTP -> HTTPS redirect-middleware (används av andra tjänster)
      - "traefik.http.middlewares.https-redirect.redirectscheme.scheme=https"
      - "traefik.http.middlewares.https-redirect.redirectscheme.permanent=true"
      # SSL-header middleware (behövs om tjänster ligger bakom proxy)
      - "traefik.http.middlewares.sslheader.headers.customrequestheaders.X-Forwarded-Proto=https"

networks:
  traefik:
    external: true
```

Starta Traefik:

```bash
docker compose up -d
```

Kontrollera att Traefik startade korrekt:

```bash
docker logs traefik --tail 30
```

### Cloudflare API-token

Om du använder Cloudflare DNS-challenge behöver Traefik en API-token med behörighet att redigera DNS-poster.

1. Gå till [dash.cloudflare.com](https://dash.cloudflare.com) → My Profile → API Tokens
2. Skapa en token med behörigheten **Zone → DNS → Edit** för din zon
3. Lägg till token i en `.env`-fil bredvid Traefik-compose-filen:

```env
CF_DNS_API_TOKEN=din-cloudflare-api-token
```

---

## 5. Starta Tidsrapport med Traefik

Gå tillbaka till Tidsrapport-katalogen och konfigurera `.env`:

```env
NEXTAUTH_SECRET=    # openssl rand -base64 32
NEXTAUTH_URL=https://tidrapport.example.com
DOMAIN=tidrapport.example.com
CERT_RESOLVER=cloudflare   # eller letsencrypt
```

Starta med Traefik-varianten:

```bash
docker compose -f docker-compose.traefik.yml up -d
```

Kontrollera att certifikat hämtas och appen svarar:

```bash
docker logs traefik --tail 20
curl -I https://tidrapport.example.com
```

---

## Felsökning

### acme.json har fel rättigheter

```
error: file permissions for '/acme.json' are 644, should be 600
```

```bash
chmod 600 acme.json
docker restart traefik
```

### Certifikat hämtas inte (Cloudflare DNS-challenge)

- Kontrollera att `CF_DNS_API_TOKEN` är korrekt satt och att tokenen har rätt behörigheter
- DNS-propagation kan ta några minuter — kontrollera Traefik-loggarna med `docker logs traefik -f`

### Appen nås inte via HTTPS

- Kontrollera att Docker-nätverket `traefik` är externt och att båda containrarna är på det
- Kontrollera att middleware-namnet i `docker-compose.traefik.yml` matchar det som definieras i Traefik-compose-filen (`https-redirect@docker`)
- Verifiera att DNS-posten pekar på serverns IP

### Kontrollera att Traefik känner igen tjänsten

```bash
# Öppna Traefik-dashboarden eller kör:
docker exec traefik wget -qO- http://localhost:8080/api/http/routers | python3 -m json.tool
```
