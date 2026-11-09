import type { Enquiry, Order, Product } from '../domain/types';
import {
  DAY_MS,
  isPendingOrder,
  isSaleOrder,
  productCreatedMs,
} from './orderMetrics';

/*
 * Mala Royale analytics assistant.
 *
 * How it works (all on the host's own data, in the browser, no external AI service needed):
 *  1. computeMetrics   - turns orders, products and enquiries into numbers.
 *  2. buildKnowledgeBase - writes those numbers up as small text documents (the "knowledge base").
 *  3. retrieve         - finds the documents most relevant to a question (the "RAG" retrieval step).
 *  4. agents           - specialist analysts (sales, inventory, pricing, customers, courier, enquiries)
 *                        each look for problems and opportunities and propose an action.
 *  5. rankInsights     - orders the advice by impact x a learned weight. The weights move up or down
 *                        from the host's thumbs-up / thumbs-down feedback, so useful advice rises.
 *
 * The retrieved documents can also be sent to an optional language-model proxy (see HostAnalytics).
 */

export type AgentKey = 'sales' | 'inventory' | 'pricing' | 'customers' | 'courier' | 'enquiries';

export interface DataSnapshot {
  orders: Order[];
  products: Product[];
  enquiries: Enquiry[];
  now: number;
}

export interface Insight {
  key: string;
  agent: AgentKey;
  title: string;
  detail: string;
  action: string;
  impact: number;
  evidence: string[];
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  text: string;
  tags: string[];
}

export interface Answer {
  text: string;
  sources: string[];
  agents: AgentKey[];
  context: string;
}

interface ProductStat {
  product: Product;
  units: number;
  revenue: number;
  orders: number;
  discount: number;
  lastSaleAt: number;
  unitsLast30: number;
  enquiryCount: number;
}

interface GroupStat {
  label: string;
  revenue: number;
  units: number;
  orders: number;
}

interface CustomerStat {
  userId: string;
  name: string;
  phone: string;
  orders: number;
  spend: number;
  lastAt: number;
}

export interface Metrics {
  salesCount: number;
  pendingCount: number;
  rejectedCount: number;
  revenue: number;
  revenue7: number;
  revenuePrev7: number;
  revenue30: number;
  orders30: number;
  discount: number;
  courierTotal: number;
  aov: number;
  productStats: ProductStat[];
  categories: GroupStat[];
  districts: GroupStat[];
  weekdays: number[];
  hours: number[];
  customers: CustomerStat[];
  repeatRate: number;
  couriers: Array<{ name: string; count: number; avg: number }>;
  newEnquiries: number;
  staleEnquiries: number;
  topEnquiredProducts: Array<{ name: string; count: number }>;
  keywordCounts: Array<[string, number]>;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const inr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const pct = (value: number) => `${Math.round(value)}%`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'you', 'your', 'with', 'this', 'that', 'have', 'has', 'was', 'what', 'when', 'how',
  'can', 'any', 'does', 'did', 'from', 'about', 'will', 'would', 'could', 'should', 'there', 'their', 'them', 'they',
  'its', 'our', 'out', 'not', 'but', 'all', 'get', 'got', 'want', 'need', 'please', 'hello', 'hii', 'hey', 'much',
  'who', 'which', 'where', 'why', 'been', 'being', 'into', 'than', 'then', 'also', 'just', 'like', 'some', 'more',
]);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));

export function computeMetrics(data: DataSnapshot): Metrics {
  const { orders, products, enquiries, now } = data;
  const productsById = new Map(products.map(product => [product.id, product] as const));
  const sales = orders.filter(isSaleOrder);
  const timeOf = (order: Order) => Date.parse(order.createdAt) || 0;
  const sumItems = (list: Order[]) => list.reduce((total, order) => total + order.itemTotal, 0);

  const stats = new Map<string, ProductStat>();
  products.forEach(product => stats.set(product.id, {
    product, units: 0, revenue: 0, orders: 0, discount: 0, lastSaleAt: 0, unitsLast30: 0, enquiryCount: 0,
  }));
  const categoryMap = new Map<string, GroupStat>();
  const districtMap = new Map<string, GroupStat>();
  const customerMap = new Map<string, CustomerStat>();
  const courierMap = new Map<string, { count: number; total: number }>();
  const weekdays: number[] = new Array(7).fill(0);
  const hours: number[] = new Array(24).fill(0);

  const bump = (map: Map<string, GroupStat>, label: string, revenue: number, units: number, orderCount: number) => {
    const entry = map.get(label) ?? { label, revenue: 0, units: 0, orders: 0 };
    entry.revenue += revenue;
    entry.units += units;
    entry.orders += orderCount;
    map.set(label, entry);
  };

  sales.forEach(order => {
    const at = timeOf(order);
    const date = new Date(at);
    weekdays[date.getDay()] += 1;
    hours[date.getHours()] += 1;

    const touchedCategories = new Set<string>();
    order.items.forEach(item => {
      const lineRevenue = item.price * item.quantity;
      const product = productsById.get(item.productId);
      const regular = item.regularPrice ?? product?.price ?? item.price;
      const stat = stats.get(item.productId);
      if (stat) {
        stat.units += item.quantity;
        stat.revenue += lineRevenue;
        stat.orders += 1;
        stat.discount += Math.max(0, regular - item.price) * item.quantity;
        stat.lastSaleAt = Math.max(stat.lastSaleAt, at);
        if (now - at <= 30 * DAY_MS) stat.unitsLast30 += item.quantity;
      }
      const category = product?.category || 'Other';
      bump(categoryMap, category, lineRevenue, item.quantity, touchedCategories.has(category) ? 0 : 1);
      touchedCategories.add(category);
    });

    const district = order.address.district || order.address.taluk || order.address.pincode || 'Unknown';
    bump(districtMap, district, order.itemTotal, order.items.reduce((count, item) => count + item.quantity, 0), 1);

    const customer = customerMap.get(order.userId) ?? {
      userId: order.userId, name: order.address.fullName, phone: order.address.phone, orders: 0, spend: 0, lastAt: 0,
    };
    customer.orders += 1;
    customer.spend += order.itemTotal;
    customer.lastAt = Math.max(customer.lastAt, at);
    customer.name = order.address.fullName;
    customerMap.set(order.userId, customer);

    if (order.courierBill) {
      const name = (order.deliveryPartner || order.courierBill.courierName || 'Unknown').trim() || 'Unknown';
      const entry = courierMap.get(name) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += order.courierBill.amount;
      courierMap.set(name, entry);
    }
  });

  const recent7 = sales.filter(order => now - timeOf(order) <= 7 * DAY_MS);
  const previous7 = sales.filter(order => {
    const age = now - timeOf(order);
    return age > 7 * DAY_MS && age <= 14 * DAY_MS;
  });
  const recent30 = sales.filter(order => now - timeOf(order) <= 30 * DAY_MS);

  const enquiryCounts = new Map<string, number>();
  const keywordMap = new Map<string, number>();
  let newEnquiries = 0;
  let staleEnquiries = 0;
  enquiries.forEach(enquiry => {
    if (enquiry.productId) {
      enquiryCounts.set(enquiry.productId, (enquiryCounts.get(enquiry.productId) || 0) + 1);
      const stat = stats.get(enquiry.productId);
      if (stat) stat.enquiryCount += 1;
    }
    if (enquiry.status === 'NEW') {
      newEnquiries += 1;
      if (now - (Date.parse(enquiry.createdAt) || now) > DAY_MS) staleEnquiries += 1;
    }
    new Set(tokenize(enquiry.message)).forEach(word => keywordMap.set(word, (keywordMap.get(word) || 0) + 1));
  });

  const discount = Array.from(stats.values()).reduce((total, stat) => total + stat.discount, 0);
  const courierTotal = sales.reduce((total, order) => total + (order.courierBill?.amount ?? 0), 0);
  const revenue = sumItems(sales);
  const customers = Array.from(customerMap.values()).sort((left, right) => right.spend - left.spend);
  const repeatCustomers = customers.filter(customer => customer.orders >= 2).length;

  return {
    salesCount: sales.length,
    pendingCount: orders.filter(isPendingOrder).length,
    rejectedCount: orders.filter(order => order.stage === 'NOT_ACCEPTED').length,
    revenue,
    revenue7: sumItems(recent7),
    revenuePrev7: sumItems(previous7),
    revenue30: sumItems(recent30),
    orders30: recent30.length,
    discount,
    courierTotal,
    aov: sales.length ? revenue / sales.length : 0,
    productStats: Array.from(stats.values()),
    categories: Array.from(categoryMap.values()).sort((left, right) => right.revenue - left.revenue),
    districts: Array.from(districtMap.values()).sort((left, right) => right.revenue - left.revenue),
    weekdays,
    hours,
    customers,
    repeatRate: customers.length ? (repeatCustomers / customers.length) * 100 : 0,
    couriers: Array.from(courierMap.entries())
      .map(([name, entry]) => ({ name, count: entry.count, avg: entry.total / entry.count }))
      .sort((left, right) => right.count - left.count),
    newEnquiries,
    staleEnquiries,
    topEnquiredProducts: Array.from(enquiryCounts.entries())
      .map(([productId, count]) => ({ name: productsById.get(productId)?.name || 'Removed product', count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
    keywordCounts: Array.from(keywordMap.entries()).sort((left, right) => right[1] - left[1]).slice(0, 8),
  };
}

/* ----------------------------- knowledge base ----------------------------- */

export function buildKnowledgeBase(data: DataSnapshot, m: Metrics): KnowledgeDoc[] {
  const docs: KnowledgeDoc[] = [];
  const peakDay = m.weekdays.indexOf(Math.max(...m.weekdays));
  const peakHour = m.hours.indexOf(Math.max(...m.hours));
  const discountShare = m.revenue + m.discount > 0 ? (m.discount / (m.revenue + m.discount)) * 100 : 0;

  docs.push({
    id: 'overview',
    title: 'Business overview',
    tags: ['sales', 'revenue', 'orders', 'overview', 'summary', 'average', 'week', 'month', 'income', 'sold'],
    text: `${plural(m.salesCount, 'confirmed sale')} worth ${inr(m.revenue)} in total, average order ${inr(m.aov)}. Last 30 days: ${plural(m.orders30, 'order')} and ${inr(m.revenue30)}. Last 7 days ${inr(m.revenue7)} versus ${inr(m.revenuePrev7)} the week before. ${plural(m.pendingCount, 'order')} waiting for payment confirmation and ${plural(m.rejectedCount, 'order')} not accepted.`,
  });

  m.categories.forEach(category => docs.push({
    id: `category-${category.label}`,
    title: `Category: ${category.label}`,
    tags: ['category', category.label.toLowerCase(), 'revenue', 'sales', 'best', 'selling'],
    text: `${category.label} earned ${inr(category.revenue)} from ${plural(category.units, 'unit')} across ${plural(category.orders, 'order')}${m.revenue ? `, which is ${pct((category.revenue / m.revenue) * 100)} of revenue` : ''}.`,
  }));

  [...m.productStats]
    .sort((left, right) => right.revenue - left.revenue || right.enquiryCount - left.enquiryCount)
    .slice(0, 60)
    .forEach(stat => {
      const stock = typeof stat.product.quantity === 'number' ? `${stat.product.quantity} in stock` : 'stock not tracked';
      const lastSale = stat.lastSaleAt ? `last sold ${Math.max(0, Math.round((data.now - stat.lastSaleAt) / DAY_MS))} days ago` : 'never sold yet';
      docs.push({
        id: `product-${stat.product.id}`,
        title: `Product: ${stat.product.name}`,
        tags: ['product', 'item', stat.product.name.toLowerCase(), stat.product.category.toLowerCase(), 'stock', 'restock', 'price', 'offer', 'inventory'],
        text: `${stat.product.name} (${stat.product.category}) is priced ${inr(stat.product.price)}${stat.product.offerPrice ? ` with an offer at ${inr(stat.product.offerPrice)}` : ' with no offer'}, ${stock}. Sold ${plural(stat.units, 'unit')} for ${inr(stat.revenue)} (${plural(stat.unitsLast30, 'unit')} in the last 30 days), ${lastSale}. ${plural(stat.enquiryCount, 'customer enquiry')}.`,
      });
    });

  docs.push({
    id: 'customers',
    title: 'Customers',
    tags: ['customer', 'customers', 'buyer', 'repeat', 'loyal', 'vip', 'best', 'spend'],
    text: `${plural(m.customers.length, 'customer')} have bought; ${pct(m.repeatRate)} ordered more than once. Top spenders: ${m.customers.slice(0, 3).map(customer => `${customer.name} (${inr(customer.spend)}, ${plural(customer.orders, 'order')})`).join('; ') || 'none yet'}.`,
  });

  docs.push({
    id: 'geography',
    title: 'Where orders come from',
    tags: ['city', 'district', 'area', 'location', 'where', 'region', 'delivery'],
    text: m.districts.length
      ? `Top areas by revenue: ${m.districts.slice(0, 4).map(district => `${district.label} (${inr(district.revenue)}, ${plural(district.orders, 'order')})`).join('; ')}.`
      : 'No confirmed orders yet, so there is no location data.',
  });

  docs.push({
    id: 'timing',
    title: 'When customers order',
    tags: ['time', 'when', 'day', 'hour', 'weekday', 'post', 'peak', 'schedule', 'busy'],
    text: m.salesCount
      ? `Most confirmed orders are placed on ${WEEKDAYS[peakDay]} (${plural(m.weekdays[peakDay], 'order')}) and around ${peakHour}:00.`
      : 'No confirmed orders yet, so there is no timing pattern.',
  });

  docs.push({
    id: 'courier',
    title: 'Courier and delivery',
    tags: ['courier', 'shipping', 'delivery', 'dispatch', 'partner', 'charge', 'cost'],
    text: `Courier charges total ${inr(m.courierTotal)}${m.revenue ? ` (${pct((m.courierTotal / m.revenue) * 100)} of item revenue)` : ''}. ${m.couriers.length ? `Partners: ${m.couriers.map(courier => `${courier.name} (${plural(courier.count, 'parcel')}, average ${inr(courier.avg)})`).join('; ')}.` : 'No courier bills yet.'}`,
  });

  docs.push({
    id: 'offers',
    title: 'Offers and discounts',
    tags: ['offer', 'discount', 'deal', 'price', 'margin', 'pricing', 'sale'],
    text: `Discounts given so far total ${inr(m.discount)}, about ${pct(discountShare)} of list-price value. ${plural(data.products.filter(product => product.offerPrice).length, 'product')} currently have an offer.`,
  });

  docs.push({
    id: 'enquiries',
    title: 'Customer enquiries',
    tags: ['enquiry', 'enquiries', 'question', 'asked', 'ask', 'whatsapp', 'interest', 'demand'],
    text: `${plural(data.enquiries.length, 'enquiry')} received, ${m.newEnquiries} still new (${m.staleEnquiries} older than a day). ${m.topEnquiredProducts.length ? `Most asked about: ${m.topEnquiredProducts.map(item => `${item.name} (${item.count})`).join('; ')}.` : ''} ${m.keywordCounts.length ? `Common words: ${m.keywordCounts.map(([word, count]) => `${word} (${count})`).join(', ')}.` : ''}`,
  });

  return docs;
}

/* -------------------------------- retrieval -------------------------------- */

const SYNONYMS: Record<string, string[]> = {
  revenue: ['sales', 'income', 'earnings', 'sold'],
  sales: ['revenue', 'sold', 'orders'],
  stock: ['inventory', 'quantity', 'restock'],
  restock: ['stock', 'inventory', 'quantity'],
  discount: ['offer', 'deal', 'price'],
  offer: ['discount', 'deal', 'pricing'],
  price: ['pricing', 'offer', 'discount'],
  customer: ['customers', 'buyer', 'repeat'],
  best: ['top', 'selling', 'popular'],
  courier: ['shipping', 'delivery', 'dispatch'],
  shipping: ['courier', 'delivery'],
  enquiry: ['enquiries', 'question', 'asked'],
};

export function retrieve(question: string, docs: KnowledgeDoc[], limit = 4): KnowledgeDoc[] {
  const base = tokenize(question);
  const terms = Array.from(new Set(base.flatMap(term => [term, ...(SYNONYMS[term] ?? [])])));
  if (terms.length === 0) return docs.slice(0, 1);

  const docTokens = docs.map(doc => new Set(tokenize(`${doc.title} ${doc.text} ${doc.tags.join(' ')}`)));
  const documentFrequency = new Map<string, number>();
  docTokens.forEach(tokens => tokens.forEach(token => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)));

  const scored = docs.map((doc, index) => {
    let score = 0;
    terms.forEach(term => {
      const idf = Math.log((docs.length + 1) / ((documentFrequency.get(term) || 0) + 1)) + 1;
      if (doc.tags.some(tag => tag === term)) score += 3 * idf;
      if (doc.title.toLowerCase().includes(term)) score += 2 * idf;
      if (docTokens[index].has(term)) score += idf;
    });
    return { doc, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(item => item.doc);
}

/* --------------------------------- agents --------------------------------- */

const AGE_DAYS = (data: DataSnapshot, product: Product) => {
  const created = productCreatedMs(product);
  return created > 0 ? (data.now - created) / DAY_MS : Number.POSITIVE_INFINITY;
};

function salesAgent(data: DataSnapshot, m: Metrics): Insight[] {
  const out: Insight[] = [];
  if (m.revenuePrev7 > 0) {
    const change = ((m.revenue7 - m.revenuePrev7) / m.revenuePrev7) * 100;
    if (Math.abs(change) >= 20) {
      out.push({
        key: 'revenue-trend',
        agent: 'sales',
        title: change > 0 ? `Sales are up ${pct(change)} on last week` : `Sales are down ${pct(-change)} on last week`,
        detail: `The last 7 days brought ${inr(m.revenue7)} against ${inr(m.revenuePrev7)} in the 7 days before.`,
        action: change > 0
          ? 'Repeat what worked: re-share your best sellers and make sure they are well stocked.'
          : 'Put a short offer on your best-selling category and share fresh photos to bring visitors back.',
        impact: 60,
        evidence: [`This week ${inr(m.revenue7)}`, `Previous week ${inr(m.revenuePrev7)}`],
      });
    }
  }

  const stalePending = data.orders.filter(order => isPendingOrder(order) && data.now - (Date.parse(order.createdAt) || data.now) > DAY_MS);
  if (stalePending.length > 0) {
    out.push({
      key: 'pending-verification',
      agent: 'sales',
      title: `${plural(stalePending.length, 'order')} waiting over a day for payment confirmation`,
      detail: 'Customers who wait a long time for confirmation often cancel or lose trust.',
      action: 'Open Orders, check the UTR for each one and confirm or reject it today.',
      impact: 85,
      evidence: stalePending.slice(0, 4).map(order => `${order.orderId} (${order.address.fullName})`),
    });
  }

  const decided = m.salesCount + m.rejectedCount;
  if (decided >= 5 && m.rejectedCount / decided >= 0.15) {
    out.push({
      key: 'rejection-rate',
      agent: 'sales',
      title: `${pct((m.rejectedCount / decided) * 100)} of orders were not accepted`,
      detail: `${m.rejectedCount} of ${decided} decided orders were rejected.`,
      action: 'Check why: unserviceable pincodes, wrong UTRs or out-of-stock items. Fix the cause on the product or checkout page.',
      impact: 65,
      evidence: [`${m.rejectedCount} not accepted`, `${m.salesCount} confirmed`],
    });
  }

  if (m.categories.length >= 2 && m.revenue > 0 && m.categories[0].revenue / m.revenue >= 0.7) {
    out.push({
      key: 'category-concentration',
      agent: 'sales',
      title: `${pct((m.categories[0].revenue / m.revenue) * 100)} of revenue comes from ${m.categories[0].label}`,
      detail: 'Relying on one category makes sales swing when it slows down.',
      action: `Promote your other categories with a new arrival or a small offer alongside ${m.categories[0].label}.`,
      impact: 35,
      evidence: m.categories.slice(0, 3).map(category => `${category.label}: ${inr(category.revenue)}`),
    });
  }
  return out;
}

function inventoryAgent(data: DataSnapshot, m: Metrics): Insight[] {
  const out: Insight[] = [];
  m.productStats.forEach(stat => {
    const stock = stat.product.quantity;
    if (typeof stock !== 'number') return;
    const perDay = stat.unitsLast30 / 30;
    if (stock === 0 && (stat.unitsLast30 > 0 || stat.enquiryCount > 0)) {
      out.push({
        key: 'restock-now',
        agent: 'inventory',
        title: `${stat.product.name} is sold out but people still want it`,
        detail: `${plural(stat.unitsLast30, 'unit')} sold in 30 days and ${plural(stat.enquiryCount, 'enquiry')} received.`,
        action: 'Restock it, or set it to "Coming soon" so interested customers know it is returning.',
        impact: 90,
        evidence: [`Stock 0`, `${stat.unitsLast30} sold in 30 days`],
      });
    } else if (stock > 0 && perDay > 0) {
      const cover = stock / perDay;
      if (cover <= 7) {
        out.push({
          key: 'restock-soon',
          agent: 'inventory',
          title: `${stat.product.name} may sell out in about ${Math.max(1, Math.round(cover))} day${Math.round(cover) === 1 ? '' : 's'}`,
          detail: `${plural(stock, 'piece')} left and ${stat.unitsLast30} sold in the last 30 days.`,
          action: 'Plan a restock now so you do not lose sales.',
          impact: 80 - Math.min(20, Math.round(cover) * 2),
          evidence: [`${stock} in stock`, `${perDay.toFixed(2)} sold per day`],
        });
      }
    }
  });

  const dead = m.productStats.filter(stat => (
    stat.product.status !== 'COMING_SOON'
    && (typeof stat.product.quantity !== 'number' || stat.product.quantity > 0)
    && AGE_DAYS(data, stat.product) > 30
    && (stat.lastSaleAt === 0 || data.now - stat.lastSaleAt > 30 * DAY_MS)
  ));
  if (dead.length > 0) {
    out.push({
      key: 'dead-stock',
      agent: 'inventory',
      title: `${plural(dead.length, 'product')} have not sold in 30 days`,
      detail: dead.slice(0, 5).map(stat => stat.product.name).join(', ') + (dead.length > 5 ? ' and more' : ''),
      action: 'Refresh the photos, add a limited-time offer, or bundle them with a best seller.',
      impact: 50,
      evidence: dead.slice(0, 5).map(stat => stat.product.name),
    });
  }

  const untracked = data.products.filter(product => typeof product.quantity !== 'number');
  if (untracked.length > 0) {
    out.push({
      key: 'track-quantity',
      agent: 'inventory',
      title: `${plural(untracked.length, 'product')} have no quantity set`,
      detail: 'Without a quantity, stock cannot reduce automatically and sold-out items stay on sale.',
      action: 'Open Manage catalog, click Edit on each one and enter the quantity in stock.',
      impact: 45,
      evidence: untracked.slice(0, 5).map(product => product.name),
    });
  }
  return out;
}

function pricingAgent(data: DataSnapshot, m: Metrics): Insight[] {
  const out: Insight[] = [];
  const grossValue = m.revenue + m.discount;
  if (grossValue > 0 && m.discount / grossValue >= 0.25) {
    out.push({
      key: 'heavy-discount',
      agent: 'pricing',
      title: `Discounts are ${pct((m.discount / grossValue) * 100)} of list-price sales`,
      detail: `You have given away ${inr(m.discount)} in offers.`,
      action: 'Keep deep offers for slow products only, and let best sellers sell at full price.',
      impact: 60,
      evidence: [`Discount ${inr(m.discount)}`, `Revenue ${inr(m.revenue)}`],
    });
  }

  const withOffer = m.productStats.filter(stat => stat.product.offerPrice);
  const withoutOffer = m.productStats.filter(stat => !stat.product.offerPrice);
  if (m.salesCount >= 5 && withOffer.length >= 2 && withoutOffer.length >= 2) {
    const avg = (list: ProductStat[]) => list.reduce((total, stat) => total + stat.unitsLast30, 0) / list.length;
    const offerAvg = avg(withOffer);
    const fullAvg = avg(withoutOffer);
    if (fullAvg > 0 && offerAvg >= fullAvg * 1.5) {
      out.push({
        key: 'offers-working',
        agent: 'pricing',
        title: 'Products on offer are selling faster',
        detail: `Offer products average ${offerAvg.toFixed(1)} units in 30 days versus ${fullAvg.toFixed(1)} at full price.`,
        action: 'Add a modest offer to your slowest products to lift them the same way.',
        impact: 55,
        evidence: [`${plural(withOffer.length, 'product')} on offer`, `${plural(withoutOffer.length, 'product')} at full price`],
      });
    } else if (offerAvg <= fullAvg) {
      out.push({
        key: 'offers-not-lifting',
        agent: 'pricing',
        title: 'Offers are not lifting sales yet',
        detail: `Offer products average ${offerAvg.toFixed(1)} units in 30 days; full-price products ${fullAvg.toFixed(1)}.`,
        action: 'Avoid deeper discounts for now. Try better photos, a video or a clearer description first.',
        impact: 50,
        evidence: [`${plural(withOffer.length, 'product')} on offer`],
      });
    }
  }

  const interested = m.productStats.filter(stat => stat.enquiryCount >= 2 && stat.units === 0);
  if (interested.length > 0) {
    out.push({
      key: 'interest-no-sales',
      agent: 'pricing',
      title: `${plural(interested.length, 'product')} get questions but no sales`,
      detail: interested.slice(0, 4).map(stat => `${stat.product.name} (${stat.enquiryCount} enquiries)`).join(', '),
      action: 'Reply to those enquiries, then consider a small offer or a clearer price and courier note on the product.',
      impact: 70,
      evidence: interested.slice(0, 4).map(stat => stat.product.name),
    });
  }
  return out;
}

function customersAgent(data: DataSnapshot, m: Metrics): Insight[] {
  const out: Insight[] = [];
  if (m.customers.length >= 3) {
    out.push({
      key: 'repeat-rate',
      agent: 'customers',
      title: `${pct(m.repeatRate)} of customers have ordered more than once`,
      detail: m.repeatRate < 20
        ? 'Most buyers order once. A follow-up message can bring them back.'
        : 'You have a loyal base. Reward them to keep it growing.',
      action: m.repeatRate < 20
        ? 'WhatsApp recent buyers a thank-you with early access to new arrivals.'
        : 'Give your top customers first look at new pieces.',
      impact: 40,
      evidence: m.customers.slice(0, 3).map(customer => `${customer.name}: ${inr(customer.spend)}`),
    });
  }

  if (m.districts.length >= 2 && m.revenue > 0 && m.districts[0].revenue / m.revenue >= 0.5) {
    out.push({
      key: 'geo-concentration',
      agent: 'customers',
      title: `${pct((m.districts[0].revenue / m.revenue) * 100)} of revenue comes from ${m.districts[0].label}`,
      detail: 'Demand is concentrated in one area.',
      action: `Run a local campaign in ${m.districts[0].label}, and check whether a nearby courier gives better rates there.`,
      impact: 35,
      evidence: m.districts.slice(0, 3).map(district => `${district.label}: ${inr(district.revenue)}`),
    });
  }

  if (m.salesCount >= 5) {
    const peakDay = m.weekdays.indexOf(Math.max(...m.weekdays));
    out.push({
      key: 'peak-day',
      agent: 'customers',
      title: `${WEEKDAYS[peakDay]} is your busiest ordering day`,
      detail: `${plural(m.weekdays[peakDay], 'confirmed order')} landed on ${WEEKDAYS[peakDay]}s.`,
      action: `Upload new items and start offers the day before, so they are live on ${WEEKDAYS[peakDay]}.`,
      impact: 30,
      evidence: [`Peak day ${WEEKDAYS[peakDay]}`],
    });
  }
  return out;
}

function courierAgent(data: DataSnapshot, m: Metrics): Insight[] {
  const out: Insight[] = [];
  if (m.revenue > 0 && m.courierTotal / m.revenue >= 0.15) {
    out.push({
      key: 'courier-cost',
      agent: 'courier',
      title: `Courier charges are ${pct((m.courierTotal / m.revenue) * 100)} of item revenue`,
      detail: `Customers paid ${inr(m.courierTotal)} in courier charges on ${inr(m.revenue)} of items.`,
      action: 'Offer free or flat shipping above a basket size to encourage larger orders, or compare partner rates.',
      impact: 55,
      evidence: [`Courier ${inr(m.courierTotal)}`, `Items ${inr(m.revenue)}`],
    });
  }
  const priced = m.couriers.filter(courier => courier.count >= 2);
  if (priced.length >= 2) {
    const cheapest = [...priced].sort((left, right) => left.avg - right.avg)[0];
    const costliest = [...priced].sort((left, right) => right.avg - left.avg)[0];
    if (costliest.avg >= cheapest.avg * 1.2) {
      out.push({
        key: 'courier-partners',
        agent: 'courier',
        title: `${costliest.name} costs ${pct(((costliest.avg - cheapest.avg) / cheapest.avg) * 100)} more than ${cheapest.name}`,
        detail: `Average parcel: ${costliest.name} ${inr(costliest.avg)}, ${cheapest.name} ${inr(cheapest.avg)}.`,
        action: `Prefer ${cheapest.name} where it serves the pincode.`,
        impact: 45,
        evidence: priced.map(courier => `${courier.name}: ${inr(courier.avg)} average`),
      });
    }
  }
  const unrecorded = data.orders.filter(order => order.courierBill && !order.deliveryPartner);
  if (unrecorded.length >= 3) {
    out.push({
      key: 'record-partner',
      agent: 'courier',
      title: `${plural(unrecorded.length, 'order')} have no delivery partner recorded`,
      detail: 'Courier comparisons need the partner on every order.',
      action: 'Open Master ledger and fill in the delivery partner and any comments.',
      impact: 30,
      evidence: unrecorded.slice(0, 4).map(order => order.orderId),
    });
  }
  return out;
}

function enquiriesAgent(data: DataSnapshot, m: Metrics): Insight[] {
  const out: Insight[] = [];
  if (m.staleEnquiries > 0) {
    out.push({
      key: 'stale-enquiries',
      agent: 'enquiries',
      title: `${plural(m.staleEnquiries, 'enquiry')} unanswered for over a day`,
      detail: 'Quick replies are one of the strongest signals for converting a question into an order.',
      action: 'Open Enquiries and reply on WhatsApp, then mark them replied.',
      impact: 80,
      evidence: [`${m.newEnquiries} new in total`],
    });
  }
  if (m.topEnquiredProducts.length > 0 && m.topEnquiredProducts[0].count >= 2) {
    out.push({
      key: 'top-enquired',
      agent: 'enquiries',
      title: `${m.topEnquiredProducts[0].name} gets the most questions`,
      detail: m.topEnquiredProducts.map(item => `${item.name} (${item.count})`).join(', '),
      action: 'Feature it on the banner and add the answers customers keep asking to its description.',
      impact: 45,
      evidence: m.topEnquiredProducts.map(item => `${item.name}: ${item.count}`),
    });
  }
  const courierQuestions = m.keywordCounts.find(([word]) => word === 'courier' || word === 'shipping' || word === 'delivery');
  if (courierQuestions && courierQuestions[1] >= 3) {
    out.push({
      key: 'courier-questions',
      agent: 'enquiries',
      title: `Customers keep asking about ${courierQuestions[0]}`,
      detail: `${courierQuestions[1]} enquiries mention it.`,
      action: 'Add a short delivery and courier-charge note to your product descriptions.',
      impact: 40,
      evidence: [`${courierQuestions[1]} mentions`],
    });
  }
  return out;
}

const AGENTS: Record<AgentKey, (data: DataSnapshot, m: Metrics) => Insight[]> = {
  sales: salesAgent,
  inventory: inventoryAgent,
  pricing: pricingAgent,
  customers: customersAgent,
  courier: courierAgent,
  enquiries: enquiriesAgent,
};

export function runAgents(data: DataSnapshot, m: Metrics, only?: AgentKey[]): Insight[] {
  const keys = (only && only.length ? only : (Object.keys(AGENTS) as AgentKey[]));
  return keys.flatMap(key => AGENTS[key](data, m));
}

/** Orders insights by impact x learned weight (weights come from the host's feedback). */
export function rankInsights(insights: Insight[], weights: Record<string, number> = {}): Insight[] {
  const score = (insight: Insight) => insight.impact * (weights[insight.key] ?? 1);
  return [...insights].sort((left, right) => score(right) - score(left));
}

export function generateInsights(data: DataSnapshot, weights: Record<string, number> = {}): Insight[] {
  return rankInsights(runAgents(data, computeMetrics(data)), weights);
}

/** Moves a weight up or down after feedback, within safe limits. */
export function adjustWeight(current: number | undefined, positive: boolean): number {
  const next = (current ?? 1) + (positive ? 0.15 : -0.2);
  return Math.min(2, Math.max(0.4, Math.round(next * 100) / 100));
}

/* --------------------------------- answers --------------------------------- */

const INTENTS: Array<{ agent: AgentKey; words: string[] }> = [
  { agent: 'sales', words: ['sales', 'sale', 'revenue', 'income', 'earn', 'sold', 'selling', 'best', 'trend', 'week', 'month', 'orders', 'order', 'growth'] },
  { agent: 'inventory', words: ['stock', 'inventory', 'restock', 'quantity', 'dead', 'slow', 'available', 'sold out'] },
  { agent: 'pricing', words: ['price', 'pricing', 'offer', 'offers', 'discount', 'deal', 'margin', 'cheap', 'expensive'] },
  { agent: 'customers', words: ['customer', 'customers', 'buyer', 'repeat', 'loyal', 'vip', 'city', 'district', 'area', 'when', 'time', 'day', 'hour', 'post'] },
  { agent: 'courier', words: ['courier', 'shipping', 'delivery', 'dispatch', 'partner', 'charge'] },
  { agent: 'enquiries', words: ['enquiry', 'enquiries', 'question', 'questions', 'asked', 'ask', 'whatsapp', 'interest', 'demand'] },
];

export function pickAgents(question: string): AgentKey[] {
  const lower = question.toLowerCase();
  const matches = INTENTS.filter(intent => intent.words.some(word => lower.includes(word))).map(intent => intent.agent);
  return matches.length ? matches : (Object.keys(AGENTS) as AgentKey[]);
}

export function answerQuestion(question: string, data: DataSnapshot, weights: Record<string, number> = {}): Answer {
  const metrics = computeMetrics(data);
  const docs = buildKnowledgeBase(data, metrics);
  const hits = retrieve(question, docs, 4);
  const agents = pickAgents(question);
  const insights = rankInsights(runAgents(data, metrics, agents), weights).slice(0, 3);

  const lines: string[] = [];
  if (data.orders.length === 0 && data.products.length === 0) {
    lines.push('There is no data to analyse yet. Once products and orders come in, I can answer from them.');
  } else {
    if (hits.length) {
      lines.push('Here is what your data says:');
      hits.forEach(doc => lines.push(`• ${doc.title}: ${doc.text}`));
    } else {
      lines.push('I could not find anything specific for that in your data, so here is the overall picture:');
      lines.push(`• ${docs[0].text}`);
    }
    if (insights.length) {
      lines.push('');
      lines.push('What I would do:');
      insights.forEach(insight => lines.push(`• ${insight.title}. ${insight.action}`));
    }
  }

  return {
    text: lines.join('\n'),
    sources: hits.map(doc => doc.title),
    agents,
    context: hits.map(doc => `${doc.title}: ${doc.text}`).join('\n') + (insights.length ? `\nFindings: ${insights.map(insight => `${insight.title} - ${insight.action}`).join(' | ')}` : ''),
  };
}
