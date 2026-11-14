import React, { useState } from 'react';
import type { Order } from '../../domain/types';
import '../storefront/Storefront.css';

export interface HostOrderActionsProps {
  order: Order;
  /** Rejecting is only offered while the order is still active. */
  canReject: boolean;
  onReject: (orderId: string, reason: string, note: string) => Promise<void>;
  onSaveMessage: (orderId: string, message: string) => Promise<void>;
}

const REFUND_LINE = 'Your refund will be processed within 2-3 working days.';

const REASONS: Array<{ label: string; note: string }> = [
  { label: 'Address not deliverable', note: 'Sorry, our courier cannot deliver to the address you gave. Please place the order again with a deliverable address.' },
  { label: 'No courier service on this pincode', note: 'Sorry, there is no courier service available for the pincode you entered.' },
  { label: 'Address incorrect or incomplete', note: 'The address looks incorrect or incomplete. Please check it and place the order again.' },
  { label: 'Item out of stock', note: 'Sorry, this item is no longer in stock.' },
  { label: 'Payment not received or UTR could not be verified', note: 'We could not verify your payment with the UTR you entered.' },
  { label: 'Other', note: '' },
];

export default function HostOrderActions({ order, canReject, onReject, onSaveMessage }: HostOrderActionsProps) {
  const [message, setMessage] = useState(order.hostMessage ?? '');
  const [savingMessage, setSavingMessage] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REASONS[0].label);
  const [note, setNote] = useState(REASONS[0].note);
  const [includeRefund, setIncludeRefund] = useState(Boolean(order.itemPayment));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const messageChanged = message.trim() !== (order.hostMessage ?? '').trim();

  const pickReason = (label: string) => {
    setReason(label);
    const preset = REASONS.find(item => item.label === label);
    if (preset) setNote(preset.note);
  };

  const saveMessage = async () => {
    setSavingMessage(true);
    setError('');
    try {
      await onSaveMessage(order.orderId, message.trim());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the message.');
    } finally {
      setSavingMessage(false);
    }
  };

  const reject = async () => {
    if (!note.trim() && reason === 'Other') {
      setError('Please write a short reason for the customer.');
      return;
    }
    if (!window.confirm(`Reject order ${order.orderId}? The customer will see the reason you wrote. This action requires host consent.`)) return;
    setBusy(true);
    setError('');
    try {
      const fullNote = [note.trim(), includeRefund ? REFUND_LINE : ''].filter(Boolean).join('\n');
      await onReject(order.orderId, reason, fullNote);
      setRejecting(false);
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : 'Could not reject the order.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: '0.9rem', padding: '0.8rem', borderRadius: '10px', background: '#faf6f8', border: '1px solid #eee', display: 'grid', gap: '0.9rem' }}>
      <div>
        <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
          Message to customer (shown on their order)
          <textarea
            value={message}
            onChange={event => setMessage(event.target.value)}
            rows={2}
            maxLength={400}
            placeholder="e.g. Your saree is packed and goes out with DTDC tomorrow."
            style={{ padding: '0.5rem', fontWeight: 'normal', resize: 'vertical' }}
          />
        </label>
        <button type="button" disabled={!messageChanged || savingMessage} onClick={() => void saveMessage()} style={{ marginTop: '0.4rem', padding: '0.4rem 0.9rem', background: '#6e1a3a', color: '#fff', border: 'none', borderRadius: '4px', cursor: messageChanged ? 'pointer' : 'not-allowed', opacity: messageChanged ? 1 : 0.5 }}>
          {savingMessage ? 'Saving...' : 'Send message'}
        </button>
        {order.hostMessageAt && <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: '#777' }}>Last sent {new Date(order.hostMessageAt).toLocaleString()}</span>}
      </div>

      {canReject && (
        <div>
          <label className="mr-switch">
            <input type="checkbox" checked={rejecting} onChange={event => setRejecting(event.target.checked)} />
            <span className="mr-switch-track" aria-hidden="true" />
            <span>Reject this order</span>
          </label>

          {rejecting && (
            <div className="mr-expand" style={{ marginTop: '0.7rem', display: 'grid', gap: '0.6rem' }}>
              <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                Reason
                <select value={reason} onChange={event => pickReason(event.target.value)} style={{ padding: '0.5rem', fontWeight: 'normal' }}>
                  {REASONS.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                Note to the customer
                <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={400} style={{ padding: '0.5rem', fontWeight: 'normal', resize: 'vertical' }} />
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeRefund} onChange={event => setIncludeRefund(event.target.checked)} />
                Add: "{REFUND_LINE}"
              </label>
              <div>
                <button type="button" disabled={busy} onClick={() => void reject()} style={{ padding: '0.5rem 1rem', background: '#c62828', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                  {busy ? 'Rejecting...' : 'Reject and notify customer'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" style={{ margin: 0, color: '#b00020', fontSize: '0.85rem' }}>{error}</p>}
    </div>
  );
}
