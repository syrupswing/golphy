import {
  doc,
  type FirestoreError,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { GameState, MatchupConfig, Player, Score } from '../types/index.ts';
import { db, isFirebaseConfigured } from './config';

interface RoundDocument {
  players: Player[];
  scores: Score[];
  currentHole: number;
  totalHoles: number;
  alias?: string;
  parValues?: number[];
  scorecardId?: string;
  scorecardName?: string;
  playedSetLabels?: string[];
  matchup?: MatchupConfig;
  createdBy: string;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const ROUND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROUND_CODE_LENGTH = 6;

const sanitizeRoundId = (value: string): string =>
  value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const buildRoundCode = (): string => {
  let code = '';
  for (let i = 0; i < ROUND_CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * ROUND_CODE_CHARS.length);
    code += ROUND_CODE_CHARS[index];
  }
  return code;
};

const toRoundDocument = (state: GameState, clientId: string): RoundDocument => ({
  players: state.players,
  scores: state.scores,
  currentHole: state.currentHole,
  totalHoles: state.totalHoles,
  alias: state.alias ?? '',
  parValues: state.parValues ?? [],
  scorecardId: state.scorecardId ?? '',
  scorecardName: state.scorecardName ?? '',
  playedSetLabels: state.playedSetLabels ?? [],
  matchup: state.matchup,
  createdBy: clientId,
  updatedBy: clientId,
});

const parseRoundDocument = (data: RoundDocument): GameState => ({
  players: data.players ?? [],
  scores: data.scores ?? [],
  currentHole: data.currentHole ?? 1,
  totalHoles: data.totalHoles ?? 18,
  alias: data.alias ?? '',
  parValues: data.parValues?.length ? data.parValues : undefined,
  scorecardId: data.scorecardId || undefined,
  scorecardName: data.scorecardName || undefined,
  playedSetLabels: data.playedSetLabels?.length ? data.playedSetLabels : undefined,
  matchup: data.matchup,
});

const ensureFirebase = () => {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      'Firebase is not configured. Add VITE_FIREBASE_API and other VITE_FIREBASE_* values to your .env.local file.'
    );
  }

  return db;
};

const toUserError = (error: unknown, fallback: string): Error => {
  const firestoreError = error as FirestoreError | undefined;
  const code = firestoreError?.code;

  if (code === 'permission-denied') {
    return new Error(
      'Firebase permission denied. Deploy Firestore rules or sign in before creating/joining shared rounds.'
    );
  }

  if (code === 'unavailable') {
    return new Error(
      'Firebase is unreachable. If you are on VPN/corporate Wi-Fi, try another network. Also confirm Firestore Database is enabled in Firebase Console.'
    );
  }

  if (code === 'failed-precondition') {
    return new Error(
      'Firestore is not ready for this project. Enable Firestore Database in Firebase Console and try again.'
    );
  }

  if (code === 'not-found') {
    return new Error('Round not found. Confirm the round code and try again.');
  }

  if (error instanceof Error && error.message) {
    return new Error(error.message);
  }

  return new Error(fallback);
};

export const createRound = async (
  state: GameState,
  clientId: string,
  maxAttempts = 8
): Promise<string> => {
  const firestore = ensureFirebase();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const roundId = buildRoundCode();
    const roundRef = doc(firestore, 'rounds', roundId);
    let existing;
    try {
      existing = await getDoc(roundRef);
    } catch (error) {
      throw toUserError(error, 'Failed to verify round code availability.');
    }

    if (existing.exists()) {
      continue;
    }

    const payload = toRoundDocument(state, clientId);
    try {
      await setDoc(roundRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw toUserError(error, 'Failed to create shared round.');
    }

    return roundId;
  }

  throw new Error('Unable to allocate a unique round code. Please try again.');
};

export const updateRound = async (
  roundId: string,
  state: GameState,
  clientId: string
): Promise<void> => {
  const firestore = ensureFirebase();
  const normalizedId = sanitizeRoundId(roundId);

  if (!normalizedId) {
    throw new Error('A valid round code is required to update a shared round.');
  }

  const roundRef = doc(firestore, 'rounds', normalizedId);
  try {
    await updateDoc(roundRef, {
      players: state.players,
      scores: state.scores,
      currentHole: state.currentHole,
      totalHoles: state.totalHoles,
      alias: state.alias ?? '',
      parValues: state.parValues ?? [],
      scorecardId: state.scorecardId ?? '',
      scorecardName: state.scorecardName ?? '',
      playedSetLabels: state.playedSetLabels ?? [],
      matchup: state.matchup ?? null,
      updatedBy: clientId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toUserError(error, 'Failed to sync round updates.');
  }
};

export const loadRound = async (roundId: string): Promise<GameState> => {
  const firestore = ensureFirebase();
  const normalizedId = sanitizeRoundId(roundId);

  if (!normalizedId) {
    throw new Error('A valid round code is required to join a shared round.');
  }

  const roundRef = doc(firestore, 'rounds', normalizedId);

  try {
    const snapshot = await getDoc(roundRef);

    if (!snapshot.exists()) {
      throw new Error('Round not found. Confirm the round code and try again.');
    }

    const data = snapshot.data() as RoundDocument;
    return parseRoundDocument(data);
  } catch (error) {
    throw toUserError(error, 'Unable to join shared round.');
  }
};

export const subscribeToRound = (
  roundId: string,
  onState: (state: GameState, updatedBy: string | null) => void,
  onError: (error: Error) => void
): Unsubscribe => {
  const firestore = ensureFirebase();
  const normalizedId = sanitizeRoundId(roundId);

  if (!normalizedId) {
    throw new Error('A valid round code is required to join a shared round.');
  }

  const roundRef = doc(firestore, 'rounds', normalizedId);

  return onSnapshot(
    roundRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onError(new Error('Round not found. Confirm the round code and try again.'));
        return;
      }

      const data = snapshot.data() as RoundDocument;
      onState(parseRoundDocument(data), data.updatedBy ?? null);
    },
    (error) => {
      onError(toUserError(error, 'Lost connection to shared round.'));
    }
  );
};

export const normalizeRoundId = sanitizeRoundId;
