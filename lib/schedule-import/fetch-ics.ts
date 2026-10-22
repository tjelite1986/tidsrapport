/**
 * Fetch a user-supplied calendar link from the server.
 *
 * The URL comes from the user, so this is a server-side request on their
 * behalf: only public https hosts are allowed, every redirect is re-checked,
 * and the body is capped. Without the address check anyone with an account
 * could make the server read the Pi's own LAN services.
 */
import { lookup } from 'dns/promises';
import net from 'net';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export class IcsFetchError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** webcal:// is how calendar apps advertise a subscription; it is plain https underneath. */
export function normalizeIcsUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    throw new IcsFetchError('Invalid URL', 400);
  }
  if (url.protocol !== 'https:') throw new IcsFetchError('Only https links are supported', 400);
  if (url.username || url.password) throw new IcsFetchError('Links with credentials are not supported', 400);
  return url;
}

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
  return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new IcsFetchError('Host not found', 400);
  if (addresses.some(isPrivateAddress)) throw new IcsFetchError('Link points to a private address', 400);
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new IcsFetchError('Calendar is larger than 2 MB', 413);
    }
    chunks.push(value);
  }
  // Decode once at the end so a multi-byte character split across chunks survives
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchIcs(input: string): Promise<string> {
  let url = normalizeIcsUrl(input);
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: { Accept: 'text/calendar, */*;q=0.5' },
        cache: 'no-store',
      });
    } catch {
      throw new IcsFetchError('Could not reach the calendar', 502);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new IcsFetchError('Redirect without a location', 502);
      url = normalizeIcsUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new IcsFetchError(`Calendar answered ${res.status}`, 502);
    return readCapped(res);
  }
  throw new IcsFetchError('Too many redirects', 502);
}
