import React, { useEffect, useRef, useState } from 'react';
import type { Order, Product } from '../../domain/types';
import { useTr } from '../../lang/ui';
import { cardBadges, discountPercent } from '../AIOfferBanner/offerEngine';
import { optimizeImageUrl } from '../AIOfferBanner/imageCache';
import './Storefront.css';

const reducedMotion = (): boolean => (
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

/* ---------------------------------------------------------------- ScrollReveal */

export interface ScrollRevealProps {
  children: React.ReactNode;
  delay?: number;
  from?: 'up' | 'left' | 'right' | 'zoom';
  className?: string;
}

/** Fades and slides its content in the first time it scrolls into view. */
export function ScrollReveal({ children, delay = 0, from = 'up', className = '' }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const direction = from === 'up' ? '' : ` mr-from-${from}`;
  return (
    <div ref={ref} className={`mr-reveal${direction}${visible ? ' is-visible' : ''} ${className}`.trim()} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- headings */

export function SectionHeading({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <ScrollReveal>
      <span className="mr-kicker">{kicker}</span>
      <h2 className="mr-section-title">{title}</h2>
      {subtitle && <p className="mr-section-sub">{subtitle}</p>}
    </ScrollReveal>
  );
}

/* ---------------------------------------------------------------- value strip */

export function ValueStrip() {
  const tr = useTr();
  const items = [
    tr('Genuine and hand-picked'),
    tr('Luxury at the best price'),
    tr('Trending styles'),
    tr('Hassle-free ordering'),
    tr('Made with love for women'),
  ];
  const loop = [...items, ...items];
  return (
    <div className="mr-marquee" aria-label={tr('What we stand for')} role="region">
      <div className="mr-marquee-track">
        {loop.map((item, index) => <span key={`${item}-${index}`} className="mr-marquee-item" aria-hidden={index >= items.length}>{item}</span>)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- featured showcase */

export interface StoryShowcaseProps {
  products: Product[];
  onSelect: (product: Product) => void;
}

const priceOf = (product: Product) => product.offerPrice || product.price;

export function StoryShowcase({ products, onSelect }: StoryShowcaseProps) {
  const tr = useTr();
  const now = Date.now();
  const featured = [...products]
    .filter(product => product.status !== 'COMING_SOON' && !(typeof product.quantity === 'number' && product.quantity <= 0))
    .sort((left, right) => cardBadges(right, now).length - cardBadges(left, now).length)
    .slice(0, 8);
  if (featured.length < 3) return null;

  return (
    <section className="mr-section" aria-label={tr('Featured pieces')}>
      <SectionHeading
        kicker={tr('Featured')}
        title={tr('Pieces worth a second look')}
        subtitle={tr('New arrivals and special offers, picked for you. Tap a piece to see it in the collection.')}
      />
      <div className="mr-showcase">
        {featured.map((product, index) => {
          const image = product.media?.find(item => item.type === 'image')?.url || product.image;
          return (
            <ScrollReveal key={product.id} delay={index * 90} from="right">
              <button type="button" className="mr-showcase-card" onClick={() => onSelect(product)} aria-label={`${product.name}, ₹${priceOf(product)}`}>
                <div className="mr-showcase-media">
                  <img src={optimizeImageUrl(image, 480)} alt="" loading="lazy" decoding="async" width={240} height={300} />
                </div>
                <div className="mr-showcase-badges">
                  {cardBadges(product, now).map(badge => <span key={badge} className={`mr-badge${badge === 'NEW' ? ' mr-badge-new' : ''}`}>{badge}</span>)}
                </div>
                <div className="mr-showcase-body">
                  <p className="mr-showcase-name">{product.name}</p>
                  <div className="mr-showcase-price">
                    ₹{priceOf(product)}
                    {discountPercent(product) > 0 && <s>₹{product.price}</s>}
                  </div>
                  <div className="mr-showcase-cta">{tr('View in collection')} <span aria-hidden="true">→</span></div>
                </div>
              </button>
            </ScrollReveal>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- how it works */

export function HowItWorks() {
  const tr = useTr();
  const steps = [
    { title: tr('Choose your piece'), text: tr('Browse sarees and custom kuchu, check the photos in full size and add your favourites to the cart.') },
    { title: tr('Pay by UPI'), text: tr('Scan the shop QR, pay securely and enter the 12-digit UTR number from your payment app.') },
    { title: tr('We confirm on WhatsApp'), text: tr('We check your address and payment, then confirm your order and share updates with you.') },
    { title: tr('Delivered to your door'), text: tr('We pack with care and send it by courier. Track every step in Recent orders.') },
  ];
  return (
    <section className="mr-section" aria-label={tr('How ordering works')}>
      <SectionHeading
        kicker={tr('Simple and safe')}
        title={tr('Ordering made hassle-free')}
        subtitle={tr('From first look to your doorstep in four easy steps.')}
      />
      <div className="mr-steps">
        {steps.map((step, index) => (
          <ScrollReveal key={step.title} delay={index * 130} from="zoom">
            <div className="mr-step">
              <span className="mr-step-number">{index + 1}</span>
              <h4>{step.title}</h4>
              <p>{step.text}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- order timeline */

/** Shows where an order is: placed, payment confirmed, address confirmed, dispatched, delivered. */
export function OrderTimeline({ order }: { order: Order }) {
  const tr = useTr();

  if (order.stage === 'NOT_ACCEPTED' || order.stage === 'CANCELLED') {
    return (
      <div role="status" style={{ margin: '0.8rem 0', padding: '0.8rem', borderRadius: '10px', background: '#fdecea', border: '1px solid #f5c2c0', color: '#7a1b1b' }}>
        <strong>{tr('This order could not be accepted')}</strong>
        {order.rejectionReason && <p style={{ margin: '0.4rem 0 0' }}>{tr('Reason')}: {order.rejectionReason}</p>}
        {order.rejectionNote && <p style={{ margin: '0.3rem 0 0', whiteSpace: 'pre-wrap' }}>{order.rejectionNote}</p>}
      </div>
    );
  }

  const dispatched = order.stage === 'SUBMITTED_FOR_DISPATCH' || order.stage === 'DELIVERED';
  const steps = [
    { label: tr('Order placed'), done: true },
    { label: tr('Payment confirmed'), done: Boolean(order.itemPayment?.verified) },
    { label: tr('Address confirmed'), done: Boolean(order.deliveryConfirmed) },
    { label: tr('Dispatched'), done: dispatched },
    { label: tr('Delivered'), done: order.stage === 'DELIVERED' },
  ];
  const currentIndex = steps.findIndex(step => !step.done);

  return (
    <ol className="mr-timeline" aria-label={tr('Order progress')}>
      {steps.map((step, index) => (
        <li key={step.label} className={step.done ? 'is-done' : index === currentIndex ? 'is-current' : ''}>
          <span className="mr-timeline-dot" aria-hidden="true">{step.done ? '✓' : ''}</span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
