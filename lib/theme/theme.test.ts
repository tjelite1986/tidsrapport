import { describe, it, expect } from 'vitest';
import { normalizeTheme, resolveTheme, THEME_INIT_SCRIPT } from './theme';

describe('theme', () => {
  it('normalizes unknown values to system', () => {
    expect(normalizeTheme(null)).toBe('system');
    expect(normalizeTheme('purple')).toBe('system');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('light')).toBe('light');
  });
  it('resolves system from the OS preference and honours explicit choices', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('init script is valid JavaScript', () => {
    expect(() => new Function(THEME_INIT_SCRIPT)).not.toThrow();
  });
});
