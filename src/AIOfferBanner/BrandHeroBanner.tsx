import React, { useRef, useState } from 'react';
import { useCachedImage } from './imageCache';
import './AIOfferBanner.css';

export interface BrandHeroBannerProps {
  logoUrl: string;
  name: string;
  tagline: string;
}

/**
 * Brand banner: logo on the left, name and tagline on the right, with a 3D tilt that follows the pointer.
 * The tilt is written straight to CSS variables (no React state), so moving the pointer never re-renders the page.
 */
export default function BrandHeroBanner({ logoUrl, name, tagline }: BrandHeroBannerProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const cachedLogo = useCachedImage(logoUrl);

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width - 0.5;
      const y = (clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
    });
  };

  const reset = () => {
    cancelAnimationFrame(frameRef.current);
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  };

  return (
    <header className="mr-hero" onPointerMove={handleMove} onPointerLeave={reset}>
      <div className="mr-hero-card" ref={cardRef}>
        {logoFailed ? (
          <div className="mr-hero-logo mr-hero-monogram" aria-hidden="true">MR</div>
        ) : (
          <img
            className="mr-hero-logo"
            src={cachedLogo ?? logoUrl}
            alt={`${name} logo`}
            width={96}
            height={96}
            decoding="async"
            onError={() => setLogoFailed(true)}
          />
        )}
        <div className="mr-hero-copy">
          <h1 className="mr-hero-title">{name}</h1>
          <p className="mr-hero-tagline">{tagline}</p>
        </div>
      </div>
    </header>
  );
}
