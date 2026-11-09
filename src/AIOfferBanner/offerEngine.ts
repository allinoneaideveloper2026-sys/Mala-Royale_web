import type { Product } from '../../domain/types';
import { DAY_MS, productCreatedMs } from '../../analytics/orderMetrics';

/*
 * Offer engine: decides WHICH offers to show and writes the copy for them.
 * It is a pure function of (catalogue, browsing context, cart), so it is easy to test and has no side effects.
 *
 * Signals used:
 *  - time spent per category and products viewed (the browsing context, kept in the visitor's own browser)
 *  - what is new in the catalogue, what is on offer, and what is nearly sold out
 *  - whether the visitor has items waiting in the cart, and whether they are returning
 */

export interface BrowsingContext {
  visits: number;
  previousVisit: number;
  lastVisit: number;
  categorySeconds: Record<string, number>;
  productViews: Record<string, number>;
  addedToCart: Record<string, number>;
  dismissed: Record<string, number>;
}

export const EMPTY_CONTEXT: BrowsingContext = {
  visits: 0,
  previousVisit: 0,
  lastVisit: 0,
  categorySeconds: {},
  productViews: {},
  addedToCart: {},
  dismissed: {},
};

export type OfferAction =
  | { type: 'shop-category'; category: string; onlyOffers?: boolean }
  | { type: 'show-new' }
  | { type: 'show-offers' }
  | { type: 'open-cart' };

export type OfferKind = 'brand' | 'category' | 'new' | 'cart' | 'lowstock' | 'welcome' | 'offers';
export type OfferAccent = 'maroon' | 'gold' | 'emerald' | 'rose';

export interface Offer {
  id: string;
  kind: OfferKind;
  headline: string;
  subline: string;
  cta: { label: string; action: OfferAction };
  badge?: string;
  imageUrl?: string;
  accent: OfferAccent;
  priority: number;
}

export interface OfferInput {
  products: Product[];
  context: BrowsingContext;
  activeCategory: string;
  cartCount: number;
  now: number;
}

/** Seconds on a category before it counts as an interest signal. */
export const CATEGORY_INTEREST_SECONDS = 20;
const NEW_PRODUCT_DAYS = 7;
const DISMISS_HOURS = 24;
const MAX_OFFERS = 4;

const isBuyable = (product: Product): boolean => {
  if (product.status === 'COMING_SOON' || product.status === 'OUT_OF_STOCK') return false;
  return !(typeof product.quantity === 'number' && product.quantity <= 0);
};

export const discountPercent = (product: Product): number => (
  product.offerPrice && product.offerPrice < product.price
    ? Math.round(((product.price - product.offerPrice) / product.price) * 100)
    : 0
);

export const isNewProduct = (product: Product, now: number = Date.now(), days: number = NEW_PRODUCT_DAYS): boolean => {
  const created = productCreatedMs(product);
  return created > 0 && now - created <= days * DAY_MS;
};

/** Badges shown on product cards, e.g. ['NEW', '-20%']. */
export const cardBadges = (product: Product, now: number = Date.now()): string[] => {
  const badges: string[] = [];
  if (isNewProduct(product, now) && isBuyable(product)) badges.push('NEW');
  const percent = discountPercent(product);
  if (percent > 0 && isBuyable(product)) badges.push(`-${percent}%`);
  return badges;
};

const firstImage = (product: Product): string | undefined => (
  product.media?.find(item => item.type === 'image')?.url || product.image || undefined
);

/** Stable pseudo-random pick so copy does not flicker between renders but varies day to day. */
function pick<T>(seed: string, options: T[]): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return options[hash % options.length];
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function buildOffers(input: OfferInput): Offer[] {
  const { products, context, activeCategory, cartCount, now } = input;
  const day = String(Math.floor(now / DAY_MS));
  const buyable = products.filter(isBuyable);
  const offers: Offer[] = [];

  /* Interest: the category the visitor spent most time in (including the one open right now). */
  const interest = Object.entries(context.categorySeconds)
    .filter(([category]) => category !== 'All')
    .sort((left, right) => right[1] - left[1]);
  const topInterest = interest.find(([, seconds]) => seconds >= CATEGORY_INTEREST_SECONDS)?.[0];
  const focusCategory = topInterest || (activeCategory !== 'All' ? activeCategory : undefined);

  /* 1. Cart reminder. */
  if (cartCount > 0) {
    offers.push({
      id: 'cart-waiting',
      kind: 'cart',
      priority: 90,
      accent: 'emerald',
      badge: plural(cartCount, 'item'),
      headline: pick(`cart${day}`, [
        'Your cart is waiting for you',
        'Ready when you are: your cart is saved',
        'Pieces you loved are still in your cart',
      ]),
      subline: 'Finish your order while they are still in stock.',
      cta: { label: 'Review cart', action: { type: 'open-cart' } },
    });
  }

  /* 2. Low stock in something the visitor cares about. */
  const viewedIds = new Set(Object.keys(context.productViews).concat(Object.keys(context.addedToCart)));
  const scarce = buyable
    .filter(product => typeof product.quantity === 'number' && product.quantity <= 3)
    .sort((left, right) => {
      const leftScore = (viewedIds.has(left.id) ? 2 : 0) + (left.category === focusCategory ? 1 : 0);
      const rightScore = (viewedIds.has(right.id) ? 2 : 0) + (right.category === focusCategory ? 1 : 0);
      return rightScore - leftScore || (left.quantity ?? 0) - (right.quantity ?? 0);
    })[0];
  if (scarce) {
    const relevant = viewedIds.has(scarce.id) || scarce.category === focusCategory;
    offers.push({
      id: `lowstock-${scarce.id}-${scarce.quantity}`,
      kind: 'lowstock',
      priority: relevant ? 85 : 60,
      accent: 'rose',
      badge: `Only ${scarce.quantity} left`,
      imageUrl: firstImage(scarce),
      headline: pick(`low${scarce.id}${day}`, [
        `Only ${scarce.quantity} left: ${scarce.name}`,
        `Going fast: ${scarce.name}`,
        `Almost gone: ${scarce.name}`,
      ]),
      subline: 'Handcrafted pieces sell quickly. Grab yours before it is gone.',
      cta: { label: `See ${scarce.category}`, action: { type: 'shop-category', category: scarce.category } },
    });
  }

  /* 3. Category offer based on interest. */
  if (focusCategory) {
    const discounted = buyable.filter(product => product.category === focusCategory && discountPercent(product) > 0);
    if (discounted.length > 0) {
      const maxPercent = Math.max(...discounted.map(discountPercent));
      const showcase = [...discounted].sort((left, right) => discountPercent(right) - discountPercent(left))[0];
      offers.push({
        id: `category-${focusCategory}-${maxPercent}`,
        kind: 'category',
        priority: topInterest ? 80 : 65,
        accent: 'gold',
        badge: `Up to ${maxPercent}% off`,
        imageUrl: firstImage(showcase),
        headline: pick(`cat${focusCategory}${day}`, [
          `${focusCategory} you will love: up to ${maxPercent}% off`,
          `Still thinking about ${focusCategory}? Save up to ${maxPercent}%`,
          `Handpicked ${focusCategory}, now up to ${maxPercent}% off`,
        ]),
        subline: `${plural(discounted.length, 'piece')} on offer right now. Limited stock.`,
        cta: { label: `Shop ${focusCategory} offers`, action: { type: 'shop-category', category: focusCategory, onlyOffers: true } },
      });
    }
  }

  /* 4. New arrivals. */
  const fresh = buyable
    .filter(product => isNewProduct(product, now))
    .sort((left, right) => productCreatedMs(right) - productCreatedMs(left));
  if (fresh.length > 0) {
    const names = fresh.slice(0, 2).map(product => product.name).join(' and ');
    offers.push({
      id: `new-${fresh[0].id}-${fresh.length}`,
      kind: 'new',
      priority: 70,
      accent: 'maroon',
      badge: 'NEW',
      imageUrl: firstImage(fresh[0]),
      headline: pick(`new${fresh[0].id}${day}`, [
        `Just landed: ${plural(fresh.length, 'new arrival')}`,
        `Fresh from our studio: ${plural(fresh.length, 'new piece')}`,
        `New in at Mala Royale: ${plural(fresh.length, 'arrival')}`,
      ]),
      subline: names,
      cta: { label: 'See what is new', action: { type: 'show-new' } },
    });
  }

  /* 5. Returning visitor. */
  if (context.visits > 1 && context.previousVisit > 0 && now - context.previousVisit > 3 * DAY_MS) {
    const sinceLast = buyable.filter(product => productCreatedMs(product) > context.previousVisit).length;
    offers.push({
      id: `welcome-${context.visits}`,
      kind: 'welcome',
      priority: 55,
      accent: 'maroon',
      badge: 'Welcome back',
      headline: 'Good to see you again',
      subline: sinceLast > 0 ? `${plural(sinceLast, 'new piece')} since your last visit.` : 'We have refreshed the collection for you.',
      cta: sinceLast > 0 ? { label: 'See what is new', action: { type: 'show-new' } } : { label: 'Browse offers', action: { type: 'show-offers' } },
    });
  }

  /* 6. Storewide offers. */
  const allDiscounted = buyable.filter(product => discountPercent(product) > 0);
  if (allDiscounted.length > 0) {
    const maxPercent = Math.max(...allDiscounted.map(discountPercent));
    const showcase = [...allDiscounted].sort((left, right) => discountPercent(right) - discountPercent(left))[0];
    offers.push({
      id: `offers-${maxPercent}-${allDiscounted.length}`,
      kind: 'offers',
      priority: 50,
      accent: 'gold',
      badge: `Up to ${maxPercent}% off`,
      imageUrl: firstImage(showcase),
      headline: pick(`offers${day}`, [
        `Special offers: up to ${maxPercent}% off`,
        `Treat yourself: save up to ${maxPercent}%`,
        `Limited-time prices on ${plural(allDiscounted.length, 'piece')}`,
      ]),
      subline: 'Premium sarees and custom kuchu at special prices.',
      cta: { label: 'Shop offers', action: { type: 'show-offers' } },
    });
  }

  /* 7. Brand fallback, so there is always something on screen. */
  offers.push({
    id: 'brand',
    kind: 'brand',
    priority: 10,
    accent: 'maroon',
    badge: 'Mala Royale',
    headline: 'Handcrafted sarees and custom kuchu',
    subline: 'Premium weaves, made to be treasured.',
    cta: { label: 'Shop the collection', action: { type: 'shop-category', category: 'All' } },
  });

  /* Hide offers the visitor dismissed recently, then rank. */
  const cutoff = now - DISMISS_HOURS * 60 * 60 * 1000;
  return offers
    .filter(offer => !(context.dismissed[offer.id] && context.dismissed[offer.id] > cutoff))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, MAX_OFFERS);
}
