import React, { useMemo, useState } from 'react';
import type { Order, Product } from '../../domain/types';
import {
  describeItems,
  formatAddress,
  orderCourierAmount,
  orderGrandTotal,
  orderOfferAmount,
  orderStageLabel,
} from '../../analytics/orderMetrics';

export interface MasterLedgerProps {
  orders: Order[];
  products: Product[];
  onSaveDelivery: (orderId: string, deliveryPartner: string, deliveryComments: string) => Promise<void>;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'DISPATCHED' | 'DELIVERED' | 'NOT_ACCEPTED';

const COURIER_PARTNERS = [
  'DTDC', 'India Post', 'Delhivery', 'Blue Dart', 'Professional Couriers', 'XpressBees', 'Ecom Express', 'Shadowfax', 'Amazon Shipping',
];

const pad = (value: number) => String(value).padStart(2, '0');

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const inr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows: Array<Array<string | number>>, filename: string) {
  const content = `\ufeff${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const matchesStatus = (order: Order, filter: StatusFilter): boolean => {
  if (filter === 'ALL') return true;
  if (filter === 'DISPATCHED') return order.stage === 'SUBMITTED_FOR_DISPATCH';
  if (filter === 'DELIVERED') return order.stage === 'DELIVERED';
  if (filter === 'NOT_ACCEPTED') return order.stage === 'NOT_ACCEPTED' || order.stage === 'CANCELLED';
  return !['SUBMITTED_FOR_DISPATCH', 'DELIVERED', 'NOT_ACCEPTED', 'CANCELLED'].includes(order.stage);
};

const cellStyle: React.CSSProperties = { padding: '0.5rem 0.6rem', borderBottom: '1px solid #eee', verticalAlign: 'top', fontSize: '0.8rem' };
const headStyle: React.CSSProperties = { ...cellStyle, position: 'sticky', top: 0, background: '#f7f2ef', fontWeight: 'bold', textAlign: 'left', whiteSpace: 'nowrap', zIndex: 1 };

export default function MasterLedger({ orders, products, onSaveDelivery }: MasterLedgerProps) {
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [drafts, setDrafts] = useState<Record<string, { partner: string; comments: string }>>({});
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  const productsById = useMemo(() => new Map(products.map(product => [product.id, product] as const)), [products]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : 0;
    const toMs = to ? new Date(`${to}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    return orders
      .filter(order => {
        const at = Date.parse(order.createdAt) || 0;
        if (at < fromMs || at > toMs) return false;
        if (!matchesStatus(order, status)) return false;
        if (!needle) return true;
        const haystack = [
          order.orderId, order.userId, order.address.fullName, order.address.phone, formatAddress(order),
          describeItems(order), order.deliveryPartner ?? '', order.deliveryComments ?? '',
        ].join(' ').toLowerCase();
        return haystack.includes(needle);
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [orders, query, from, to, status]);

  const totals = useMemo(() => rows.reduce((sum, order) => ({
    items: sum.items + order.itemTotal,
    offer: sum.offer + orderOfferAmount(order, productsById),
    courier: sum.courier + orderCourierAmount(order),
    grand: sum.grand + orderGrandTotal(order),
  }), { items: 0, offer: 0, courier: 0, grand: 0 }), [rows, productsById]);

  const partnerOf = (order: Order) => drafts[order.orderId]?.partner ?? order.deliveryPartner ?? order.courierBill?.courierName ?? '';
  const commentsOf = (order: Order) => drafts[order.orderId]?.comments ?? order.deliveryComments ?? '';
  const isDirty = (order: Order) => (
    partnerOf(order).trim() !== (order.deliveryPartner ?? order.courierBill?.courierName ?? '').trim()
    || commentsOf(order).trim() !== (order.deliveryComments ?? '').trim()
  );

  const edit = (order: Order, patch: Partial<{ partner: string; comments: string }>) => {
    setDrafts(current => ({
      ...current,
      [order.orderId]: { partner: partnerOf(order), comments: commentsOf(order), ...patch },
    }));
  };

  const save = async (order: Order) => {
    setSavingId(order.orderId);
    setError('');
    try {
      await onSaveDelivery(order.orderId, partnerOf(order).trim(), commentsOf(order).trim());
      setDrafts(current => {
        const next = { ...current };
        delete next[order.orderId];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the delivery details.');
    } finally {
      setSavingId('');
    }
  };

  const exportCsv = () => {
    const header = [
      'Timestamp', 'Order ID', 'Customer name', 'Contact', 'User ID', 'Address', 'Order breakdown',
      'Items total (INR)', 'Offer discount (INR)', 'Courier amount (INR)', 'Grand total (INR)', 'Status', 'Delivery partner', 'Delivery comments',
    ];
    const body = rows.map(order => [
      formatStamp(order.createdAt), order.orderId, order.address.fullName, order.address.phone, order.userId,
      formatAddress(order), describeItems(order), order.itemTotal, orderOfferAmount(order, productsById),
      orderCourierAmount(order), orderGrandTotal(order), orderStageLabel(order), partnerOf(order), commentsOf(order),
    ]);
    const today = new Date();
    downloadCsv([header, ...body], `mala-royale-ledger-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.csv`);
  };

  return (
    <section aria-label="Master ledger">
      <h3 style={{ margin: '0 0 0.3rem' }}>Master ledger ({rows.length} of {orders.length} orders)</h3>
      <p style={{ margin: '0 0 0.8rem', color: '#666', fontSize: '0.85rem' }}>
        Every transaction in one place. Fill in the delivery partner and comments for each order, then download the sheet for Excel or Google Sheets.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'end', marginBottom: '0.8rem' }}>
        <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem', flex: '1 1 200px' }}>
          Search
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, phone, order ID, address, item..." style={{ padding: '0.45rem' }} />
        </label>
        <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem' }}>
          From
          <input type="date" value={from} onChange={event => setFrom(event.target.value)} style={{ padding: '0.4rem' }} />
        </label>
        <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem' }}>
          To
          <input type="date" value={to} onChange={event => setTo(event.target.value)} style={{ padding: '0.4rem' }} />
        </label>
        <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem' }}>
          Status
          <select value={status} onChange={event => setStatus(event.target.value as StatusFilter)} style={{ padding: '0.45rem' }}>
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="DELIVERED">Delivered</option>
            <option value="NOT_ACCEPTED">Not accepted</option>
          </select>
        </label>
        <button type="button" onClick={exportCsv} disabled={rows.length === 0} style={{ backgroundColor: '#2e7d32', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.55rem 1rem', fontWeight: 'bold', cursor: rows.length ? 'pointer' : 'not-allowed' }}>
          Download CSV
        </button>
      </div>

      {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}

      <datalist id="mr-delivery-partners">
        {COURIER_PARTNERS.map(partner => <option key={partner} value={partner} />)}
      </datalist>

      {rows.length === 0 ? (
        <p style={{ color: '#666', fontStyle: 'italic' }}>No orders match these filters.</p>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: '70vh', border: '1px solid #ddd', borderRadius: '6px' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '1500px', width: '100%' }}>
            <thead>
              <tr>
                {['Timestamp', 'Order ID', 'Customer', 'Contact', 'User ID', 'Address', 'Order breakdown', 'Items total', 'Offer discount', 'Courier', 'Grand total', 'Status', 'Delivery partner', 'Delivery comments', ''].map(label => (
                  <th key={label || 'save'} style={headStyle}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(order => (
                <tr key={order.orderId}>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{formatStamp(order.createdAt)}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{order.orderId}</td>
                  <td style={cellStyle}>{order.address.fullName}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{order.address.phone}</td>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '0.7rem', wordBreak: 'break-all', maxWidth: '130px' }}>{order.userId}</td>
                  <td style={{ ...cellStyle, minWidth: '220px' }}>{formatAddress(order)}</td>
                  <td style={{ ...cellStyle, minWidth: '240px' }}>{describeItems(order)}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{inr(order.itemTotal)}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{inr(orderOfferAmount(order, productsById))}</td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>{order.courierBill ? inr(order.courierBill.amount) : '-'}</td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{inr(orderGrandTotal(order))}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{orderStageLabel(order)}</td>
                  <td style={cellStyle}>
                    <input
                      list="mr-delivery-partners"
                      aria-label={`Delivery partner for ${order.orderId}`}
                      value={partnerOf(order)}
                      onChange={event => edit(order, { partner: event.target.value })}
                      placeholder="Select or type"
                      style={{ padding: '0.35rem', width: '150px' }}
                    />
                  </td>
                  <td style={cellStyle}>
                    <textarea
                      aria-label={`Delivery comments for ${order.orderId}`}
                      value={commentsOf(order)}
                      onChange={event => edit(order, { comments: event.target.value })}
                      rows={2}
                      placeholder="Tracking, delays, notes"
                      style={{ padding: '0.35rem', width: '200px', resize: 'vertical' }}
                    />
                  </td>
                  <td style={cellStyle}>
                    <button
                      type="button"
                      disabled={!isDirty(order) || savingId === order.orderId}
                      onClick={() => void save(order)}
                      style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.4rem 0.8rem', cursor: isDirty(order) ? 'pointer' : 'not-allowed', opacity: isDirty(order) ? 1 : 0.5 }}
                    >
                      {savingId === order.orderId ? 'Saving...' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...cellStyle, fontWeight: 'bold', background: '#f7f2ef' }} colSpan={7}>Totals for the {rows.length} orders shown</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', background: '#f7f2ef' }}>{inr(totals.items)}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', background: '#f7f2ef' }}>{inr(totals.offer)}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', background: '#f7f2ef' }}>{inr(totals.courier)}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', background: '#f7f2ef' }}>{inr(totals.grand)}</td>
                <td style={{ ...cellStyle, background: '#f7f2ef' }} colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
