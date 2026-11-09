import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '../../domain/types';
import { buildOffers, type BrowsingContext, type OfferAction } from './offerEngine';
import { cacheImage, optimizeImageUrl, useCachedImage } from './imageCache';
import './AIOfferBanner.css';

export interface AIOfferBannerContainerProps {
  products: Product[];
  context: BrowsingContext;
  activeCategory: string;
  cartCount: number;
  onAction: (action: OfferAction) => void;
  onDismiss: (offerId: string) => void;
  /** Milliseconds each offer stays on screen before the next one slides in. */
  rotateMs?: number;
}

const EXIT_MS = 240;

const prefersReducedMotion = (): boolean => (
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

/**
 * Sticky, glass-style offer banner. It shows the most relevant offer first, rotates through the others,
 * animates in and out with CSS (transform and opacity only), and reserves its height so nothing shifts.
 */
export default function AIOfferBannerContainer({
  products,
  context,
  activeCategory,
  cartCount,
  onAction,
  onDismiss,
  rotateMs = 7000,
}: AIOfferBannerContainerProps) {
  const offers = useMemo(
    () => buildOffers({ products, context, activeCategory, cartCount, now: Date.now() }),
    [products, context, activeCategory, cartCount],
  );
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const timers = useRef<number[]>([]);

  const count = offers.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const current = offers[safeIndex];
  const currentImage = current?.imageUrl ? optimizeImageUrl(current.imageUrl, 160) : undefined;
  const imageSrc = useCachedImage(currentImage);

  /* Warm the cache for every offer image so the next slide appears instantly. */
  useEffect(() => {
    offers.forEach(offer => {
      if (offer.imageUrl) void cacheImage(optimizeImageUrl(offer.imageUrl, 160));
    });
  }, [offers]);

  useEffect(() => {
    setImageReady(false);
  }, [imageSrc]);

  useEffect(() => () => {
    timers.current.forEach(timer => window.clearTimeout(timer));
  }, []);

  const later = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  };

  const goTo = (next: number) => {
    if (leaving || count < 2) return;
    if (prefersReducedMotion()) {
      setIndex(((next % count) + count) % count);
      return;
    }
    setLeaving(true);
    later(() => {
      setIndex(((next % count) + count) % count);
      setLeaving(false);
    }, EXIT_MS);
  };

  /* Auto-rotate, paused while the visitor hovers or focuses the banner. */
  useEffect(() => {
    if (paused || leaving || count < 2 || prefersReducedMotion()) return undefined;
    const timer = window.setTimeout(() => goTo(safeIndex + 1), rotateMs);
    return () => window.clearTimeout(timer);
  }, [paused, leaving, count, safeIndex, rotateMs]);

  if (!current) return null;

  const dismiss = () => {
    if (prefersReducedMotion()) {
      onDismiss(current.id);
      return;
    }
    setLeaving(true);
    later(() => {
      onDismiss(current.id);
      setLeaving(false);
      setIndex(0);
    }, EXIT_MS);
  };

  return (
    <section className="mr-offer-slot" aria-label="Offers and updates">
      <div
        key={current.id}
        className={`mr-offer mr-accent-${current.accent} ${leaving ? 'mr-offer-out' : 'mr-offer-in'}`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        aria-live="polite"
      >
        <div className="mr-offer-media" aria-hidden="true">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              width={52}
              height={52}
              loading="lazy"
              decoding="async"
              className={imageReady ? 'is-loaded' : undefined}
              onLoad={() => setImageReady(true)}
            />
          ) : (
            <span className="mr-offer-glyph">✦</span>
          )}
        </div>

        <div className="mr-offer-copy">
          {current.badge && <span className="mr-offer-badge">{current.badge}</span>}
          <strong className="mr-offer-headline">{current.headline}</strong>
          <span className="mr-offer-sub">{current.subline}</span>
        </div>

        <button type="button" className="mr-offer-cta" onClick={() => onAction(current.cta.action)}>
          {current.cta.label}<span aria-hidden="true"> →</span>
        </button>

        <button type="button" className="mr-offer-close" aria-label="Dismiss this offer" onClick={dismiss}>✕</button>

        {count > 1 && (
          <div className="mr-offer-dots">
            {offers.map((offer, dotIndex) => (
              <button
                key={offer.id}
                type="button"
                className={`mr-offer-dot${dotIndex === safeIndex ? ' is-active' : ''}`}
                aria-label={`Show offer ${dotIndex + 1} of ${count}`}
                onClick={() => goTo(dotIndex)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
