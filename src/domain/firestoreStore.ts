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
  type Firestore,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { CONFIG } from '../config';
import { firestore, storage } from '../firebase';
import { CourierBill, CustomerAddress, Order, ParcelDetails, PaymentRecord, Product, ProductMedia } from './types';

function requireFirestore(): Firestore {
  if (!firestore) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* settings first.');
  return firestore;
}

function requireStorage(): FirebaseStorage {
  if (!storage) throw new Error('Firebase Storage is not configured. Add the storage bucket setting first.');
  return storage;
}

function createId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
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
  await setDoc(doc(db, 'products', product.id), product);
}

export async function uploadProductMedia(productId: string, files: File[]): Promise<ProductMedia[]> {
  const bucket = requireStorage();
  return Promise.all(files.map(async file => {
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (type === 'video' ? 'mp4' : 'jpg');
    const path = `products/${productId}/${type === 'video' ? 'videos' : 'images'}/${createId()}.${extension}`;
    const fileRef = ref(bucket, path);
    await uploadBytes(fileRef, file, { contentType: file.type });
    return { url: await getDownloadURL(fileRef), type, name: file.name };
  }));
}

export function subscribeCheckoutQr(onChange: (url: string) => void, onError: (error: Error) => void) {
  const db = requireFirestore();
  return onSnapshot(doc(db, 'settings', 'checkout'), snapshot => {
    onChange(snapshot.exists() ? String(snapshot.data().paymentQrUrl || '') : '');
  }, onError);
}

export async function uploadCheckoutQr(file: File): Promise<string> {
  const bucket = requireStorage();
  const db = requireFirestore();
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file for the payment QR.');
  if (file.size > 5 * 1024 * 1024) throw new Error('The payment QR image must be smaller than 5 MB.');

  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const fileRef = ref(bucket, `settings/payment-qr/${createId()}.${extension}`);
  await uploadBytes(fileRef, file, { contentType: file.type });
  const url = await getDownloadURL(fileRef);
  await setDoc(doc(db, 'settings', 'checkout'), { paymentQrUrl: url, updatedAt: new Date().toISOString() }, { merge: true });
  return url;
}

export async function uploadCourierTrackerImage(orderId: string, file: File): Promise<string> {
  const bucket = requireStorage();
  if (!file.type.startsWith('image/')) throw new Error('Choose an image screenshot for the courier tracker.');
  if (file.size > 10 * 1024 * 1024) throw new Error('The courier tracker screenshot must be smaller than 10 MB.');

  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const fileRef = ref(bucket, `orders/${orderId}/courier-tracker/${createId()}.${extension}`);
  await uploadBytes(fileRef, file, { contentType: file.type });
  return getDownloadURL(fileRef);
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

export async function verifyCloudPayment(orderId: string, kind: 'ITEM' | 'COURIER'): Promise<void> {
  const db = requireFirestore();
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Order not found.');
    const order = snapshot.data() as Order;
    const paymentField = kind === 'ITEM' ? 'itemPayment' : 'courierPayment';
    if (!order[paymentField]) return;
    transaction.update(orderRef, {
      [`${paymentField}.verified`]: true,
      stage: kind === 'ITEM' ? 'ITEM_PAYMENT_VERIFIED' : 'COURIER_CHARGE_VERIFIED',
      updatedAt: new Date().toISOString(),
    });
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
  await updateDoc(doc(db, 'orders', orderId), { stage: 'NOT_ACCEPTED', updatedAt: new Date().toISOString() });
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

export function isConfiguredDeveloper(email: string): boolean {
  return CONFIG.developerEmails.some((developer: string) => developer.trim().toLowerCase() === email.toLowerCase());
}

export function isConfiguredOwner(email: string): boolean {
  return CONFIG.ownerEmails.some((owner: string) => owner.trim().toLowerCase() === email.toLowerCase());
}