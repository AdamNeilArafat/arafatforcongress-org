import { describe, expect, it } from 'vitest';
import { mergeScript } from '../lib/scripts/merge';

describe('script merge', () => {
  it('replaces merge variables', () => {
    const message = mergeScript('Hi {{first_name}} in {{city}}', { first_name: 'Ana', city: 'Tacoma' });
    expect(message).toBe('Hi Ana in Tacoma');
  });
});
