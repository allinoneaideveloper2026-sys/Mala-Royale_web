import React, { useEffect, useState } from 'react';
import type { Product } from '../../domain/types';
import { useTr } from '../../lang/ui';
import './Storefront.css';

export interface ShareMenuProps {
  product: Product;
  onClose: () => void;
}

/** A link that opens the shared product straight away (the page scrolls to it and highlights it). */
export function productShareUrl(productId: string): string {
  return `${window.location.origin}${window.location.pathname}#product=${encodeURIComponent(productId)}`;
}

interface Target {
  key: string;
  label: string;
  glyph: string;
  color: string;
  href: string;
}

export default function ShareMenu({ product, onClose }: ShareMenuProps) {
  const tr = useTr();
  const [copied, setCopied] = useState(false);
  const url = productShareUrl(product.id);
  const price = product.offerPrice || product.price;
  const message = tr('Look at this at Mala Royale: {name} (₹{price})', { name: product.name, price });
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const image = product.media?.find(item => item.type === 'image')?.url || product.image;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const encodedText = encodeURIComponent(message);
  const encodedUrl = encodeURIComponent(url);
  const targets: Target[] = [
    { key: 'whatsapp', label: 'WhatsApp', glyph: '💬', color: '#25d366', href: `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}` },
    { key: 'telegram', label: 'Telegram', glyph: '✈', color: '#229ed9', href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}` },
    { key: 'facebook', label: 'Facebook', glyph: 'f', color: '#1877f2', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { key: 'x', label: 'X', glyph: '𝕏', color: '#111111', href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}` },
    { key: 'pinterest', label: 'Pinterest', glyph: 'P', color: '#e60023', href: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&media=${encodeURIComponent(image)}&description=${encodedText}` },
    { key: 'email', label: tr('Email'), glyph: '✉', color: '#6e1a3a', href: `mailto:?subject=${encodeURIComponent(product.name)}&body=${encodeURIComponent(`${message}\n${url}`)}` },
    { key: 'sms', label: 'SMS', glyph: '✆', color: '#2e7d32', href: `sms:?&body=${encodeURIComponent(`${message} ${url}`)}` },
  ];

  const nativeShare = async () => {
    try {
      await navigator.share({ title: product.name, text: message, url });
      onClose();
    } catch {
      /* the visitor closed the share sheet; keep this menu open */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt(tr('Copy this link'), url);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr('Share this piece')}
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1250, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div onClick={event => event.stopPropagation()} className="mr-expand" style={{ width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '16px', padding: '1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
          <h3 style={{ margin: 0, color: '#6e1a3a' }}>{tr('Share this piece')}</h3>
          <button type="button" aria-label={tr('Close')} onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', margin: '0.9rem 0', padding: '0.6rem', background: '#fbf3f6', borderRadius: '12px' }}>
          <img src={image} alt="" width={56} height={56} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '10px' }} />
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</strong>
            <span style={{ color: '#6e1a3a', fontWeight: 'bold' }}>₹{price}</span>
          </div>
        </div>

        {canNativeShare && (
          <button type="button" onClick={() => void nativeShare()} style={{ width: '100%', marginBottom: '0.8rem', padding: '0.7rem', border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #6e1a3a, #b03466)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
            {tr('Share using your phone apps')}
          </button>
        )}

        <div className="mr-share-grid">
          {targets.map(target => (
            <a key={target.key} className="mr-share-item" href={target.href} target="_blank" rel="noopener noreferrer">
              <span className="mr-share-icon" style={{ background: target.color }} aria-hidden="true">{target.glyph}</span>
              {target.label}
            </a>
          ))}
          <button type="button" className="mr-share-item" onClick={() => void copyLink()}>
            <span className="mr-share-icon" style={{ background: copied ? '#2e7d32' : '#555' }} aria-hidden="true">{copied ? '✓' : '🔗'}</span>
            {copied ? tr('Copied') : tr('Copy link')}
          </button>
        </div>
      </div>
    </div>
  );
}
