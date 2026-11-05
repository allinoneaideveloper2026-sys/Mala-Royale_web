import React, { useEffect, useRef, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { CONFIG } from './config';
import { TRANSLATIONS, Language } from './i18n';
import { UserRole, Product, ProductMedia, Order, CustomerAddress } from './domain/types';
import { globalOrderBook } from './domain/OrderBook';
import { auth, firebaseConfigured } from './firebase';
import {
  attachCloudCourierBill,
  authorizeHost,
  createCloudOrder,
  isAuthorizedHost,
  isConfiguredDeveloper,
  isConfiguredOwner,
  publishProduct,
  revokeHost,
  seedInitialProducts,
  subscribeAuthorizedHosts,
  subscribeCheckoutQr,
  subscribeOrders,
  subscribeProducts,
  submitCloudOrderForDispatch,
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
  const catalogSeedAttempted = useRef(false);
  const [isUploadingProduct, setIsUploadingProduct] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);

  // Catalog State
  const [products, setProducts] = useState<Product[]>(INITIAL_CATALOG);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [newProduct, setNewProduct] = useState({ name: '', category: 'Sarees', price: '', offerPrice: '', description: '', image: '' });
  const [productMediaFiles, setProductMediaFiles] = useState<File[]>([]);
  const [paymentQrUrl, setPaymentQrUrl] = useState('');
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);

  // Customer Cart & Checkout State
  const [cart, setCart] = useState<Product[]>([]);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [courierPolicyAccepted, setCourierPolicyAccepted] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [customerTab, setCustomerTab] = useState<'SHOP' | 'ORDERS'>('SHOP');

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

  useEffect(() => {
    if (!auth) {
      setFirebaseLoading(false);
      return;
    }

    return onAuthStateChanged(auth, async user => {
      setFirebaseUser(user);
      setFirebaseLoading(true);

      if (!user?.email) {
        setUserEmail('');
        setRole('CUSTOMER');
        setActiveOrders([]);
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
        setRole('CUSTOMER');
        setSyncError(err instanceof Error ? err.message : 'Could not load account permissions.');
      } finally {
        setFirebaseLoading(false);
      }
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
      if (nextProducts.length === 0 && (role === 'OWNER' || role === 'DEVELOPER') && !catalogSeedAttempted.current) {
        catalogSeedAttempted.current = true;
        void seedInitialProducts(INITIAL_CATALOG).catch(error => setSyncError(error.message));
      }
    }, error => setSyncError(error.message));
  }, [role]);

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

  const handleGoogleSignIn = async () => {
    if (!auth) return;
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Google sign-in failed.');
    }
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
    setIsUploadingProduct(true);
    try {
      const productId = `p-${Date.now()}`;
      const media = firebaseConfigured
        ? await uploadProductMedia(productId, productMediaFiles)
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
        await publishProduct(addedProduct);
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
    setIsUploadingQr(true);
    try {
      const url = firebaseConfigured
        ? await uploadCheckoutQr(paymentQrFile)
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

  // Cart Management
  const addToCart = (p: Product) => setCart([...cart, p]);
  const buyNow = (product: Product) => {
    setCart(currentCart => [...currentCart, product]);
    setCheckoutStep(1);
    setIsCheckoutOpen(true);
    setCustomerTab('SHOP');
  };
  const cartTotal = cart.reduce((sum, item) => sum + (item.offerPrice || item.price), 0);

  // Customer Action: Submit Order via OrderBook Engine
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courierPolicyAccepted) {
      alert(t.acceptCourierNotice);
      return;
    }
    if (firebaseConfigured && !firebaseUser) {
      alert('Sign in with Google before placing an order.');
      return;
    }
    try {
      const orderItems = cart.map(i => ({ productId: i.id, name: i.name, price: i.offerPrice || i.price, quantity: 1 }));
      const order = firebaseConfigured
        ? await createCloudOrder(
          firebaseUser!.uid,
          orderItems,
          cartTotal,
          { ...address, consentTimestamp: new Date().toISOString() },
          courierPolicyAccepted,
          utr,
        )
        : globalOrderBook.createOrder(
          userEmail,
          orderItems,
          cartTotal,
          { ...address, consentTimestamp: new Date().toISOString() },
          courierPolicyAccepted
        );

      if (!firebaseConfigured) {
        globalOrderBook.submitItemPayment(order.orderId, cartTotal, utr, 'uploaded_proof.png');
        setActiveOrders(globalOrderBook.getAllOrders());
      }
      setCart([]);
      setIsCheckoutOpen(false);
      setCheckoutStep(3);
      setCustomerTab('ORDERS');
      alert(`Order ${order.orderId} submitted successfully!`);
    } catch (err: any) {
      const message = err instanceof Error && err.message.includes('permission-denied')
        ? 'Firestore rejected this action. Check the deployed Firestore rules and signed-in account role.'
        : err.message;
      alert(message);
    }
  };

  const handleVerifyPayment = async (orderId: string, kind: 'ITEM' | 'COURIER') => {
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

  const handleCourierReceipt = async (orderId: string) => {
    const bill = {
      courierName: 'DTDC Courier',
      trackingId: 'DT98210391',
      amount: 180,
      receiptPhotoUrl: '',
    };
    try {
      if (firebaseConfigured) {
        await attachCloudCourierBill(orderId, bill);
      } else {
        globalOrderBook.attachCourierBill(orderId, bill);
        setActiveOrders([...globalOrderBook.getAllOrders()]);
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not attach courier receipt.');
    }
  };

  const handleDispatch = async (orderId: string) => {
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

  const filteredProducts = categoryFilter === 'All'
    ? products
    : products.filter(p => p.category === categoryFilter);

  return (
    <div style={{ fontFamily: 'Georgia, serif', backgroundColor: '#fdf8f6', color: '#333', minHeight: '100vh' }}>
      
      {/* ROLE SWITCHER & LANGUAGE HEADER */}
      <div style={{ backgroundColor: '#1a050d', color: '#fff', padding: '0.6rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.85rem' }}>
        <div>
          <span>Role: <strong>{firebaseConfigured ? firebaseLoading ? 'CHECKING ACCESS' : firebaseUser ? role === 'OWNER' ? 'HOST' : role : 'GUEST' : `LOCAL ${role === 'OWNER' ? 'HOST' : role}`}</strong> ({firebaseConfigured ? firebaseUser?.email || 'signed out' : userEmail})</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select value={lang} onChange={(e) => setLang(e.target.value as Language)} style={{ padding: '0.25rem', borderRadius: '4px' }}>
            <option value="en">English</option>
            <option value="kn">ಕನ್ನಡ (Kannada)</option>
          </select>
          {firebaseConfigured ? (
            firebaseUser ? (
              <button onClick={handleSignOut} style={{ padding: '0.35rem 0.7rem', cursor: 'pointer' }}>Sign out</button>
            ) : (
              <button onClick={handleGoogleSignIn} disabled={firebaseLoading} style={{ padding: '0.35rem 0.7rem', cursor: 'pointer' }}>
                {firebaseLoading ? 'Checking session...' : 'Sign in with Google'}
              </button>
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

      <div aria-live="polite" style={{ padding: '0.55rem 1.2rem', backgroundColor: firebaseConfigured ? '#e8f5e9' : '#fff3cd', color: firebaseConfigured ? '#1b5e20' : '#664d03', fontSize: '0.85rem' }}>
        {firebaseConfigured
          ? 'Firestore is configured; catalog and order changes sync live when connected.'
          : 'Local demo only: add Firebase project settings to sync catalog and orders across devices.'}
        {syncError && <span> Sync issue: {syncError}</span>}
      </div>

      {/* BOUTIQUE BRANDING */}
      <header style={{ backgroundColor: '#6e1a3a', color: '#fff', padding: '1.5rem', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '2.4rem' }}>{t.appName}</h1>
        <p style={{ margin: '0.3rem 0 0', fontStyle: 'italic', opacity: 0.9 }}>{t.tagline}</p>
      </header>

      {/* MAIN CONTENT AREA */}
      <div style={{ maxWidth: '1100px', margin: '2rem auto', padding: '0 1rem' }}>
        {firebaseConfigured && firebaseLoading && <p role="status">Checking Google account and host access...</p>}

        {/* ------------------------------------------------------------------------- */}
        {/* DEVELOPER VIEW */}
        {/* ------------------------------------------------------------------------- */}
        {!firebaseLoading && role === 'DEVELOPER' && (
          <div style={{ backgroundColor: '#fff', padding: '1.8rem', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
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
        {/* HOST / OWNER VIEW */}
        {/* ------------------------------------------------------------------------- */}
        {!firebaseLoading && role === 'OWNER' && (
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
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    Product photos and video
                    <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple onChange={handleProductMediaSelection} />
                  </label>
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    Capture a product photo
                    <input type="file" accept="image/*" capture="environment" onChange={handleProductMediaSelection} />
                  </label>
                  <span style={{ alignSelf: 'end', color: '#666', fontSize: '0.85rem' }}>
                    Up to 6 photos and one video (30 seconds max). {productMediaFiles.length ? `${productMediaFiles.length} file(s) selected.` : ''}
                  </span>
                </div>
                {productMediaFiles.length > 0 && (
                  <ul style={{ gridColumn: '1 / -1', margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                    {productMediaFiles.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}</li>)}
                  </ul>
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
              {paymentQrUrl && <img src={paymentQrUrl} alt="Current checkout payment QR" style={{ width: '160px', height: '160px', objectFit: 'contain', display: 'block', marginBottom: '0.8rem' }} />}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem', alignItems: 'center' }}>
                <input type="file" accept="image/*" onChange={handlePaymentQrSelection} />
                <button type="button" disabled={!paymentQrFile || isUploadingQr} onClick={() => void handleCheckoutQrUpload()} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {isUploadingQr ? 'Uploading...' : 'Save checkout QR'}
                </button>
              </div>
            </div>

            {/* Manage Incoming Orders */}
            <h3>Incoming Orders & Courier Billing</h3>
            {activeOrders.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>
                {firebaseConfigured ? 'Customer orders will appear here as they are submitted.' : 'No customer orders placed yet. Switch to Customer View to place a test order.'}
              </p>
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
                      onClick={() => void handleVerifyPayment(ord.orderId, 'ITEM')}
                      style={{ backgroundColor: '#2e7d32', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      {t.verifyPayment}
                    </button>

                    <button 
                      onClick={() => void handleCourierReceipt(ord.orderId)}
                      style={{ backgroundColor: '#0288d1', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      {t.uploadCourierReceipt} (₹180)
                    </button>

                    <button 
                      onClick={() => void handleDispatch(ord.orderId)}
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
            </nav>

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
                onClick={() => setIsCheckoutOpen(true)}
                style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.6rem 1.4rem', borderRadius: '25px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Order now · Cart ({cart.length}) · ₹{cartTotal}
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
                      {firebaseConfigured && !firebaseUser && <p role="status">Sign in with Google before submitting your order.</p>}
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
                      <button type="submit" disabled={firebaseConfigured && !firebaseUser} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', padding: '0.7rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>{t.placeOrder}</button>
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
                {activeOrders.length === 0 ? (
                  <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', border: '1px solid #eee' }}>
                    <p style={{ marginTop: 0 }}>{firebaseConfigured && !firebaseUser ? 'Sign in to track your orders.' : 'No orders yet.'}</p>
                    <button type="button" onClick={() => setCustomerTab('SHOP')} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 0, padding: '0.6rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Browse the collection</button>
                  </div>
                ) : activeOrders.map(ord => (
                  <article key={ord.orderId} style={{ backgroundColor: '#fff', border: '1px solid #eee', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <strong>Order #{ord.orderId}</strong>
                        <div style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.2rem' }}>Placed {new Date(ord.createdAt).toLocaleString()}</div>
                      </div>
                      <span style={{ color: '#6e1a3a', fontWeight: 'bold' }}>{ord.stage.replace(/_/g, ' ')}</span>
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
                    {ord.courierBill && (
                      <div style={{ marginTop: '0.6rem', backgroundColor: '#e8f5e9', padding: '0.8rem', borderRadius: '6px', fontSize: '0.9rem' }}>
                        <p style={{ margin: 0 }}>Courier: <strong>{ord.courierBill.courierName}</strong></p>
                        <p style={{ margin: '0.2rem 0' }}>Tracking ID: <strong>{ord.courierBill.trackingId}</strong></p>
                        <p style={{ margin: 0 }}>Courier Charge: <strong>₹{ord.courierBill.amount}</strong></p>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
