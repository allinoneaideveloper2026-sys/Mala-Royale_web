import React, { useState } from 'react';
import { CONFIG } from './config';
import { TRANSLATIONS, Language } from './i18n';
import { UserRole, Product, Order, CustomerAddress } from './domain/types';
import { globalOrderBook } from './domain/OrderBook';

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

export default function App() {
  // Navigation & Authentication State
  const [lang, setLang] = useState<Language>('en');
  const [role, setRole] = useState<UserRole>('CUSTOMER');
  const [userEmail, setUserEmail] = useState('customer@gmail.com');
  const [authorizedHosts, setAuthorizedHosts] = useState<string[]>(['owner@malaroyale.com']);
  const [newHostEmail, setNewHostEmail] = useState('');

  // Catalog State
  const [products, setProducts] = useState<Product[]>(INITIAL_CATALOG);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [newProduct, setNewProduct] = useState({ name: '', category: 'Sarees', price: '', offerPrice: '', description: '', image: '' });

  // Customer Cart & Checkout State
  const [cart, setCart] = useState<Product[]>([]);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [courierPolicyAccepted, setCourierPolicyAccepted] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);

  // Customer Form Data
  const [address, setAddress] = useState<CustomerAddress>({
    fullName: '',
    phone: '',
    street: '',
    landmark1: '',
    pincode: '',
    googleMapsPin: '',
    consentTimestamp: ''
  });
  const [utr, setUtr] = useState('');

  const t = TRANSLATIONS[lang];

  // Role Routing based on Sign-In Email
  const handleEmailSwitch = (email: string) => {
    setUserEmail(email);
    if (CONFIG.developerEmails.includes(email)) {
      setRole('DEVELOPER');
    } else if (authorizedHosts.includes(email)) {
      setRole('OWNER');
    } else {
      setRole('CUSTOMER');
    }
  };

  // Developer Action: Add Host Email Whitelist
  const handleAddHost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHostEmail) return;
    if (authorizedHosts.length >= CONFIG.maxHostLogins) {
      alert(`Limit reached: Maximum of ${CONFIG.maxHostLogins} host logins allowed.`);
      return;
    }
    if (!authorizedHosts.includes(newHostEmail)) {
      setAuthorizedHosts([...authorizedHosts, newHostEmail]);
      setNewHostEmail('');
      alert(`Host email ${newHostEmail} successfully authorized.`);
    }
  };

  // Host Action: Publish Item with Price/Offers
  const handlePublishProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price) return;
    const addedProduct: Product = {
      id: `p-${Date.now()}`,
      name: newProduct.name,
      category: newProduct.category,
      price: parseFloat(newProduct.price),
      offerPrice: newProduct.offerPrice ? parseFloat(newProduct.offerPrice) : undefined,
      description: newProduct.description || 'Exclusive boutique craftsmanship.',
      image: newProduct.image || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&q=80&w=600'
    };
    setProducts([addedProduct, ...products]);
    setNewProduct({ name: '', category: 'Sarees', price: '', offerPrice: '', description: '', image: '' });
    alert('Item successfully added to live catalog!');
  };

  // Cart Management
  const addToCart = (p: Product) => setCart([...cart, p]);
  const cartTotal = cart.reduce((sum, item) => sum + (item.offerPrice || item.price), 0);

  // Customer Action: Submit Order via OrderBook Engine
  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courierPolicyAccepted) {
      alert(t.acceptCourierNotice);
      return;
    }
    try {
      const orderItems = cart.map(i => ({ productId: i.id, name: i.name, price: i.offerPrice || i.price, quantity: 1 }));
      const order = globalOrderBook.createOrder(
        userEmail,
        orderItems,
        cartTotal,
        { ...address, consentTimestamp: new Date().toISOString() },
        courierPolicyAccepted
      );
      globalOrderBook.submitItemPayment(order.orderId, cartTotal, utr, 'uploaded_proof.png');
      
      setActiveOrders(globalOrderBook.getAllOrders());
      setCart([]);
      setIsCheckoutOpen(false);
      setCheckoutStep(3);
      alert(`Order ${order.orderId} submitted successfully!`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredProducts = categoryFilter === 'All'
    ? products
    : products.filter(p => p.category === categoryFilter);

  return (
    <div style={{ fontFamily: 'Georgia, serif', backgroundColor: '#fdf8f6', color: '#333', minHeight: '100vh' }}>
      
      {/* ROLE SWITCHER & LANGUAGE HEADER */}
      <div style={{ backgroundColor: '#1a050d', color: '#fff', padding: '0.6rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.85rem' }}>
        <div>
          <span>Role: <strong>{role}</strong> ({userEmail})</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select value={lang} onChange={(e) => setLang(e.target.value as Language)} style={{ padding: '0.25rem', borderRadius: '4px' }}>
            <option value="en">English</option>
            <option value="kn">ಕನ್ನಡ (Kannada)</option>
          </select>
          <select value={userEmail} onChange={(e) => handleEmailSwitch(e.target.value)} style={{ padding: '0.25rem', borderRadius: '4px' }}>
            <option value="customer@gmail.com">{t.roleCustomer}</option>
            <option value="owner@malaroyale.com">{t.roleHost}</option>
            <option value="allinoneaideveloper2026@gmail.com">{t.roleDeveloper}</option>
          </select>
        </div>
      </div>

      {/* BOUTIQUE BRANDING */}
      <header style={{ backgroundColor: '#6e1a3a', color: '#fff', padding: '1.5rem', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '2.4rem' }}>{t.appName}</h1>
        <p style={{ margin: '0.3rem 0 0', fontStyle: 'italic', opacity: 0.9 }}>{t.tagline}</p>
      </header>

      {/* MAIN CONTENT AREA */}
      <div style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1rem' }}>

        {/* ------------------------------------------------------------------------- */}
        {/* DEVELOPER VIEW */}
        {/* ------------------------------------------------------------------------- */}
        {role === 'DEVELOPER' && (
          <div style={{ backgroundColor: '#fff', padding: '1.8rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
            <h2 style={{ color: '#6e1a3a', marginTop: 0 }}>🛠️ Developer Telemetry & Host Access</h2>
            <p style={{ fontSize: '0.9rem' }}>App Version: <strong>{CONFIG.version}</strong> | Active Orders in Engine: <strong>{activeOrders.length}</strong></p>
            
            <div style={{ backgroundColor: '#f9f9f9', padding: '1.2rem', borderRadius: '6px', margin: '1.5rem 0' }}>
              <h4 style={{ margin: '0 0 0.8rem' }}>{t.addHostHeader} (Max {CONFIG.maxHostLogins})</h4>
              <form onSubmit={handleAddHost} style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="email" 
                  placeholder="Enter Host Gmail address" 
                  value={newHostEmail} 
                  onChange={e => setNewHostEmail(e.target.value)} 
                  required 
                  style={{ flex: 1, padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} 
                />
                <button type="submit" style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Authorize Host</button>
              </form>
              <ul style={{ marginTop: '1rem', paddingLeft: '1.2rem' }}>
                {authorizedHosts.map(h => <li key={h}><strong>{h}</strong></li>)}
              </ul>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* HOST / OWNER VIEW */}
        {/* ------------------------------------------------------------------------- */}
        {role === 'OWNER' && (
          <div style={{ backgroundColor: '#fff', padding: '1.8rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
            <h2 style={{ color: '#6e1a3a', marginTop: 0 }}>🏪 Host Management Panel</h2>

            {/* Catalog Upload Form */}
            <div style={{ backgroundColor: '#f7ebe8', padding: '1.2rem', borderRadius: '8px', marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem' }}>Upload New Catalog Item</h3>
              <form onSubmit={handlePublishProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                <input type="text" placeholder="Product Name *" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} required style={{ padding: '0.6rem' }} />
                <select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} style={{ padding: '0.6rem' }}>
                  <option value="Sarees">Sarees</option>
                  <option value="Custom Kuchu">Custom Kuchu</option>
                </select>
                <input type="number" placeholder="Regular Price (₹) *" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} required style={{ padding: '0.6rem' }} />
                <input type="number" placeholder="Offer Price (₹, Optional)" value={newProduct.offerPrice} onChange={e => setNewProduct({ ...newProduct, offerPrice: e.target.value })} style={{ padding: '0.6rem' }} />
                <input type="text" placeholder="Image URL" value={newProduct.image} onChange={e => setNewProduct({ ...newProduct, image: e.target.value })} style={{ padding: '0.6rem', gridColumn: '1 / -1' }} />
                <textarea placeholder="Product Description" value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} style={{ padding: '0.6rem', gridColumn: '1 / -1' }} />
                <button type="submit" style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', gridColumn: '1 / -1' }}>{t.publishProduct}</button>
              </form>
            </div>

            {/* Manage Incoming Orders */}
            <h3>Incoming Orders & Courier Billing</h3>
            {activeOrders.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>No customer orders placed yet. Switch to Customer View to place a test order.</p>
            ) : (
              activeOrders.map(ord => (
                <div key={ord.orderId} style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>Order #{ord.orderId}</span>
                    <span style={{ color: '#6e1a3a' }}>Stage: {ord.stage}</span>
                  </div>
                  <p style={{ fontSize: '0.9rem', margin: '0.4rem 0' }}>Customer: {ord.address.fullName} ({ord.address.phone}) | UTR: <code>{ord.itemPayment?.utr}</code></p>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
                    <button 
                      onClick={() => {
                        globalOrderBook.verifyPayment(ord.orderId, 'ITEM');
                        setActiveOrders([...globalOrderBook.getAllOrders()]);
                      }} 
                      style={{ backgroundColor: '#2e7d32', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      {t.verifyPayment}
                    </button>

                    <button 
                      onClick={() => {
                        globalOrderBook.attachCourierBill(ord.orderId, {
                          courierName: 'DTDC Courier',
                          trackingId: 'DT98210391',
                          amount: 180,
                          receiptPhotoUrl: ''
                        });
                        setActiveOrders([...globalOrderBook.getAllOrders()]);
                      }} 
                      style={{ backgroundColor: '#0288d1', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      {t.uploadCourierReceipt} (₹180)
                    </button>

                    <button 
                      onClick={() => {
                        globalOrderBook.submitForDispatch(ord.orderId);
                        setActiveOrders([...globalOrderBook.getAllOrders()]);
                      }} 
                      style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      {t.markDispatched}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------------- */}
        {/* CUSTOMER VIEW */}
        {/* ------------------------------------------------------------------------- */}
        {role === 'CUSTOMER' && (
          <div>
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
                onClick={() => setIsCheckoutOpen(true)}
                style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.6rem 1.4rem', borderRadius: '25px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                🛒 Cart ({cart.length}) - ₹{cartTotal}
              </button>
            </div>

            {/* Catalog Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.8rem' }}>
              {filteredProducts.map(product => (
                <div key={product.id} style={{ backgroundColor: '#fff', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
                  <img src={product.image} alt={product.name} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
                  <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#6e1a3a', fontWeight: 'bold', textTransform: 'uppercase' }}>{product.category}</span>
                      <h3 style={{ margin: '0.3rem 0', fontSize: '1.1rem' }}>{product.name}</h3>
                      <p style={{ fontSize: '0.85rem', color: '#666', lineHeight: '1.3' }}>{product.description}</p>
                    </div>
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                      <button
                        onClick={() => addToCart(product)}
                        style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 3-Step Checkout Drawer */}
            {isCheckoutOpen && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
                <div style={{ backgroundColor: '#fff', maxWidth: '550px', width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: '12px', padding: '1.8rem', position: 'relative' }}>
                  <button onClick={() => setIsCheckoutOpen(false)} style={{ position: 'absolute', top: '15px', right: '15px', border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>

                  <h2 style={{ color: '#6e1a3a', marginTop: 0 }}>Checkout</h2>

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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <input type="text" placeholder="Full Name *" value={address.fullName} onChange={e => setAddress({ ...address, fullName: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                        <input type="text" placeholder="Phone Number *" value={address.phone} onChange={e => setAddress({ ...address, phone: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                        <input type="text" placeholder="Street / Door No *" value={address.street} onChange={e => setAddress({ ...address, street: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                        <input type="text" placeholder="Landmark *" value={address.landmark1} onChange={e => setAddress({ ...address, landmark1: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                        <input type="text" placeholder="Pincode *" value={address.pincode} onChange={e => setAddress({ ...address, pincode: e.target.value })} style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }} />
                      </div>
                      <button onClick={() => setCheckoutStep(2)} disabled={!address.fullName || !address.pincode} style={{ marginTop: '1.2rem', backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>Next: Item Payment</button>
                    </div>
                  )}

                  {/* Step 2: Payment */}
                  {checkoutStep === 2 && (
                    <form onSubmit={handlePlaceOrder}>
                      <h3>{t.step2Payment} (₹{cartTotal})</h3>
                      <p style={{ fontSize: '0.85rem', color: '#666' }}>Pay via UPI to <code>malaroyale@upi</code> and input your 12-digit UTR reference below.</p>
                      <input 
                        type="text" 
                        placeholder={t.enterUtr} 
                        value={utr} 
                        onChange={e => setUtr(e.target.value)} 
                        required 
                        style={{ width: '100%', padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px', margin: '0.8rem 0' }} 
                      />
                      <button type="submit" style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>{t.placeOrder}</button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* Active Orders Section */}
            {activeOrders.length > 0 && (
              <div style={{ marginTop: '3rem', backgroundColor: '#fff', padding: '1.5rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                <h3 style={{ color: '#6e1a3a', marginTop: 0 }}>{t.myOrders}</h3>
                {activeOrders.map(ord => (
                  <div key={ord.orderId} style={{ border: '1px solid #eee', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                      <span>Order ID: {ord.orderId}</span>
                      <span style={{ color: '#2e7d32' }}>Stage: {ord.stage}</span>
                    </div>
                    {ord.courierBill && (
                      <div style={{ marginTop: '0.6rem', backgroundColor: '#e8f5e9', padding: '0.8rem', borderRadius: '6px', fontSize: '0.9rem' }}>
                        <p style={{ margin: 0 }}>Courier: <strong>{ord.courierBill.courierName}</strong></p>
                        <p style={{ margin: '0.2rem 0' }}>Tracking ID: <strong>{ord.courierBill.trackingId}</strong></p>
                        <p style={{ margin: 0 }}>Courier Charge: <strong>₹{ord.courierBill.amount}</strong></p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
