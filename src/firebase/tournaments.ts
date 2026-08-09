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
import type { Tournament, TournamentEntry, TournamentFormat } from '../types/index.ts';
import { db, isFirebaseConfigured } from './config';

interface TournamentDocument {
  name: string;
  nameKey: string;
  format: TournamentFormat;
  entries: TournamentEntry[];
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TournamentInput {
  name: string;
  format: TournamentFormat;
  entries: TournamentEntry[];
}

const ensureFirebase = () => {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured.');
  }
  return db;
};

const toUserError = (error: unknown, fallback: string): Error => {
  const firestoreError = error as FirestoreError | undefined;

  if (firestoreError?.code === 'permission-denied') {
    return new Error(
      'Firebase permission denied. Deploy Firestore rules before creating or editing tournaments.'
    );
  }

  if (firestoreError?.code === 'unavailable') {
    return new Error('Firebase is unreachable. Check your connection and try again.');
  }

  if (error instanceof Error && error.message) {
    return new Error(error.message);
  }

  return new Error(fallback);
};

// Stored alongside the display name so uniqueness ignores case and spacing.
const toNameKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

const createEntryId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const parseDoc = (id: string, data: TournamentDocument): Tournament => ({
  id,
  name: data.name,
  format: data.format === 'team' ? 'team' : 'individual',
  entries: (data.entries ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    playerIds: entry.playerIds ?? [],
  })),
  createdBy: data.createdBy,
});

const sanitizeEntries = (entries: TournamentEntry[], format: TournamentFormat): TournamentEntry[] =>
  entries
    .map((entry) => ({
      id: entry.id || createEntryId(),
      name: entry.name.trim(),
      playerIds: [...new Set(entry.playerIds.filter(Boolean))],
    }))
    .filter((entry) => entry.playerIds.length > 0 && (format === 'individual' || entry.name.length > 0));

const validateInput = (input: TournamentInput): TournamentEntry[] => {
  if (!input.name.trim()) {
    throw new Error('Enter a tournament name.');
  }

  const entries = sanitizeEntries(input.entries, input.format);

  if (entries.length === 0) {
    throw new Error(
      input.format === 'team'
        ? 'Add at least one team with a name and a player.'
        : 'Add at least one player.'
    );
  }

  if (input.format === 'team') {
    const nameKeys = entries.map((entry) => toNameKey(entry.name));
    if (new Set(nameKeys).size !== nameKeys.length) {
      throw new Error('Team names must be unique within a tournament.');
    }
  }

  const assignedPlayerIds = entries.flatMap((entry) => entry.playerIds);
  if (new Set(assignedPlayerIds).size !== assignedPlayerIds.length) {
    throw new Error('A player can only appear once in a tournament.');
  }

  return entries;
};

export const listTournaments = async (): Promise<Tournament[]> => {
  const firestore = ensureFirebase();

  try {
    const snapshot = await getDocs(collection(firestore, 'tournaments'));
    return snapshot.docs
      .map((d) => parseDoc(d.id, d.data() as TournamentDocument))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
  } catch (error) {
    throw toUserError(error, 'Failed to load tournaments.');
  }
};

export const getTournament = async (id: string): Promise<Tournament | null> => {
  const firestore = ensureFirebase();

  try {
    const snapshot = await getDoc(doc(firestore, 'tournaments', id));
    if (!snapshot.exists()) return null;
    return parseDoc(snapshot.id, snapshot.data() as TournamentDocument);
  } catch (error) {
    throw toUserError(error, 'Failed to load tournament.');
  }
};

const assertNameIsAvailable = async (name: string, ignoreId?: string): Promise<void> => {
  const nameKey = toNameKey(name);
  const existing = await listTournaments();
  const clash = existing.find(
    (tournament) => tournament.id !== ignoreId && toNameKey(tournament.name) === nameKey
  );

  if (clash) {
    throw new Error(`A tournament named "${clash.name}" already exists.`);
  }
};

export const createTournament = async (
  input: TournamentInput,
  clientId: string
): Promise<Tournament> => {
  const firestore = ensureFirebase();
  const entries = validateInput(input);
  await assertNameIsAvailable(input.name);

  const payload: TournamentDocument = {
    name: input.name.trim(),
    nameKey: toNameKey(input.name),
    format: input.format,
    entries,
    createdBy: clientId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = await addDoc(collection(firestore, 'tournaments'), payload);
    return parseDoc(ref.id, payload);
  } catch (error) {
    throw toUserError(error, 'Failed to create tournament.');
  }
};

export const updateTournament = async (
  id: string,
  input: TournamentInput
): Promise<Tournament> => {
  const firestore = ensureFirebase();
  const entries = validateInput(input);
  await assertNameIsAvailable(input.name, id);

  const payload = {
    name: input.name.trim(),
    nameKey: toNameKey(input.name),
    format: input.format,
    entries,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(firestore, 'tournaments', id), payload);
    return { id, name: payload.name, format: payload.format, entries };
  } catch (error) {
    throw toUserError(error, 'Failed to update tournament.');
  }
};

export const deleteTournament = async (id: string): Promise<void> => {
  const firestore = ensureFirebase();

  try {
    await deleteDoc(doc(firestore, 'tournaments', id));
  } catch (error) {
    throw toUserError(error, 'Failed to delete tournament.');
  }
};

export const makeEntryId = createEntryId;
