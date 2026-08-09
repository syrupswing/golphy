import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  type FirestoreError,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import type {
  PlayerTier,
  TierAssignmentMode,
  Tournament,
  TournamentEntry,
  TournamentFormat,
  TournamentMatchupFormat,
  TournamentRound,
} from '../types/index.ts';
import { HOLES_PER_GAME, MATCHUP_FORMAT_LABELS } from '../tournaments/scoring';
import { db, isFirebaseConfigured } from './config';

// Team tournaments are played with a fixed two-A, two-B roster.
export const REQUIRED_TIER_COUNTS: Record<PlayerTier, number> = { A: 2, B: 2 };
export const TEAM_SIZE = REQUIRED_TIER_COUNTS.A + REQUIRED_TIER_COUNTS.B;

interface TournamentDocument {
  name: string;
  nameKey: string;
  format: TournamentFormat;
  tierMode?: TierAssignmentMode;
  entries: TournamentEntry[];
  rounds?: TournamentRound[];
  createdBy?: string;
  updatedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TournamentInput {
  name: string;
  format: TournamentFormat;
  tierMode: TierAssignmentMode;
  entries: TournamentEntry[];
  rounds: TournamentRound[];
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
  tierMode: data.tierMode === 'manual' ? 'manual' : 'auto',
  entries: (data.entries ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    playerIds: entry.playerIds ?? [],
    playerTiers: entry.playerTiers ?? {},
  })),
  rounds: (data.rounds ?? []).map((round) => ({
    id: round.id,
    name: round.name,
    roundId: round.roundId ?? '',
    matchups: (round.matchups ?? []).map((matchup) => ({
      id: matchup.id,
      format: matchup.format,
      confirmed: matchup.confirmed === true,
      sides: (matchup.sides ?? []).map((side) => ({
        entryId: side.entryId ?? '',
        playerIds: side.playerIds ?? [],
        scores: side.scores ?? [],
      })),
    })),
  })),
  createdBy: data.createdBy,
});

const sanitizeRounds = (rounds: TournamentRound[]): TournamentRound[] =>
  rounds.map((round) => ({
    id: round.id || createEntryId(),
    name: round.name.trim(),
    roundId: round.roundId?.trim() ?? '',
    matchups: round.matchups.map((matchup) => ({
      id: matchup.id || createEntryId(),
      format: (MATCHUP_FORMAT_LABELS[matchup.format] ? matchup.format : 'singles') as TournamentMatchupFormat,
      confirmed: matchup.confirmed === true,
      sides: matchup.sides.slice(0, 2).map((side) => ({
        entryId: side.entryId ?? '',
        playerIds: side.playerIds.filter(Boolean),
        scores: Array.from({ length: HOLES_PER_GAME }, (_, hole) => {
          const value = side.scores?.[hole];
          return Number.isFinite(value) && value > 0 ? value : 0;
        }),
      })),
    })),
  }));

const sanitizeEntries = (entries: TournamentEntry[], format: TournamentFormat): TournamentEntry[] =>
  entries
    .map((entry) => {
      const playerIds = [...new Set(entry.playerIds.filter(Boolean))];
      const playerTiers: Record<string, PlayerTier> = {};

      if (format === 'team') {
        playerIds.forEach((playerId) => {
          playerTiers[playerId] = entry.playerTiers?.[playerId] === 'A' ? 'A' : 'B';
        });
      }

      return {
        id: entry.id || createEntryId(),
        name: entry.name.trim(),
        playerIds,
        playerTiers,
      };
    })
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

    entries.forEach((entry) => {
      const tiers = Object.values(entry.playerTiers ?? {});
      const aCount = tiers.filter((tier) => tier === 'A').length;
      const bCount = tiers.filter((tier) => tier === 'B').length;

      if (aCount !== REQUIRED_TIER_COUNTS.A || bCount !== REQUIRED_TIER_COUNTS.B) {
        throw new Error(
          `${entry.name} needs ${REQUIRED_TIER_COUNTS.A} A players and ${REQUIRED_TIER_COUNTS.B} B players (currently ${aCount}A / ${bCount}B).`
        );
      }
    });
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
    tierMode: input.tierMode,
    entries,
    rounds: sanitizeRounds(input.rounds ?? []),
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
    tierMode: input.tierMode,
    entries,
    rounds: sanitizeRounds(input.rounds ?? []),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(firestore, 'tournaments', id), payload);
    return {
      id,
      name: payload.name,
      format: payload.format,
      tierMode: payload.tierMode,
      entries,
      rounds: payload.rounds,
    };
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

// Scores save continuously, so this writes only the rounds field and skips name validation.
export const saveTournamentRounds = async (
  id: string,
  rounds: TournamentRound[],
  clientId: string
): Promise<void> => {
  const firestore = ensureFirebase();

  try {
    await updateDoc(doc(firestore, 'tournaments', id), {
      rounds: sanitizeRounds(rounds),
      updatedBy: clientId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toUserError(error, 'Failed to save scores.');
  }
};

export const subscribeToTournament = (
  id: string,
  onTournament: (tournament: Tournament, updatedBy: string | null) => void,
  onError: (error: Error) => void
): Unsubscribe => {
  const firestore = ensureFirebase();

  return onSnapshot(
    doc(firestore, 'tournaments', id),
    (snapshot) => {
      if (!snapshot.exists()) {
        onError(new Error('Tournament not found.'));
        return;
      }

      const data = snapshot.data() as TournamentDocument;
      onTournament(parseDoc(snapshot.id, data), data.updatedBy ?? null);
    },
    (error) => {
      onError(toUserError(error, 'Lost connection to the tournament.'));
    }
  );
};

export const makeEntryId = createEntryId;
