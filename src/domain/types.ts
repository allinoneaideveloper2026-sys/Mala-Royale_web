export type OrderStage = 
  | 'ORDER_RECEIVED'
  | 'ITEM_PAYMENT_VERIFIED'
  | 'PACKING'
  | 'COURIER_RECEIPT_UPLOADED'
  | 'COURIER_CHARGE_VERIFIED'
  | 'SUBMITTED_FOR_DISPATCH'
  | 'DELIVERED'
  | 'CANCELLED';

export type UserRole = 'DEVELOPER' | 'OWNER' | 'CUSTOMER';

export interface Product {
  id: string;
  name: string;
  category: 'Sarees' | 'Custom Kuchu' | string;
  price: number;
  offerPrice?: number;
  description: string;
  image: string;
}

export interface CustomerAddress {
  fullName: string;
  phone: string;
  street: string;
  landmark1: string;
  landmark2?: string;
  pincode: string;
  googleMapsPin?: string;
  consentTimestamp: string;
}

export interface PaymentRecord {
  paymentId: string;
  kind: 'ITEM' | 'COURIER';
  amount: number;
  utr: string;
  screenshotUrl: string;
  verified: boolean;
}

export interface CourierBill {
  billId: string;
  courierName: string;
  trackingId: string;
  amount: number;
  receiptPhotoUrl: string;
}

export interface Order {
  orderId: string;
  userId: string;
  items: Array<{ productId: string; name: string; price: number; quantity: number }>;
  itemTotal: number;
  stage: OrderStage;
  isWithheld: boolean;
  courierNoticeAccepted: boolean;
  address: CustomerAddress;
  itemPayment?: PaymentRecord;
  courierBill?: CourierBill;
  courierPayment?: PaymentRecord;
  createdAt: string;
  updatedAt: string;
}
