import React, { useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithCredential, signInWithPopup, signOut, type User } from 'firebase/auth';
import { CONFIG } from './config';
import { TRANSLATIONS, Language } from './i18n';
import { UserRole, Product, ProductMedia, ProductStatus, Order, CourierBill, CustomerAddress, ParcelDetails, ParcelParty, PincodeCheck, SavedDeliveryAddress } from './domain/types';
import { globalOrderBook } from './domain/OrderBook';
import { auth, firebaseConfigured } from './firebase';
import {
  attachCloudCourierBill,
  authorizeHost,
  checkDeliveryPincode,
  createCloudOrder,
  confirmCloudOrderDelivery,
  deleteCloudDeliveryAddress,
  deleteProduct,
  isAuthorizedHost,
  isConfiguredDeveloper,
  isConfiguredOwner,
  markCloudOrderNotAccepted,
  markCloudOrderDelivered,
  publishProduct,
  revokeHost,
  saveCloudDeliveryAddress,
  saveCloudParcelDetails,
  subscribeAuthorizedHosts,
  subscribeCheckoutQr,
  subscribeSavedAddresses,
  subscribeOrders,
  subscribeProducts,
  submitCloudOrderForDispatch,
  submitCloudCourierPayment,
  updateProduct,
  uploadCheckoutQr,
  uploadProductMedia,
  verifyCloudPayment,
} from './domain/firestoreStore';

const INITIAL_CATALOG: Product[] = [
  {
    id: 'p1',
    name: 'Kanjeevaram Silk Saree',
    category: 'Sarees',
    price: 14999,
    offerPrice: 13999,
    description: 'Pure zari woven Kanjeevaram silk saree with rich pallu.',
    image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&q=80&w=600',
  },
  {
    id: 'p2',
    name: 'Tassel & Bead Kuchu Work',
    category: 'Custom Kuchu',
    price: 1499,
    description: 'Handcrafted traditional silk thread Kuchu with pearl embellishments.',
    image: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&q=80&w=600',
  },
  {
    id: 'p3',
    name: 'Banarasi Soft Silk Saree',
    category: 'Sarees',
    price: 9800,
    offerPrice: 8999,
    description: 'Lightweight Banarasi silk with floral brocade pattern.',
    image: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&q=80&w=600',
  }
];

const MAX_PRODUCT_IMAGES = 6;
const MAX_PRODUCT_VIDEOS = 1;
const MAX_VIDEO_SECONDS = 30;
const LOGO_URL = 'https://res.cloudinary.com/yydehgmd/image/upload/w_400,q_auto,f_auto/v1793990131/MalaRoyale.jpg';

type HostOrderTab = 'ACTIVE' | 'DISPATCHED' | 'HISTORY';

type CartLine = { product: Product; quantity: number };
const MAX_CART_QUANTITY = 10;
const unitPrice = (product: Product) => product.offerPrice || product.price;

const isPurchasable = (product: Product) => !product.status || product.status === 'AVAILABLE';

const STATUS_LABELS: Record<ProductStatus, string> = {
  AVAILABLE: 'Available',
  OUT_OF_STOCK: 'Out of stock',
  COMING_SOON: 'Coming soon',
};

const STATUS_COLORS: Record<ProductStatus, { backgroundColor: string; color: string }> = {
  AVAILABLE: { backgroundColor: '#e8f5e9', color: '#1b5e20' },
  OUT_OF_STOCK: { backgroundColor: '#fdecea', color: '#8b1e2d' },
  COMING_SOON: { backgroundColor: '#fff3cd', color: '#664d03' },
};

const mediaButtonStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  color: '#6e1a3a',
  border: '1px solid #6e1a3a',
  borderRadius: '20px',
  padding: '0.5rem 0.9rem',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '0.9rem',
};

function whatsAppLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function GoogleSignInButton({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.55rem',
        backgroundColor: '#fff',
        color: '#3c4043',
        border: '1px solid #dadce0',
        borderRadius: '999px',
        padding: '0.4rem 1rem 0.4rem 0.7rem',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '0.85rem',
        fontWeight: 600,
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <GoogleIcon />
      {label}
    </button>
  );
}

function ProductManagerRow({
  product,
  onSave,
  onDelete,
}: {
  product: Product;
  onSave: (productId: string, changes: { name: string; price: number; offerPrice?: number; status: ProductStatus }) => Promise<void>;
  onDelete: (product: Product) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [offerPrice, setOfferPrice] = useState(product.offerPrice ? String(product.offerPrice) : '');
  const [status, setStatus] = useState<ProductStatus>(product.status || 'AVAILABLE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const currentStatus: ProductStatus = product.status || 'AVAILABLE';

  const openEditor = () => {
    setName(product.name);
    setPrice(String(product.price));
    setOfferPrice(product.offerPrice ? String(product.offerPrice) : '');
    setStatus(product.status || 'AVAILABLE');
    setError('');
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextPrice = Number(price);
    const nextOffer = offerPrice.trim() === '' ? undefined : Number(offerPrice);
    if (!name.trim()) {
      setError('Enter a product name.');
      return;
    }
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      setError('Enter a regular price greater than zero.');
      return;
    }
    if (nextOffer !== undefined && (!Number.isFinite(nextOffer) || nextOffer <= 0 || nextOffer >= nextPrice)) {
      setError('The offer price must be lower than the regular price.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(product.id, { name: name.trim(), price: nextPrice, offerPrice: nextOffer, status });
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the changes.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await onDelete(product);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove the product.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '0.7rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <img src={product.image} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '4px', flex: '0 0 52px' }} />
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <strong>{product.name}</strong>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            {product.category} · ₹{unitPrice(product)}
            {product.offerPrice ? <span style={{ textDecoration: 'line-through', marginLeft: '0.4rem', color: '#999' }}>₹{product.price}</span> : null}
          </div>
        </div>
        <span style={{ ...STATUS_COLORS[currentStatus], fontSize: '0.75rem', fontWeight: 'bold', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>{STATUS_LABELS[currentStatus]}</span>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" disabled={busy} onClick={editing ? () => setEditing(false) : openEditor} style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}>{editing ? 'Cancel' : 'Edit'}</button>
          <button type="button" disabled={busy} onClick={() => void remove()} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fff', color: '#8b1e2d', border: '1px solid #8b1e2d', borderRadius: '4px', cursor: 'pointer' }}>Remove</button>
        </div>
      </div>
      {editing && (
        <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', marginTop: '0.7rem' }}>
          <input aria-label="Product name" placeholder="Product name" value={name} onChange={event => setName(event.target.value)} required style={{ padding: '0.5rem' }} />
          <input aria-label="Regular price" type="number" min="1" step="0.01" placeholder="Regular price (₹)" value={price} onChange={event => setPrice(event.target.value)} required style={{ padding: '0.5rem' }} />
          <input aria-label="Offer price (optional)" type="number" min="1" step="0.01" placeholder="Offer price (₹, optional)" value={offerPrice} onChange={event => setOfferPrice(event.target.value)} style={{ padding: '0.5rem' }} />
          <select aria-label="Availability" value={status} onChange={event => setStatus(event.target.value as ProductStatus)} style={{ padding: '0.5rem' }}>
            <option value="AVAILABLE">Available</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="COMING_SOON">Coming soon</option>
          </select>
          <button type="submit" disabled={busy} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 0, borderRadius: '4px', padding: '0.5rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>{busy ? 'Saving...' : 'Save changes'}</button>
        </form>
      )}
      {error && <p role="alert" style={{ color: '#b00020', margin: '0.5rem 0 0' }}>{error}</p>}
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => { window.clearTimeout(timer); resolve(value); },
      error => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function getOrderStatus(order: Order): string {
  if (order.stage === 'NOT_ACCEPTED') return 'Not accepted';
  if (order.stage === 'CANCELLED') return 'Cancelled';
  if (order.stage === 'DELIVERED') return 'Delivered';
  if (order.stage === 'SUBMITTED_FOR_DISPATCH') return 'Dispatched';
  if (order.courierPayment?.verified) return 'Courier payment confirmed';
  if (order.courierPayment) return 'Courier payment awaiting host confirmation';
  if (order.courierBill) return 'Courier charge awaiting customer payment';
  if (order.stage === 'COURIER_CHARGE_VERIFIED') return 'Courier payment confirmed';
  if (order.stage === 'COURIER_RECEIPT_UPLOADED') return 'Courier bill ready';
  if (order.stage === 'PACKING') return 'Packing';
  if (order.itemPayment && !order.deliveryConfirmed) return 'Delivery address awaiting host confirmation';
  if (order.itemPayment?.verified) return 'Item payment confirmed';
  if (order.itemPayment) return 'Item payment awaiting host confirmation';
  return 'Order received';
}

function CourierBillForm({
  order,
  onSave,
}: {
  order: Order;
  onSave: (orderId: string, bill: Omit<CourierBill, 'billId'>) => Promise<void>;
}) {
  const [courierName, setCourierName] = useState(order.courierBill?.courierName || '');
  const [trackingId, setTrackingId] = useState(order.courierBill?.trackingId || '');
  const [amount, setAmount] = useState(order.courierBill ? String(order.courierBill.amount) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!courierName.trim() || !trackingId.trim() || Number(amount) <= 0) return;
    setSaving(true);
    setError('');
    try {
      await onSave(order.orderId, {
        courierName: courierName.trim(),
        trackingId: trackingId.trim(),
        amount: Number(amount),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Courier bill could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginTop: '0.8rem' }}>
      <input aria-label="Courier name" placeholder="Courier name" value={courierName} onChange={event => setCourierName(event.target.value)} required />
      <input aria-label="Tracking ID" placeholder="Tracking ID" value={trackingId} onChange={event => setTrackingId(event.target.value)} required />
      <input aria-label="Courier amount in rupees" type="number" min="1" step="0.01" placeholder="Amount (₹)" value={amount} onChange={event => setAmount(event.target.value)} required />
      <button type="submit" disabled={saving} style={{ backgroundColor: '#0288d1', color: '#fff', border: 0, borderRadius: '4px', padding: '0.55rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>
        {saving ? 'Saving bill...' : order.courierBill ? 'Update courier bill' : 'Add courier bill'}
      </button>
      {error && <span role="alert" style={{ gridColumn: '1 / -1', color: '#b00020' }}>{error}</span>}
    </form>
  );
}

function CourierPaymentForm({
  order,
  paymentQrUrl,
  canSubmit,
  onSubmit,
}: {
  order: Order;
  paymentQrUrl: string;
  canSubmit: boolean;
  onSubmit: (orderId: string, utr: string) => Promise<void>;
}) {
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!order.courierBill) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(order.orderId, utr.trim());
      setUtr('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Courier payment could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: '0.7rem', padding: '0.8rem', backgroundColor: '#f7f2ef', borderRadius: '6px' }}>
      <p style={{ margin: '0 0 0.35rem' }}>Courier charge: <strong>₹{order.courierBill.amount}</strong></p>
      {paymentQrUrl && <img src={paymentQrUrl} alt="Courier payment QR" style={{ width: '150px', height: '150px', objectFit: 'contain', display: 'block', margin: '0.6rem 0' }} />}
      {order.courierPayment ? (
        <p role="status" style={{ marginBottom: 0, color: order.courierPayment.verified ? '#1b5e20' : '#8a4b08' }}>
          {order.courierPayment.verified ? 'Courier payment confirmed by host.' : 'Courier payment submitted; waiting for host confirmation.'}
          {' '}UTR: {order.courierPayment.utr}
        </p>
      ) : !canSubmit ? (
        <p role="status" style={{ marginBottom: 0 }}>Sign in to submit this courier payment.</p>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.6rem' }}>
          <label style={{ flex: '1 1 190px' }}>
            Courier payment UTR
            <input value={utr} onChange={event => setUtr(event.target.value)} required inputMode="numeric" pattern="[0-9]{12}" maxLength={12} title="Enter the 12-digit UTR" style={{ display: 'block', boxSizing: 'border-box', width: '100%', padding: '0.55rem' }} />
          </label>
          <button type="submit" disabled={submitting} style={{ alignSelf: 'end', backgroundColor: '#6e1a3a', color: '#fff', border: 0, borderRadius: '4px', padding: '0.6rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>
            {submitting ? 'Submitting...' : `Submit ₹${order.courierBill.amount} payment`}
          </button>
          {error && <span role="alert" style={{ flexBasis: '100%', color: '#b00020' }}>{error}</span>}
        </form>
      )}
    </div>
  );
}

function DeliveryAddressFields({
  address,
  setAddress,
  isCheckingPincode,
  onCheckPincode,
}: {
  address: CustomerAddress;
  setAddress: React.Dispatch<React.SetStateAction<CustomerAddress>>;
  isCheckingPincode: boolean;
  onCheckPincode: () => void;
}) {
  const fields: Array<{ key: keyof CustomerAddress; label: string; required?: boolean; numeric?: boolean }> = [
    { key: 'fullName', label: 'Customer name', required: true },
    { key: 'phone', label: 'WhatsApp / phone number', required: true, numeric: true },
    { key: 'houseNameOrNumber', label: 'House name / number' },
    { key: 'street1', label: 'Street 1', required: true },
    { key: 'street2', label: 'Street 2', required: true },
    { key: 'landmark1', label: 'Landmark 1', required: true },
    { key: 'landmark2', label: 'Landmark 2' },
    { key: 'taluk', label: 'Taluk', required: true },
    { key: 'district', label: 'District', required: true },
    { key: 'pincode', label: 'Pincode', required: true, numeric: true },
  ];

  return (
    <>
      <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>Address details are collected only to deliver this order. The host will use your WhatsApp number to confirm your order and share delivery updates.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.6rem' }}>
        {fields.map(field => (
          <label key={field.key} style={{ display: 'grid', gap: '0.2rem', fontSize: '0.85rem' }}>
            {field.label}{field.required ? ' *' : ''}
            <input
              value={String(address[field.key] || '')}
              onChange={event => setAddress(previous => ({
                ...previous,
                [field.key]: event.target.value,
                ...(field.key === 'pincode' ? { pincodeCheck: undefined } : {}),
              }))}
              required={field.required}
              inputMode={field.numeric ? 'numeric' : 'text'}
              maxLength={field.key === 'pincode' ? 6 : undefined}
              pattern={field.key === 'pincode' ? '[0-9]{6}' : undefined}
            />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
        <button type="button" disabled={isCheckingPincode || address.pincode.length !== 6} onClick={onCheckPincode} style={{ padding: '0.55rem 0.8rem' }}>
          {isCheckingPincode ? 'Checking pincode...' : 'Check pincode online'}
        </button>
        {address.pincodeCheck && (
          <span role="status" style={{ color: address.pincodeCheck.status === 'NOT_FOUND' || address.pincodeCheck.status === 'NOT_SERVICEABLE' ? '#b00020' : '#555', fontSize: '0.85rem' }}>
            {address.pincodeCheck.provider}: {address.pincodeCheck.message}
          </span>
        )}
      </div>
    </>
  );
}

function customerParcelParty(address: CustomerAddress): ParcelParty {
  return {
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: [address.houseNameOrNumber, address.street1, address.street2, address.street].filter(Boolean).join(', '),
    addressLine2: [address.landmark1, address.landmark2].filter(Boolean).join(', '),
    city: address.taluk || '',
    state: address.district || '',
    pincode: address.pincode,
    country: 'India',
  };
}

function ParcelSheet({
  order,
  onSave,
}: {
  order: Order;
  onSave: (orderId: string, from: ParcelParty, to: ParcelParty) => Promise<void>;
}) {
  const [from, setFrom] = useState<ParcelParty>(order.parcelDetails?.from || {
    fullName: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', country: 'India',
  });
  const [to, setTo] = useState<ParcelParty>(order.parcelDetails?.to || customerParcelParty(order.address));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState(order.parcelDetails ? JSON.stringify({ from: order.parcelDetails.from, to: order.parcelDetails.to }) : '');
  const currentSnapshot = JSON.stringify({ from, to });
  const saved = Boolean(savedSnapshot) && currentSnapshot === savedSnapshot;

  useEffect(() => {
    if (!order.parcelDetails) return;
    setFrom(order.parcelDetails.from);
    setTo(order.parcelDetails.to);
    setSavedSnapshot(JSON.stringify({ from: order.parcelDetails.from, to: order.parcelDetails.to }));
  }, [order.orderId, order.parcelDetails?.savedAt]);

  const updateParty = (side: 'from' | 'to', field: keyof ParcelParty, value: string) => {
    const setter = side === 'from' ? setFrom : setTo;
    setter(party => ({ ...party, [field]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!from.fullName.trim() || !from.phone.trim() || !from.addressLine1.trim() || !from.pincode.trim()) {
      setError('Complete the From name, phone, address, and pincode.');
      return;
    }
    if (!to.fullName.trim() || !to.phone.trim() || !to.addressLine1.trim() || !to.pincode.trim()) {
      setError('Complete the To name, phone, address, and pincode.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(order.orderId, from, to);
      setSavedSnapshot(currentSnapshot);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Parcel details could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!saved) return;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const left = 18;
    let y = 18;
    pdf.setFontSize(18);
    pdf.text('PARCEL SHEET', left, y);
    y += 10;
    pdf.setFontSize(10);
    pdf.text(`Order: ${order.orderId}`, left, y);
    pdf.text(`Status: ${getOrderStatus(order)}`, 110, y);
    y += 6;
    pdf.text(`Order date: ${new Date(order.createdAt).toLocaleString()}`, left, y);
    y += 12;

    const drawParty = (title: string, party: ParcelParty, x: number) => {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(title, x, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const addressLines = [
        party.fullName,
        party.phone,
        party.addressLine1,
        party.addressLine2,
        [party.city, party.state, party.pincode].filter(Boolean).join(', '),
        party.country,
      ].filter(Boolean).flatMap(line => pdf.splitTextToSize(line, 78));
      pdf.text(addressLines, x, y + 7);
    };

    drawParty('FROM', from, left);
    drawParty('TO', to, 110);
    y += 52;
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ORDER CONTENTS', left, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    order.items.forEach(item => {
      const lines = pdf.splitTextToSize(`${item.name}  x${item.quantity}  Rs ${item.price * item.quantity}`, 170);
      if (y + lines.length * 5 > 275) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(lines, left, y);
      y += lines.length * 5 + 2;
    });
    y += 3;
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Items total: Rs ${order.itemTotal}`, left, y);
    if (order.courierBill) pdf.text(`Courier charge: Rs ${order.courierBill.amount}`, 110, y);
    pdf.save(`parcel-${order.orderId}.pdf`);
  };

  const partyFields: Array<[keyof ParcelParty, string]> = [
    ['fullName', 'Name'],
    ['phone', 'Phone'],
    ['addressLine1', 'Address line 1'],
    ['addressLine2', 'Address line 2 / landmark'],
    ['city', 'City'],
    ['state', 'State'],
    ['pincode', 'Pincode'],
    ['country', 'Country'],
  ];

  return (
    <details style={{ marginTop: '0.8rem', border: '1px solid #ddd', borderRadius: '6px', padding: '0.7rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Parcel sheet · From / To</summary>
      <form onSubmit={save} style={{ marginTop: '0.8rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
          {(['from', 'to'] as const).map(side => (
            <fieldset key={side} style={{ display: 'grid', gap: '0.5rem', border: '1px solid #ddd', padding: '0.75rem', minWidth: 0 }}>
              <legend style={{ fontWeight: 'bold' }}>{side === 'from' ? 'FROM · Host' : 'TO · Customer'}</legend>
              {partyFields.map(([field, label]) => (
                <label key={field} style={{ display: 'grid', gap: '0.2rem', fontSize: '0.85rem' }}>
                  {label}
                  <input value={side === 'from' ? from[field] : to[field]} onChange={event => updateParty(side, field, event.target.value)} required={['fullName', 'phone', 'addressLine1', 'pincode'].includes(field)} />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {order.parcelDetails && <p style={{ color: '#666', fontSize: '0.8rem' }}>Last saved by {order.parcelDetails.savedBy} · {new Date(order.parcelDetails.savedAt).toLocaleString()}</p>}
        {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.8rem' }}>
          <button type="submit" disabled={saving || saved} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 0, padding: '0.55rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save parcel details'}
          </button>
          <button type="button" disabled={!saved} onClick={downloadPdf} style={{ backgroundColor: '#2e7d32', color: '#fff', border: 0, padding: '0.55rem 0.8rem', borderRadius: '4px', cursor: saved ? 'pointer' : 'not-allowed' }}>
            Download parcel PDF
          </button>
        </div>
      </form>
    </details>
  );
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
    };
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error(`Could not read the duration of ${file.name}.`));
    };
    video.src = url;
  });
}

async function validateProductMedia(files: File[]): Promise<void> {
  const images = files.filter(file => file.type.startsWith('image/'));
  const videos = files.filter(file => file.type.startsWith('video/'));
  if (images.length > MAX_PRODUCT_IMAGES) throw new Error(`Choose up to ${MAX_PRODUCT_IMAGES} photos.`);
  if (videos.length > MAX_PRODUCT_VIDEOS) throw new Error('Choose one product video at a time.');
  if (files.length !== images.length + videos.length) throw new Error('Choose image or video files only.');
  if (images.some(file => file.size > 10 * 1024 * 1024)) throw new Error('Each photo must be smaller than 10 MB.');
  if (videos.some(file => file.size > 50 * 1024 * 1024)) throw new Error('The product video must be smaller than 50 MB.');
  if (videos.length && !['video/mp4', 'video/webm', 'video/quicktime'].includes(videos[0].type)) {
    throw new Error('Use an MP4, WebM, or QuickTime video.');
  }
  if (videos.length && await readVideoDuration(videos[0]) > MAX_VIDEO_SECONDS) {
    throw new Error(`Keep the product video to ${MAX_VIDEO_SECONDS} seconds or less.`);
  }
}

function ProductGallery({ product }: { product: Product }) {
  const media: ProductMedia[] = product.media?.length
    ? product.media
    : [{ url: product.image, type: 'image' }];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedMedia = media[Math.min(selectedIndex, media.length - 1)];

  useEffect(() => setSelectedIndex(0), [product.id]);

  return (
    <div>
      {selectedMedia.type === 'video' ? (
        <video src={selectedMedia.url} controls playsInline preload="metadata" style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }} />
      ) : (
        <img src={selectedMedia.url} alt={product.name} style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }} />
      )}
      {media.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', padding: '0.5rem' }}>
          {media.map((item, index) => (
            <button
              key={`${item.url}-${index}`}
              type="button"
              aria-label={`Show ${item.type === 'video' ? 'video' : 'photo'} ${index + 1}`}
              aria-pressed={selectedIndex === index}
              onClick={() => setSelectedIndex(index)}
              style={{ width: '56px', height: '48px', flex: '0 0 56px', padding: 0, border: selectedIndex === index ? '2px solid #6e1a3a' : '1px solid #ccc', cursor: 'pointer' }}
            >
              {item.type === 'video' ? (
                <video src={item.url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Navigation & Authentication State
  const [lang, setLang] = useState<Language>('en');
  const [role, setRole] = useState<UserRole>('CUSTOMER');
  const [userEmail, setUserEmail] = useState('customer@gmail.com');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(firebaseConfigured);
  const [syncError, setSyncError] = useState('');
  const [authorizedHosts, setAuthorizedHosts] = useState<string[]>(CONFIG.ownerEmails);
  const [newHostEmail, setNewHostEmail] = useState('');
  const [grantHostAccess, setGrantHostAccess] = useState(true);
  const [isUploadingProduct, setIsUploadingProduct] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);

  // Catalog State
  const [products, setProducts] = useState<Product[]>(firebaseConfigured ? [] : INITIAL_CATALOG);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [newProduct, setNewProduct] = useState({ name: '', category: 'Sarees', price: '', offerPrice: '', description: '', image: '' });
  const [productMediaFiles, setProductMediaFiles] = useState<File[]>([]);
  const [paymentQrUrl, setPaymentQrUrl] = useState('');
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);

  // Customer Cart & Checkout State
  const [cartLines, setCart] = useState<CartLine[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{ orderId: string; total: number; phone: string; name: string } | null>(null);
  const [orderCopied, setOrderCopied] = useState(false);
  // Always price the cart from the live catalog so host price changes apply immediately.
  const cart: CartLine[] = cartLines.map(line => ({ ...line, product: products.find(product => product.id === line.product.id) || line.product }));
  const unavailableLines = cart.filter(line => !products.some(product => product.id === line.product.id) || !isPurchasable(line.product));
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [courierPolicyAccepted, setCourierPolicyAccepted] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [hostOrderTab, setHostOrderTab] = useState<HostOrderTab>('ACTIVE');
  const [customerTab, setCustomerTab] = useState<'SHOP' | 'ORDERS' | 'ADDRESSES'>('SHOP');
  const [savedAddresses, setSavedAddresses] = useState<SavedDeliveryAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [useSavedAddress, setUseSavedAddress] = useState(false);
  const [saveAddressForLater, setSaveAddressForLater] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [isCheckingPincode, setIsCheckingPincode] = useState(false);

  // Customer Form Data
  const [address, setAddress] = useState<CustomerAddress>({
    fullName: '',
    phone: '',
    houseNameOrNumber: '',
    street1: '',
    street2: '',
    street: '',
    landmark1: '',
    landmark2: '',
    taluk: '',
    district: '',
    pincode: '',
    googleMapsPin: '',
    consentTimestamp: ''
  });
  const [utr, setUtr] = useState('');

  const t = TRANSLATIONS[lang];
  const isStaff = role === 'OWNER' || role === 'DEVELOPER';
  const googleUser = firebaseUser && !firebaseUser.isAnonymous ? firebaseUser : null;
  const [logoFailed, setLogoFailed] = useState(false);

  const mediaPreviews = useMemo(() => productMediaFiles.map(file => ({
    name: file.name,
    url: URL.createObjectURL(file),
    isVideo: file.type.startsWith('video/'),
  })), [productMediaFiles]);
  useEffect(() => () => mediaPreviews.forEach(preview => URL.revokeObjectURL(preview.url)), [mediaPreviews]);

  const applySignedInUser = async (user: User | null) => {
    setFirebaseUser(user);
    setFirebaseLoading(true);

    if (!user?.email) {
      setUserEmail('');
      setRole('CUSTOMER');
      if (!user) setActiveOrders([]);
      setFirebaseLoading(false);
      return;
    }

    const email = user.email.toLowerCase();
    setUserEmail(email);

    try {
      const nextRole = isConfiguredDeveloper(email)
        ? 'DEVELOPER'
        : isConfiguredOwner(email) || await isAuthorizedHost(email)
          ? 'OWNER'
          : 'CUSTOMER';
      setRole(nextRole);
      setSyncError('');
    } catch (err) {
      console.error('Role check failed:', err);
      setRole('CUSTOMER');
      setSyncError(err instanceof Error ? err.message : 'Could not load account permissions.');
    } finally {
      setFirebaseLoading(false);
    }
  };

  useEffect(() => {
    if (!auth) {
      setFirebaseLoading(false);
      return;
    }

    return onAuthStateChanged(auth, user => {
      void applySignedInUser(user);
    }, error => {
      setFirebaseLoading(false);
      setSyncError(error.message);
    });
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;

    return subscribeProducts(nextProducts => {
      setSyncError('');
      setProducts(nextProducts);
    }, error => setSyncError(error.message));
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;
    if (!firebaseUser) {
      setActiveOrders([]);
      return;
    }

    return subscribeOrders(firebaseUser.uid, role !== 'CUSTOMER', orders => {
      setSyncError('');
      setActiveOrders(orders);
    }, error => setSyncError(error.message));
  }, [firebaseUser, role]);

  useEffect(() => {
    if (!firebaseConfigured || role !== 'DEVELOPER') return;
    return subscribeAuthorizedHosts(hosts => {
      setSyncError('');
      setAuthorizedHosts(hosts);
    }, error => setSyncError(error.message));
  }, [role]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return subscribeCheckoutQr(url => {
      setSyncError('');
      setPaymentQrUrl(url);
    }, error => setSyncError(error.message));
  }, []);

  useEffect(() => {
    if (firebaseConfigured) {
      if (!googleUser) {
        setSavedAddresses([]);
        return;
      }
      return subscribeSavedAddresses(googleUser.uid, addresses => {
        setSavedAddresses(addresses);
        setSyncError('');
      }, error => setSyncError(error.message));
    }

    try {
      const saved = localStorage.getItem(`mala-royale:delivery-addresses:${userEmail}`);
      setSavedAddresses(saved ? JSON.parse(saved) as SavedDeliveryAddress[] : []);
    } catch {
      setSavedAddresses([]);
    }
    return undefined;
  }, [googleUser?.uid, userEmail]);

  const handleGoogleSignIn = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    // Always show the Google account chooser instead of silently using the primary account.
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const current = auth.currentUser;
      if (current?.isAnonymous) {
        try {
          // Keep the guest's orders by attaching the Google account to the same session.
          await linkWithPopup(current, provider);
          await current.reload();
          await current.getIdToken(true);
          await applySignedInUser(auth.currentUser);
          return;
        } catch (linkError) {
          const linkCode = (linkError as { code?: string })?.code;
          if (linkCode === 'auth/credential-already-in-use') {
            const credential = GoogleAuthProvider.credentialFromError(linkError as never);
            if (credential) {
              await signInWithCredential(auth, credential);
              return;
            }
          }
          throw linkError;
        }
      }
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setSyncError(error instanceof Error ? error.message : 'Google sign-in failed.');
    }
  };

  // Lets customers order without an account; a Google account can be linked later.
  const ensureCustomerSession = async (): Promise<string> => {
    if (firebaseUser) return firebaseUser.uid;
    if (!auth) throw new Error('Sign-in is not available.');
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  };

  const handleSignOut = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sign out failed.');
    }
  };

  // Role Routing based on Sign-In Email
  const handleEmailSwitch = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    setUserEmail(normalizedEmail);
    if (CONFIG.developerEmails.some((developer: string) => developer.trim().toLowerCase() === normalizedEmail)) {
      setRole('DEVELOPER');
    } else if (authorizedHosts.some(host => host.trim().toLowerCase() === normalizedEmail)) {
      setRole('OWNER');
    } else {
      setRole('CUSTOMER');
    }
  };

  const confirmHostAction = (message: string) => {
    if (typeof window === 'undefined') return true;
    return window.confirm(`${message} This action requires host consent.`);
  };

  // Developer Action: Add Host Email Whitelist
  const handleAddHost = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = newHostEmail.trim().toLowerCase();
    if (!normalizedEmail || !grantHostAccess) return;
    if (authorizedHosts.length >= CONFIG.maxHostLogins) {
      alert(`Limit reached: Maximum of ${CONFIG.maxHostLogins} host logins allowed.`);
      return;
    }
    if (!authorizedHosts.some(host => host.toLowerCase() === normalizedEmail)) {
      if (!confirmHostAction(`Authorize ${normalizedEmail} as a host?`)) return;
      try {
        if (firebaseConfigured) {
          await authorizeHost(normalizedEmail);
        } else {
          setAuthorizedHosts([...authorizedHosts, normalizedEmail]);
        }
        setNewHostEmail('');
        alert(`Host email ${normalizedEmail} successfully authorized.`);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Could not authorize host.');
      }
    }
  };

  const handleHostAccessToggle = async (email: string, enabled: boolean) => {
    const action = enabled ? `Authorize ${email} as a host?` : `Revoke host access for ${email}?`;
    if (!confirmHostAction(action)) return;
    try {
      if (enabled) {
        await authorizeHost(email);
      } else if (firebaseConfigured) {
        await revokeHost(email);
      } else {
        setAuthorizedHosts(hosts => hosts.filter(host => host !== email));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not update host access.');
    }
  };

  const handleProductMediaSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (selectedFiles.length === 0) return;
    try {
      const nextFiles = [...productMediaFiles, ...selectedFiles];
      await validateProductMedia(nextFiles);
      setProductMediaFiles(nextFiles);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not use those media files.');
    }
  };

  // Host Action: Publish Item with Price/Offers
  const handlePublishProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price || isUploadingProduct) return;
    if (!confirmHostAction(`Publish "${newProduct.name}" to the catalog?`)) return;
    setIsUploadingProduct(true);
    try {
      const productId = `p-${Date.now()}`;
      const media = firebaseConfigured
        ? await withTimeout(uploadProductMedia(productMediaFiles), 120000, 'Uploading the photos is taking too long. Check your internet connection and try again.')
        : productMediaFiles.map(file => ({
          url: URL.createObjectURL(file),
          type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
          name: file.name,
        }));
      const coverImage = media.find(item => item.type === 'image')?.url || newProduct.image || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&q=80&w=600';
      const addedProduct: Product = {
        id: productId,
        name: newProduct.name,
        category: newProduct.category,
        price: parseFloat(newProduct.price),
        offerPrice: newProduct.offerPrice ? parseFloat(newProduct.offerPrice) : undefined,
        description: newProduct.description || 'Exclusive boutique craftsmanship.',
        image: coverImage,
        media,
      };
      if (firebaseConfigured) {
        await withTimeout(publishProduct(addedProduct), 60000, 'Saving the item is taking too long. Check your connection; if it does not appear in the catalog, try again.');
      } else {
        setProducts([addedProduct, ...products]);
      }
      setNewProduct({ name: '', category: 'Sarees', price: '', offerPrice: '', description: '', image: '' });
      setProductMediaFiles([]);
      alert(firebaseConfigured ? 'Item published to the live catalog.' : 'Item added to the local demo catalog.');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not publish product.');
    } finally {
      setIsUploadingProduct(false);
    }
  };

  const handleCheckoutQrUpload = async () => {
    if (!paymentQrFile || isUploadingQr) return;
    if (!confirmHostAction('Update the checkout QR for customers?')) return;
    setIsUploadingQr(true);
    try {
      const url = firebaseConfigured
        ? await withTimeout(uploadCheckoutQr(paymentQrFile), 60000, 'Saving the checkout QR is taking too long. Check your internet connection and try again.')
        : URL.createObjectURL(paymentQrFile);
      setPaymentQrUrl(url);
      setPaymentQrFile(null);
      alert(firebaseConfigured ? 'Checkout QR updated for all customers.' : 'Checkout QR updated in this local demo.');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not upload payment QR.');
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handlePaymentQrSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] || null;
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Choose an image file for the payment QR.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('The payment QR image must be smaller than 5 MB.');
      return;
    }
    setPaymentQrFile(file);
  };

  const removeProductMediaFile = (index: number) => setProductMediaFiles(files => files.filter((_, fileIndex) => fileIndex !== index));

  // Host Action: Edit or remove a published product
  const handleUpdateProduct = async (
    productId: string,
    changes: { name: string; price: number; offerPrice?: number; status: ProductStatus },
  ) => {
    try {
      if (firebaseConfigured) {
        await withTimeout(updateProduct(productId, changes), 30000, 'Saving the changes is taking too long. Check your internet connection and try again.');
      } else {
        setProducts(current => current.map(product => product.id === productId ? { ...product, ...changes } : product));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not update the product.');
      throw error;
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!confirmHostAction(`Remove "${product.name}" from the catalog?`)) return;
    try {
      if (firebaseConfigured) {
        await withTimeout(deleteProduct(product.id), 30000, 'Removing the item is taking too long. Check your internet connection and try again.');
      } else {
        setProducts(current => current.filter(item => item.id !== product.id));
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not remove the product.');
      throw error;
    }
  };

  // Cart Management
  const addToCart = (product: Product) => isPurchasable(product) && setCart(current => (
    current.some(line => line.product.id === product.id)
      ? current.map(line => line.product.id === product.id
        ? { ...line, quantity: Math.min(line.quantity + 1, MAX_CART_QUANTITY) }
        : line)
      : [...current, { product, quantity: 1 }]
  ));
  const changeQuantity = (productId: string, delta: number) => setCart(current => current.flatMap(line => {
    if (line.product.id !== productId) return [line];
    const nextQuantity = Math.min(line.quantity + delta, MAX_CART_QUANTITY);
    return nextQuantity <= 0 ? [] : [{ ...line, quantity: nextQuantity }];
  }));
  const removeFromCart = (productId: string) => setCart(current => current.filter(line => line.product.id !== productId));
  const buyNow = (product: Product) => {
    addToCart(product);
    setCheckoutStep(1);
    setIsCheckoutOpen(false);
    setIsCartOpen(true);
    setCustomerTab('SHOP');
  };
  const cartCount = cart.reduce((count, line) => count + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + unitPrice(line.product) * line.quantity, 0);

  // Customer Action: Submit Order via OrderBook Engine
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.fullName.trim() || !address.phone.trim() || !address.street1?.trim() || !address.street2?.trim() || !address.landmark1.trim() || !address.taluk?.trim() || !address.district?.trim() || !/^\d{6}$/.test(address.pincode)) {
      alert('Complete the required delivery-address fields before placing your order.');
      setCheckoutStep(1);
      return;
    }
    if (!address.pincodeCheck) {
      alert('Check the pincode online before placing your order.');
      setCheckoutStep(1);
      return;
    }
    if (['NOT_FOUND', 'NOT_SERVICEABLE'].includes(address.pincodeCheck.status)) {
      alert('This pincode could not be confirmed as deliverable. Please check the address or contact the host.');
      setCheckoutStep(1);
      return;
    }
    if (cart.length === 0) {
      alert('Your cart is empty. Add at least one item before placing an order.');
      setIsCheckoutOpen(false);
      return;
    }
    if (!courierPolicyAccepted) {
      alert(t.acceptCourierNotice);
      return;
    }
    if (unavailableLines.length > 0) {
      alert('Some items in your cart are no longer available. Please remove them and try again.');
      setIsCheckoutOpen(false);
      setIsCartOpen(true);
      return;
    }
    try {
      let customerUid = firebaseUser?.uid || '';
      if (firebaseConfigured && !customerUid) {
        try {
          customerUid = await ensureCustomerSession();
        } catch (sessionError) {
          console.error('Guest checkout session failed:', sessionError);
          alert('We could not start a secure checkout. Please use the "Sign in with Google" button in this step and try again.');
          return;
        }
      }
      const orderItems = cart.map(line => ({ productId: line.product.id, name: line.product.name, price: unitPrice(line.product), quantity: line.quantity }));
      const deliveryAddress: CustomerAddress = {
        ...address,
        street: [address.houseNameOrNumber, address.street1, address.street2].filter(Boolean).join(', '),
        consentTimestamp: new Date().toISOString(),
      };
      const order = firebaseConfigured
        ? await createCloudOrder(
          customerUid,
          orderItems,
          cartTotal,
          deliveryAddress,
          courierPolicyAccepted,
          utr,
        )
        : globalOrderBook.createOrder(
          userEmail,
          orderItems,
          cartTotal,
          deliveryAddress,
          courierPolicyAccepted
        );

      if (!firebaseConfigured) {
        globalOrderBook.submitItemPayment(order.orderId, cartTotal, utr, 'uploaded_proof.png');
        setActiveOrders(globalOrderBook.getAllOrders());
      }
      if (saveAddressForLater && (googleUser || !firebaseConfigured)) {
        const savedAddress: SavedDeliveryAddress = {
          ...deliveryAddress,
          id: selectedAddressId || `address-${Date.now()}`,
        };
        try {
          if (firebaseConfigured && googleUser) {
            await saveCloudDeliveryAddress(googleUser.uid, savedAddress);
          } else {
            const nextAddresses = [savedAddress, ...savedAddresses.filter(saved => saved.id !== savedAddress.id)];
            setSavedAddresses(nextAddresses);
            localStorage.setItem(`mala-royale:delivery-addresses:${userEmail}`, JSON.stringify(nextAddresses));
          }
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : 'Order placed, but the address could not be saved for later.');
        }
      }
      setCart([]);
      setUtr('');
      setIsCheckoutOpen(false);
      setCheckoutStep(1);
      setCustomerTab('ORDERS');
      setOrderCopied(false);
      setPlacedOrder({ orderId: order.orderId, total: cartTotal, phone: deliveryAddress.phone, name: deliveryAddress.fullName });
    } catch (err: any) {
      const message = err instanceof Error && err.message.includes('permission-denied')
        ? 'Firestore rejected this action. Check the deployed Firestore rules and signed-in account role.'
        : err.message;
      alert(message);
    }
  };

  const handleConfirmDelivery = async (order: Order) => {
    if (!order.address.pincodeCheck) {
      setSyncError('This order needs an online pincode check before delivery can be confirmed.');
      return;
    }
    if (['NOT_FOUND', 'NOT_SERVICEABLE'].includes(order.address.pincodeCheck.status)) {
      setSyncError('This pincode is not confirmed as deliverable. Contact the customer or courier.');
      return;
    }
    try {
      if (firebaseConfigured) {
        await confirmCloudOrderDelivery(order.orderId, firebaseUser?.email || userEmail);
      } else {
        globalOrderBook.confirmDelivery(order.orderId, userEmail);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not confirm the delivery address.');
    }
  };

  const handleVerifyPayment = async (orderId: string, kind: 'ITEM' | 'COURIER') => {
    const paymentKindLabel = kind === 'ITEM' ? 'item payment' : 'courier payment';
    if (!confirmHostAction(`Verify the ${paymentKindLabel} for order ${orderId}?`)) return;
    try {
      if (firebaseConfigured) {
        await verifyCloudPayment(orderId, kind);
      } else {
        globalOrderBook.verifyPayment(orderId, kind);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not verify payment.');
    }
  };

  const handleCourierReceipt = async (
    orderId: string,
    bill: Omit<CourierBill, 'billId'>,
  ) => {
    try {
      if (firebaseConfigured) {
        await attachCloudCourierBill(orderId, bill);
      } else {
        globalOrderBook.attachCourierBill(orderId, bill);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save courier bill.');
      throw error;
    }
  };

  const handleCourierPayment = async (orderId: string, utr: string) => {
    try {
      if (firebaseConfigured) {
        if (!firebaseUser) throw new Error('Sign in before submitting payment.');
        await submitCloudCourierPayment(orderId, firebaseUser.uid, utr);
      } else {
        globalOrderBook.submitCourierPayment(orderId, userEmail, utr);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not submit courier payment.');
      throw error;
    }
  };

  const handleDispatch = async (orderId: string) => {
    if (!confirmHostAction(`Mark order ${orderId} as dispatched?`)) return;
    try {
      if (firebaseConfigured) {
        await submitCloudOrderForDispatch(orderId);
      } else {
        globalOrderBook.submitForDispatch(orderId);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not submit order for dispatch.');
    }
  };

  const handleNotAccepted = async (orderId: string) => {
    if (!confirmHostAction(`Mark order ${orderId} as not accepted?`)) return;
    try {
      if (firebaseConfigured) {
        await markCloudOrderNotAccepted(orderId);
      } else {
        globalOrderBook.markNotAccepted(orderId);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not update order status.');
    }
  };

  const handleDelivered = async (orderId: string) => {
    if (!confirmHostAction(`Mark order ${orderId} as delivered?`)) return;
    try {
      if (firebaseConfigured) {
        await markCloudOrderDelivered(orderId);
      } else {
        globalOrderBook.markDelivered(orderId);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not mark order delivered.');
    }
  };

  const handleSaveParcel = async (orderId: string, from: ParcelParty, to: ParcelParty) => {
    const parcelDetails: ParcelDetails = {
      from,
      to,
      savedAt: new Date().toISOString(),
      savedBy: firebaseUser?.email || userEmail,
    };
    try {
      if (firebaseConfigured) {
        await saveCloudParcelDetails(orderId, parcelDetails);
      } else {
        globalOrderBook.saveParcelDetails(orderId, parcelDetails);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save parcel details.');
      throw error;
    }
  };

  const handleCheckPincode = async () => {
    setIsCheckingPincode(true);
    try {
      const result = await checkDeliveryPincode(address.pincode);
      setAddress(previous => ({
        ...previous,
        district: result.district || previous.district,
        taluk: result.taluk || previous.taluk,
        pincodeCheck: result,
      }));
    } finally {
      setIsCheckingPincode(false);
    }
  };

  const handleSaveDeliveryAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address.fullName.trim() || !address.phone.trim() || !address.street1?.trim() || !address.street2?.trim() || !address.landmark1.trim() || !address.taluk?.trim() || !address.district?.trim() || !/^\d{6}$/.test(address.pincode)) {
      alert('Complete all required delivery-address fields before saving.');
      return;
    }
    const savedAddress: SavedDeliveryAddress = {
      ...address,
      id: editingAddressId || `address-${Date.now()}`,
      consentTimestamp: new Date().toISOString(),
    };
    try {
      if (firebaseConfigured) {
        if (!googleUser) throw new Error('Sign in with Google to save delivery addresses.');
        await saveCloudDeliveryAddress(googleUser.uid, savedAddress);
      } else {
        const nextAddresses = [savedAddress, ...savedAddresses.filter(saved => saved.id !== savedAddress.id)];
        setSavedAddresses(nextAddresses);
        localStorage.setItem(`mala-royale:delivery-addresses:${userEmail}`, JSON.stringify(nextAddresses));
      }
      setSelectedAddressId(savedAddress.id);
      setUseSavedAddress(true);
      setEditingAddressId(null);
      setCustomerTab('ADDRESSES');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not save delivery address.');
    }
  };

  const handleDeleteDeliveryAddress = async (addressId: string) => {
    try {
      if (firebaseConfigured) {
        if (!googleUser) throw new Error('Sign in with Google to manage delivery addresses.');
        await deleteCloudDeliveryAddress(googleUser.uid, addressId);
      } else {
        const nextAddresses = savedAddresses.filter(saved => saved.id !== addressId);
        setSavedAddresses(nextAddresses);
        localStorage.setItem(`mala-royale:delivery-addresses:${userEmail}`, JSON.stringify(nextAddresses));
      }
      if (selectedAddressId === addressId) {
        setSelectedAddressId('');
        setUseSavedAddress(false);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not delete delivery address.');
    }
  };

  const selectDeliveryAddress = (addressId: string) => {
    const savedAddress = savedAddresses.find(saved => saved.id === addressId);
    if (!savedAddress) return;
    setSelectedAddressId(savedAddress.id);
    setUseSavedAddress(true);
    setAddress({ ...savedAddress, consentTimestamp: '', street: savedAddress.street || '' });
  };

  const filteredProducts = categoryFilter === 'All'
    ? products
    : products.filter(p => p.category === categoryFilter);

  const firstInFirstOut = (left: Order, right: Order) => left.createdAt.localeCompare(right.createdAt);
  const hostActiveOrders = activeOrders
    .filter(order => !['SUBMITTED_FOR_DISPATCH', 'DELIVERED', 'NOT_ACCEPTED', 'CANCELLED'].includes(order.stage))
    .sort(firstInFirstOut);
  const hostDispatchedOrders = activeOrders
    .filter(order => order.stage === 'SUBMITTED_FOR_DISPATCH')
    .sort(firstInFirstOut);
  const hostHistoryOrders = activeOrders
    .filter(order => ['DELIVERED', 'NOT_ACCEPTED', 'CANCELLED'].includes(order.stage))
    .sort(firstInFirstOut);
  const hostVisibleOrders = hostOrderTab === 'ACTIVE'
    ? hostActiveOrders
    : hostOrderTab === 'DISPATCHED'
      ? hostDispatchedOrders
      : hostHistoryOrders;

  return (
    <div style={{ fontFamily: 'Georgia, serif', backgroundColor: '#fdf8f6', color: '#333', minHeight: '100vh' }}>
      
      {/* ROLE SWITCHER & LANGUAGE HEADER */}
      <div style={{ backgroundColor: '#1a050d', color: '#fff', padding: '0.6rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.85rem' }}>
        <div>
          {isStaff || !firebaseConfigured ? (
            <span>Role: <strong>{firebaseConfigured ? firebaseLoading ? 'CHECKING ACCESS' : firebaseUser ? role === 'OWNER' ? 'HOST' : role : 'GUEST' : `LOCAL ${role === 'OWNER' ? 'HOST' : role}`}</strong> ({firebaseConfigured ? firebaseUser?.email || 'signed out' : userEmail})</span>
          ) : googleUser ? (
            <span>{googleUser.email}</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select value={lang} onChange={(e) => setLang(e.target.value as Language)} style={{ padding: '0.25rem', borderRadius: '4px' }}>
            <option value="en">English</option>
            <option value="kn">ಕನ್ನಡ (Kannada)</option>
          </select>
          {firebaseConfigured ? (
            googleUser ? (
              <button onClick={handleSignOut} style={{ padding: '0.35rem 0.9rem', cursor: 'pointer', borderRadius: '999px', border: '1px solid #dadce0', backgroundColor: '#fff', color: '#3c4043', fontWeight: 600 }}>Sign out</button>
            ) : (
              <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label={firebaseLoading ? 'Checking session...' : 'Sign in with Google'} />
            )
          ) : (
            <select value={userEmail} onChange={(e) => handleEmailSwitch(e.target.value)} style={{ padding: '0.25rem', borderRadius: '4px' }}>
              <option value="customer@gmail.com">{t.roleCustomer}</option>
              <option value="owner@malaroyale.com">{t.roleHost}</option>
              <option value="allinoneaideveloper2026@gmail.com">{t.roleDeveloper}</option>
            </select>
          )}
        </div>
      </div>

      {(isStaff || !firebaseConfigured) ? (
        <div aria-live="polite" style={{ padding: '0.55rem 1.2rem', backgroundColor: firebaseConfigured ? '#e8f5e9' : '#fff3cd', color: firebaseConfigured ? '#1b5e20' : '#664d03', fontSize: '0.85rem' }}>
          {firebaseConfigured
            ? 'Firestore is configured; catalog and order changes sync live when connected.'
            : 'Local demo only: add Firebase project settings to sync catalog and orders across devices.'}
          {syncError && <span> Sync issue: {syncError}</span>}
        </div>
      ) : syncError ? (
        <div aria-live="polite" style={{ padding: '0.55rem 1.2rem', backgroundColor: '#fdecea', color: '#8b1e2d', fontSize: '0.85rem' }}>
          Something went wrong. Please refresh the page and try again.
        </div>
      ) : null}

      {/* BOUTIQUE BRANDING */}
      <header style={{ backgroundColor: '#6e1a3a', color: '#fff', padding: '1.5rem', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '2.4rem' }}>
          {logoFailed ? t.appName : (
            <img src={LOGO_URL} alt={t.appName} onError={() => setLogoFailed(true)} style={{ height: '80px', maxWidth: '100%', objectFit: 'contain' }} />
          )}
        </h1>
        <p style={{ margin: '0.3rem 0 0', fontStyle: 'italic', opacity: 0.9 }}>{t.tagline}</p>
      </header>

      {/* MAIN CONTENT AREA */}
      <div style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1rem' }}>
        {firebaseConfigured && firebaseLoading && <p role="status">Checking Google account and host access...</p>}

        {/* ------------------------------------------------------------------------- */}
        {/* DEVELOPER VIEW */}
        {/* ------------------------------------------------------------------------- */}
        {!firebaseLoading && role === 'DEVELOPER' && (
          <div style={{ backgroundColor: '#fff', padding: '1.8rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: '2rem' }}>
            <h2 style={{ color: '#6e1a3a', marginTop: 0 }}>🛠️ Developer Telemetry & Host Access</h2>
            <p style={{ fontSize: '0.9rem' }}>App Version: <strong>{CONFIG.version}</strong> | Active Orders in Engine: <strong>{activeOrders.length}</strong></p>
            
            <div style={{ backgroundColor: '#f9f9f9', padding: '1.2rem', borderRadius: '6px', margin: '1.5rem 0' }}>
              <h4 style={{ margin: '0 0 0.8rem' }}>{t.addHostHeader} (Max {CONFIG.maxHostLogins})</h4>
              <form onSubmit={handleAddHost} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.6rem', alignItems: 'center' }}>
                <input 
                  type="email" 
                  placeholder="Enter host Google account email"
                  value={newHostEmail} 
                  onChange={e => setNewHostEmail(e.target.value)} 
                  required 
                  style={{ flex: 1, padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} 
                />
                <button type="submit" disabled={!grantHostAccess} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '4px', cursor: grantHostAccess ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>Add as host</button>
                <label style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={grantHostAccess} onChange={e => setGrantHostAccess(e.target.checked)} />
                  Grant this Google account access to the Host view
                </label>
              </form>
              <div style={{ marginTop: '1rem', display: 'grid', gap: '0.45rem' }}>
                <strong>Host access</strong>
                {authorizedHosts.map(email => {
                  const fixedOwner = CONFIG.ownerEmails.some((owner: string) => owner.trim().toLowerCase() === email.toLowerCase());
                  return (
                    <label key={email} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="checkbox" checked disabled={fixedOwner} onChange={event => void handleHostAccessToggle(email, event.target.checked)} />
                      <span>{email}{fixedOwner ? ' (configured owner)' : ''}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* HOST / OWNER VIEW (also shown to the developer account) */}
        {/* ------------------------------------------------------------------------- */}
        {!firebaseLoading && (role === 'OWNER' || role === 'DEVELOPER') && (
          <div style={{ backgroundColor: '#fff', padding: '1.8rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
            <h2 style={{ color: '#6e1a3a', marginTop: 0 }}>🏪 Host Management Panel</h2>

            {/* Catalog Upload Form */}
            <div style={{ backgroundColor: '#f7ebe8', padding: '1.2rem', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem' }}>Upload New Catalog Item</h3>
              {firebaseConfigured && (!CONFIG.cloudinary.cloudName || !CONFIG.cloudinary.uploadPreset) && <p role="status" style={{ color: '#8a4b08', fontSize: '0.85rem' }}>Configure VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to upload product media. You can still use a hosted image URL.</p>}
              <form onSubmit={handlePublishProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                <input type="text" placeholder="Product Name *" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} required style={{ padding: '0.6rem' }} />
                <select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} style={{ padding: '0.6rem' }}>
                  <option value="Sarees">Sarees</option>
                  <option value="Custom Kuchu">Custom Kuchu</option>
                </select>
                <input type="number" placeholder="Regular Price (₹) *" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} required style={{ padding: '0.6rem' }} />
                <input type="number" placeholder="Offer Price (₹, Optional)" value={newProduct.offerPrice} onChange={e => setNewProduct({ ...newProduct, offerPrice: e.target.value })} style={{ padding: '0.6rem' }} />
                <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '0.25rem' }}>
                  <input type="text" placeholder="Optional: direct image link (ends in .jpg, .png or .webp)" value={newProduct.image} onChange={e => setNewProduct({ ...newProduct, image: e.target.value })} style={{ padding: '0.6rem' }} />
                  <small style={{ color: '#666' }}>Only used when no photo is uploaded. Google Drive, Google Photos and Instagram page links do not work as image links, so upload the photo instead.</small>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                  <label style={mediaButtonStyle}>
                    📷 Take photo
                    <input type="file" accept="image/*" capture="environment" onChange={handleProductMediaSelection} style={{ display: 'none' }} />
                  </label>
                  <label style={mediaButtonStyle}>
                    🎥 Record video
                    <input type="file" accept="video/*" capture="environment" onChange={handleProductMediaSelection} style={{ display: 'none' }} />
                  </label>
                  <label style={mediaButtonStyle}>
                    🖼️ Choose from gallery
                    <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple onChange={handleProductMediaSelection} style={{ display: 'none' }} />
                  </label>
                  <span style={{ color: '#666', fontSize: '0.8rem' }}>
                    Up to 6 photos and one video (30 seconds max). The camera buttons open the camera on a phone; on a computer they open the file picker.
                  </span>
                </div>
                {mediaPreviews.length > 0 && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '0.7rem' }}>
                    {mediaPreviews.map((preview, index) => (
                      <div key={`${preview.name}-${index}`} style={{ position: 'relative', width: '84px', height: '84px' }}>
                        {preview.isVideo ? (
                          <video src={preview.url} muted playsInline style={{ width: '84px', height: '84px', objectFit: 'cover', borderRadius: '6px' }} />
                        ) : (
                          <img src={preview.url} alt={preview.name} style={{ width: '84px', height: '84px', objectFit: 'cover', borderRadius: '6px' }} />
                        )}
                        <button type="button" aria-label={`Remove ${preview.name}`} onClick={() => removeProductMediaFile(index)} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#8b1e2d', color: '#fff', cursor: 'pointer', lineHeight: 1 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea placeholder="Product Description" value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} style={{ padding: '0.6rem', gridColumn: '1 / -1' }} />
                <button type="submit" disabled={isUploadingProduct} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', gridColumn: '1 / -1' }}>
                  {isUploadingProduct ? 'Uploading media...' : t.publishProduct}
                </button>
              </form>
            </div>

            <div style={{ backgroundColor: '#fff', padding: '1.2rem', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 0.6rem' }}>Checkout Payment QR</h3>
              <p style={{ margin: '0 0 0.8rem', color: '#666', fontSize: '0.9rem' }}>Customers will see this QR during checkout.</p>
              {firebaseConfigured && (!CONFIG.cloudinary.cloudName || !CONFIG.cloudinary.uploadPreset) && <p role="status" style={{ color: '#8a4b08', fontSize: '0.85rem' }}>Configure VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in the deployment environment to upload images.</p>}
              {paymentQrUrl && <img src={paymentQrUrl} alt="Current checkout payment QR" style={{ width: '160px', height: '160px', objectFit: 'contain', display: 'block', marginBottom: '0.8rem' }} />}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem', alignItems: 'center' }}>
                <input type="file" accept="image/*" onChange={handlePaymentQrSelection} />
                <button type="button" disabled={!paymentQrFile || isUploadingQr} onClick={() => void handleCheckoutQrUpload()} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {isUploadingQr ? 'Uploading...' : 'Save checkout QR'}
                </button>
              </div>
            </div>

            {/* Manage catalog */}
            <div style={{ backgroundColor: '#fff', padding: '1.2rem', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 0.3rem' }}>Manage catalog ({products.length})</h3>
              <p style={{ margin: '0 0 0.8rem', color: '#666', fontSize: '0.85rem' }}>Edit prices and offers, mark an item out of stock or coming soon, or remove it.</p>
              {products.length === 0 ? (
                <p style={{ margin: 0, color: '#666', fontStyle: 'italic' }}>No items published yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {products.map(product => (
                    <ProductManagerRow
                      key={`${product.id}-${product.name}-${product.price}-${product.offerPrice ?? ''}-${product.status ?? ''}`}
                      product={product}
                      onSave={handleUpdateProduct}
                      onDelete={handleDeleteProduct}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Manage Incoming Orders */}
            <h3>Incoming Orders & Courier Billing</h3>
            <div role="tablist" aria-label="Host order queues" style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid #ddd', margin: '0.8rem 0 1rem' }}>
              {([
                ['ACTIVE', `Active (${hostActiveOrders.length})`],
                ['DISPATCHED', `Dispatched (${hostDispatchedOrders.length})`],
                ['HISTORY', `History (${hostHistoryOrders.length})`],
              ] as const).map(([tab, label]) => (
                <button key={tab} type="button" role="tab" aria-selected={hostOrderTab === tab} onClick={() => setHostOrderTab(tab)} style={{ padding: '0.65rem 0.8rem', border: 0, borderBottom: hostOrderTab === tab ? '3px solid #6e1a3a' : '3px solid transparent', background: 'transparent', color: '#6e1a3a', fontWeight: 'bold', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            <p style={{ color: '#666', fontSize: '0.85rem' }}>Active orders are listed oldest first. Times are shown in your local timezone.</p>
            {hostVisibleOrders.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>
                {hostOrderTab === 'ACTIVE' && firebaseConfigured ? 'Incoming orders will appear here as customers submit them.' : 'No orders in this section.'}
              </p>
            ) : hostVisibleOrders.map(ord => {
              const canDispatch = Boolean(ord.deliveryConfirmed && ord.itemPayment?.verified) && (!ord.courierBill || Boolean(ord.courierPayment?.verified));
              return (
                <article key={ord.orderId} style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', fontWeight: 'bold' }}>
                    <span>Order #{ord.orderId}</span>
                    <span style={{ color: '#6e1a3a' }}>{getOrderStatus(ord)}</span>
                  </div>
                  <p style={{ fontSize: '0.85rem', margin: '0.45rem 0', color: '#555' }}>
                    Received {new Date(ord.createdAt).toLocaleString()} · Updated {new Date(ord.updatedAt).toLocaleString()}
                  </p>
                  <p style={{ fontSize: '0.9rem', margin: '0.4rem 0' }}>
                    Customer: {ord.address.fullName} ({ord.address.phone}){' '}
                    <a href={whatsAppLink(ord.address.phone, `Hello ${ord.address.fullName}, thank you for your order ${ord.orderId} at Mala Royale. We have received it and will update you shortly.`)} target="_blank" rel="noreferrer" style={{ marginLeft: '0.4rem', color: '#128c7e', fontWeight: 'bold' }}>WhatsApp customer</a>
                  </p>
                  <div style={{ margin: '0.6rem 0', padding: '0.75rem', background: '#f7f2ef', borderRadius: '5px' }}>
                    <strong>Delivery address</strong>
                    <p style={{ margin: '0.35rem 0' }}>
                      {[ord.address.houseNameOrNumber, ord.address.street1, ord.address.street2, ord.address.landmark1, ord.address.landmark2, ord.address.taluk, ord.address.district, ord.address.pincode].filter(Boolean).join(', ') || ord.address.street}
                    </p>
                    {ord.address.pincodeCheck && <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>{ord.address.pincodeCheck.provider}: {ord.address.pincodeCheck.message}</p>}
                    {ord.deliveryConfirmed ? (
                      <p role="status" style={{ color: '#1b5e20', margin: '0.35rem 0 0' }}>
                        Deliverable confirmed by {ord.deliveryConfirmedBy} · {ord.deliveryConfirmedAt ? new Date(ord.deliveryConfirmedAt).toLocaleString() : ''}
                      </p>
                    ) : (
                      <button type="button" disabled={!ord.address.pincodeCheck || ['NOT_FOUND', 'NOT_SERVICEABLE'].includes(ord.address.pincodeCheck.status)} onClick={() => void handleConfirmDelivery(ord)} style={{ marginTop: '0.35rem', padding: '0.5rem 0.75rem' }}>
                        Confirm address is deliverable
                      </button>
                    )}
                  </div>
                  <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
                    {ord.items.map((item, index) => <li key={`${item.productId}-${index}`}>{item.name} × {item.quantity} · ₹{item.price * item.quantity}</li>)}
                  </ul>
                  <p style={{ margin: '0.4rem 0', fontWeight: 'bold' }}>Items total: ₹{ord.itemTotal}</p>
                  <ParcelSheet key={`${ord.orderId}-${ord.parcelDetails?.savedAt || 'new'}`} order={ord} onSave={handleSaveParcel} />
                  {ord.itemPayment && (
                    <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                      Item payment: {ord.itemPayment.verified ? 'Confirmed' : 'Awaiting confirmation'} · UTR <code>{ord.itemPayment.utr}</code>
                      {!ord.itemPayment.verified && <button type="button" disabled={!ord.deliveryConfirmed} onClick={() => void handleVerifyPayment(ord.orderId, 'ITEM')} style={{ marginLeft: '0.5rem' }}>{t.verifyPayment}</button>}
                    </div>
                  )}
                  {ord.courierBill && (
                    <div style={{ marginTop: '0.6rem', padding: '0.7rem', background: '#f5f8fa', borderRadius: '5px' }}>
                      <strong>Courier charge: ₹{ord.courierBill.amount}</strong>
                      <span> · {ord.courierBill.courierName} · Tracking {ord.courierBill.trackingId}</span>
                      {ord.courierPayment && (
                        <p style={{ margin: '0.4rem 0' }}>
                          Customer UTR: <code>{ord.courierPayment.utr}</code> · {ord.courierPayment.verified ? 'Confirmed' : 'Awaiting host confirmation'}
                          {!ord.courierPayment.verified && <button type="button" onClick={() => void handleVerifyPayment(ord.orderId, 'COURIER')} style={{ marginLeft: '0.5rem' }}>Confirm courier payment</button>}
                        </p>
                      )}
                    </div>
                  )}
                  {hostOrderTab === 'ACTIVE' && <CourierBillForm key={`${ord.orderId}-${ord.courierBill?.billId || 'new'}`} order={ord} onSave={handleCourierReceipt} />}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.8rem' }}>
                    {hostOrderTab === 'ACTIVE' && <button type="button" disabled={!canDispatch} onClick={() => void handleDispatch(ord.orderId)} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.45rem 0.8rem', borderRadius: '4px', cursor: canDispatch ? 'pointer' : 'not-allowed' }}>{t.markDispatched}</button>}
                    {hostOrderTab === 'DISPATCHED' && <button type="button" onClick={() => void handleDelivered(ord.orderId)} style={{ backgroundColor: '#2e7d32', color: '#fff', border: 'none', padding: '0.45rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Mark delivered</button>}
                    {hostOrderTab === 'ACTIVE' && <button type="button" onClick={() => void handleNotAccepted(ord.orderId)} style={{ backgroundColor: '#fff', color: '#8b1e2d', border: '1px solid #8b1e2d', padding: '0.45rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Not accepted</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* CUSTOMER VIEW */}
        {/* ------------------------------------------------------------------------- */}
        {!firebaseLoading && role === 'CUSTOMER' && (
          <div>
            <nav aria-label="Customer sections" style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #ddd', marginBottom: '1.4rem' }}>
              <button
                type="button"
                role="tab"
                aria-selected={customerTab === 'SHOP'}
                onClick={() => setCustomerTab('SHOP')}
                style={{ padding: '0.7rem 1rem', border: 0, borderBottom: customerTab === 'SHOP' ? '3px solid #6e1a3a' : '3px solid transparent', background: 'transparent', color: '#6e1a3a', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Shop
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={customerTab === 'ORDERS'}
                onClick={() => setCustomerTab('ORDERS')}
                style={{ padding: '0.7rem 1rem', border: 0, borderBottom: customerTab === 'ORDERS' ? '3px solid #6e1a3a' : '3px solid transparent', background: 'transparent', color: '#6e1a3a', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Recent orders{activeOrders.length > 0 ? ` (${activeOrders.length})` : ''}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={customerTab === 'ADDRESSES'}
                onClick={() => setCustomerTab('ADDRESSES')}
                style={{ padding: '0.7rem 1rem', border: 0, borderBottom: customerTab === 'ADDRESSES' ? '3px solid #6e1a3a' : '3px solid transparent', background: 'transparent', color: '#6e1a3a', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Addresses{savedAddresses.length > 0 ? ` (${savedAddresses.length})` : ''}
              </button>
            </nav>

            {customerTab === 'ADDRESSES' && (
              <section aria-label="Saved delivery addresses">
                <h2 style={{ color: '#6e1a3a', marginTop: 0 }}>Delivery addresses</h2>
                {firebaseConfigured && !googleUser && (
                  <div style={{ marginBottom: '1rem' }}>
                    <p role="status" style={{ marginTop: 0 }}>Sign in with Google to save addresses to your account.</p>
                    <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label="Sign in with Google" />
                  </div>
                )}
                <div style={{ display: 'grid', gap: '0.7rem', marginBottom: '1.2rem' }}>
                  {savedAddresses.map(saved => (
                    <article key={saved.id} style={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px', padding: '0.9rem' }}>
                      <strong>{saved.fullName} · {saved.phone}</strong>
                      <p style={{ margin: '0.35rem 0', color: '#555' }}>
                        {[saved.houseNameOrNumber, saved.street1, saved.street2, saved.landmark1, saved.landmark2, saved.taluk, saved.district, saved.pincode].filter(Boolean).join(', ')}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <button type="button" onClick={() => { selectDeliveryAddress(saved.id); setCustomerTab('SHOP'); setIsCheckoutOpen(true); setCheckoutStep(1); }} style={{ padding: '0.45rem 0.7rem' }}>Use at checkout</button>
                        <button type="button" onClick={() => { setAddress({ ...saved }); setEditingAddressId(saved.id); }} style={{ padding: '0.45rem 0.7rem' }}>Edit</button>
                        <button type="button" onClick={() => void handleDeleteDeliveryAddress(saved.id)} style={{ padding: '0.45rem 0.7rem' }}>Delete</button>
                      </div>
                    </article>
                  ))}
                </div>
                <form onSubmit={handleSaveDeliveryAddress} style={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', display: 'grid', gap: '0.8rem' }}>
                  <h3 style={{ margin: 0 }}>{editingAddressId ? 'Edit address' : 'Add a delivery address'}</h3>
                  <DeliveryAddressFields address={address} setAddress={setAddress} isCheckingPincode={isCheckingPincode} onCheckPincode={() => void handleCheckPincode()} />
                  <button type="submit" style={{ justifySelf: 'start', backgroundColor: '#6e1a3a', color: '#fff', border: 0, borderRadius: '4px', padding: '0.6rem 0.9rem', cursor: 'pointer' }}>
                    {editingAddressId ? 'Save address changes' : 'Save address'}
                  </button>
                  {editingAddressId && <button type="button" onClick={() => { setEditingAddressId(null); setAddress({ fullName: '', phone: '', houseNameOrNumber: '', street1: '', street2: '', street: '', landmark1: '', landmark2: '', taluk: '', district: '', pincode: '', consentTimestamp: '' }); }} style={{ justifySelf: 'start' }}>Cancel editing</button>}
                </form>
              </section>
            )}

            {customerTab === 'SHOP' && (
              <>
            {/* Filter Bar & Cart Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                {['All', 'Sarees', 'Custom Kuchu'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    style={{
                      backgroundColor: categoryFilter === cat ? '#6e1a3a' : '#fff',
                      color: categoryFilter === cat ? '#fff' : '#6e1a3a',
                      border: '1px solid #6e1a3a',
                      padding: '0.5rem 1rem',
                      marginRight: '0.5rem',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setIsCartOpen(true)}
                style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.6rem 1.4rem', borderRadius: '25px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                View cart · {cartCount} item{cartCount === 1 ? '' : 's'} · ₹{cartTotal}
              </button>
            </div>

            {/* Catalog Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.8rem' }}>
              {filteredProducts.map(product => (
                <div key={product.id} style={{ backgroundColor: '#fff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
                  <ProductGallery product={product} />
                  <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#6e1a3a', fontWeight: 'bold', textTransform: 'uppercase' }}>{product.category}</span>
                      <h3 style={{ margin: '0.3rem 0', fontSize: '1.1rem' }}>{product.name}</h3>
                      <p style={{ fontSize: '0.85rem', color: '#666', lineHeight: '1.3' }}>{product.description}</p>
                    </div>
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div>
                        {product.offerPrice ? (
                          <>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#6e1a3a' }}>₹{product.offerPrice}</span>
                            <span style={{ fontSize: '0.85rem', color: '#999', textDecoration: 'line-through', marginLeft: '0.4rem' }}>₹{product.price}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#6e1a3a' }}>₹{product.price}</span>
                        )}
                      </div>
                      {isPurchasable(product) ? (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            onClick={() => addToCart(product)}
                            style={{ backgroundColor: '#fff', color: '#6e1a3a', border: '1px solid #6e1a3a', padding: '0.45rem 0.65rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            + Add
                          </button>
                          <button
                            onClick={() => buyNow(product)}
                            style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.45rem 0.65rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            Buy now
                          </button>
                        </div>
                      ) : (
                        <span style={{ ...STATUS_COLORS[product.status || 'OUT_OF_STOCK'], fontSize: '0.85rem', fontWeight: 'bold', padding: '0.4rem 0.8rem', borderRadius: '999px' }}>
                          {STATUS_LABELS[product.status || 'OUT_OF_STOCK']}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Cart Drawer */}
            {isCartOpen && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
                <div role="dialog" aria-label="Shopping cart" style={{ backgroundColor: '#fff', maxWidth: '550px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '12px', padding: '1.8rem', position: 'relative' }}>
                  <button type="button" aria-label="Close cart" onClick={() => setIsCartOpen(false)} style={{ position: 'absolute', top: '15px', right: '15px', border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                  <h2 style={{ color: '#6e1a3a', marginTop: 0 }}>Your cart</h2>

                  {cart.length === 0 ? (
                    <div>
                      <p>Your cart is empty.</p>
                      <button type="button" onClick={() => setIsCartOpen(false)} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Continue shopping</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gap: '0.9rem' }}>
                        {cart.map(line => (
                          <div key={line.product.id} style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '0.9rem' }}>
                            <img src={line.product.image} alt="" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', flex: '0 0 64px' }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <strong>{line.product.name}</strong>
                              <div style={{ fontSize: '0.85rem', color: '#666' }}>₹{unitPrice(line.product)} each</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
                                <button type="button" aria-label={`Decrease quantity of ${line.product.name}`} onClick={() => changeQuantity(line.product.id, -1)} style={{ width: '30px', height: '30px', cursor: 'pointer' }}>−</button>
                                <span aria-live="polite" style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 'bold' }}>{line.quantity}</span>
                                <button type="button" aria-label={`Increase quantity of ${line.product.name}`} disabled={line.quantity >= MAX_CART_QUANTITY} onClick={() => changeQuantity(line.product.id, 1)} style={{ width: '30px', height: '30px', cursor: line.quantity >= MAX_CART_QUANTITY ? 'not-allowed' : 'pointer' }}>+</button>
                                <button type="button" onClick={() => removeFromCart(line.product.id)} style={{ marginLeft: '0.4rem', background: 'none', border: 'none', color: '#8b1e2d', textDecoration: 'underline', cursor: 'pointer' }}>Remove</button>
                              </div>
                            </div>
                            <div style={{ fontWeight: 'bold', color: '#6e1a3a' }}>₹{unitPrice(line.product) * line.quantity}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ borderTop: '2px solid #6e1a3a', marginTop: '1rem', paddingTop: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                          <span>Items ({cartCount})</span>
                          <span>₹{cartTotal}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '0.4rem', fontWeight: 'bold', fontSize: '1.1rem' }}>
                          <span>Order total</span>
                          <span style={{ color: '#6e1a3a' }}>₹{cartTotal}</span>
                        </div>
                        <p style={{ color: '#666', fontSize: '0.8rem', marginBottom: 0 }}>Courier charges are billed separately after your order is confirmed.</p>
                        {unavailableLines.length > 0 && (
                          <p role="alert" style={{ color: '#8b1e2d', fontSize: '0.85rem', marginBottom: 0 }}>
                            No longer available: {unavailableLines.map(line => line.product.name).join(', ')}. Please remove {unavailableLines.length === 1 ? 'it' : 'them'} to continue.
                          </p>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1.2rem' }}>
                        <button type="button" onClick={() => setIsCartOpen(false)} style={{ flex: '1 1 140px', backgroundColor: '#fff', color: '#6e1a3a', border: '1px solid #6e1a3a', padding: '0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Continue shopping</button>
                        <button type="button" disabled={unavailableLines.length > 0} onClick={() => { setIsCartOpen(false); setCheckoutStep(1); setIsCheckoutOpen(true); }} style={{ flex: '1 1 140px', backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '6px', cursor: unavailableLines.length > 0 ? 'not-allowed' : 'pointer', opacity: unavailableLines.length > 0 ? 0.6 : 1, fontWeight: 'bold' }}>Proceed to checkout</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 3-Step Checkout Drawer */}
            {isCheckoutOpen && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
                <div style={{ backgroundColor: '#fff', maxWidth: '550px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '12px', padding: '1.8rem', position: 'relative' }}>
                  <button onClick={() => setIsCheckoutOpen(false)} style={{ position: 'absolute', top: '15px', right: '15px', border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>

                  <h2 style={{ color: '#6e1a3a', marginTop: 0 }}>Checkout</h2>

                  {/* Order Summary */}
                  <div style={{ backgroundColor: '#f7f2ef', padding: '0.8rem', borderRadius: '6px', marginBottom: '1.2rem', fontSize: '0.9rem' }}>
                    <strong>Order summary</strong>
                    {cart.length === 0 ? (
                      <p style={{ margin: '0.4rem 0 0' }}>Your cart is empty.</p>
                    ) : cart.map(line => (
                      <div key={line.product.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.35rem' }}>
                        <span>{line.product.name} × {line.quantity}</span>
                        <span>₹{unitPrice(line.product) * line.quantity}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.5rem', fontWeight: 'bold' }}>
                      <span>Order total</span>
                      <span>₹{cartTotal}</span>
                    </div>
                    <button type="button" onClick={() => { setIsCheckoutOpen(false); setIsCartOpen(true); }} style={{ marginTop: '0.5rem', padding: '0.35rem 0.7rem', cursor: 'pointer' }}>Edit cart</button>
                  </div>

                  {/* Courier Policy Notice */}
                  <div style={{ backgroundColor: '#fff8e7', borderLeft: '4px solid #d97706', padding: '0.8rem', borderRadius: '4px', marginBottom: '1.2rem', fontSize: '0.85rem' }}>
                    <strong style={{ color: '#92400e' }}>{t.courierNoticeTitle}</strong>
                    <p style={{ margin: '0.3rem 0 0.5rem' }}>{t.courierNoticeBody}</p>
                    <label style={{ fontWeight: 'bold', cursor: 'pointer' }}>
                      <input type="checkbox" checked={courierPolicyAccepted} onChange={(e) => setCourierPolicyAccepted(e.target.checked)} /> {t.acceptCourierNotice}
                    </label>
                  </div>

                  {/* Step 1: Address */}
                  {checkoutStep === 1 && (
                    <div>
                      <h3>{t.step1Address}</h3>
                      {savedAddresses.length > 0 && (
                        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.8rem' }}>
                          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input type="checkbox" checked={useSavedAddress} onChange={event => {
                              setUseSavedAddress(event.target.checked);
                              if (event.target.checked && !selectedAddressId) selectDeliveryAddress(savedAddresses[0].id);
                            }} />
                            Use a saved address
                          </label>
                          {useSavedAddress && (
                            <>
                              <select aria-label="Select saved delivery address" value={selectedAddressId} onChange={event => selectDeliveryAddress(event.target.value)}>
                                {savedAddresses.map(saved => <option key={saved.id} value={saved.id}>{saved.fullName} · {saved.street1} · {saved.pincode}</option>)}
                              </select>
                              <p style={{ margin: 0, color: '#555', fontSize: '0.85rem' }}>
                                {[address.houseNameOrNumber, address.street1, address.street2, address.landmark1, address.landmark2, address.taluk, address.district, address.pincode].filter(Boolean).join(', ')}
                              </p>
                              <button type="button" disabled={isCheckingPincode || address.pincode.length !== 6} onClick={() => void handleCheckPincode()}>
                                {isCheckingPincode ? 'Checking pincode...' : 'Check selected pincode online'}
                              </button>
                              {address.pincodeCheck && <span role="status">{address.pincodeCheck.provider}: {address.pincodeCheck.message}</span>}
                            </>
                          )}
                        </div>
                      )}
                      {!useSavedAddress && <DeliveryAddressFields address={address} setAddress={setAddress} isCheckingPincode={isCheckingPincode} onCheckPincode={() => void handleCheckPincode()} />}
                      {!useSavedAddress && (googleUser || !firebaseConfigured) && (
                        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.6rem' }}>
                          <input type="checkbox" checked={saveAddressForLater} onChange={event => setSaveAddressForLater(event.target.checked)} />
                          Save this address for next time
                        </label>
                      )}
                      <p style={{ color: '#666', fontSize: '0.8rem' }}>Delivery address only. The host will confirm courier serviceability before accepting payment.</p>
                      <button
                        onClick={() => setCheckoutStep(2)}
                        disabled={!address.pincodeCheck || ['NOT_FOUND', 'NOT_SERVICEABLE'].includes(address.pincodeCheck.status) || (useSavedAddress ? !selectedAddressId : !address.fullName || !address.phone || !address.street1 || !address.street2 || !address.landmark1 || !address.taluk || !address.district || !/^\d{6}$/.test(address.pincode))}
                        style={{ marginTop: '1.2rem', backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}
                      >Next: Item Payment</button>
                    </div>
                  )}

                  {/* Step 2: Payment */}
                  {checkoutStep === 2 && (
                    <form onSubmit={handlePlaceOrder}>
                      <h3>{t.step2Payment} (₹{cartTotal})</h3>
                      {firebaseConfigured && !googleUser && (
                        <div style={{ backgroundColor: '#f1f8ff', border: '1px solid #cfe3f7', padding: '0.8rem', borderRadius: '6px', margin: '0.6rem 0', fontSize: '0.85rem' }}>
                          <strong>No account needed.</strong> The host will confirm your order on WhatsApp{address.phone ? ` at ${address.phone}` : ''}. Sign in with Google (optional) to keep track of your orders on any device.
                          <div style={{ marginTop: '0.5rem' }}>
                            <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label="Sign in with Google (optional)" />
                          </div>
                        </div>
                      )}
                      <div style={{ backgroundColor: '#f7f2ef', padding: '1rem', borderRadius: '6px', margin: '0.8rem 0' }}>
                        <p style={{ marginTop: 0, fontSize: '0.9rem' }}>Scan the payment QR provided by the host, then enter your 12-digit UTR reference.</p>
                        {paymentQrUrl ? (
                          <img src={paymentQrUrl} alt="Host payment QR code" style={{ width: '200px', height: '200px', maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                        ) : (
                          <p role="status" style={{ marginBottom: 0, color: '#8a4b08' }}>The host has not added a payment QR yet.</p>
                        )}
                      </div>
                      <input 
                        type="text" 
                        placeholder={t.enterUtr} 
                        value={utr} 
                        onChange={e => setUtr(e.target.value)} 
                        required 
                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px', margin: '0.8rem 0' }} 
                      />
                      <button type="submit" disabled={firebaseLoading} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>{t.placeOrder}</button>
                    </form>
                  )}
                </div>
              </div>
            )}
              </>
            )}

            {customerTab === 'ORDERS' && (
              <section aria-label="Recent orders and tracking">
                <h2 style={{ color: '#6e1a3a', marginTop: 0 }}>{t.myOrders}</h2>
                {firebaseConfigured && !googleUser && (
                  <div style={{ backgroundColor: '#f1f8ff', border: '1px solid #cfe3f7', padding: '0.8rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Placed an order before, or want to track orders from any device?</span>
                    <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label="Sign in with Google" />
                  </div>
                )}
                {activeOrders.length === 0 ? (
                  <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #eee' }}>
                    <p style={{ marginTop: 0 }}>{firebaseConfigured && !googleUser ? 'No orders on this device yet.' : 'No orders yet.'}</p>
                    <button type="button" onClick={() => setCustomerTab('SHOP')} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 0, padding: '0.6rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Browse the collection</button>
                  </div>
                ) : activeOrders.map(ord => (
                  <article key={ord.orderId} style={{ backgroundColor: '#fff', border: '1px solid #eee', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <strong>Order #{ord.orderId}</strong>
                        <div style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.2rem' }}>Placed {new Date(ord.createdAt).toLocaleString()}</div>
                      </div>
                      <span style={{ color: '#6e1a3a', fontWeight: 'bold' }}>{getOrderStatus(ord)}</span>
                    </div>
                    <ul style={{ margin: '0.8rem 0', paddingLeft: '1.2rem' }}>
                      {ord.items.map((item, index) => (
                        <li key={`${item.productId}-${index}`} style={{ marginBottom: '0.25rem' }}>
                          {item.name} × {item.quantity} <span style={{ color: '#555' }}>₹{item.price * item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    <p style={{ margin: '0.4rem 0', fontWeight: 'bold' }}>Order total: ₹{ord.itemTotal}</p>
                    <p style={{ margin: '0.4rem 0', color: '#666', fontSize: '0.85rem' }}>Last updated {new Date(ord.updatedAt).toLocaleString()}</p>
                    <div style={{ margin: '0.7rem 0', padding: '0.75rem', backgroundColor: '#f7f2ef', borderRadius: '6px' }}>
                      <strong>Delivery address submitted</strong>
                      <p style={{ margin: '0.35rem 0' }}>{ord.address.fullName} · {ord.address.phone}</p>
                      <p style={{ margin: '0.35rem 0' }}>
                        {[ord.address.houseNameOrNumber, ord.address.street1, ord.address.street2, ord.address.landmark1, ord.address.landmark2, ord.address.taluk, ord.address.district, ord.address.pincode].filter(Boolean).join(', ') || ord.address.street}
                      </p>
                      <p role="status" style={{ margin: '0.35rem 0', color: ord.deliveryConfirmed ? '#1b5e20' : '#8a4b08' }}>
                        {ord.deliveryConfirmed ? `Host confirmed deliverable${ord.deliveryConfirmedAt ? ` · ${new Date(ord.deliveryConfirmedAt).toLocaleString()}` : ''}` : 'Waiting for host to confirm delivery serviceability'}
                      </p>
                    </div>
                    {ord.courierBill && (
                      <div style={{ marginTop: '0.6rem', backgroundColor: '#e8f5e9', padding: '0.8rem', borderRadius: '6px', fontSize: '0.9rem' }}>
                        <p style={{ margin: 0 }}>Courier: <strong>{ord.courierBill.courierName}</strong></p>
                        <p style={{ margin: '0.2rem 0' }}>Tracking ID: <strong>{ord.courierBill.trackingId}</strong></p>
                        <p style={{ margin: 0 }}>Courier Charge: <strong>₹{ord.courierBill.amount}</strong></p>
                      </div>
                    )}
                    {ord.courierBill && <CourierPaymentForm order={ord} paymentQrUrl={paymentQrUrl} canSubmit={!firebaseConfigured || Boolean(firebaseUser)} onSubmit={handleCourierPayment} />}
                  </article>
                ))}
              </section>
            )}

            {placedOrder && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '1rem' }}>
                <div role="dialog" aria-label="Order placed" style={{ backgroundColor: '#fff', maxWidth: '460px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '12px', padding: '1.8rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '2.4rem' }} aria-hidden="true">✅</div>
                  <h2 style={{ color: '#6e1a3a', margin: '0.3rem 0' }}>Order placed!</h2>
                  <p style={{ margin: '0.3rem 0', color: '#555' }}>Thank you, {placedOrder.name}. Your order ID is:</p>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 'bold', backgroundColor: '#f7f2ef', padding: '0.7rem', borderRadius: '6px', letterSpacing: '0.04em', wordBreak: 'break-all' }}>{placedOrder.orderId}</div>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard?.writeText(placedOrder.orderId).then(() => setOrderCopied(true)).catch(() => undefined); }}
                    style={{ marginTop: '0.6rem', padding: '0.45rem 0.9rem', cursor: 'pointer' }}
                  >
                    {orderCopied ? 'Copied ✓' : 'Copy order ID'}
                  </button>
                  <p style={{ margin: '0.9rem 0 0.3rem', fontWeight: 'bold' }}>Order total: ₹{placedOrder.total}</p>
                  <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.3rem 0 1rem' }}>
                    The host will verify your payment and confirm your order on WhatsApp at {placedOrder.phone}. Keep this order ID for any questions.
                  </p>
                  {firebaseConfigured && !googleUser && (
                    <div style={{ marginBottom: '1rem' }}>
                      <p style={{ color: '#666', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>Want to track this order from any device?</p>
                      <GoogleSignInButton onClick={() => void handleGoogleSignIn()} disabled={firebaseLoading} label="Sign in with Google" />
                    </div>
                  )}
                  <button type="button" onClick={() => setPlacedOrder(null)} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem 1.2rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>View my orders</button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
