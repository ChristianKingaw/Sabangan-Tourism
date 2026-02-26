# Sabangan Tourism System

<p align="center">
  Official Sabangan Tourism Office website for the Gagayam Trail Run experience.
</p>

Production-ready tourism and trail registration system for the Gagayam Trail Run, built with Next.js and Firebase.

## 1. System Scope

This repository contains:

- Public tourism page and event content.
- Multi-step participant registration form.
- Public endpoint for approved participants.
- Local-only admin review portal.
- Firebase Hosting + SSR deployment setup.

## 2. End-to-End Process

### 2.1 Registration Process

1. User opens the public site and completes the multi-step form.
2. Frontend sends form data and payment proof file to `POST /api/register`.
3. Backend validates required fields, ZIP code, privacy consent, and payment amount.
4. Payment proof is stored in Firebase Storage when configured.
5. If Storage is unavailable, the system falls back to a Base64 data URL to avoid blocking registration.
6. Registration is saved to Firebase Realtime Database:
   - `events/{eventId}`
   - `clients/{clientId}` with default `review_status = "pending"`
   - `payments/{paymentId}`
7. API returns `eventId`, `clientId`, and `paymentId`.

### 2.2 Admin Review Process (Localhost Only)

1. Admin opens `/admin` in development localhost only.
2. Admin signs in via `POST /api/admin/login`.
3. Session cookie is issued (`sabangan_admin_session`).
4. Admin loads rows from `GET /api/admin/registrations`.
5. Admin action is submitted to `POST /api/admin/registrations/[clientId]/review`:
   - `accept`: updates client status and writes to `public_clients/{clientId}`
   - `reject`: updates client status and removes from `public_clients`
   - `delete`: deletes client, public client row, and related payments

### 2.3 Public Approved Participants Process

1. Client requests `GET /api/registered-clients`.
2. API reads `public_clients` and returns normalized, date-sorted rows.
3. Only approved entries appear in the public list.

### 2.4 Deployment Process

1. Run `npm run build` for production build verification.
2. Run `npm run deploy`.
3. Deployment script temporarily removes `app/admin` and `app/api/admin` from deployment payload.
4. `firebase deploy --only hosting --force` publishes the site and SSR backend.
5. Script restores moved directories after deploy completes.

## 3. Runtime Architecture

- Framework: Next.js App Router (Node.js runtime for APIs).
- Hosting: Firebase Hosting with framework integration.
- Data store: Firebase Realtime Database.
- File storage: Firebase Storage (proof of payment).
- Fallback write path: REST writes to Realtime DB when Admin SDK is unavailable.
- Local DB utility: Prisma schema + SQLite DDL helper script for local tooling.

## 4. Project Structure

| Path | Purpose |
| --- | --- |
| `app/` | Next.js pages and API routes |
| `components/` | UI components including registration and admin portal |
| `lib/` | Firebase Admin setup, admin auth/session, access guards, timeout helper |
| `scripts/` | Deployment and local database schema scripts |
| `firebase.json` | Hosting, Database, and Storage deployment config |
| `firestore.rules` / `firestore.indexes.json` | Firestore configs kept in repo |
| `firebase/` | Realtime Database and Storage rules |
| `functions/` | Separate Cloud Functions TypeScript workspace |
| `prisma/` | Prisma schema for local SQLite modeling |

## 5. Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase client auth/API access |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Yes | Realtime DB URL (client/server fallback) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase project id |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Firebase Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase app metadata |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase app metadata |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional | Analytics metadata |
| `FIREBASE_DATABASE_URL` | Recommended | Server-side DB URL override |
| `FIREBASE_PROJECT_ID` | Recommended | Firebase Admin SDK service account config |
| `FIREBASE_CLIENT_EMAIL` | Recommended | Firebase Admin SDK service account config |
| `FIREBASE_PRIVATE_KEY` | Recommended | Firebase Admin SDK service account config |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional | Alternative Admin SDK credential path |
| `FIREBASE_DATABASE_SECRET` | Optional | REST fallback token for DB reads/writes |
| `FIREBASE_AUTH_TOKEN` | Optional | Alternative REST auth token |
| `FIREBASE_STORAGE_BUCKET` | Optional | Server-side storage bucket override |
| `USE_FIREBASE_STORAGE` | Optional | Force/disable storage upload mode |
| `FIXED_REGISTRATION_AMOUNT` | Yes | Fixed event registration amount |
| `ADMIN_SESSION_SECRET` | Recommended | Cookie signing secret for admin session |
| `DATABASE_URL` | Optional | SQLite path for `db:push` utility |

## 6. Commands

### 6.1 Root Application

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next.js development server |
| `npm run build` | Create production build |
| `npm run start` | Run production server locally |
| `npm run deploy` | Deploy hosting using the no-admin script |
| `npm run deploy:hosting:no-admin` | Run `scripts/deploy-hosting-no-admin.js` |
| `npm run db:push` | Create/update local SQLite tables via DDL script |
| `npm run db:studio` | Open Prisma Studio |

### 6.2 Functions Workspace (`functions/`)

| Command | Description |
| --- | --- |
| `npm run lint` | Lint functions code |
| `npm run build` | Compile TypeScript |
| `npm run serve` | Build and run emulator for functions |
| `npm run shell` | Open Firebase functions shell |
| `npm run deploy` | Deploy only Cloud Functions |
| `npm run logs` | Tail functions logs |

## 7. Dependency Details

### 7.1 Root Dependencies (`package.json`)

| Package | Version | Role in System |
| --- | --- | --- |
| `next` | `^15.5.12` | SSR framework, routing, API handlers |
| `react` | `^19.2.4` | UI rendering |
| `react-dom` | `^19.2.4` | React DOM runtime |
| `firebase-admin` | `^13.6.1` | Server-side Firebase Admin SDK access |
| `@jobuntux/psgc` | `^0.2.1` | Philippine PSGC geographic reference data |
| `use-postal-ph` | `^1.1.13` | Philippine postal code dataset lookup |
| `leaflet` | `^1.9.4` | Interactive map rendering |
| `leaflet-omnivore` | `^0.3.4` | KML parsing for trail route overlays |
| `@prisma/client` | `^7.4.1` | Prisma client runtime |
| `prisma` (dev) | `^7.4.1` | Schema tooling / local data tooling |
| `better-sqlite3` | `^12.6.2` | Local SQLite DDL execution (`db:push`) |
| `dotenv` (dev) | `^17.3.1` | Environment variable loading for scripts |
| `@dataconnect/admin-generated` | `file:src/dataconnect-admin-generated` | Generated Data Connect admin client bundle |

### 7.2 Functions Dependencies (`functions/package.json`)

| Package | Version | Role in System |
| --- | --- | --- |
| `firebase-functions` | `^7.0.0` | Cloud Functions runtime APIs |
| `firebase-admin` | `^13.6.0` | Admin SDK in function context |
| `typescript` (dev) | `^5.7.3` | Functions TypeScript compilation |
| `eslint` + TS plugins (dev) | various | Linting and code quality |
| `firebase-functions-test` (dev) | `^3.4.1` | Functions testing helpers |

## 8. Professional Deployment Checklist

1. Confirm `.env.local` is complete for target Firebase project.
2. Run `npm install` (and `npm install` inside `functions/` if deploying functions).
3. Run `npm run build` and resolve all errors.
4. Run `firebase projects:list` and verify active project id.
5. Run `npm run deploy`.
6. Verify hosting URL and critical flows (`/`, `/api/register`, `/api/registered-clients`).

## 9. Operational Notes

- Admin page and admin APIs are development-only by host and environment checks.
- Deployment script intentionally excludes admin routes from hosting deploy payload.
- Current admin username/password are hardcoded in `lib/adminAuth.js`; move these to secure environment variables for production-grade security.

## 10. License

See `LICENSE`.


## Issues

Grabeng rush to diko na ma enjoy, 1 week lang tinapos 😒😒😒😒😒
