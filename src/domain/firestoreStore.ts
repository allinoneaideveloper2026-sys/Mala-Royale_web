import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { CONFIG } from '../config';
import { firestore } from '../firebase';
import { CourierBill, CustomerAddress, Enquiry, Order, ParcelDetails, PaymentRecord, PincodeCheck, Product, ProductMedia, ProductStatus, SavedDeliveryAddress } from './types';

function requireFirestore(): Firestore {
  if (!firestore) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* settings first.');
  return firestore;
}

function createId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

interface CloudinaryUploadResponse {
  secure_url?: unknown;
  error?: { message?: unknown };
}

async function uploadToCloudinary(file: File, resourceType: 'image' | 'video'): Promise<string> {
  const { cloudName, uploadPreset } = CONFIG.cloudinary;
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  });
  let result: CloudinaryUploadResponse;
  try {
    result = await response.json() as CloudinaryUploadResponse;
  } catch {
    throw new Error(`Cloudinary returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = typeof result.error?.message === 'string' ? result.error.message : `Cloudinary upload failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (typeof result.secure_url !== 'string' || !result.secure_url.startsWith('https://')) {
    throw new Error('Cloudinary did not return a valid secure media URL.');
  }
  return result.secure_url;
}

async function hashPaymentReference(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function subscribeProducts(onChange: (products: Product[]) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(collection(db, 'products'), snapshot => {
    onChange(snapshot.docs.map(product => ({ ...product.data(), id: product.id } as Product)));
  }, onError);
}

export async function seedInitialProducts(products: Product[]): Promise<void> {
  const db = requireFirestore();
  const existing = await getDocs(collection(db, 'products'));
  if (!existing.empty) return;

  const batch = writeBatch(db);
  products.forEach(product => batch.set(doc(db, 'products', product.id), product));
  await batch.commit();
}

export async function publishProduct(product: Product): Promise<void> {
  const db = requireFirestore();
  // Firestore rejects `undefined` values (for example a blank offer price), so drop them first.
  const data = JSON.parse(JSON.stringify(product)) as Product;
  await setDoc(doc(db, 'products', product.id), data);
}

export async function updateProduct(
  productId: string,
  changes: { name: string; price: number; offerPrice?: number; quantity: number; status: ProductStatus },
): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'products', productId), {
    name: changes.name,
    price: changes.price,
    offerPrice: changes.offerPrice === undefined ? deleteField() : changes.offerPrice,
    quantity: changes.quantity,
    status: changes.status,
  });
}

export async function deleteProduct(productId: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'products', productId));
}

export async function uploadProductMedia(files: File[]): Promise<ProductMedia[]> {
  const videos = files.filter(file => file.type.startsWith('video/'));
  const images = files.filter(file => file.type.startsWith('image/'));
  if (files.length !== images.length + videos.length || images.length > 6 || videos.length > 1) {
    throw new Error('Choose up to 6 photos and one product video.');
  }
  return Promise.all(files.map(async file => {
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    if (type === 'image' && (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024)) {
      throw new Error('Each product photo must be an image smaller than 10 MB.');
    }
    if (type === 'video' && (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type) || file.size > 50 * 1024 * 1024)) {
      throw new Error('Use an MP4, WebM, or QuickTime video smaller than 50 MB.');
    }
    return { url: await uploadToCloudinary(file, type), type, name: file.name };
  }));
}

export function subscribeCheckoutQr(onChange: (url: string) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(doc(db, 'settings', 'checkout'), snapshot => {
    onChange(snapshot.exists() ? String(snapshot.data().paymentQrUrl || '') : '');
  }, onError);
}

export async function uploadCheckoutQr(file: File): Promise<string> {
  const db = requireFirestore();
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file for the payment QR.');
  if (file.size > 5 * 1024 * 1024) throw new Error('The payment QR image must be smaller than 5 MB.');

  const url = await uploadToCloudinary(file, 'image');
  await setDoc(doc(db, 'settings', 'checkout'), { paymentQrUrl: url, updatedAt: new Date().toISOString() }, { merge: true });
  return url;
}

export function subscribeOrders(
  userId: string,
  canManageOrders: boolean,
  onChange: (orders: Order[]) => void,
  onError: (error: Error) => void,
) {
  const db = requireFirestore();
  const orders = collection(db, 'orders');
  const ordersQuery = canManageOrders ? orders : query(orders, where('userId', '==', userId));

  return onSnapshot(ordersQuery, snapshot => {
    const records = snapshot.docs.map(order => ({ ...order.data(), orderId: order.id } as Order));
    records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    onChange(records);
  }, onError);
}

export async function isAuthorizedHost(email: string): Promise<boolean> {
  const db = requireFirestore();
  const host = await getDoc(doc(db, 'hostAccess', email.toLowerCase()));
  return host.exists();
}

export function subscribeAuthorizedHosts(onChange: (emails: string[]) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(collection(db, 'hostAccess'), snapshot => {
    const hosts = snapshot.docs.map(host => host.id.toLowerCase());
    onChange(Array.from(new Set([...CONFIG.ownerEmails.map((email: string) => email.trim().toLowerCase()), ...hosts])).sort());
  }, onError);
}

export async function authorizeHost(email: string): Promise<void> {
  const db = requireFirestore();
  const normalizedEmail = email.trim().toLowerCase();
  await setDoc(doc(db, 'hostAccess', normalizedEmail), { email: normalizedEmail });
}

export async function revokeHost(email: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'hostAccess', email.trim().toLowerCase()));
}

export async function createCloudOrder(
  userId: string,
  items: Order['items'],
  itemTotal: number,
  address: CustomerAddress,
  courierNoticeAccepted: boolean,
  utr: string,
): Promise<Order> {
  const db = requireFirestore();
  if (!courierNoticeAccepted) throw new Error('Courier charge notice must be accepted prior to order placement.');

  const orderId = `MR-${createId()}`;
  const orderRef = doc(db, 'orders', orderId);
  const referenceId = await hashPaymentReference(utr);
  const paymentRef = doc(db, 'paymentReferences', referenceId);
  const now = new Date().toISOString();
  const itemPayment: PaymentRecord = {
    paymentId: `PAY-${createId()}`,
    kind: 'ITEM',
    amount: itemTotal,
    utr,
    screenshotUrl: 'uploaded_proof.png',
    verified: false,
  };
  const order: Order = {
    orderId,
    userId,
    items,
    itemTotal,
    stage: 'ORDER_RECEIVED',
    isWithheld: false,
    courierNoticeAccepted,
    address,
    itemPayment,
    createdAt: now,
    updatedAt: now,
  };

  await runTransaction(db, async transaction => {
    const existingReference = await transaction.get(paymentRef);
    if (existingReference.exists()) throw new Error('UTR has already been submitted for another order.');
    transaction.set(orderRef, order);
    transaction.set(paymentRef, { userId, orderId, createdAt: now });
  });

  return order;
}

function totalsByProduct(items: Order['items']): Array<[string, number]> {
  const totals = new Map<string, number>();
  items.forEach(item => totals.set(item.productId, (totals.get(item.productId) || 0) + item.quantity));
  return Array.from(totals.entries());
}

export async function verifyCloudPayment(orderId: string, kind: 'ITEM' | 'COURIER'): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    const order = snapshot.data() as Order;
    if (kind === 'ITEM' && !order.deliveryConfirmed) {
      throw new Error('Host must confirm the delivery address before confirming payment.');
    }
    const paymentField = kind === 'ITEM' ? 'itemPayment' : 'courierPayment';
    if (!order[paymentField]) return;
    if (order[paymentField]?.verified) return;

    // Confirming the item payment is the point where stock is reduced.
    const stockUpdates: Array<{ ref: DocumentReference; quantity: number }> = [];
    if (kind === 'ITEM') {
      const entries = totalsByProduct(order.items);
      const productSnapshots = await Promise.all(entries.map(([productId]) => transaction.get(doc(db, 'products', productId))));
      productSnapshots.forEach((productSnapshot, index) => {
        if (!productSnapshot.exists()) return;
        const product = productSnapshot.data() as Product;
        if (typeof product.quantity !== 'number') return;
        const requested = entries[index][1];
        if (product.quantity < requested) {
          throw new Error(`Not enough stock for "${product.name}" (${product.quantity} left, ${requested} ordered). Restock it, or mark the order as not accepted.`);
        }
        stockUpdates.push({ ref: productSnapshot.ref, quantity: product.quantity - requested });
      });
    }

    transaction.update(orderRef, {
      [`${paymentField}.verified`]: true,
      stage: kind === 'ITEM' ? 'ITEM_PAYMENT_VERIFIED' : 'COURIER_CHARGE_VERIFIED',
      updatedAt: new Date().toISOString(),
    });
    stockUpdates.forEach(update => transaction.update(update.ref, { quantity: update.quantity }));
  });
}

export async function attachCloudCourierBill(orderId: string, bill: Omit<CourierBill, 'billId'>): Promise<void> {
  const db = requireFirestore();
  if (!Number.isFinite(bill.amount) || bill.amount <= 0) throw new Error('Courier amount must be greater than zero.');
  await updateDoc(doc(db, 'orders', orderId), {
    courierBill: { ...bill, billId: `CB-${createId()}` },
    courierPayment: deleteField(),
    stage: 'COURIER_RECEIPT_UPLOADED',
    updatedAt: new Date().toISOString(),
  });
}

export async function submitCloudCourierPayment(orderId: string, userId: string, utr: string): Promise<void> {
  const db = requireFirestore();
  const normalizedUtr = utr.trim();
  if (!/^\d{12}$/.test(normalizedUtr)) throw new Error('Enter the 12-digit courier payment UTR.');
  const orderRef = doc(db, 'orders', orderId);
  const referenceId = await hashPaymentReference(normalizedUtr);
  const paymentRef = doc(db, 'paymentReferences', referenceId);
  const now = new Date().toISOString();

  await runTransaction(db, async transaction => {
    const [orderSnapshot, referenceSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(paymentRef),
    ]);
    if (!orderSnapshot.exists()) throw new Error('Order not found.');
    if (referenceSnapshot.exists()) throw new Error('UTR has already been submitted for another payment.');
    const order = orderSnapshot.data() as Order;
    if (order.userId !== userId) throw new Error('This order does not belong to your account.');
    if (!order.courierBill) throw new Error('The host has not added a courier charge yet.');
    if (order.courierPayment) throw new Error('Courier payment has already been submitted.');

    const payment: PaymentRecord = {
      paymentId: `PAY-${createId()}`,
      kind: 'COURIER',
      amount: order.courierBill.amount,
      utr: normalizedUtr,
      screenshotUrl: '',
      verified: false,
      submittedAt: now,
    };
    transaction.update(orderRef, { courierPayment: payment, updatedAt: now });
    transaction.set(paymentRef, { userId, orderId, createdAt: now });
  });
}

export async function submitCloudOrderForDispatch(orderId: string): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    const order = snapshot.data() as Order;
    if (order.isWithheld) throw new Error('Parcel is withheld by host.');
    if (order.courierBill && !order.courierPayment?.verified) {
      throw new Error('Courier payment must be confirmed before dispatch.');
    }
    transaction.update(orderRef, { stage: 'SUBMITTED_FOR_DISPATCH', updatedAt: new Date().toISOString() });
  });
}

export async function markCloudOrderNotAccepted(orderId: string): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    const order = snapshot.data() as Order;
    if (order.stage === 'NOT_ACCEPTED') return;

    // If stock was already reduced when the item payment was confirmed, put it back.
    const restocks: Array<{ ref: DocumentReference; quantity: number }> = [];
    if (order.itemPayment?.verified) {
      const entries = totalsByProduct(order.items);
      const productSnapshots = await Promise.all(entries.map(([productId]) => transaction.get(doc(db, 'products', productId))));
      productSnapshots.forEach((productSnapshot, index) => {
        if (!productSnapshot.exists()) return;
        const product = productSnapshot.data() as Product;
        if (typeof product.quantity !== 'number') return;
        restocks.push({ ref: productSnapshot.ref, quantity: product.quantity + entries[index][1] });
      });
    }

    transaction.update(orderRef, { stage: 'NOT_ACCEPTED', updatedAt: new Date().toISOString() });
    restocks.forEach(update => transaction.update(update.ref, { quantity: update.quantity }));
  });
}

export async function markCloudOrderDelivered(orderId: string): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    if ((snapshot.data() as Order).stage !== 'SUBMITTED_FOR_DISPATCH') {
      throw new Error('Only dispatched orders can be marked delivered.');
    }
    transaction.update(orderRef, { stage: 'DELIVERED', updatedAt: new Date().toISOString() });
  });
}

export async function saveCloudParcelDetails(orderId: string, parcelDetails: ParcelDetails): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'orders', orderId), {
    parcelDetails,
    updatedAt: parcelDetails.savedAt,
  });
}

export function subscribeSavedAddresses(
  userId: string,
  onChange: (addresses: SavedDeliveryAddress[]) => void,
  onError: (error: Error) => void,
) {
  const db = requireFirestore();
  return onSnapshot(collection(db, 'users', userId, 'addresses'), snapshot => {
    onChange(snapshot.docs.map(address => ({ ...address.data(), id: address.id } as SavedDeliveryAddress)));
  }, onError);
}

export async function saveCloudDeliveryAddress(userId: string, address: SavedDeliveryAddress): Promise<void> {
  const db = requireFirestore();
  const { id, ...deliveryAddress } = address;
  await setDoc(doc(db, 'users', userId, 'addresses', id), deliveryAddress);
}

export async function deleteCloudDeliveryAddress(userId: string, addressId: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'users', userId, 'addresses', addressId));
}

export async function checkDeliveryPincode(pincode: string): Promise<PincodeCheck> {
  const normalizedPincode = pincode.trim();
  const checkedAt = new Date().toISOString();
  if (!/^\d{6}$/.test(normalizedPincode)) {
    return { status: 'NOT_FOUND', provider: 'Local validation', message: 'Enter a valid 6-digit Indian pincode.', checkedAt };
  }

  if (CONFIG.pincodeProxyUrl) {
    try {
      const response = await fetch(CONFIG.pincodeProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pincode: normalizedPincode }),
      });
      if (!response.ok) throw new Error(`Courier lookup failed (${response.status}).`);
      const result = await response.json() as { serviceable?: boolean; provider?: string; message?: string; district?: string; state?: string; taluk?: string };
      if (typeof result.serviceable !== 'boolean') throw new Error('Courier lookup response must include a serviceable boolean.');
      return {
        status: result.serviceable ? 'SERVICEABLE' : 'NOT_SERVICEABLE',
        provider: result.provider || 'Courier serviceability provider',
        message: result.message || (result.serviceable ? 'Courier service reports this pincode as serviceable.' : 'Courier service reports this pincode as not serviceable.'),
        checkedAt,
        district: result.district,
        state: result.state,
        taluk: result.taluk,
      };
    } catch (error) {
      return { status: 'UNAVAILABLE', provider: 'Courier serviceability proxy', message: error instanceof Error ? error.message : 'Courier pincode lookup failed.', checkedAt };
    }
  }

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${normalizedPincode}`);
    if (!response.ok) throw new Error('Postal lookup is temporarily unavailable.');
    const result = await response.json() as Array<{ Status?: string; Message?: string; PostOffice?: Array<{ District?: string; State?: string; Block?: string }> | null }>;
    const postalData = result[0];
    const office = postalData?.PostOffice?.[0];
    if (postalData?.Status !== 'Success' || !office) {
      return { status: 'NOT_FOUND', provider: 'India Post postal lookup', message: 'No postal area was found for this pincode.', checkedAt };
    }
    return {
      status: 'POSTAL_CODE_FOUND',
      provider: 'India Post postal lookup',
      message: 'Postal area found. The host must still confirm courier delivery availability.',
      checkedAt,
      district: office.District,
      state: office.State,
      taluk: office.Block,
    };
  } catch (error) {
    return { status: 'UNAVAILABLE', provider: 'India Post postal lookup', message: error instanceof Error ? error.message : 'Postal lookup failed.', checkedAt };
  }
}

export async function confirmCloudOrderDelivery(orderId: string, email: string): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  const snapshot = await getDoc(orderRef);
  if (!snapshot.exists()) throw new Error('Order not found.');
  const order = snapshot.data() as Order;
  if (!order.address.pincodeCheck) throw new Error('Run an online pincode check before confirming delivery.');
  if (['NOT_FOUND', 'NOT_SERVICEABLE'].includes(order.address.pincodeCheck.status)) {
    throw new Error('This pincode is not confirmed as deliverable.');
  }
  await updateDoc(orderRef, {
    deliveryConfirmed: true,
    deliveryConfirmedAt: new Date().toISOString(),
    deliveryConfirmedBy: email,
    updatedAt: new Date().toISOString(),
  });
}

export function isConfiguredDeveloper(email: string): boolean {
  return CONFIG.developerEmails.some((developer: string) => developer.trim().toLowerCase() === email.toLowerCase());
}

export function isConfiguredOwner(email: string): boolean {
  return CONFIG.ownerEmails.some((owner: string) => owner.trim().toLowerCase() === email.toLowerCase());
}

export interface EnquiryInput {
  name: string;
  phone: string;
  message: string;
  productId?: string;
  productName?: string;
}

export async function submitEnquiry(userId: string, input: EnquiryInput): Promise<void> {
  const db = requireFirestore();
  const name = input.name.trim();
  const phone = input.phone.replace(/\D/g, '');
  const message = input.message.trim();
  if (!name || name.length > 80) throw new Error('Enter your name (up to 80 characters).');
  if (!/^\d{10,15}$/.test(phone)) throw new Error('Enter a valid WhatsApp number.');
  if (!message || message.length > 1000) throw new Error('Enter your message (up to 1000 characters).');

  const data: Omit<Enquiry, 'id'> = {
    userId,
    name,
    phone,
    message,
    status: 'NEW',
    createdAt: new Date().toISOString(),
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.productName ? { productName: input.productName.slice(0, 120) } : {}),
  };
  await setDoc(doc(db, 'enquiries', `ENQ-${createId()}`), data);
}

export function subscribeEnquiries(onChange: (enquiries: Enquiry[]) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(collection(db, 'enquiries'), snapshot => {
    onChange(snapshot.docs.map(enquiry => ({ ...enquiry.data(), id: enquiry.id } as Enquiry)));
  }, onError);
}

export async function setEnquiryStatus(enquiryId: string, status: 'NEW' | 'REPLIED'): Promise<void> {
  const db = requireFirestore();
  await updateDoc(doc(db, 'enquiries', enquiryId), { status });
}

export async function deleteEnquiry(enquiryId: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, 'enquiries', enquiryId));
}
