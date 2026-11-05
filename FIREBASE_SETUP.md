# Firebase Setup

1. Create a Firebase project and register a Web App. Enable Google under Authentication providers, add the deployed site domain to Authorized domains, and create a Firestore database and Storage bucket.
2. Copy `.env.example` to `.env.local` and fill in the Web App values. Set `VITE_OWNER_EMAILS` and `VITE_DEVELOPER_EMAILS` to the Google accounts that should manage this store.
3. Keep the emails in `firestore.rules` aligned with those values. The default developer and first owner are listed in the rules; additional owners can be authorized from the developer panel after sign-in.
4. Publish both included rulesets with the Firebase Console Rules editors or Firebase CLI: `firebase deploy --only firestore:rules,storage`.
5. Add the same `VITE_FIREBASE_*`, `VITE_OWNER_EMAILS`, and `VITE_DEVELOPER_EMAILS` values to the Vercel project's Environment Variables, then redeploy.

The app uses Google sign-in in Firebase mode. Product reads are public; only signed-in staff can change the catalog, and customers can read only their own orders. Do not use service-account keys in the browser or in Vercel's `VITE_` variables.

Courier charges are stored on their order. The customer pays using the host's payment QR and submits the 12-digit UTR; a host must manually confirm that payment before dispatch is enabled. The app records the payment reference but does not process or verify bank transfers automatically.

Hosts can save From/To parcel details on each order and download a PDF parcel sheet. The customer To fields are prefilled from checkout and can be corrected before saving.

Customers can save delivery addresses under their signed-in account; the order keeps a snapshot of the exact address submitted. Customers can see their own order address and packed-parcel photos, while hosts can see all orders and confirm delivery.

Pincode entry checks the 6-digit format and queries India Post for postal-area metadata. That result is not a courier guarantee. For carrier serviceability, configure `VITE_PINCODE_PROXY_URL` to a server endpoint that accepts `POST { "pincode": "..." }` and returns `{ "serviceable": true|false, "provider": "...", "message": "...", "district": "...", "state": "...", "taluk": "..." }`. Keep DTDC, Delhivery, India Post business API, or other carrier credentials on the server, never in the browser. The host still explicitly confirms the address before item payment can be confirmed.

There is no Google Sheets integration in this repository. Orders are stored in Firestore when configured, or only in browser memory in local demo mode.

Until Firebase is configured, the site stays in local demo mode. Catalog and order changes in that mode are not shared across browsers or devices.