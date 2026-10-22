/**
 * Fetch a user-supplied calendar link from the server.
 *
 * The URL comes from the user, so this is a server-side request on their
 * behalf: only public https hosts are allowed, every redirect is re-checked,
 * and the body is capped. Without the address check anyone with an account
 * could make the server read the Pi's own LAN services.
 */
import dns from 'dns';
import https from 'https';
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

// Everything that is not ordinary public unicast. IPv6 forms that embed an
// IPv4 address (mapped, NAT64, 6to4, Teredo) are blocked wholesale rather than
// unpacked: no calendar host needs them, and unpacking is where checks slip.
// Two lists, because BlockList checks an IPv4 address against IPv4-mapped IPv6
// rules too: in one list ::ffff:0:0/96 would block every IPv4 host.
const BLOCKED_V4 = new net.BlockList();
const BLOCKED_V6 = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) BLOCKED_V4.addSubnet(prefix, bits, 'ipv4');
for (const [prefix, bits] of [
  ['::', 96], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) BLOCKED_V6.addSubnet(prefix, bits, 'ipv6');

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return true;
  return family === 4 ? BLOCKED_V4.check(address, 'ipv4') : BLOCKED_V6.check(address, 'ipv6');
}

/**
 * DNS lookup for the request itself: the address checked here is the address
 * the socket connects to, so a host cannot answer public for the check and
 * private for the connection (DNS rebinding).
 */
const checkedLookup: typeof dns.lookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0) return callback(new IcsFetchError('Host not found', 400));
    if (list.some((a) => isBlockedAddress(a.address))) {
      return callback(new IcsFetchError('Link points to a private address', 400));
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}) as typeof dns.lookup;

type RawResponse = { status: number; location: string | null; body: string };

function request(url: URL, deadline: number): Promise<RawResponse> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isBlockedAddress(host)) {
    return Promise.reject(new IcsFetchError('Link points to a private address', 400));
  }
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      lookup: checkedLookup,
      headers: { Accept: 'text/calendar, */*;q=0.5', 'User-Agent': 'tidsrapport-schedule-import' },
      timeout: Math.max(1, deadline - Date.now()),
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        clearTimeout(timer);
        res.resume();
        resolve({ status, location: res.headers.location ?? null, body: '' });
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BYTES) {
          req.destroy(new IcsFetchError('Calendar is larger than 2 MB', 413));
          return;
        }
        chunks.push(chunk);
      });
      // Decode once at the end so a multi-byte character split across chunks survives
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status, location: null, body: Buffer.concat(chunks).toString('utf8') });
      });
      res.on('error', reject);
    });
    // The socket timeout is per idle gap only; a server dripping one byte at a
    // time would never trip it, so the whole request also has a hard deadline
    const timer = setTimeout(
      () => req.destroy(new IcsFetchError('Calendar did not answer in time', 502)),
      Math.max(1, deadline - Date.now()),
    );
    req.on('timeout', () => req.destroy(new IcsFetchError('Calendar did not answer in time', 502)));
    req.on('close', () => clearTimeout(timer));
    req.on('error', (err) => reject(err instanceof IcsFetchError ? err : new IcsFetchError('Could not reach the calendar', 502)));
    req.end();
  });
}

export async function fetchIcs(input: string): Promise<string> {
  let url = normalizeIcsUrl(input);
  const deadline = Date.now() + TIMEOUT_MS;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await request(url, deadline);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new IcsFetchError('Redirect without a location', 502);
      url = normalizeIcsUrl(new URL(res.location, url).toString());
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new IcsFetchError(`Calendar answered ${res.status}`, 502);
    return res.body;
  }
  throw new IcsFetchError('Too many redirects', 502);
}
