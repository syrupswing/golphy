# Golphy

Golphy is a golf score-tracking app built with React, TypeScript, and Vite.

## Run locally

```bash
npm install
npm start
```

## Shared rounds with Firebase

The app supports optional real-time round sharing through Firestore.

### 1) Create a Firebase project

1. Go to Firebase Console and create (or choose) a project.
2. Add a Web App in that Firebase project.
3. Copy the Firebase config values.

### 2) Enable Firestore

1. In Firebase Console, open Firestore Database.
2. Create the database in production mode.

### 3) Configure local environment

1. Copy `.env.example` to `.env.local`.
2. Fill in all `VITE_FIREBASE_*` values from your Firebase Web App config.

### 4) Deploy Firestore rules

Install Firebase CLI and run:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

The included `firestore.rules` currently allows read/write for anyone with the round code. This is useful for quick multiplayer testing. For production, switch to authenticated rules.

## Player profiles collection

The app now includes a dedicated Firestore collection for reusable player profiles:

- Collection: `players`
- Minimum fields:
	- `firstName` (string)
	- `lastName` (string)
	- `nickname` (string, optional)
	- `handicap` (number)

Access helpers are in `src/firebase/players.ts`:

- `createPlayer(...)`
- `listPlayers()`
- `getPlayer(id)`
- `updatePlayer(id, updates)`

### 5) Use shared rounds in the app

1. Add players and hole count.
2. Click **Create Shared Round** to create a round and get a round code.
3. Other players enter that code and click **Join Shared Round**.
4. Score updates sync in real time across devices.
