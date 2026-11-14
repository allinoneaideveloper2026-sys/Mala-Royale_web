import React, { useMemo, useState } from 'react';
import type { Feedback, FeedbackSentiment } from '../../domain/types';

export interface FeedbackPanelProps {
  feedback: Feedback[];
  onStatus: (item: Feedback, status: 'NEW' | 'REVIEWED') => Promise<void>;
  onDelete: (item: Feedback) => Promise<void>;
}

const SENTIMENTS: Array<{ key: FeedbackSentiment; label: string; color: string; background: string }> = [
  { key: 'POSITIVE', label: 'Positive', color: '#1b5e20', background: '#e8f5e9' },
  { key: 'NEGATIVE', label: 'Negative', color: '#8b1e2d', background: '#fdecea' },
  { key: 'SUGGESTION', label: 'Suggestion', color: '#8a4b08', background: '#fff3cd' },
  { key: 'NEUTRAL', label: 'Neutral', color: '#555', background: '#eee' },
];

const LANGUAGE_NAME: Record<string, string> = { en: 'English', kn: 'Kannada', hi: 'Hindi', te: 'Telugu', ta: 'Tamil' };

const sentimentStyle = (key: FeedbackSentiment) => SENTIMENTS.find(item => item.key === key) ?? SENTIMENTS[3];

export default function FeedbackPanel({ feedback, onStatus, onDelete }: FeedbackPanelProps) {
  const [sentimentFilter, setSentimentFilter] = useState<'ALL' | FeedbackSentiment>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [onlyNew, setOnlyNew] = useState(false);
  const [busyId, setBusyId] = useState('');

  const summary = useMemo(() => {
    const bySentiment: Record<string, number> = {};
    const byCategory = new Map<string, { total: number; negative: number }>();
    feedback.forEach(item => {
      bySentiment[item.sentiment] = (bySentiment[item.sentiment] || 0) + 1;
      const entry = byCategory.get(item.category) ?? { total: 0, negative: 0 };
      entry.total += 1;
      if (item.sentiment === 'NEGATIVE') entry.negative += 1;
      byCategory.set(item.category, entry);
    });
    const categories = Array.from(byCategory.entries()).sort((left, right) => right[1].total - left[1].total);
    return { bySentiment, categories };
  }, [feedback]);

  const visible = useMemo(() => feedback
    .filter(item => sentimentFilter === 'ALL' || item.sentiment === sentimentFilter)
    .filter(item => categoryFilter === 'ALL' || item.category === categoryFilter)
    .filter(item => !onlyNew || item.status === 'NEW')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [feedback, sentimentFilter, categoryFilter, onlyNew]);

  const total = feedback.length;
  const positiveShare = total ? Math.round(((summary.bySentiment.POSITIVE || 0) / total) * 100) : 0;
  const topIssue = summary.categories.find(([, entry]) => entry.negative > 0);
  const newCount = feedback.filter(item => item.status === 'NEW').length;

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId('');
    }
  };

  return (
    <section aria-label="Customer feedback">
      <h3 style={{ margin: '0 0 0.3rem' }}>Customer feedback ({total}, {newCount} new)</h3>
      <p style={{ margin: '0 0 0.9rem', color: '#666', fontSize: '0.85rem' }}>
        Each comment is read automatically and filed as positive, negative or a suggestion, with the topic it is about.
        {total > 0 && ` ${positiveShare}% of feedback is positive.`}
        {topIssue ? ` Most complaints are about ${topIssue[0]} (${topIssue[1].negative}).` : ''}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        {SENTIMENTS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSentimentFilter(sentimentFilter === item.key ? 'ALL' : item.key)}
            aria-pressed={sentimentFilter === item.key}
            style={{ padding: '0.7rem', borderRadius: '10px', border: sentimentFilter === item.key ? `2px solid ${item.color}` : '1px solid #ddd', background: item.background, color: item.color, cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ fontSize: '0.75rem' }}>{item.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{summary.bySentiment[item.key] || 0}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', alignItems: 'center', marginBottom: '1rem', fontSize: '0.88rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          Topic
          <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} style={{ padding: '0.4rem' }}>
            <option value="ALL">All topics</option>
            {summary.categories.map(([category, entry]) => <option key={category} value={category}>{category} ({entry.total})</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyNew} onChange={event => setOnlyNew(event.target.checked)} />
          New only
        </label>
        <span style={{ color: '#777' }}>{visible.length} shown</span>
      </div>

      {visible.length === 0 ? (
        <p style={{ color: '#666', fontStyle: 'italic' }}>{total === 0 ? 'No feedback yet.' : 'Nothing matches these filters.'}</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          {visible.map(item => {
            const style = sentimentStyle(item.sentiment);
            return (
              <article key={item.id} style={{ border: '1px solid #eee', borderLeft: `4px solid ${style.color}`, borderRadius: '8px', padding: '0.8rem', opacity: item.status === 'REVIEWED' ? 0.75 : 1 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.15rem 0.6rem', borderRadius: '999px', background: style.background, color: style.color }}>{style.label}</span>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.6rem', borderRadius: '999px', background: '#f1e3e9', color: '#6e1a3a' }}>{item.category}</span>
                  <span style={{ fontSize: '0.75rem', color: '#777' }}>{LANGUAGE_NAME[item.language] || item.language} · {Math.round(item.confidence * 100)}% sure</span>
                  {item.status === 'REVIEWED' && <span style={{ fontSize: '0.75rem', color: '#2e7d32' }}>Reviewed</span>}
                </div>
                <p style={{ margin: '0.5rem 0 0.3rem', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>{item.text}</p>
                <div style={{ fontSize: '0.78rem', color: '#777' }}>
                  {item.name ? item.name : 'Anonymous'} · {new Date(item.createdAt).toLocaleString()}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button type="button" disabled={busyId === item.id} onClick={() => void run(item.id, () => onStatus(item, item.status === 'NEW' ? 'REVIEWED' : 'NEW'))} style={{ padding: '0.35rem 0.8rem', cursor: 'pointer' }}>
                    {item.status === 'NEW' ? 'Mark reviewed' : 'Mark as new'}
                  </button>
                  <button type="button" disabled={busyId === item.id} onClick={() => void run(item.id, () => onDelete(item))} style={{ padding: '0.35rem 0.8rem', background: '#fff', color: '#8b1e2d', border: '1px solid #8b1e2d', borderRadius: '4px', cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
