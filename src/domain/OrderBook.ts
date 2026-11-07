import { Order, OrderStage, PaymentRecord, CourierBill, CustomerAddress, ParcelDetails } from './types';

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
      if (!order.deliveryConfirmed) throw new Error('Host must confirm the delivery address before confirming payment.');
      order.itemPayment.verified = true;
      order.stage = 'ITEM_PAYMENT_VERIFIED';
    } else if (kind === 'COURIER' && order.courierPayment) {
      order.courierPayment.verified = true;
      order.stage = 'COURIER_CHARGE_VERIFIED';
    }

    order.updatedAt = new Date().toISOString();
    return order;
  }

  public submitCourierPayment(orderId: string, userId: string, utr: string): Order {
    const order = this.orders.get(orderId);
    if (!order || order.userId !== userId) throw new Error('Order not found');
    if (!order.courierBill) throw new Error('The host has not added a courier charge yet.');
    if (order.courierPayment) throw new Error('Courier payment has already been submitted.');
    const normalizedUtr = utr.trim();
    if (!/^\d{12}$/.test(normalizedUtr)) throw new Error('Enter the 12-digit courier payment UTR.');
    if (this.usedUtrs.has(normalizedUtr)) throw new Error('UTR has already been submitted for another order.');

    const submittedAt = new Date().toISOString();
    order.courierPayment = {
      paymentId: `PAY-${Math.floor(10000 + Math.random() * 90000)}`,
      kind: 'COURIER',
      amount: order.courierBill.amount,
      utr: normalizedUtr,
      screenshotUrl: '',
      verified: false,
      submittedAt,
    };
    order.updatedAt = submittedAt;
    this.usedUtrs.add(normalizedUtr);
    return order;
  }

  public attachCourierBill(orderId: string, bill: Omit<CourierBill, 'billId'>): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');

    order.courierBill = {
      ...bill,
      billId: `CB-${Math.floor(1000 + Math.random() * 9000)}`,
    };
    delete order.courierPayment;
    order.stage = 'COURIER_RECEIPT_UPLOADED';
    order.updatedAt = new Date().toISOString();
    return order;
  }

  public submitForDispatch(orderId: string): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    if (order.isWithheld) throw new Error('Parcel is withheld by host.');
    if (!order.deliveryConfirmed) throw new Error('Host must confirm the delivery address before dispatch.');
    if (order.courierBill && !order.courierPayment?.verified) {
      throw new Error('Courier payment must be confirmed before dispatch.');
    }
    
    order.stage = 'SUBMITTED_FOR_DISPATCH';
    order.updatedAt = new Date().toISOString();
    return order;
  }

  public markNotAccepted(orderId: string): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    order.stage = 'NOT_ACCEPTED';
    order.updatedAt = new Date().toISOString();
    return order;
  }

  public markDelivered(orderId: string): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    if (order.stage !== 'SUBMITTED_FOR_DISPATCH') throw new Error('Only dispatched orders can be marked delivered.');
    order.stage = 'DELIVERED';
    order.updatedAt = new Date().toISOString();
    return order;
  }

  public saveParcelDetails(orderId: string, parcelDetails: ParcelDetails): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    order.parcelDetails = parcelDetails;
    order.updatedAt = parcelDetails.savedAt;
    return order;
  }

  public confirmDelivery(orderId: string, email: string): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    if (!order.address.pincodeCheck) throw new Error('Run an online pincode check before confirming delivery.');
    if (['NOT_FOUND', 'NOT_SERVICEABLE'].includes(order.address.pincodeCheck.status)) {
      throw new Error('This pincode is not confirmed as deliverable.');
    }
    order.deliveryConfirmed = true;
    order.deliveryConfirmedAt = new Date().toISOString();
    order.deliveryConfirmedBy = email;
    order.updatedAt = order.deliveryConfirmedAt;
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
