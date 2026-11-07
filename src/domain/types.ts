export type OrderStage = 
  | 'ORDER_RECEIVED'
  | 'ITEM_PAYMENT_VERIFIED'
  | 'PACKING'
  | 'COURIER_RECEIPT_UPLOADED'
  | 'COURIER_CHARGE_VERIFIED'
  | 'SUBMITTED_FOR_DISPATCH'
  | 'DELIVERED'
  | 'NOT_ACCEPTED'
  | 'CANCELLED';

export type UserRole = 'DEVELOPER' | 'OWNER' | 'CUSTOMER';

export interface ProductMedia {
  url: string;
  type: 'image' | 'video';
  name?: string;
}

export type ProductStatus = 'AVAILABLE' | 'OUT_OF_STOCK' | 'COMING_SOON';

export interface Product {
  id: string;
  name: string;
  category: 'Sarees' | 'Custom Kuchu' | string;
  price: number;
  offerPrice?: number;
  description: string;
  image: string;
  media?: ProductMedia[];
  status?: ProductStatus;
}

export interface CustomerAddress {
  fullName: string;
  phone: string;
  houseNameOrNumber?: string;
  street1?: string;
  street2?: string;
  landmark1: string;
  landmark2?: string;
  taluk?: string;
  district?: string;
  street?: string;
  pincode: string;
  googleMapsPin?: string;
  consentTimestamp: string;
  pincodeCheck?: PincodeCheck;
}

export interface PincodeCheck {
  status: 'SERVICEABLE' | 'NOT_SERVICEABLE' | 'POSTAL_CODE_FOUND' | 'NOT_FOUND' | 'UNAVAILABLE';
  provider: string;
  message: string;
  checkedAt: string;
  district?: string;
  state?: string;
  taluk?: string;
}

export interface SavedDeliveryAddress extends CustomerAddress {
  id: string;
}

export interface ParcelParty {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface ParcelDetails {
  from: ParcelParty;
  to: ParcelParty;
  savedAt: string;
  savedBy: string;
}

export interface PaymentRecord {
  paymentId: string;
  kind: 'ITEM' | 'COURIER';
  amount: number;
  utr: string;
  screenshotUrl: string;
  verified: boolean;
  submittedAt?: string;
}

export interface CourierBill {
  billId: string;
  courierName: string;
  trackingId: string;
  amount: number;
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
  deliveryConfirmed?: boolean;
  deliveryConfirmedAt?: string;
  deliveryConfirmedBy?: string;
  parcelDetails?: ParcelDetails;
  itemPayment?: PaymentRecord;
  courierBill?: CourierBill;
  courierPayment?: PaymentRecord;
  createdAt: string;
  updatedAt: string;
}
