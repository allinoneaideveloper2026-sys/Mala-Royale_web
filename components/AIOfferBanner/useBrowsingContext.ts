import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_CONTEXT, type BrowsingContext } from './offerEngine';

/*
 * Keeps a small browsing profile in the visitor's own browser (localStorage). Nothing is sent to a server.
 * It records: how long they spend in each category, which products they open, what they add to the cart,
 * which offers they dismissed, and when they last visited.
 */

const STORAGE_KEY = 'mr:browsing-context:v1';
const SESSION_KEY = 'mr:session-counted';
const DWELL_TICK_MS = 10000;
const DISMISS_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

function loadContext(): BrowsingContext {
  const now = Date.now();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<BrowsingContext>) : {};
    const dismissed: Record<string, number> = {};
    Object.entries(stored.dismissed ?? {}).forEach(([id, at]) => {
      if (typeof at === 'number' && now - at < DISMISS_KEEP_MS) dismissed[id] = at;
    });
    const context: BrowsingContext = {
      ...EMPTY_CONTEXT,
      ...stored,
      categorySeconds: { ...(stored.categorySeconds ?? {}) },
      productViews: { ...(stored.productViews ?? {}) },
      addedToCart: { ...(stored.addedToCart ?? {}) },
      dismissed,
    };
    if (!window.sessionStorage.getItem(SESSION_KEY)) {
      window.sessionStorage.setItem(SESSION_KEY, '1');
      context.visits += 1;
      context.previousVisit = context.lastVisit;
      context.lastVisit = now;
    }
    return context;
  } catch {
    return { ...EMPTY_CONTEXT, visits: 1, lastVisit: now };
  }
}

export interface BrowsingTracker {
  context: BrowsingContext;
  trackProductView: (productId: string, category?: string) => void;
  trackAddToCart: (productId: string, category?: string) => void;
  dismissOffer: (offerId: string) => void;
}

/**
 * @param activeCategory the category the visitor currently has open ("All" counts for nothing)
 * @param enabled        false for the host and developer, so their browsing never skews the profile
 */
export function useBrowsingContext(activeCategory: string, enabled: boolean): BrowsingTracker {
  const [context, setContext] = useState<BrowsingContext>(() => (enabled ? loadContext() : { ...EMPTY_CONTEXT }));
  const categoryRef = useRef(activeCategory);
  categoryRef.current = activeCategory;

  useEffect(() => {
    if (!enabled) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    } catch {
      /* storage can be unavailable (private mode); the profile then lives for this visit only */
    }
  }, [context, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const category = categoryRef.current;
      if (!category || category === 'All') return;
      setContext(current => ({
        ...current,
        categorySeconds: { ...current.categorySeconds, [category]: (current.categorySeconds[category] || 0) + DWELL_TICK_MS / 1000 },
      }));
    }, DWELL_TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const trackProductView = useCallback((productId: string, category?: string) => {
    if (!enabled) return;
    setContext(current => ({
      ...current,
      productViews: { ...current.productViews, [productId]: (current.productViews[productId] || 0) + 1 },
      categorySeconds: category
        ? { ...current.categorySeconds, [category]: (current.categorySeconds[category] || 0) + 5 }
        : current.categorySeconds,
    }));
  }, [enabled]);

  const trackAddToCart = useCallback((productId: string, category?: string) => {
    if (!enabled) return;
    setContext(current => ({
      ...current,
      addedToCart: { ...current.addedToCart, [productId]: (current.addedToCart[productId] || 0) + 1 },
      categorySeconds: category
        ? { ...current.categorySeconds, [category]: (current.categorySeconds[category] || 0) + 15 }
        : current.categorySeconds,
    }));
  }, [enabled]);

  const dismissOffer = useCallback((offerId: string) => {
    setContext(current => ({ ...current, dismissed: { ...current.dismissed, [offerId]: Date.now() } }));
  }, []);

  return { context, trackProductView, trackAddToCart, dismissOffer };
}
