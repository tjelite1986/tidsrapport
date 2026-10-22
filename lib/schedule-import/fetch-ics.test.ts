import { describe, expect, it } from 'vitest';
import { IcsFetchError, isBlockedAddress, normalizeIcsUrl } from './fetch-ics';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '192.168.0.143', '172.20.0.5', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '198.18.0.1', '::1', '::', 'fd00::1', 'fe80::1',
    // IPv4 embedded in IPv6, in both notations
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:c0a8:8f', '64:ff9b::7f00:1', '2002:7f00:1::',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['20.105.224.16', '1.1.1.1', '2606:4700:4700::1111'])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('normalizeIcsUrl', () => {
  it('turns webcal into https', () => {
    expect(normalizeIcsUrl('webcal://example.com/a.ics').toString()).toBe('https://example.com/a.ics');
  });

  it.each(['http://example.com/a.ics', 'file:///etc/passwd', 'https://u:p@example.com/', 'nope'])(
    'rejects %s',
    (input) => {
      expect(() => normalizeIcsUrl(input)).toThrow(IcsFetchError);
    },
  );
});
