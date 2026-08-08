import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  type FirestoreError,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import type { PlayerProfile } from '../types/index.ts';
import { db, isFirebaseConfigured } from './config';

interface PlayerDocument {
  firstName: string;
  lastName: string;
  nickname?: string;
  handicap: number;
  createdBy?: string;
  isPublic?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface CreatePlayerInput {
  firstName: string;
  lastName: string;
  nickname?: string;
  handicap: number;
}

interface UpdatePlayerInput {
  firstName?: string;
  lastName?: string;
  nickname?: string;
  handicap?: number;
  isPublic?: boolean;
}

const MIN_HANDICAP = -10;
const MAX_HANDICAP = 54;

const ensureFirebase = () => {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured.');
  }
  return db;
};

const toUserError = (error: unknown, fallback: string): Error => {
  const firestoreError = error as FirestoreError | undefined;
  const code = firestoreError?.code;
  const rawMessage =
    typeof firestoreError?.message === 'string'
      ? firestoreError.message.toLowerCase()
      : error instanceof Error
        ? error.message.toLowerCase()
        : '';

  if (code === 'permission-denied') {
    return new Error(
      'Firebase permission denied. Deploy Firestore rules or sign in before creating or editing players.'
    );
  }

  if (code === 'unavailable') {
    return new Error(
      'Firebase is unreachable. If you are on VPN or corporate Wi-Fi, try another network. Also confirm Firestore Database is enabled in Firebase Console.'
    );
  }

  if (code === 'failed-precondition') {
    if (rawMessage.includes('index') || rawMessage.includes('requires an index')) {
      return new Error(
        'Firestore needs an index for this player query. Create the suggested Firestore index in Firebase Console and try again.'
      );
    }

    if (rawMessage.includes('database') || rawMessage.includes('firestore')) {
      return new Error(
        'Firestore is not ready for this project. Enable Firestore Database in Firebase Console and try again.'
      );
    }

    return new Error(
      'Firestore rejected this request because the project is not fully configured yet. Check Firestore setup and indexes in Firebase Console, then try again.'
    );
  }

  if (code === 'not-found') {
    return new Error('Player not found. Confirm the player ID and try again.');
  }

  if (error instanceof Error && error.message) {
    return new Error(error.message);
  }

  return new Error(fallback);
};

const clampHandicap = (value: number): number => {
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.max(MIN_HANDICAP, Math.min(MAX_HANDICAP, numeric));
};

const cleanName = (value: string): string => value.trim();

const cleanNickname = (value?: string): string | undefined => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length ? trimmed : undefined;
};

const parseDoc = (id: string, data: PlayerDocument): PlayerProfile => ({
  id,
  firstName: data.firstName,
  lastName: data.lastName,
  nickname: data.nickname,
  handicap: clampHandicap(data.handicap),
  createdBy: data.createdBy,
  isPublic: data.isPublic ?? true,
});

export const listPlayers = async (): Promise<PlayerProfile[]> => {
  const firestore = ensureFirebase();
  try {
    const snapshot = await getDocs(collection(firestore, 'players'));
    return snapshot.docs
      .map((d) => parseDoc(d.id, d.data() as PlayerDocument))
      .sort((left, right) => {
        const lastNameCompare = left.lastName.localeCompare(right.lastName, undefined, {
          sensitivity: 'base',
        });

        if (lastNameCompare !== 0) {
          return lastNameCompare;
        }

        return left.firstName.localeCompare(right.firstName, undefined, {
          sensitivity: 'base',
        });
      });
  } catch (error) {
    throw toUserError(error, 'Failed to load players.');
  }
};

export const getPlayer = async (id: string): Promise<PlayerProfile | null> => {
  const firestore = ensureFirebase();
  try {
    const snapshot = await getDoc(doc(firestore, 'players', id));
    if (!snapshot.exists()) return null;
    return parseDoc(snapshot.id, snapshot.data() as PlayerDocument);
  } catch (error) {
    throw toUserError(error, 'Failed to load player profile.');
  }
};

export const createPlayer = async (
  input: CreatePlayerInput,
  clientId: string
): Promise<PlayerProfile> => {
  const firestore = ensureFirebase();
  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);

  if (!firstName || !lastName) {
    throw new Error('First name and last name are required.');
  }

  const payload: PlayerDocument = {
    firstName,
    lastName,
    nickname: cleanNickname(input.nickname),
    handicap: clampHandicap(input.handicap),
    createdBy: clientId,
    isPublic: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = await addDoc(collection(firestore, 'players'), payload);
    return parseDoc(ref.id, payload);
  } catch (error) {
    throw toUserError(error, 'Failed to create player profile.');
  }
};

export const updatePlayer = async (
  id: string,
  updates: UpdatePlayerInput
): Promise<void> => {
  const firestore = ensureFirebase();
  const ref = doc(firestore, 'players', id);

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (typeof updates.firstName === 'string') {
    const firstName = cleanName(updates.firstName);
    if (!firstName) throw new Error('First name cannot be empty.');
    payload.firstName = firstName;
  }

  if (typeof updates.lastName === 'string') {
    const lastName = cleanName(updates.lastName);
    if (!lastName) throw new Error('Last name cannot be empty.');
    payload.lastName = lastName;
  }

  if (typeof updates.nickname === 'string') {
    payload.nickname = cleanNickname(updates.nickname) ?? '';
  }

  if (typeof updates.handicap === 'number') {
    payload.handicap = clampHandicap(updates.handicap);
  }

  if (typeof updates.isPublic === 'boolean') {
    payload.isPublic = updates.isPublic;
  }

  try {
    await updateDoc(ref, payload);
  } catch (error) {
    throw toUserError(error, 'Failed to update player profile.');
  }
};

export const deletePlayer = async (id: string): Promise<void> => {
  const firestore = ensureFirebase();

  try {
    await deleteDoc(doc(firestore, 'players', id));
  } catch (error) {
    throw toUserError(error, 'Failed to delete player profile.');
  }
};
