import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import type { NineHoleSet, Scorecard } from '../types/index.ts';
import { db, isFirebaseConfigured } from './config';

interface ScorecardDocument {
  name: string;
  sets: NineHoleSet[];
  createdBy?: string;
  isPublic?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const ensureFirebase = () => {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured.');
  }
  return db;
};

const parseDoc = (id: string, data: ScorecardDocument): Scorecard => ({
  id,
  name: data.name,
  sets: data.sets ?? [],
  createdBy: data.createdBy,
  isPublic: data.isPublic ?? true,
});

// Firestore rejects undefined, so blank yardage/handicap cells are dropped entirely.
const sanitizeSets = (sets: NineHoleSet[]): NineHoleSet[] =>
  sets.map((set) => ({
    ...(set.alias?.trim() ? { alias: set.alias.trim() } : {}),
    holes: set.holes.map((hole) => ({
      par: hole.par,
      ...(Number.isFinite(hole.yards) ? { yards: hole.yards } : {}),
      ...(Number.isFinite(hole.handicap) ? { handicap: hole.handicap } : {}),
    })),
  }));

export const listScorecards = async (): Promise<Scorecard[]> => {
  const firestore = ensureFirebase();
  const q = query(collection(firestore, 'scorecard-templates'), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => parseDoc(d.id, d.data() as ScorecardDocument));
};

export const getScorecard = async (id: string): Promise<Scorecard | null> => {
  const firestore = ensureFirebase();
  const snapshot = await getDoc(doc(firestore, 'scorecard-templates', id));
  if (!snapshot.exists()) return null;
  return parseDoc(snapshot.id, snapshot.data() as ScorecardDocument);
};

export const createScorecard = async (
  name: string,
  sets: NineHoleSet[],
  clientId: string
): Promise<Scorecard> => {
  const firestore = ensureFirebase();
  const cleanSets = sanitizeSets(sets);
  const payload: ScorecardDocument = {
    name: name.trim(),
    sets: cleanSets,
    createdBy: clientId,
    isPublic: true,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(firestore, 'scorecard-templates'), payload);
  return { id: ref.id, name: payload.name, sets: cleanSets, createdBy: clientId, isPublic: true };
};

export const updateScorecard = async (
  id: string,
  name: string,
  sets: NineHoleSet[]
): Promise<NineHoleSet[]> => {
  const firestore = ensureFirebase();
  const cleanSets = sanitizeSets(sets);
  await updateDoc(doc(firestore, 'scorecard-templates', id), {
    name: name.trim(),
    sets: cleanSets,
    updatedAt: serverTimestamp(),
  });
  return cleanSets;
};
