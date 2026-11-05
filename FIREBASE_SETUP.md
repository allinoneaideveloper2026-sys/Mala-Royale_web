# Firebase Setup

1. Create a Firebase project and register a Web App. Enable Google under Authentication providers, add the deployed site domain to Authorized domains, and create a Firestore database and Storage bucket.
2. Copy `.env.example` to `.env.local` and fill in the Web App values. Set `VITE_OWNER_EMAILS` and `VITE_DEVELOPER_EMAILS` to the Google accounts that should manage this store.
3. Keep the emails in `firestore.rules` aligned with those values. The default developer and first owner are listed in the rules; additional owners can be authorized from the developer panel after sign-in.
4. Publish both included rulesets with the Firebase Console Rules editors or Firebase CLI: `firebase deploy --only firestore:rules,storage`.
5. Add the same `VITE_FIREBASE_*`, `VITE_OWNER_EMAILS`, and `VITE_DEVELOPER_EMAILS` values to the Vercel project's Environment Variables, then redeploy.

The app uses Google sign-in in Firebase mode. Product reads are public; only signed-in staff can change the catalog, and customers can read only their own orders. Do not use service-account keys in the browser or in Vercel's `VITE_` variables.

Until Firebase is configured, the site stays in local demo mode. Catalog and order changes in that mode are not shared across browsers or devices.