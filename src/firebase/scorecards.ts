import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import type { NineHoleSet, Scorecard } from '../types/index.ts';
import { db, isFirebaseConfigured } from './config';

interface ScorecardDocument {
  name: string;
  sets: NineHoleSet[];
  createdBy?: string;
  isPublic?: boolean;
  createdAt?: unknown;
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
  const payload: ScorecardDocument = {
    name: name.trim(),
    sets,
    createdBy: clientId,
    isPublic: true,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(firestore, 'scorecard-templates'), payload);
  return { id: ref.id, name: payload.name, sets, createdBy: clientId, isPublic: true };
};
