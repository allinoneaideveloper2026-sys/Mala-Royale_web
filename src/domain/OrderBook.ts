import { Order, OrderStage, PaymentRecord, CourierBill, CustomerAddress } from './types';

export class OrderBook {
  private orders: Map<string, Order> = new Map();
  private usedUtrs: Set<string> = new Set();

  public createOrder(
    userId: string,
    items: Order['items'],
    itemTotal: number,
    address: CustomerAddress,
    courierNoticeAccepted: boolean
  ): Order {
    if (!courierNoticeAccepted) {
      throw new Error('Courier charge notice must be accepted prior to order placement.');
    }

    const orderId = `MR-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrder: Order = {
      orderId,
      userId,
      items,
      itemTotal,
      stage: 'ORDER_RECEIVED',
      isWithheld: false,
      courierNoticeAccepted,
      address,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.orders.set(orderId, newOrder);
    return newOrder;
  }

  public submitItemPayment(orderId: string, amount: number, utr: string, screenshotUrl: string): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    if (this.usedUtrs.has(utr)) throw new Error('UTR has already been submitted for another order.');

    const payment: PaymentRecord = {
      paymentId: `PAY-${Math.floor(10000 + Math.random() * 90000)}`,
      kind: 'ITEM',
      amount,
      utr,
      screenshotUrl,
      verified: false,
    };

    order.itemPayment = payment;
    this.usedUtrs.add(utr);
    order.updatedAt = new Date().toISOString();
    return order;
  }

  public verifyPayment(orderId: string, kind: 'ITEM' | 'COURIER'): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');

    if (kind === 'ITEM' && order.itemPayment) {
      order.itemPayment.verified = true;
      order.stage = 'ITEM_PAYMENT_VERIFIED';
    } else if (kind === 'COURIER' && order.courierPayment) {
      order.courierPayment.verified = true;
      order.stage = 'COURIER_CHARGE_VERIFIED';
    }

    order.updatedAt = new Date().toISOString();
    return order;
  }

  public attachCourierBill(orderId: string, bill: Omit<CourierBill, 'billId'>): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');

    order.courierBill = {
      ...bill,
      billId: `CB-${Math.floor(1000 + Math.random() * 9000)}`,
    };
    order.stage = 'COURIER_RECEIPT_UPLOADED';
    order.updatedAt = new Date().toISOString();
    return order;
  }

  public submitForDispatch(orderId: string): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    if (order.isWithheld) throw new Error('Parcel is withheld by host.');
    
    order.stage = 'SUBMITTED_FOR_DISPATCH';
    order.updatedAt = new Date().toISOString();
    return order;
  }

  public getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  public getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }
}

export const globalOrderBook = new OrderBook();
