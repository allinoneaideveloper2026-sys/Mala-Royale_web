import React, { useState } from 'react';
import type { FeedbackSentiment } from '../../domain/types';
import { useTr } from '../../lang/ui';
import { ScrollReveal, SectionHeading } from './StorefrontSections';
import './Storefront.css';

/** Short feedback works best. Change this number to allow longer or shorter comments. */
export const FEEDBACK_MAX_CHARS = 100;

export interface FeedbackResult {
  status: 'sent' | 'needs-signin' | 'error';
  sentiment?: FeedbackSentiment;
  category?: string;
}

export interface AboutSectionProps {
  onSubmitFeedback: (input: { name: string; text: string }) => Promise<FeedbackResult>;
  /** The Google sign-in button, shown only when sending needs a sign-in. */
  signInButton: React.ReactNode;
}

const SENTIMENT_LABEL: Record<FeedbackSentiment, string> = {
  POSITIVE: 'Positive',
  NEGATIVE: 'Negative',
  SUGGESTION: 'Suggestion',
  NEUTRAL: 'Neutral',
};

export default function AboutSection({ onSubmitFeedback, signInButton }: AboutSectionProps) {
  const tr = useTr();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);

  const values = [
    { icon: '💎', title: tr('Genuine'), text: tr('Every piece is authentic and carefully checked before it reaches you.') },
    { icon: '👑', title: tr('Luxury, fairly priced'), text: tr('Premium quality at the best prices, with offers you will love.') },
    { icon: '✨', title: tr('Always trending'), text: tr('Fresh arrivals that follow what women love right now.') },
    { icon: '🌸', title: tr('Empowering women'), text: tr('A home business built with passion, celebrating women and their dreams.') },
    { icon: '🤝', title: tr('Hassle-free'), text: tr('Simple ordering, clear updates and caring support at every step.') },
  ];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending || !text.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const outcome = await onSubmitFeedback({ name: name.trim(), text: text.trim() });
      setResult(outcome);
      if (outcome.status === 'sent') setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mr-tab-in">
      <section className="mr-section" style={{ marginTop: '0.5rem' }} aria-label={tr('About Mala Royale')}>
        <SectionHeading kicker={tr('Our story')} title={tr('About Mala Royale')} />
        <ScrollReveal>
          <p className="mr-about-lead">
            {tr('A fashion boutique for the woman who loves to stand out: niche, genuine, trending and luxurious pieces, chosen with love.')}
          </p>
        </ScrollReveal>
        <ScrollReveal delay={80}>
          <p className="mr-about-text">
            {tr('Mala Royale is a home-grown boutique with a big dream: to celebrate and empower women through fashion. Every saree and custom kuchu we offer is chosen with care, because we believe that when a woman feels beautiful, she feels unstoppable.')}
          </p>
        </ScrollReveal>
        <ScrollReveal delay={140}>
          <p className="mr-about-text">
            {tr('We bring you the best of the market: genuine, trending and luxury pieces at the best prices, with offers made to delight you.')}
          </p>
        </ScrollReveal>

        <div className="mr-values">
          {values.map((value, index) => (
            <ScrollReveal key={value.title} delay={index * 90} from="zoom">
              <div className="mr-value">
                <div className="mr-value-icon" aria-hidden="true">{value.icon}</div>
                <h4>{value.title}</h4>
                <p>{value.text}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal>
          <p className="mr-about-text">
            <strong>{tr('Our goal')}: </strong>
            {tr('to build a dream that grows with you, showcasing the talent and creativity of women, and making every customer feel special, confident and cared for.')}
          </p>
        </ScrollReveal>
        <ScrollReveal delay={80}>
          <p className="mr-about-text">
            {tr('We built this website to reach customers across India and give you a smooth, hassle-free experience, from browsing and ordering to delivery at your doorstep. Thank you for being part of our journey.')}
          </p>
        </ScrollReveal>
      </section>

      <section className="mr-section" aria-label={tr('Feedback')}>
        <SectionHeading
          kicker={tr('Your voice matters')}
          title={tr('Tell us what you think')}
          subtitle={tr('Any suggestion or feedback is welcome. It helps us serve you better.')}
        />
        <ScrollReveal>
          <form onSubmit={submit} style={{ display: 'grid', gap: '0.7rem', maxWidth: '560px', padding: '1.1rem', borderRadius: '16px', background: '#fff', border: '1px solid #f0dce4', boxShadow: '0 8px 22px rgba(63,12,34,0.08)' }}>
            <input
              aria-label={tr('Your name (optional)')}
              placeholder={tr('Your name (optional)')}
              maxLength={80}
              value={name}
              onChange={event => setName(event.target.value)}
              style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #ccc' }}
            />
            <div>
              <textarea
                aria-label={tr('Your feedback')}
                placeholder={tr('Share your feedback in a few words')}
                maxLength={FEEDBACK_MAX_CHARS}
                rows={3}
                value={text}
                onChange={event => setText(event.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem', borderRadius: '8px', border: '1px solid #ccc', resize: 'vertical' }}
              />
              <div style={{ textAlign: 'right', fontSize: '0.75rem', color: text.length >= FEEDBACK_MAX_CHARS ? '#b00020' : '#888' }}>
                {text.length} / {FEEDBACK_MAX_CHARS}
              </div>
            </div>
            <button
              type="submit"
              disabled={sending || !text.trim()}
              style={{ padding: '0.7rem', border: 'none', borderRadius: '10px', background: 'linear-gradient(135deg, #6e1a3a, #b03466)', color: '#fff', fontWeight: 'bold', cursor: sending || !text.trim() ? 'not-allowed' : 'pointer', opacity: sending || !text.trim() ? 0.65 : 1 }}
            >
              {sending ? tr('Sending...') : tr('Send feedback')}
            </button>

            {result?.status === 'sent' && (
              <p role="status" style={{ margin: 0, color: '#1b5e20', fontSize: '0.9rem' }}>
                {tr('Thank you! We read every message.')}
                {result.sentiment && (
                  <span style={{ marginLeft: '0.4rem', color: '#555' }}>
                    ({tr(SENTIMENT_LABEL[result.sentiment])}{result.category ? ` · ${tr(result.category)}` : ''})
                  </span>
                )}
              </p>
            )}
            {result?.status === 'needs-signin' && (
              <div role="alert" style={{ padding: '0.7rem', borderRadius: '10px', background: '#fff8e7', border: '1px solid #f0d9a0', fontSize: '0.88rem' }}>
                <p style={{ margin: '0 0 0.5rem' }}>{tr('A quick sign-in is needed to send feedback. Please sign in with Google, then press Send again.')}</p>
                {signInButton}
              </div>
            )}
            {result?.status === 'error' && (
              <p role="alert" style={{ margin: 0, color: '#b00020', fontSize: '0.9rem' }}>{tr('We could not send your feedback right now. Please try again in a moment.')}</p>
            )}
          </form>
        </ScrollReveal>
      </section>
    </div>
  );
}
