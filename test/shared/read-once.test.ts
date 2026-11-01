import { describe, expect, it, vi } from 'vitest';
import { readOnce } from '../../src/shared/read-once.js';

describe('readOnce', () => {
  it('reads once and shares the value with every call, concurrent ones included', async () => {
    const read = vi.fn(() => Promise.resolve('value'));
    const getValue = readOnce(read);

    await expect(Promise.all([getValue(), getValue()])).resolves.toEqual(['value', 'value']);
    await expect(getValue()).resolves.toBe('value');

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed read, so the next call tries again', async () => {
    const read = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('throttled'))
      .mockResolvedValueOnce('value');
    const getValue = readOnce(read);

    await expect(getValue()).rejects.toThrow('throttled');
    await expect(getValue()).resolves.toBe('value');

    expect(read).toHaveBeenCalledTimes(2);
  });
});
