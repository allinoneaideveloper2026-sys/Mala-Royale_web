import type { Order, Product } from '../domain/types';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A confirmed sale: the host has verified the item payment and the order was not rejected. */
export function isSaleOrder(order: Order): boolean {
  return order.itemPayment?.verified === true && order.stage !== 'NOT_ACCEPTED' && order.stage !== 'CANCELLED';
}

/** An order that is still waiting for payment confirmation. */
export function isPendingOrder(order: Order): boolean {
  return !isSaleOrder(order) && order.stage !== 'NOT_ACCEPTED' && order.stage !== 'CANCELLED';
}

/** Discount given on an order: (regular price - price paid) x quantity. */
export function orderOfferAmount(order: Order, productsById?: Map<string, Product>): number {
  return order.items.reduce((sum, item) => {
    const regular = item.regularPrice ?? productsById?.get(item.productId)?.price ?? item.price;
    return sum + Math.max(0, regular - item.price) * item.quantity;
  }, 0);
}

export const orderCourierAmount = (order: Order): number => order.courierBill?.amount ?? 0;

export const orderGrandTotal = (order: Order): number => order.itemTotal + orderCourierAmount(order);

export function orderStageLabel(order: Order): string {
  if (order.stage === 'NOT_ACCEPTED') return 'Not accepted';
  if (order.stage === 'CANCELLED') return 'Cancelled';
  if (order.stage === 'DELIVERED') return 'Delivered';
  if (order.stage === 'SUBMITTED_FOR_DISPATCH') return 'Dispatched';
  if (order.courierPayment?.verified) return 'Courier paid';
  if (order.courierPayment) return 'Courier payment pending';
  if (order.courierBill) return 'Courier bill sent';
  if (order.itemPayment?.verified) return 'Payment confirmed';
  if (order.itemPayment) return 'Payment pending';
  return 'Order received';
}

export function formatAddress(order: Order): string {
  const a = order.address;
  const joined = [a.houseNameOrNumber, a.street1, a.street2, a.landmark1, a.landmark2, a.taluk, a.district, a.pincode]
    .filter(Boolean)
    .join(', ');
  return joined || a.street || '';
}

export function describeItems(order: Order): string {
  return order.items.map(item => `${item.name} x${item.quantity} @ ₹${item.price}`).join('; ');
}

/** When a product was added. Newer products store createdAt; older ones carry it in their id (p-<milliseconds>). */
export function productCreatedMs(product: Product): number {
  if (product.createdAt) {
    const parsed = Date.parse(product.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  const match = /^p-(\d{10,})$/.exec(product.id);
  return match ? Number(match[1]) : 0;
}
