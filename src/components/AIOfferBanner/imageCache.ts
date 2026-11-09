import { useEffect, useState } from 'react';

const CACHE_NAME = 'mr-banner-images-v1';
const memory = new Map<string, Promise<string>>();

/**
 * Asks Cloudinary for a smaller, optimised copy (automatic format and quality).
 * Links that are not Cloudinary uploads, or already carry a transformation, are returned unchanged.
 */
export function optimizeImageUrl(url: string, width = 600): string {
  const marker = '/image/upload/';
  if (!url.includes('res.cloudinary.com') || !url.includes(marker)) return url;
  const [head, tail] = [url.slice(0, url.indexOf(marker) + marker.length), url.slice(url.indexOf(marker) + marker.length)];
  const firstSegment = tail.split('/')[0];
  const hasTransformation = /(^|,)(w|h|c|q|f)_[^/]*/.test(firstSegment) && !/^v\d+$/.test(firstSegment);
  if (hasTransformation) return url;
  return `${head}w_${width},q_auto,f_auto,c_limit/${tail}`;
}

/**
 * Loads an image once and keeps it: first from memory, then from the browser's Cache Storage, then the network.
 * Resolves to a URL that is safe to use as an <img> src. Any failure falls back to the original URL.
 */
export function cacheImage(url: string): Promise<string> {
  const existing = memory.get(url);
  if (existing) return existing;

  const task = (async () => {
    try {
      if (typeof caches !== 'undefined') {
        const cache = await caches.open(CACHE_NAME);
        let response = await cache.match(url);
        if (!response) {
          const fetched = await fetch(url, { mode: 'cors' });
          if (!fetched.ok) throw new Error('Image request failed');
          await cache.put(url, fetched.clone());
          response = fetched;
        }
        return URL.createObjectURL(await response.blob());
      }
    } catch {
      /* fall through to the direct URL */
    }
    return url;
  })();

  memory.set(url, task);
  return task;
}

/** Returns the cached image URL once ready (undefined while loading, so callers can show a placeholder). */
export function useCachedImage(url?: string): string | undefined {
  const [source, setSource] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setSource(undefined);
    if (!url) return undefined;
    void cacheImage(url).then(result => {
      if (active) setSource(result);
    });
    return () => {
      active = false;
    };
  }, [url]);

  return source;
}
