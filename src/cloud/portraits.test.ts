import { beforeEach, describe, expect, it, vi } from 'vitest';

const upload = vi.fn();
vi.mock('./client', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => upload(...a),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/portraits/${path}` } }),
      }),
    },
  },
}));
vi.mock('./auth', async () => {
  const { create } = await import('zustand');
  return { useAuth: create(() => ({ user: null as null | { id: string } })) };
});

const { isStoredPortrait, portraitPath, storePortrait } = await import('./portraits');
const { useAuth } = await import('./auth');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('pictures in Storage', () => {
  beforeEach(() => {
    upload.mockReset();
    useAuth.setState({ user: null });
  });

  it('recognises our own Storage addresses only', () => {
    expect(isStoredPortrait('https://lnvrptqcjcmvsmeprkfk.supabase.co/storage/v1/object/public/portraits/u/a.jpg')).toBe(true);
    expect(isStoredPortrait('data:image/jpeg;base64,AAA')).toBe(false);
    expect(isStoredPortrait('https://evil.example.com/portraits/a.jpg')).toBe(false);
    expect(isStoredPortrait(undefined)).toBe(false);
  });

  it('each person writes inside their own folder', () => {
    expect(portraitPath('user-1', 'abc')).toBe('user-1/abc.jpg');
  });

  it('signed out, the picture stays inline', async () => {
    expect(await storePortrait(PNG)).toBe(PNG);
    expect(upload).not.toHaveBeenCalled();
  });

  it('signed in, it is uploaded to the person folder and the address comes back', async () => {
    useAuth.setState({ user: { id: 'user-1' } });
    upload.mockResolvedValue({ error: null });
    const url = await storePortrait(PNG);
    expect(upload.mock.calls[0][0]).toMatch(/^user-1\/.+\.jpg$/);
    expect(isStoredPortrait(url)).toBe(true);
  });

  it('if the upload fails, nothing is lost: the inline picture is kept', async () => {
    useAuth.setState({ user: { id: 'user-1' } });
    upload.mockResolvedValue({ error: { message: 'Payload too large' } });
    expect(await storePortrait(PNG)).toBe(PNG);
  });
});
