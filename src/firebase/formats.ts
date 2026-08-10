import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';
import type { TournamentSessionFormat } from '../types/index.ts';
import {
  DEFAULT_TOURNAMENT_SESSION_FORMATS,
  getTournamentSessionFormats,
  normalizeSessionFormat,
} from '../tournaments/scoring';
import { db, isFirebaseConfigured } from './config';

interface GlobalFormatsDocument {
  customSessionFormats?: TournamentSessionFormat[];
  updatedBy?: string;
  updatedAt?: unknown;
}

const GLOBAL_FORMATS_DOC = 'global-session-formats';

const ensureFirebase = () => {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured.');
  }

  return db;
};

const toUserError = (error: unknown, fallback: string): Error => {
  const firestoreError = error as FirestoreError | undefined;

  if (firestoreError?.code === 'permission-denied') {
    return new Error('Firebase permission denied. Deploy Firestore rules before editing formats.');
  }

  if (firestoreError?.code === 'unavailable') {
    return new Error('Firebase is unreachable. Check your connection and try again.');
  }

  if (error instanceof Error && error.message) {
    return new Error(error.message);
  }

  return new Error(fallback);
};

const parseCustomSessionFormats = (source: unknown[] = []): TournamentSessionFormat[] => {
  const parsed = source
    .filter((candidate): candidate is Record<string, unknown> =>
      typeof candidate === 'object' && candidate !== null
    )
    .map((format) => ({
      id: typeof format.id === 'string' ? format.id : '',
      name: typeof format.name === 'string' ? format.name : '',
      baseFormat: typeof format.baseFormat === 'string' ? format.baseFormat : 'singles',
      scoringMode: typeof format.scoringMode === 'string' ? format.scoringMode : undefined,
      useHandicaps: typeof format.useHandicaps === 'boolean' ? format.useHandicaps : undefined,
      hasTeams: typeof format.hasTeams === 'boolean' ? format.hasTeams : undefined,
      ownBall: typeof format.ownBall === 'boolean' ? format.ownBall : undefined,
      playersPerSide:
        typeof format.playersPerSide === 'number' ? format.playersPerSide : undefined,
      resultMode: typeof format.resultMode === 'string' ? format.resultMode : undefined,
      lineupRule: typeof format.lineupRule === 'string' ? format.lineupRule : undefined,
      handicapRule:
        typeof format.handicapRule === 'object' && format.handicapRule !== null
          ? format.handicapRule
          : undefined,
    })) as TournamentSessionFormat[];

  return getTournamentSessionFormats(parsed).filter(
    (format) => !DEFAULT_TOURNAMENT_SESSION_FORMATS.some((builtin) => builtin.id === format.id)
  );
};

const sanitizeCustomSessionFormats = (
  formats: TournamentSessionFormat[] = []
): TournamentSessionFormat[] =>
  getTournamentSessionFormats(formats)
    .filter((format) => !DEFAULT_TOURNAMENT_SESSION_FORMATS.some((builtin) => builtin.id === format.id))
    .map((format) => normalizeSessionFormat(format));

export const listGlobalSessionFormats = async (): Promise<TournamentSessionFormat[]> => {
  const firestore = ensureFirebase();

  try {
    const snapshot = await getDoc(doc(firestore, 'appSettings', GLOBAL_FORMATS_DOC));
    if (!snapshot.exists()) {
      return [];
    }

    const data = snapshot.data() as GlobalFormatsDocument;
    return parseCustomSessionFormats((data.customSessionFormats ?? []) as unknown[]);
  } catch (error) {
    throw toUserError(error, 'Failed to load global session formats.');
  }
};

export const saveGlobalSessionFormats = async (
  formats: TournamentSessionFormat[],
  clientId: string
): Promise<void> => {
  const firestore = ensureFirebase();
  const sanitizedCustomFormats = sanitizeCustomSessionFormats(formats);

  try {
    await setDoc(
      doc(firestore, 'appSettings', GLOBAL_FORMATS_DOC),
      {
        customSessionFormats: sanitizedCustomFormats,
        updatedBy: clientId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    throw toUserError(error, 'Failed to save global session formats.');
  }
};

export const subscribeToGlobalSessionFormats = (
  onFormats: (formats: TournamentSessionFormat[]) => void,
  onError: (error: Error) => void
): Unsubscribe => {
  const firestore = ensureFirebase();

  return onSnapshot(
    doc(firestore, 'appSettings', GLOBAL_FORMATS_DOC),
    (snapshot) => {
      if (!snapshot.exists()) {
        onFormats([]);
        return;
      }

      const data = snapshot.data() as GlobalFormatsDocument;
      onFormats(parseCustomSessionFormats((data.customSessionFormats ?? []) as unknown[]));
    },
    (error) => {
      onError(toUserError(error, 'Lost connection to global session formats.'));
    }
  );
};
