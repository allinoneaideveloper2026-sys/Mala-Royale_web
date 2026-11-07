# Firebase Setup

## Accounts and services

- **GitHub:** You need access to this repository with permission to enable GitHub Pages and configure repository variables. GitHub Actions builds and deploys the site.
- **Google / Firebase:** Use a Google account to create a project in the [Firebase Console](https://console.firebase.google.com/). This account also signs in to the app. Add the Google accounts that should manage the store to the owner/developer configuration.
- **Cloudinary (optional):** Create an account at [Cloudinary](https://cloudinary.com/users/register/free) if you want to upload product images and the checkout QR from the app. Without it, you can still use hosted image URLs.

## Environment variables

Copy `.env.example` to `.env.local` for local development. For deployment, add the values in GitHub under **Settings → Secrets and variables → Actions → Variables**. GitHub Actions passes these values into the production build.

| Variable | Requirement | Where to get it / purpose |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Yes | Firebase Console → Project settings → Your apps → Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Web app config, usually `<project-id>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase Web app config |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase Web app config |
| `VITE_OWNER_EMAILS` | Configure for staff access | Comma-separated Google email addresses for store owners; keep in sync with `firestore.rules` |
| `VITE_DEVELOPER_EMAILS` | Configure for staff access | Comma-separated developer Google email addresses; keep in sync with `firestore.rules` |
| `VITE_CLOUDINARY_CLOUD_NAME` | Optional | Cloudinary dashboard; required for in-app media uploads |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Optional | Name of the Cloudinary unsigned upload preset; required for in-app media uploads |
| `VITE_PINCODE_PROXY_URL` | Optional | URL of your server-side courier serviceability endpoint; leave unset to use India Post postal-area lookup only |
| `VITE_GOOGLE_CLIENT_ID` | Not needed | Google sign-in is configured through Firebase; this value is not currently used by the app |
| `VITE_FEEDBACK_URL` | Not needed | This value is not currently used by the app |

Values prefixed with `VITE_` are embedded in the public website bundle. Firebase web-app configuration is intended for client use, but access must be protected by the Firestore rules. Never put Firebase service-account keys, Cloudinary API secrets, or courier credentials in these variables. The Cloudinary cloud name and unsigned preset name are public too, so restrict the preset to the media types and sizes the catalog needs.

1. Create a Firebase project and register a Web App. Enable Google under Authentication providers, add the deployed site domain to Authorized domains, and create a Firestore database. Do not enable Firebase Storage; the app does not use it.
2. Copy `.env.example` to `.env.local` and fill in the Firebase Web App values. Set `VITE_OWNER_EMAILS` and `VITE_DEVELOPER_EMAILS` to the Google accounts that should manage this store.
3. Keep the emails in `firestore.rules` aligned with those values. The default developer and first owner are listed in the rules; additional owners can be authorized from the developer panel after sign-in.
4. Create a Cloudinary account and an unsigned upload preset. Set `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` from the account/preset details. The preset name and cloud name are public frontend settings; never put a Cloudinary API secret in a `VITE_` variable.
5. In Cloudinary, restrict the preset to the image/video types and file sizes needed by the catalog. Unsigned uploads are publicly callable, so this app uses them only for public product media and the public checkout QR. Order-related photos are not uploaded or displayed.
6. Publish the Firestore rules with the Firebase Console Rules editor or Firebase CLI: `firebase deploy --only firestore:rules`.
7. In the GitHub repository, open **Settings → Pages** and set the source to **GitHub Actions**. Add the required and desired optional values from the table above under **Settings → Secrets and variables → Actions → Variables**. The workflow builds `dist` and deploys it to GitHub Pages whenever changes are pushed to `main`.

Cloudinary's [free plan](https://cloudinary.com/pricing) currently lists 25 monthly credits and no credit card requirement. Plan features and usage limits can change; check its current pricing and usage dashboard. Uploads are unavailable until the Cloudinary environment variables and unsigned preset are configured.

The app uses Google sign-in in Firebase mode. Product reads are public; only signed-in staff can change the catalog, and customers can read only their own orders. Do not use service-account keys in the browser or in `VITE_` variables.

Courier charges are stored on their order. The customer pays using the host's payment QR and submits the 12-digit UTR; a host must manually confirm that payment before dispatch is enabled. The app records the payment reference but does not process or verify bank transfers automatically.

Hosts can save From/To parcel details on each order and download a PDF parcel sheet. The customer To fields are prefilled from checkout and can be corrected before saving. To avoid exposing order details through public media uploads, packed-parcel photos and courier tracker screenshots are not supported.

Customers can save delivery addresses under their signed-in account; the order keeps a snapshot of the exact address submitted. Customers can see their own order address, while hosts can see all orders and confirm delivery.

Pincode entry checks the 6-digit format and queries India Post for postal-area metadata. That result is not a courier guarantee. For carrier serviceability, configure `VITE_PINCODE_PROXY_URL` to a server endpoint that accepts `POST { "pincode": "..." }` and returns `{ "serviceable": true|false, "provider": "...", "message": "...", "district": "...", "state": "...", "taluk": "..." }`. Keep DTDC, Delhivery, India Post business API, or other carrier credentials on the server, never in the browser. The host still explicitly confirms the address before item payment can be confirmed.

There is no Google Sheets integration in this repository. Orders are stored in Firestore when configured, or only in browser memory in local demo mode.

Until Firebase is configured, the site stays in local demo mode. Catalog and order changes in that mode are not shared across browsers or devices.