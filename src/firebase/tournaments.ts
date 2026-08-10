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
  BuiltInTournamentMatchupFormat,
  PlayerTier,
  TierAssignmentMode,
  Tournament,
  TournamentEntry,
  TournamentFormat,
  TournamentMatchupFormat,
  TournamentSessionFormat,
  TournamentSession,
} from '../types/index.ts';
import {
  DEFAULT_TOURNAMENT_SESSION_FORMATS,
  HOLES_PER_MATCH,
  getTournamentSessionFormats,
  normalizeSessionFormat,
} from '../tournaments/scoring';
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
  sessionFormats?: TournamentSessionFormat[];
  sessions?: TournamentSession[];
  rounds?: TournamentSession[];
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
  sessionFormats?: TournamentSessionFormat[];
  sessions?: TournamentSession[];
  rounds?: TournamentSession[];
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

const parseSessionFormats = (source: unknown[] = []): TournamentSessionFormat[] => {
  const parsed = source
    .filter((candidate): candidate is Record<string, unknown> =>
      typeof candidate === 'object' && candidate !== null
    )
    .map((format) => ({
      id: typeof format.id === 'string' ? format.id : '',
      name: typeof format.name === 'string' ? format.name : '',
      baseFormat: (typeof format.baseFormat === 'string' ? format.baseFormat : '') as BuiltInTournamentMatchupFormat,
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
    })) as Array<
      Partial<TournamentSessionFormat> &
      Pick<TournamentSessionFormat, 'id' | 'name' | 'baseFormat'>
    >;

  const normalized = parsed
    .filter((format) => format.id.trim().length > 0 && format.name.trim().length > 0)
    .map((format) => normalizeSessionFormat(format));

  return getTournamentSessionFormats(normalized).filter(
    (format) => !DEFAULT_TOURNAMENT_SESSION_FORMATS.some((builtin) => builtin.id === format.id)
  );
};

const parseSessions = (source: unknown[] = []): TournamentSession[] =>
  source
    .filter((candidate): candidate is Record<string, unknown> =>
      typeof candidate === 'object' && candidate !== null
    )
    .map((session) => {
      const rawMatchups = Array.isArray(session.matchups) ? session.matchups : [];
      const firstMatchup = rawMatchups[0] as { format?: unknown } | undefined;
      const rawFormat =
        typeof session.format === 'string'
          ? session.format
          : typeof firstMatchup?.format === 'string'
            ? firstMatchup.format
            : 'singles';

      const format =
        typeof rawFormat === 'string' && rawFormat.trim().length > 0
          ? (rawFormat as TournamentMatchupFormat)
          : 'singles';

      return {
        id: typeof session.id === 'string' ? session.id : createEntryId(),
        name: typeof session.name === 'string' ? session.name : 'Session',
        format,
        matchups: rawMatchups
          .filter((candidate): candidate is Record<string, unknown> =>
            typeof candidate === 'object' && candidate !== null
          )
          .map((matchup) => ({
            id: typeof matchup.id === 'string' ? matchup.id : createEntryId(),
            confirmed: matchup.confirmed === true,
            sides: (Array.isArray(matchup.sides) ? matchup.sides : [])
              .filter((candidate): candidate is Record<string, unknown> =>
                typeof candidate === 'object' && candidate !== null
              )
              .map((side) => ({
                entryId: typeof side.entryId === 'string' ? side.entryId : '',
                playerIds: Array.isArray(side.playerIds)
                  ? side.playerIds.filter((id): id is string => typeof id === 'string')
                  : [],
                scores: Array.isArray(side.scores)
                  ? side.scores.filter((score): score is number => Number.isFinite(score))
                  : [],
              })),
          })),
      };
    });

const parseDoc = (id: string, data: TournamentDocument): Tournament => {
  const sessionFormats = parseSessionFormats((data.sessionFormats ?? []) as unknown[]);
  const sessions = parseSessions((data.sessions ?? data.rounds ?? []) as unknown[]);

  return {
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
  sessions,
  sessionFormats,
  rounds: sessions,
  createdBy: data.createdBy,
  };
};

const sanitizeSessions = (sessions: TournamentSession[]): TournamentSession[] =>
  sessions.map((session) => ({
    id: session.id || createEntryId(),
    name: session.name.trim(),
    format: (session.format || 'singles') as TournamentMatchupFormat,
    matchups: session.matchups.map((matchup) => ({
      id: matchup.id || createEntryId(),
      confirmed: matchup.confirmed === true,
      sides: matchup.sides.slice(0, 2).map((side) => ({
        entryId: side.entryId ?? '',
        playerIds: side.playerIds.filter(Boolean),
        scores: Array.from({ length: HOLES_PER_MATCH }, (_, hole) => {
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

  const sessions = sanitizeSessions(input.sessions ?? input.rounds ?? []);

  const payload: TournamentDocument = {
    name: input.name.trim(),
    nameKey: toNameKey(input.name),
    format: input.format,
    tierMode: input.tierMode,
    entries,
    sessions,
    rounds: sessions,
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

  const sessions = sanitizeSessions(input.sessions ?? input.rounds ?? []);

  const payload = {
    name: input.name.trim(),
    nameKey: toNameKey(input.name),
    format: input.format,
    tierMode: input.tierMode,
    entries,
    sessions,
    rounds: sessions,
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
      sessions: payload.sessions,
      rounds: payload.sessions,
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

// Scores save continuously, so this writes only session/round fields and skips name validation.
export const saveTournamentSessions = async (
  id: string,
  sessions: TournamentSession[],
  clientId: string
): Promise<void> => {
  const firestore = ensureFirebase();
  const sanitizedSessions = sanitizeSessions(sessions);

  try {
    await updateDoc(doc(firestore, 'tournaments', id), {
      sessions: sanitizedSessions,
      rounds: sanitizedSessions,
      updatedBy: clientId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw toUserError(error, 'Failed to save scores.');
  }
};

// Backward-compatible alias while module naming migrates from rounds to sessions.
export const saveTournamentRounds = saveTournamentSessions;

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
