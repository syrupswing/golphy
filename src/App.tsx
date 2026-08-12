import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  Player,
  PlayerProfile,
  Score,
  GameState,
  MatchupConfig,
  Scorecard,
  NineHoleSet,
  HoleInfo,
  StrokeIndexAllocation,
  TournamentMatchupFormat,
  TournamentSessionFormat,
  Tournament,
} from './types/index.ts'
import ScoreTable from './components/ScoreTable'
import ScorecardSelector from './components/ScorecardSelector'
import TournamentManager from './components/TournamentManager'
import TournamentDashboard from './components/TournamentDashboard'
import {
  MATCHUP_FORMAT_LABELS,
  getSessionFormatDefinition,
  getSessionFormatLabel,
  getSessionFormatPlayerCount,
  getTournamentSessionFormats,
  normalizeSessionFormat,
} from './tournaments/scoring'
import { isFirebaseConfigured } from './firebase/config'
import {
  createRound,
  deleteRound,
  loadRound,
  normalizeRoundId,
  listRounds,
  subscribeToRound,
  updateRound,
} from './firebase/rounds'
import { createScorecard, listScorecards, updateScorecard } from './firebase/scorecards'
import { createPlayer, deletePlayer, listPlayers, updatePlayer } from './firebase/players'
import {
  createTournament,
  deleteTournament,
  getTournament,
  listTournaments,
  saveTournamentSessions,
  updateTournament,
} from './firebase/tournaments'
import {
  saveGlobalSessionFormats,
  subscribeToGlobalSessionFormats,
} from './firebase/formats'
import type { TournamentInput } from './firebase/tournaments'
import './styles/App.scss'
import golphyBanner from './assets/golphy-by-banner.svg'

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
];

const DEFAULT_PAR = 4;

const DEFAULT_HOLE_OPTIONS = [9, 18, 27] as const;
const APP_SESSION_STORAGE_KEY = 'golphy-app-session-v1';
const DEFAULT_GAME_STATE: GameState = {
  players: [],
  scores: [],
  currentHole: 1,
  totalHoles: 18,
};

interface PersistedAppSession {
  view: 'home' | 'game' | 'tournament';
  homeStep: 'choose' | 'new' | 'join';
  newRoundStep: 'course' | 'details';
  competitionType: TournamentMatchupFormat | 'match-play';
  gameStarted: boolean;
  gameState: GameState;
  totalHoles: number;
  roundAlias: string;
  sharedRoundId: string | null;
  selectedJoinRoundId: string;
  selectedScorecard: Scorecard | null;
  selectedSetIndexes: number[];
  activeTournamentId: string | null;
  activeRoundTournamentId: string | null;
}

const createClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

function App() {
  const [toastMessage, setToastMessage] = useState('');
  const [createdPlayerSummary, setCreatedPlayerSummary] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    handicap: number;
  } | null>(null);
  const [view, setView] = useState<'home' | 'game' | 'tournament'>('home');
  const [homeStep, setHomeStep] = useState<'choose' | 'new' | 'join'>('choose');
  const [newRoundStep, setNewRoundStep] = useState<'course' | 'details'>('course');
  const [competitionType, setCompetitionType] = useState<TournamentMatchupFormat>('stroke');
  const [gameStarted, setGameStarted] = useState(false);
  const [gameState, setGameState] = useState<GameState>(DEFAULT_GAME_STATE);
  const [newPlayerFirstName, setNewPlayerFirstName] = useState('');
  const [newPlayerLastName, setNewPlayerLastName] = useState('');
  const [newPlayerNickname, setNewPlayerNickname] = useState('');
  const [newPlayerHandicap, setNewPlayerHandicap] = useState('0');
  const [showQuickPlayerForm, setShowQuickPlayerForm] = useState(false);
  const [showQuickEditPlayerForm, setShowQuickEditPlayerForm] = useState(false);
  const [showRoundPlayerForm, setShowRoundPlayerForm] = useState(false);
  const [showRoundNewPlayerForm, setShowRoundNewPlayerForm] = useState(false);
  const [showEditPlayerForm, setShowEditPlayerForm] = useState(false);
  const [playerProfiles, setPlayerProfiles] = useState<PlayerProfile[]>([]);
  const [isLoadingPlayerProfiles, setIsLoadingPlayerProfiles] = useState(false);
  const [selectedPlayerProfile, setSelectedPlayerProfile] = useState<PlayerProfile | null>(null);
  const [playerValidationId, setPlayerValidationId] = useState('');
  const [isPlayerValidated, setIsPlayerValidated] = useState(false);
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);
  const [playerProfileNotice, setPlayerProfileNotice] = useState('');
  const [playerProfileError, setPlayerProfileError] = useState('');
  const [editPlayerId, setEditPlayerId] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editHandicap, setEditHandicap] = useState('');
  const [isUpdatingPlayer, setIsUpdatingPlayer] = useState(false);
  const [isDeletingPlayer, setIsDeletingPlayer] = useState(false);
  const [totalHoles, setTotalHoles] = useState(18);
  const [roundAlias, setRoundAlias] = useState('');
  const [sharedRoundId, setSharedRoundId] = useState<string | null>(null);
  const [isConnectingRound, setIsConnectingRound] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [shareNotice, setShareNotice] = useState('');
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [selectedScorecard, setSelectedScorecard] = useState<Scorecard | null>(null);
  const [selectedSetIndexes, setSelectedSetIndexes] = useState<number[]>([]);
  const [isCreatingScorecard, setIsCreatingScorecard] = useState(false);
  const [coursePanelMode, setCoursePanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentPanelMode, setTournamentPanelMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  const [tournamentViewMode, setTournamentViewMode] = useState<'dashboard' | 'manage'>('dashboard');
  const [activeRoundTournamentId, setActiveRoundTournamentId] = useState<string | null>(null);
  const [isSavingTournament, setIsSavingTournament] = useState(false);
  const [tournamentError, setTournamentError] = useState('');
  const [tournamentNotice, setTournamentNotice] = useState('');
  const [globalSessionFormats, setGlobalSessionFormats] = useState<TournamentSessionFormat[]>([]);
  const [formatPanelOpen, setFormatPanelOpen] = useState(false);
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [formatName, setFormatName] = useState('');
  const [formatBase, setFormatBase] = useState<keyof typeof MATCHUP_FORMAT_LABELS>('singles');
  const [formatScoringMode, setFormatScoringMode] = useState<'stroke' | 'match' | 'skins'>('match');
  const [formatUseHandicaps, setFormatUseHandicaps] = useState(true);
  const [formatHasTeams, setFormatHasTeams] = useState(true);
  const [formatOwnBall, setFormatOwnBall] = useState(true);
  const [formatPlayersPerSide, setFormatPlayersPerSide] = useState('1');
  const [isSavingFormat, setIsSavingFormat] = useState(false);
  const [formatMessage, setFormatMessage] = useState('');
  const [formatError, setFormatError] = useState('');
  const [homeCourseSelection, setHomeCourseSelection] = useState<Scorecard | null>(null);
  const [showRoundInfoPopover, setShowRoundInfoPopover] = useState(false);
  const [availableRounds, setAvailableRounds] = useState<Array<{
    id: string;
    alias?: string;
    scorecardName?: string;
    totalHoles: number;
  }>>([]);
  const [isLoadingRounds, setIsLoadingRounds] = useState(false);
  const [selectedJoinRoundId, setSelectedJoinRoundId] = useState('');
  const [isSessionRestored, setIsSessionRestored] = useState(false);
  const clientId = useMemo(() => createClientId(), []);
  const skipNextSyncRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const roundInfoPopoverRef = useRef<HTMLDivElement | null>(null);
  const roundInfoButtonRef = useRef<HTMLButtonElement | null>(null);

  const buildDefaultPars = (holes: number) => Array.from({ length: holes }, () => DEFAULT_PAR);
  const allSessionFormats = getTournamentSessionFormats(globalSessionFormats);
  const defaultFormatId = allSessionFormats[0]?.id ?? 'singles';
  const createLocalId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const normalizeStandaloneFormat = (
    format: string | undefined
  ): TournamentMatchupFormat => {
    if (format === 'match-play') {
      return 'singles';
    }

    if (typeof format !== 'string' || !format.trim()) {
      return defaultFormatId;
    }

    const exists = allSessionFormats.some((option) => option.id === format);
    return exists ? format : defaultFormatId;
  };

  const competitionDefinition = getSessionFormatDefinition(competitionType, globalSessionFormats);
  const usesTeamSides = competitionDefinition.hasTeams;
  const requiredRoundPlayers = usesTeamSides
    ? getSessionFormatPlayerCount(competitionType, globalSessionFormats) * 2
    : 0;
  const maxRoundPlayers = usesTeamSides ? requiredRoundPlayers : 8;
  const competitionLabel = getSessionFormatLabel(competitionType, globalSessionFormats);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    listScorecards().then(setScorecards).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setGlobalSessionFormats([]);
      return;
    }

    const unsubscribe = subscribeToGlobalSessionFormats(
      (formats) => {
        setGlobalSessionFormats(formats);
        setFormatError('');
      },
      (error) => setFormatError(error.message)
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const available = getTournamentSessionFormats(globalSessionFormats);
    if (available.some((option) => option.id === competitionType)) {
      return;
    }

    setCompetitionType(available[0]?.id ?? 'singles');
  }, [globalSessionFormats, competitionType]);

  useEffect(() => {
    try {
      const rawSession = window.localStorage.getItem(APP_SESSION_STORAGE_KEY);
      if (!rawSession) {
        setIsSessionRestored(true);
        return;
      }

      const session = JSON.parse(rawSession) as Partial<PersistedAppSession>;

      if (session.gameState) {
        setGameState(session.gameState);
      }

      if (session.view === 'home' || session.view === 'game' || session.view === 'tournament') {
        setView(session.view);
      }

      if (session.homeStep === 'choose' || session.homeStep === 'new' || session.homeStep === 'join') {
        setHomeStep(session.homeStep);
      }

      if (session.newRoundStep === 'course' || session.newRoundStep === 'details') {
        setNewRoundStep(session.newRoundStep);
      }

      const restoredFormatId =
        typeof session.gameState?.sessionFormatId === 'string'
          ? session.gameState.sessionFormatId
          : session.gameState?.matchup?.sessionFormatId ??
            session.gameState?.matchup?.format ??
            session.competitionType;

      if (typeof restoredFormatId === 'string') {
        setCompetitionType(normalizeStandaloneFormat(restoredFormatId));
      }

      if (typeof session.gameStarted === 'boolean') {
        setGameStarted(session.gameStarted);
      }

      if (typeof session.totalHoles === 'number' && session.totalHoles > 0) {
        setTotalHoles(session.totalHoles);
      }

      if (typeof session.roundAlias === 'string') {
        setRoundAlias(session.roundAlias);
      }

      if (typeof session.sharedRoundId === 'string' || session.sharedRoundId === null) {
        setSharedRoundId(session.sharedRoundId ?? null);
      }

      if (typeof session.selectedJoinRoundId === 'string') {
        setSelectedJoinRoundId(session.selectedJoinRoundId);
      }

      if (session.selectedScorecard) {
        setSelectedScorecard(session.selectedScorecard);
      }

      if (Array.isArray(session.selectedSetIndexes)) {
        setSelectedSetIndexes(session.selectedSetIndexes);
      }

      if (typeof session.activeTournamentId === 'string') {
        setActiveTournamentId(session.activeTournamentId);
      }

      if (typeof session.activeRoundTournamentId === 'string' || session.activeRoundTournamentId === null) {
        setActiveRoundTournamentId(session.activeRoundTournamentId ?? null);
      }
    } catch {
      window.localStorage.removeItem(APP_SESSION_STORAGE_KEY);
    } finally {
      setIsSessionRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage('');
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  useEffect(() => {
    if (!showRoundInfoPopover) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (roundInfoPopoverRef.current?.contains(target)) {
        return;
      }
      if (roundInfoButtonRef.current?.contains(target)) {
        return;
      }

      setShowRoundInfoPopover(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowRoundInfoPopover(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showRoundInfoPopover]);

  const refreshPlayerProfiles = async () => {
    if (!isFirebaseConfigured) {
      return;
    }

    setIsLoadingPlayerProfiles(true);
    try {
      const profiles = await listPlayers();
      setPlayerProfiles(profiles);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load players.';
      setPlayerProfileError(message);
    } finally {
      setIsLoadingPlayerProfiles(false);
    }
  };

  const refreshTournaments = async () => {
    if (!isFirebaseConfigured) {
      return;
    }

    try {
      setTournaments(await listTournaments());
    } catch (error) {
      setTournamentError(error instanceof Error ? error.message : 'Failed to load tournaments.');
    }
  };

  const openTournamentPanel = (nextMode: 'add' | 'edit') => {    setTournamentPanelMode(nextMode);
    setTournamentError('');
    setTournamentNotice('');
    void refreshPlayerProfiles();
    void refreshTournaments();
  };

  const saveTournament = async (
    action: () => Promise<Tournament>,
    successMessage: string
  ): Promise<boolean> => {
    if (!isFirebaseConfigured) {
      setTournamentError('Firebase is not configured. Add VITE_FIREBASE_* values in .env.local first.');
      return false;
    }

    setIsSavingTournament(true);
    setTournamentError('');
    setTournamentNotice('');

    try {
      await action();
      await refreshTournaments();
      setTournamentNotice(successMessage);
      return true;
    } catch (error) {
      setTournamentError(error instanceof Error ? error.message : 'Failed to save tournament.');
      return false;
    } finally {
      setIsSavingTournament(false);
    }
  };

  const handleCreateTournament = (input: TournamentInput) =>
    saveTournament(() => createTournament(input, clientId), 'Tournament created.');

  const handleUpdateTournament = (id: string, input: TournamentInput) =>
    saveTournament(() => updateTournament(id, input), 'Tournament updated.');

  const handleDeleteTournament = async (id: string): Promise<boolean> => {    setIsSavingTournament(true);
    setTournamentError('');
    setTournamentNotice('');

    try {
      await deleteTournament(id);
      await refreshTournaments();
      setTournamentNotice('Tournament deleted.');
      return true;
    } catch (error) {
      setTournamentError(error instanceof Error ? error.message : 'Failed to delete tournament.');
      return false;
    } finally {
      setIsSavingTournament(false);
    }
  };

  const openFormatPanel = () => {
    setFormatPanelOpen(true);
    setEditingFormatId(null);
    setFormatName('');
    setFormatBase('singles');
    setFormatScoringMode('match');
    setFormatUseHandicaps(true);
    setFormatHasTeams(true);
    setFormatOwnBall(true);
    setFormatPlayersPerSide('1');
    setFormatError('');
    setFormatMessage('');
  };

  const openEditFormat = (format: TournamentSessionFormat) => {
    setFormatPanelOpen(true);
    setEditingFormatId(format.id);
    setFormatName(format.name);
    setFormatBase(format.baseFormat);
    setFormatScoringMode(format.scoringMode);
    setFormatUseHandicaps(format.useHandicaps);
    setFormatHasTeams(format.hasTeams);
    setFormatOwnBall(format.ownBall);
    setFormatPlayersPerSide(String(format.playersPerSide));
    setFormatError('');
    setFormatMessage('');
  };

  const closeFormatPanel = () => {
    setFormatPanelOpen(false);
    setEditingFormatId(null);
    setFormatName('');
    setFormatBase('singles');
    setFormatScoringMode('match');
    setFormatUseHandicaps(true);
    setFormatHasTeams(true);
    setFormatOwnBall(true);
    setFormatPlayersPerSide('1');
  };

  const saveGlobalFormat = async () => {
    if (!isFirebaseConfigured) {
      setFormatError('Firebase is not configured. Add VITE_FIREBASE_* values in .env.local first.');
      return;
    }

    const nextName = formatName.trim();
    if (!nextName) {
      setFormatError('Enter a format name.');
      return;
    }

    const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
    const hasNameConflict = allSessionFormats.some(
      (format) => format.id !== editingFormatId && normalizeName(format.name) === normalizeName(nextName)
    );
    if (hasNameConflict) {
      setFormatError('Format names must be unique.');
      return;
    }

    const parsedPlayersPerSide = Number(formatPlayersPerSide);
    if (!Number.isFinite(parsedPlayersPerSide) || parsedPlayersPerSide < 1) {
      setFormatError('Players per side must be at least 1.');
      return;
    }

    const existingFormat = editingFormatId
      ? globalSessionFormats.find((format) => format.id === editingFormatId)
      : undefined;

    const normalizedFormat = normalizeSessionFormat({
      id: editingFormatId ?? `format-${createLocalId()}`,
      name: nextName,
      baseFormat: formatBase,
      scoringMode: formatScoringMode,
      useHandicaps: formatUseHandicaps,
      hasTeams: formatHasTeams,
      ownBall: formatOwnBall,
      playersPerSide: parsedPlayersPerSide,
      resultMode: existingFormat?.resultMode,
      lineupRule: existingFormat?.lineupRule,
      handicapRule: existingFormat?.handicapRule,
    });

    const nextCustomFormats = editingFormatId
      ? globalSessionFormats.map((format) =>
          format.id === editingFormatId
            ? normalizedFormat
            : format
        )
      : [...globalSessionFormats, normalizedFormat];

    setIsSavingFormat(true);
    setFormatError('');
    setFormatMessage('');

    try {
      await saveGlobalSessionFormats(nextCustomFormats, clientId);
      setFormatMessage(editingFormatId ? 'Format updated.' : 'Format created.');
      closeFormatPanel();
    } catch (error) {
      setFormatError(error instanceof Error ? error.message : 'Failed to save format.');
    } finally {
      setIsSavingFormat(false);
    }
  };

  const deleteGlobalFormat = async (format: TournamentSessionFormat) => {
    if (!isFirebaseConfigured) {
      setFormatError('Firebase is not configured. Add VITE_FIREBASE_* values in .env.local first.');
      return;
    }

    const isInUse = tournaments.some((tournament) =>
      (tournament.sessions ?? tournament.rounds ?? []).some((session) => session.format === format.id)
    );

    if (isInUse) {
      setFormatError('This format is currently used by a tournament session. Change those sessions first.');
      return;
    }

    if (!window.confirm(`Delete format ${format.name}?`)) {
      return;
    }

    const nextCustomFormats = globalSessionFormats.filter((item) => item.id !== format.id);

    setIsSavingFormat(true);
    setFormatError('');
    setFormatMessage('');

    try {
      await saveGlobalSessionFormats(nextCustomFormats, clientId);
      if (editingFormatId === format.id) {
        closeFormatPanel();
      }
      setFormatMessage('Format deleted.');
    } catch (error) {
      setFormatError(error instanceof Error ? error.message : 'Failed to delete format.');
    } finally {
      setIsSavingFormat(false);
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    void refreshPlayerProfiles();
    void refreshTournaments();
  }, []);

  const openTournamentDashboard = (tournamentId: string) => {
    setActiveTournamentId(tournamentId);
    setTournamentViewMode('dashboard');
    setView('tournament');
    void refreshPlayerProfiles();
  };

  useEffect(() => {
    if (homeStep !== 'join') {
      setAvailableRounds([]);
      setIsLoadingRounds(false);
      setSelectedJoinRoundId('');
      return;
    }

    if (!isFirebaseConfigured) {
      setAvailableRounds([]);
      setIsLoadingRounds(false);
      return;
    }

    const loadAvailableRounds = async () => {
      setIsLoadingRounds(true);
      try {
        const rounds = await listRounds();
        setAvailableRounds(rounds);
        setSelectedJoinRoundId((current) =>
          current && rounds.some((round) => round.id === current) ? current : rounds[0]?.id ?? ''
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load rounds.';
        setSyncError(message);
        setAvailableRounds([]);
      } finally {
        setIsLoadingRounds(false);
      }
    };

    void loadAvailableRounds();
  }, [homeStep]);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (!sharedRoundId || !gameStarted) {
      return;
    }

    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }

    const runSync = async () => {
      try {
        await updateRound(sharedRoundId, gameState, clientId);
        setSyncError('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to sync round updates.';
        setSyncError(message);
      }
    };

    void runSync();
  }, [clientId, gameStarted, gameState, sharedRoundId]);

  useEffect(() => {
    if (!isSessionRestored || !isFirebaseConfigured || !sharedRoundId || !gameStarted) {
      return;
    }

    subscribeToSharedRound(sharedRoundId);
  }, [gameStarted, isSessionRestored, sharedRoundId]);

  useEffect(() => {
    if (!isSessionRestored) {
      return;
    }

    const sessionToPersist: PersistedAppSession = {
      view,
      homeStep,
      newRoundStep,
      competitionType,
      gameStarted,
      gameState,
      totalHoles,
      roundAlias,
      sharedRoundId,
      selectedJoinRoundId,
      selectedScorecard,
      selectedSetIndexes,
      activeTournamentId,
      activeRoundTournamentId,
    };

    window.localStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify(sessionToPersist));
  }, [
    activeRoundTournamentId,
    activeTournamentId,
    competitionType,
    gameStarted,
    gameState,
    homeStep,
    isSessionRestored,
    newRoundStep,
    roundAlias,
    selectedJoinRoundId,
    selectedScorecard,
    selectedSetIndexes,
    sharedRoundId,
    totalHoles,
    view,
  ]);

  const subscribeToSharedRound = (roundId: string) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    unsubscribeRef.current = subscribeToRound(
      roundId,
      (remoteState, updatedBy) => {
        // Ignore our own writes to avoid re-applying unchanged state.
        if (updatedBy && updatedBy === clientId) {
          return;
        }

        skipNextSyncRef.current = true;
        setGameState(remoteState);
        setTotalHoles(remoteState.totalHoles);
        setCompetitionType(
          normalizeStandaloneFormat(
            remoteState.sessionFormatId ??
            remoteState.matchup?.sessionFormatId ??
            remoteState.matchup?.format
          )
        );
        setGameStarted(true);
        setView('game');
        setHomeStep('choose');
        setSyncError('');
      },
      (error) => {
        const message = error instanceof Error ? error.message : 'Lost connection to shared round.';
        setSyncError(message);
      }
    );
  };

  const updateGameState = (updater: (prev: GameState) => GameState) => {
    setGameState((prev) => updater(prev));
  };

  const buildMatchupConfig = (players: Player[]): MatchupConfig | undefined => {
    if (!competitionDefinition.hasTeams) {
      return undefined;
    }

    const sideSize = getSessionFormatPlayerCount(competitionType, globalSessionFormats);
    const requiredPlayers = sideSize * 2;
    const selectedPlayers = players.slice(0, requiredPlayers);

    if (selectedPlayers.length < requiredPlayers) {
      return undefined;
    }

    const sideAPlayers = selectedPlayers.slice(0, sideSize);
    const sideBPlayers = selectedPlayers.slice(sideSize, requiredPlayers);
    const sideALabel = sideAPlayers.map((player) => player.name).join(' & ') || 'Side A';
    const sideBLabel = sideBPlayers.map((player) => player.name).join(' & ') || 'Side B';

    return {
      format: competitionDefinition.baseFormat,
      sessionFormatId: competitionType,
      scoringMode: competitionDefinition.scoringMode,
      resultMode: competitionDefinition.resultMode,
      ownBall: competitionDefinition.ownBall,
      teams: [
        {
          id: 'team-a',
          name: sideALabel,
          playerIds: sideAPlayers.map((player) => player.id),
        },
        {
          id: 'team-b',
          name: sideBLabel,
          playerIds: sideBPlayers.map((player) => player.id),
        },
      ],
      handicapRule:
        competitionDefinition.handicapRule?.type === 'scramble-pair-percentage'
          ? {
              type: 'scramble-pair-percentage',
              lowPercentage: competitionDefinition.handicapRule.lowPercentage,
              highPercentage: competitionDefinition.handicapRule.highPercentage,
              rounding: competitionDefinition.handicapRule.rounding,
              prorateByHoles: competitionDefinition.handicapRule.prorateByHoles,
            }
          : undefined,
    };
  };

  const getPlayedSets = (): NineHoleSet[] => {
    const sets = selectedScorecard?.sets;
    if (!sets?.length) {
      return [];
    }

    const indexes = selectedSetIndexes.length ? selectedSetIndexes : sets.map((_, index) => index);
    return indexes.filter((index) => index < sets.length).map((index) => sets[index]);
  };

  const getPlayOrder = (): number[] => {
    const sets = selectedScorecard?.sets;
    if (!sets?.length) {
      return [];
    }

    const indexes = selectedSetIndexes.length ? selectedSetIndexes : sets.map((_, index) => index);
    return indexes.filter((index) => index < sets.length);
  };

  const moveSetInPlayOrder = (position: number, direction: -1 | 1) => {
    const target = position + direction;
    if (target < 0 || target >= selectedSetIndexes.length) {
      return;
    }

    const next = [...selectedSetIndexes];
    [next[position], next[target]] = [next[target], next[position]];
    setSelectedSetIndexes(next);
  };

  // Courses publish a separate stroke index order for each pairing of nines.
  const getStrokeIndexAllocation = (playOrder: number[]): StrokeIndexAllocation | undefined => {
    const key = [...playOrder].sort((a, b) => a - b).join('-');
    return selectedScorecard?.strokeIndexAllocations?.find(
      (allocation) => [...allocation.setIndexes].sort((a, b) => a - b).join('-') === key
    );
  };

  const buildPlayedHoleDetails = (): HoleInfo[] => {
    const sets = selectedScorecard?.sets;
    if (!sets?.length) {
      return [];
    }

    const playOrder = getPlayOrder();
    const allocation = getStrokeIndexAllocation(playOrder);

    return playOrder.flatMap((setIndex) => {
      const allocationPosition = allocation?.setIndexes.indexOf(setIndex) ?? -1;
      const overrides =
        allocationPosition >= 0 ? allocation?.handicapsBySet[allocationPosition] : undefined;

      return sets[setIndex].holes.map((hole, holeIndex) => {
        const override = overrides?.[holeIndex];
        return Number.isFinite(override) && (override as number) > 0
          ? { ...hole, handicap: override as number }
          : { ...hole };
      });
    });
  };

  const buildPlayedSetLabels = () => {
    const playedSets = getPlayedSets();

    if (playedSets.length) {
      return playedSets.map((set, position) => {
        const alias = set.alias?.trim();
        if (alias) {
          return alias;
        }

        const startHole = position * 9 + 1;
        const endHole = Math.min(startHole + 8, totalHoles);
        return `Set ${position + 1} (${startHole}-${endHole})`;
      });
    }

    const setCount = Math.max(1, Math.ceil(totalHoles / 9));
    return Array.from({ length: setCount }, (_, index) => {
      const startHole = index * 9 + 1;
      const endHole = Math.min(startHole + 8, totalHoles);
      return `Set ${index + 1} (${startHole}-${endHole})`;
    });
  };

  const addRoundPlayer = (id: string, name: string, handicap?: number) => {
    if (!name.trim() || gameState.players.length >= 8) {
      return;
    }

    if (gameState.players.length >= maxRoundPlayers) {
      setPlayerProfileError(
        usesTeamSides
          ? `${competitionLabel} requires exactly ${requiredRoundPlayers} players.`
          : 'You can add up to 8 players per round.'
      );
      return;
    }

    const newPlayer: Player = {
      id,
      name: name.trim(),
      color: PLAYER_COLORS[gameState.players.length],
      // Firestore rejects undefined values, so only set a numeric handicap.
      ...(Number.isFinite(handicap) ? { handicap: handicap as number } : {}),
    };

    updateGameState((prev) => ({
      ...prev,
      players: [...prev.players, newPlayer],
      matchup: buildMatchupConfig([...prev.players, newPlayer]),
    }));
    setPlayerProfileError('');
  };

  const createPlayerProfile = async (addToRound: boolean) => {
    if (!isFirebaseConfigured) {
      setPlayerProfileError('Firebase is not configured. Add VITE_FIREBASE_* values in .env.local first.');
      return;
    }

    if (addToRound && gameState.players.length >= 8) {
      setPlayerProfileError('You can add up to 8 players per round.');
      return;
    }

    const firstName = newPlayerFirstName.trim();
    const lastName = newPlayerLastName.trim();
    const nickname = newPlayerNickname.trim();
    const handicapNumber = Number(newPlayerHandicap);

    if (!firstName || !lastName) {
      setPlayerProfileError('Enter a first name and last name.');
      return;
    }

    if (Number.isNaN(handicapNumber)) {
      setPlayerProfileError('Enter a valid handicap value.');
      return;
    }

    setPlayerProfileError('');
    setPlayerProfileNotice('');
    setCreatedPlayerSummary(null);
    setIsSavingPlayer(true);

    try {
      const created = await createPlayer(
        {
          firstName,
          lastName,
          nickname,
          handicap: handicapNumber,
        },
        clientId
      );

      if (addToRound) {
        const roundName = created.nickname?.trim() || `${created.firstName} ${created.lastName}`;
        addRoundPlayer(created.id, roundName, created.handicap);
        setShowRoundPlayerForm(false);
        setShowRoundNewPlayerForm(false);
      } else {
        setShowQuickPlayerForm(false);
      }

      setCreatedPlayerSummary({
        id: created.id,
        firstName: created.firstName,
        lastName: created.lastName,
        nickname: created.nickname,
        handicap: created.handicap,
      });
      setNewPlayerFirstName('');
      setNewPlayerLastName('');
      setNewPlayerNickname('');
      setNewPlayerHandicap('0');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save player profile.';
      setPlayerProfileError(message);
    } finally {
      setIsSavingPlayer(false);
    }
  };

  const handleCreatePlayerAndAdd = async () => {
    await createPlayerProfile(true);
  };

  const handleCreatePlayerOnly = async () => {
    await createPlayerProfile(false);
  };

  const getRoundPlayerDisplayName = (profile: PlayerProfile) =>
    profile.nickname?.trim() || `${profile.firstName} ${profile.lastName}`;

  // The round stores a name only as a fallback; the profile is the source of truth.
  const resolvePlayer = (player: Player): Player => {
    const profile = playerProfiles.find((candidate) => candidate.id === player.id);
    if (!profile) {
      return player;
    }

    return {
      ...player,
      name: getRoundPlayerDisplayName(profile),
      handicap: profile.handicap,
    };
  };

  const resolvedPlayers = gameState.players.map(resolvePlayer);

  const openRoundPlayerPicker = () => {
    setShowRoundPlayerForm(true);
    setShowRoundNewPlayerForm(false);
    setPlayerProfileError('');
    void refreshPlayerProfiles();
  };

  const closeRoundPlayerPicker = () => {
    setShowRoundPlayerForm(false);
    setShowRoundNewPlayerForm(false);
  };

  const addExistingPlayerToRound = (profile: PlayerProfile) => {
    if (gameState.players.some((player) => player.id === profile.id)) {
      setPlayerProfileError('That player is already in this round.');
      return;
    }

    addRoundPlayer(profile.id, getRoundPlayerDisplayName(profile), profile.handicap);
    setShowRoundPlayerForm(false);
    setShowRoundNewPlayerForm(false);
  };

  const openPlayerForEditing = (profile: PlayerProfile) => {
    setSelectedPlayerProfile(profile);
    setPlayerValidationId('');
    setIsPlayerValidated(false);
    setEditPlayerId(profile.id);
    setEditFirstName('');
    setEditLastName('');
    setEditNickname('');
    setEditHandicap('');
    setPlayerProfileError('');
    setPlayerProfileNotice('');
  };

  const handleValidateSelectedPlayer = () => {
    if (!selectedPlayerProfile) {
      setPlayerProfileError('Choose a player first.');
      return;
    }

    if (playerValidationId.trim() !== selectedPlayerProfile.id) {
      setPlayerProfileError('Player ID does not match the selected player.');
      setIsPlayerValidated(false);
      return;
    }

    setPlayerProfileError('');
    setPlayerProfileNotice(`Validated player ${selectedPlayerProfile.id}. You can now edit or delete this player.`);
    setIsPlayerValidated(true);
    setEditPlayerId(selectedPlayerProfile.id);
    setEditFirstName(selectedPlayerProfile.firstName);
    setEditLastName(selectedPlayerProfile.lastName);
    setEditNickname(selectedPlayerProfile.nickname ?? '');
    setEditHandicap(String(selectedPlayerProfile.handicap));
  };

  const handleUpdatePlayerById = async () => {
    if (!isFirebaseConfigured) {
      setPlayerProfileError('Firebase is not configured. Add VITE_FIREBASE_* values in .env.local first.');
      return;
    }

    const playerId = editPlayerId.trim();
    if (!playerId) {
      setPlayerProfileError('Enter the player ID to update.');
      return;
    }

    const updates: {
      firstName?: string;
      lastName?: string;
      nickname?: string;
      handicap?: number;
    } = {};

    if (editFirstName.trim()) {
      updates.firstName = editFirstName.trim();
    }
    if (editLastName.trim()) {
      updates.lastName = editLastName.trim();
    }
    if (editNickname.trim()) {
      updates.nickname = editNickname.trim();
    }
    if (editHandicap.trim()) {
      const handicapNumber = Number(editHandicap);
      if (Number.isNaN(handicapNumber)) {
        setPlayerProfileError('Enter a valid handicap value for update.');
        return;
      }
      updates.handicap = handicapNumber;
    }

    if (Object.keys(updates).length === 0) {
      setPlayerProfileError('Add at least one value to update.');
      return;
    }

    setPlayerProfileError('');
    setPlayerProfileNotice('');
    setCreatedPlayerSummary(null);
    setIsUpdatingPlayer(true);

    try {
      await updatePlayer(playerId, updates);
      const refreshedProfile: PlayerProfile = {
        id: playerId,
        firstName: updates.firstName ?? selectedPlayerProfile?.firstName ?? editFirstName.trim(),
        lastName: updates.lastName ?? selectedPlayerProfile?.lastName ?? editLastName.trim(),
        nickname:
          updates.nickname !== undefined
            ? updates.nickname
            : (selectedPlayerProfile?.nickname ?? editNickname.trim()) || undefined,
        handicap: updates.handicap ?? selectedPlayerProfile?.handicap ?? Number(editHandicap || 0),
        createdBy: selectedPlayerProfile?.createdBy,
        isPublic: selectedPlayerProfile?.isPublic,
      };

      const refreshedName = refreshedProfile.nickname?.trim() || `${refreshedProfile.firstName} ${refreshedProfile.lastName}`;
      updateGameState((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                name: refreshedName,
              }
            : p
        ),
      }));

      setSelectedPlayerProfile(refreshedProfile);
      setPlayerProfiles((prev) => prev.map((profile) => (profile.id === playerId ? refreshedProfile : profile)));

      setToastMessage('Player saved successfully.');
      setEditFirstName(refreshedProfile.firstName);
      setEditLastName(refreshedProfile.lastName);
      setEditNickname(refreshedProfile.nickname ?? '');
      setEditHandicap(String(refreshedProfile.handicap));
      resetSelectedPlayerEditing();
      setShowQuickEditPlayerForm(false);
      setShowEditPlayerForm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update player profile.';
      setPlayerProfileError(message);
    } finally {
      setIsUpdatingPlayer(false);
    }
  };

  const handleDeletePlayerById = async () => {
    if (!isFirebaseConfigured) {
      setPlayerProfileError('Firebase is not configured. Add VITE_FIREBASE_* values in .env.local first.');
      return;
    }

    const playerId = editPlayerId.trim();
    if (!playerId) {
      setPlayerProfileError('Enter the player ID to delete.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    setPlayerProfileError('');
    setPlayerProfileNotice('');
    setCreatedPlayerSummary(null);
    setIsDeletingPlayer(true);

    try {
      await deletePlayer(playerId);
      setPlayerProfiles((prev) => prev.filter((profile) => profile.id !== playerId));
      setSelectedPlayerProfile(null);
      setPlayerValidationId('');
      setIsPlayerValidated(false);
      updateGameState((prev) => ({
        ...prev,
        players: prev.players.filter((player) => player.id !== playerId),
        scores: prev.scores.filter((score) => score.playerId !== playerId),
      }));
      setPlayerProfileNotice(`Player ${playerId} deleted successfully.`);
      setEditPlayerId('');
      setEditFirstName('');
      setEditLastName('');
      setEditNickname('');
      setEditHandicap('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete player profile.';
      setPlayerProfileError(message);
    } finally {
      setIsDeletingPlayer(false);
    }
  };

  const removePlayer = (playerId: string): boolean => {
    const confirmed = window.confirm(
      'Are you absolutely sure? Removing this player from the round will delete all scores recorded for them in this round.'
    );

    if (!confirmed) {
      return false;
    }

    updateGameState((prev) => {
      const nextPlayers = prev.players.filter((player) => player.id !== playerId);

      return {
        ...prev,
        players: nextPlayers,
        scores: prev.scores.filter((score) => score.playerId !== playerId),
        matchup: buildMatchupConfig(nextPlayers),
      };
    });

    return true;
  };

  const handleScorecardSelect = (sc: Scorecard | null) => {
    setSelectedScorecard(sc);
    if (sc) {
      const allSetIndexes = sc.sets.map((_, index) => index);
      setSelectedSetIndexes(allSetIndexes);
      setTotalHoles(allSetIndexes.length * 9);
    } else {
      setSelectedSetIndexes([]);
    }
  };

  const toggleSetSelection = (setIndex: number) => {
    const next = selectedSetIndexes.includes(setIndex)
      ? selectedSetIndexes.filter((index) => index !== setIndex)
      : [...selectedSetIndexes, setIndex];

    // A round needs at least one set of nine.
    if (next.length === 0) {
      return;
    }

    setSelectedSetIndexes(next);
    setTotalHoles(next.length * 9);
  };

  const handleCreateScorecard = async (    name: string,
    sets: NineHoleSet[],
    allocations: StrokeIndexAllocation[]
  ) => {
    setIsCreatingScorecard(true);
    try {
      const created = await createScorecard(name, sets, allocations, clientId);
      setScorecards((prev) => [...prev, created]);
      setSelectedScorecard(created);
      setSelectedSetIndexes(created.sets.map((_, index) => index));
      setTotalHoles(created.sets.length * 9);
      setCoursePanelMode('closed');
    } finally {
      setIsCreatingScorecard(false);
    }
  };

  const handleUpdateScorecard = async (
    id: string,
    name: string,
    sets: NineHoleSet[],
    allocations: StrokeIndexAllocation[]
  ) => {
    setIsCreatingScorecard(true);
    try {
      const saved = await updateScorecard(id, name, sets, allocations);
      const savedSets = saved.sets;
      const patch = {
        name: name.trim(),
        sets: savedSets,
        strokeIndexAllocations: saved.strokeIndexAllocations,
      };
      setScorecards((prev) => prev.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)));
      setSelectedScorecard((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
      setHomeCourseSelection((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
      if (selectedScorecard?.id === id) {
        setSelectedSetIndexes(savedSets.map((_, index) => index));
        setTotalHoles(savedSets.length * 9);
      }
      setCoursePanelMode('closed');
    } finally {
      setIsCreatingScorecard(false);
    }
  };

  const buildInitialRoundState = (): GameState => {
    const holeDetails = buildPlayedHoleDetails();
    const parValues = holeDetails.map((hole) => hole.par);

    return {
      ...gameState,
      currentHole: 1,
      totalHoles,
      sessionFormatId: competitionType,
      alias: roundAlias.trim() || undefined,
      parValues: parValues && parValues.length > 0 ? parValues : buildDefaultPars(totalHoles),
      holeDetails:
        holeDetails && holeDetails.length > 0
          ? holeDetails
          : buildDefaultPars(totalHoles).map((par) => ({ par })),
      scorecardId: selectedScorecard?.id,
      scorecardName: selectedScorecard?.name,
      playedSetLabels: buildPlayedSetLabels(),
      matchup: buildMatchupConfig(gameState.players),
    };
  };

  const startGame = () => {
    if (gameState.players.length > 0) {
      if (usesTeamSides && gameState.players.length !== requiredRoundPlayers) {
        setPlayerProfileError(
          `${competitionLabel} requires exactly ${requiredRoundPlayers} players.`
        );
        return;
      }

      const initialState = buildInitialRoundState();
      setActiveRoundTournamentId(null);
      setGameState(initialState);
      setGameStarted(true);
      setView('game');
      setHomeStep('choose');
      setPlayerProfileError('');

      if (isFirebaseConfigured && !sharedRoundId) {
        setIsConnectingRound(true);
        setSyncError('');

        void (async () => {
          try {
            const roundId = await createRound(initialState, clientId);
            skipNextSyncRef.current = true;
            setSharedRoundId(roundId);
            subscribeToSharedRound(roundId);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save round.';
            setSyncError(`Round started locally, but could not be saved for joining: ${message}`);
          } finally {
            setIsConnectingRound(false);
          }
        })();
      }
    }
  };

  const goHome = () => {
    setView('home');
    setTournamentViewMode('dashboard');
    setShowRoundInfoPopover(false);
    setShowRoundPlayerForm(false);
    setShowRoundNewPlayerForm(false);
    setShowEditPlayerForm(false);
    setHomeStep('choose');
    setNewRoundStep('course');
    setCompetitionType('stroke');
    setShowQuickPlayerForm(false);
    setShowQuickEditPlayerForm(false);
    setSyncError('');
    setShareNotice('');
    setPlayerProfileError('');
    setPlayerProfileNotice('');
  };

  const endRound = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setGameStarted(false);
    setActiveRoundTournamentId(null);
    setSharedRoundId(null);
    setRoundAlias('');
    setSyncError('');
    setShareNotice('');
    setSelectedScorecard(null);
    setSelectedSetIndexes([]);
    setPlayerProfileError('');
    setPlayerProfileNotice('');
    setCreatedPlayerSummary(null);
    setShowQuickPlayerForm(false);
    setShowQuickEditPlayerForm(false);
    setShowRoundPlayerForm(false);
    setShowRoundNewPlayerForm(false);
    setShowEditPlayerForm(false);
    setNewPlayerFirstName('');
    setNewPlayerLastName('');
    setNewPlayerNickname('');
    setNewPlayerHandicap('0');
    setEditPlayerId('');
    setEditFirstName('');
    setEditLastName('');
    setEditNickname('');
    setEditHandicap('');
    setGameState(DEFAULT_GAME_STATE);
    setTotalHoles(18);
    setHomeStep('choose');
    setNewRoundStep('course');
    setView('home');
    setShowRoundInfoPopover(false);
  };

  const deleteTournamentMatch = async () => {
    if (!activeRoundTournamentId || !sharedRoundId) {
      return;
    }

    const confirmed = window.confirm(
      'Delete this match? The round and its scores are removed from the tournament.'
    );

    if (!confirmed) {
      return;
    }

    const tournamentId = activeRoundTournamentId;
    const roundId = sharedRoundId;

    try {
      const tournament = await getTournament(tournamentId);

      if (tournament) {
        const nextSessions = (tournament.sessions ?? tournament.rounds ?? []).map((session) => ({
          ...session,
          matchups: session.matchups.filter((matchup) => matchup.roundId !== roundId),
        }));

        await saveTournamentSessions(tournamentId, nextSessions, clientId);
      }

      await deleteRound(roundId);
      setShowRoundInfoPopover(false);
      endRound();
      openTournamentDashboard(tournamentId);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not delete the match.');
    }
  };

  const createSharedRound = async () => {
    if (!isFirebaseConfigured) {
      setSyncError('Firebase is not configured. Add VITE_FIREBASE_* values in .env.local first.');
      return;
    }

    if (gameState.players.length === 0) {
      setSyncError('Add at least one player before creating a shared round.');
      return;
    }

    setIsConnectingRound(true);
    setSyncError('');

    try {
      const initialState = buildInitialRoundState();

      if (usesTeamSides && gameState.players.length !== requiredRoundPlayers) {
        setSyncError(
          `${competitionLabel} requires exactly ${requiredRoundPlayers} players before creating a shared round.`
        );
        setIsConnectingRound(false);
        return;
      }

      const roundId = await createRound(initialState, clientId);
      skipNextSyncRef.current = true;
      setActiveRoundTournamentId(null);
      setSharedRoundId(roundId);
      setShareNotice(`Shared round created. Code: ${roundId}`);
      setRoundAlias(initialState.alias ?? '');
      setGameState(initialState);
      setTotalHoles(initialState.totalHoles);
      setGameStarted(true);
      setView('game');
      setHomeStep('choose');
      subscribeToSharedRound(roundId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create shared round.';
      setSyncError(message);
    } finally {
      setIsConnectingRound(false);
    }
  };

  const openSharedRound = async (roundCode: string, sourceTournamentId?: string): Promise<boolean> => {
    if (!isFirebaseConfigured) {
      setSyncError('Firebase is not configured. Add VITE_FIREBASE_* values in .env.local first.');
      return false;
    }

    const normalizedRoundId = normalizeRoundId(roundCode);
    if (!normalizedRoundId) {
      setSyncError('Choose a round to join.');
      return false;
    }

    setIsConnectingRound(true);
    setSyncError('');

    try {
      const remoteState = await loadRound(normalizedRoundId);
      skipNextSyncRef.current = true;
      setSharedRoundId(normalizedRoundId);
      setGameState(remoteState);
      setTotalHoles(remoteState.totalHoles);
      setRoundAlias(remoteState.alias ?? '');
      setCompetitionType(
        normalizeStandaloneFormat(
          remoteState.sessionFormatId ??
          remoteState.matchup?.sessionFormatId ??
          remoteState.matchup?.format
        )
      );
      setActiveRoundTournamentId(sourceTournamentId ?? null);
      subscribeToSharedRound(normalizedRoundId);
      setGameStarted(true);
      setView('game');
      setHomeStep('choose');
      setShareNotice('');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join shared round.';
      setSharedRoundId(null);
      setSyncError(message);
      return false;
    } finally {
      setIsConnectingRound(false);
    }
  };

  const joinSharedRound = async () => {
    await openSharedRound(selectedJoinRoundId);
  };

  const copyRoundCode = async () => {
    if (!sharedRoundId) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sharedRoundId);
        setShareNotice('Round code copied. Share it with other players.');
        return;
      }

      setShareNotice(`Round code: ${sharedRoundId}`);
    } catch {
      setShareNotice(`Round code: ${sharedRoundId}`);
    }
  };

  const updateScore = (playerId: string, hole: number, strokes: number) => {
    updateGameState(prev => {
      const existingScoreIndex = prev.scores.findIndex(
        s => s.playerId === playerId && s.hole === hole
      );

      let newScores: Score[];
      
      // If strokes is 0, remove the score
      if (strokes === 0) {
        if (existingScoreIndex >= 0) {
          newScores = prev.scores.filter(
            s => !(s.playerId === playerId && s.hole === hole)
          );
        } else {
          newScores = prev.scores;
        }
      } else {
        // Otherwise update or add the score
        if (existingScoreIndex >= 0) {
          newScores = [...prev.scores];
          newScores[existingScoreIndex] = { playerId, hole, strokes };
        } else {
          newScores = [...prev.scores, { playerId, hole, strokes }];
        }
      }

      return { ...prev, scores: newScores };
    });
  };

  const openHomeStep = (step: 'choose' | 'new' | 'join') => {
    setHomeStep(step);
    setSyncError('');
    setShareNotice('');
    setSelectedJoinRoundId('');
  };

  const startNewRoundFlow = () => {
    openHomeStep('new');
    setNewRoundStep('course');
    setCompetitionType('stroke');
    setShowRoundPlayerForm(false);
    setShowEditPlayerForm(false);
  };

  const resetSelectedPlayerEditing = () => {
    setSelectedPlayerProfile(null);
    setPlayerValidationId('');
    setIsPlayerValidated(false);
    setEditPlayerId('');
    setEditFirstName('');
    setEditLastName('');
    setEditNickname('');
    setEditHandicap('');
    setPlayerProfileError('');
    setPlayerProfileNotice('');
  };

  const renderPlayerSelectionEditor = (
    formMode: 'home' | 'round',
    onClose: () => void
  ) => (
    <>
      <div className="player-picker-panel">
        <strong>Select an existing player</strong>
        {isLoadingPlayerProfiles ? (
          <p className="sync-note">Loading players...</p>
        ) : playerProfiles.length === 0 ? (
          <p className="sync-note">No saved players found yet.</p>
        ) : (
          <div className="player-picker-list">
            {playerProfiles.map((profile) => {
              const displayName = profile.nickname?.trim() || `${profile.firstName} ${profile.lastName}`;
              const isSelected = selectedPlayerProfile?.id === profile.id;

              return (
                <button
                  key={profile.id}
                  type="button"
                  className={`player-picker-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => openPlayerForEditing(profile)}
                >
                  <span className="player-picker-name">{displayName}</span>
                  <span className="player-picker-meta">{profile.firstName} {profile.lastName} · HCP {profile.handicap}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedPlayerProfile && (
        <div className="player-validation-panel">
          <div className="player-profile-grid">
            <div className="field-with-label">
              <label htmlFor={`${formMode}-validate-player-id`}>Player ID</label>
              <input
                id={`${formMode}-validate-player-id`}
                type="text"
                value={playerValidationId}
                onChange={(e) => setPlayerValidationId(e.target.value)}
                placeholder="Enter player ID to validate"
                maxLength={80}
              />
            </div>
          </div>
          {!isPlayerValidated && (
            <div className="add-player-form">
              <button type="button" onClick={handleValidateSelectedPlayer} disabled={!playerValidationId.trim()}>
                Edit
              </button>
            </div>
          )}
        </div>
      )}

      {selectedPlayerProfile && isPlayerValidated && (
        <>
          <div className="player-profile-grid">
            <input
              type="text"
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
              placeholder="New first name"
              maxLength={30}
            />
            <input
              type="text"
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
              placeholder="New last name"
              maxLength={30}
            />
            <input
              type="text"
              value={editNickname}
              onChange={(e) => setEditNickname(e.target.value)}
              placeholder="New nickname"
              maxLength={20}
            />
            <div className="field-with-label">
              <label htmlFor={`${formMode}-edit-player-handicap`}>Handicap</label>
              <input
                id={`${formMode}-edit-player-handicap`}
                type="number"
                inputMode="decimal"
                value={editHandicap}
                onChange={(e) => setEditHandicap(e.target.value)}
                placeholder="New handicap"
                min={-10}
                max={54}
              />
            </div>
          </div>
          <div className="edit-player-action-row">
            <button
              onClick={handleUpdatePlayerById}
              disabled={isUpdatingPlayer || isDeletingPlayer || !editPlayerId.trim()}
              className="edit-player-save-btn"
            >
              {isUpdatingPlayer ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="edit-player-cancel-btn"
              onClick={() => {
                resetSelectedPlayerEditing()
                onClose()
              }}
              disabled={isUpdatingPlayer || isDeletingPlayer}
            >
              Cancel
            </button>
            <button
              onClick={handleDeletePlayerById}
              disabled={isUpdatingPlayer || isDeletingPlayer || !editPlayerId.trim()}
              className="edit-player-delete-btn"
            >
              {isDeletingPlayer ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </>
      )}

      {!isPlayerValidated && (
        <button
          type="button"
          className="collapse-player-btn"
          onClick={() => {
            resetSelectedPlayerEditing()
            onClose()
          }}
        >
          Cancel
        </button>
      )}
    </>
  );

  if (view === 'tournament' && activeTournamentId) {
    const activeTournament = tournaments.find((t) => t.id === activeTournamentId) ?? null;

    return (
      <div className="app">
        <div className="header">
          <button onClick={goHome} className="logo-btn" aria-label="Go to home">
            <img src={golphyBanner} width="139" alt="Golphy Logo" className="logo" />
          </button>
        </div>

        {tournamentViewMode === 'manage' ? (
          <>
            <div className="resume-panel">
              <div className="resume-info">
                <strong>{activeTournament?.name || 'Tournament editor'}</strong>
                <span>Edit tournament details and player assignments.</span>              </div>
              <div className="resume-actions">
                <button onClick={() => setTournamentViewMode('dashboard')} className="resume-btn">
                  Back to dashboard
                </button>
              </div>
            </div>

            <TournamentManager
              mode="edit"
              tournaments={tournaments}
              initialTournamentId={activeTournamentId}
              onCancel={() => setTournamentViewMode('dashboard')}
              playerProfiles={playerProfiles}
              isSaving={isSavingTournament}
              onCreate={handleCreateTournament}
              onUpdate={handleUpdateTournament}
              onDelete={handleDeleteTournament}
            />
            {tournamentNotice && <p className="share-notice">{tournamentNotice}</p>}
            {tournamentError && <p className="sync-error">{tournamentError}</p>}
          </>
        ) : (
          <TournamentDashboard
            tournamentId={activeTournamentId}
            initialTournament={activeTournament}
            sessionFormats={globalSessionFormats}
            playerProfiles={playerProfiles}
            scorecards={scorecards}
            clientId={clientId}
            onManage={() => {
              setTournamentViewMode('manage');
            }}
            onOpenRound={(roundId) => {
              void openSharedRound(roundId, activeTournamentId);
            }}
          />
        )}
      </div>
    );
  }

  if (view === 'home') {
    return (
      <div className="app">
        <div className="header">
          <button onClick={goHome} className="logo-btn" aria-label="Go to home">
            <img src={golphyBanner} width="139" alt="Golphy Logo" className="logo" />
          </button>
        </div>

        {gameStarted && (
          <div className="resume-panel">
            <div className="resume-info">
              <strong>{roundAlias || 'Round in progress'}</strong>
              <span>{gameState.players.length} player{gameState.players.length !== 1 ? 's' : ''} · Hole {gameState.currentHole} of {gameState.totalHoles}</span>
              {sharedRoundId && <span className="resume-code">Code: {sharedRoundId}</span>}
            </div>
            <div className="resume-actions">
              <button onClick={() => setView('game')} className="resume-btn">Back to round</button>
              <button onClick={endRound} className="end-btn">Exit round</button>
            </div>
          </div>
        )}

        <div className="setup-screen">
          {toastMessage && <div className="toast-notice">{toastMessage}</div>}
          {homeStep === 'choose' && (
            <>
              <h2>Start here</h2>
              <p className="setup-intro">Choose one action to continue.</p>
              <div className="home-actions">
                <button type="button" className="home-action-card" onClick={startNewRoundFlow}>
                  <span className="card-title">Start a new round</span>
                  <span className="card-copy">Set the course, add players, and begin scoring.</span>
                </button>
                <button type="button" className="home-action-card" onClick={() => openHomeStep('join')}>
                  <span className="card-title">Join an existing round</span>
                  <span className="card-copy">Enter a round code from another player.</span>
                </button>
              </div>

              <div className="quick-player-panel">
                <h3>Players</h3>
                {!showQuickPlayerForm && !showQuickEditPlayerForm ? (
                  <div className="player-action-row">
                    <button
                      type="button"
                      className="reveal-player-btn"
                      onClick={() => setShowQuickPlayerForm(true)}
                    >
                      Add new
                    </button>
                    <button
                      type="button"
                      className="reveal-player-btn secondary"
                      onClick={() => {
                        setShowQuickEditPlayerForm(true)
                        void refreshPlayerProfiles()
                      }}
                    >
                      Edit existing
                    </button>
                  </div>
                ) : (
                  <>
                    {showQuickPlayerForm && (
                      <>
                        <div className="player-profile-grid">
                          <input
                            type="text"
                            value={newPlayerFirstName}
                            onChange={(e) => setNewPlayerFirstName(e.target.value)}
                            placeholder="First name"
                            maxLength={30}
                          />
                          <input
                            type="text"
                            value={newPlayerLastName}
                            onChange={(e) => setNewPlayerLastName(e.target.value)}
                            placeholder="Last name"
                            maxLength={30}
                          />
                          <input
                            type="text"
                            value={newPlayerNickname}
                            onChange={(e) => setNewPlayerNickname(e.target.value)}
                            placeholder="Nickname (optional)"
                            maxLength={20}
                          />
                          <div className="field-with-label">
                            <label htmlFor="quick-player-handicap">Handicap</label>
                            <input
                              id="quick-player-handicap"
                              type="number"
                              inputMode="decimal"
                              value={newPlayerHandicap}
                              onChange={(e) => setNewPlayerHandicap(e.target.value)}
                              placeholder="e.g. 12.4"
                              min={-10}
                              max={54}
                            />
                          </div>
                        </div>
                        <div className="add-player-form compact">
                          <button
                            onClick={handleCreatePlayerOnly}
                            disabled={
                              isSavingPlayer ||
                              !newPlayerFirstName.trim() ||
                              !newPlayerLastName.trim()
                            }
                          >
                            {isSavingPlayer ? 'Saving player...' : 'Create player'}
                          </button>
                        </div>
                        <button
                          type="button"
                          className="collapse-player-btn"
                          onClick={() => setShowQuickPlayerForm(false)}
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {showQuickEditPlayerForm && (
                      <>
                        {renderPlayerSelectionEditor('home', () => setShowQuickEditPlayerForm(false))}
                      </>
                    )}
                  </>
                )}

                {createdPlayerSummary && (
                  <div className="player-created-summary">
                    <strong>New player created</strong>
                    <span>ID: {createdPlayerSummary.id}</span>
                    <span>First name: {createdPlayerSummary.firstName}</span>
                    <span>Last name: {createdPlayerSummary.lastName}</span>
                    <span>Nickname: {createdPlayerSummary.nickname || 'None'}</span>
                    <span>Handicap: {createdPlayerSummary.handicap}</span>
                  </div>
                )}
              </div>

              <div className="quick-course-panel">
                <h3>Courses</h3>
                {coursePanelMode === 'closed' ? (
                  <div className="player-action-row">
                    <button
                      type="button"
                      className="reveal-player-btn"
                      onClick={() => setCoursePanelMode('add')}
                    >
                      Add new
                    </button>
                    <button
                      type="button"
                      className="reveal-player-btn secondary"
                      onClick={() => setCoursePanelMode('edit')}
                    >
                      Edit existing
                    </button>
                  </div>
                ) : (
                  <>
                    <ScorecardSelector
                      scorecards={scorecards}
                      selectedId={homeCourseSelection?.id ?? null}
                      onSelect={setHomeCourseSelection}
                      onCreate={handleCreateScorecard}
                      onUpdate={handleUpdateScorecard}
                      isSaving={isCreatingScorecard}
                      showOptions={coursePanelMode === 'edit'}
                      allowBlankCourse={false}
                      initialFormMode={coursePanelMode === 'add' ? 'create' : 'closed'}
                    />
                    <button
                      type="button"
                      className="collapse-player-btn"
                      onClick={() => setCoursePanelMode('closed')}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>

              <div className="quick-course-panel">
                <h3>Formats</h3>
                {!formatPanelOpen ? (
                  <div className="player-action-row">
                    <button
                      type="button"
                      className="reveal-player-btn"
                      onClick={openFormatPanel}
                    >
                      Add new
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="player-profile-grid">
                      <input
                        type="text"
                        value={formatName}
                        onChange={(event) => setFormatName(event.target.value)}
                        placeholder="Format name"
                        maxLength={40}
                      />
                      <div className="field-with-label">
                        <label htmlFor="global-format-base">Base format</label>
                        <select
                          id="global-format-base"
                          value={formatBase}
                          onChange={(event) => setFormatBase(event.target.value as keyof typeof MATCHUP_FORMAT_LABELS)}
                        >
                          {Object.entries(MATCHUP_FORMAT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field-with-label">
                        <label htmlFor="global-format-scoring">Scoring mode</label>
                        <select
                          id="global-format-scoring"
                          value={formatScoringMode}
                          onChange={(event) => setFormatScoringMode(event.target.value as 'stroke' | 'match' | 'skins')}
                        >
                          <option value="stroke">Stroke play</option>
                          <option value="match">Match play</option>
                          <option value="skins">Skins</option>
                        </select>
                      </div>
                      <div className="field-with-label">
                        <label htmlFor="global-format-players-per-side">Players per side</label>
                        <input
                          id="global-format-players-per-side"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={6}
                          value={formatPlayersPerSide}
                          onChange={(event) => setFormatPlayersPerSide(event.target.value)}
                          placeholder="1"
                        />
                      </div>
                      <label className="format-toggle-field">
                        <input
                          type="checkbox"
                          checked={formatUseHandicaps}
                          onChange={(event) => setFormatUseHandicaps(event.target.checked)}
                        />
                        <span>Use handicaps</span>
                      </label>
                      <label className="format-toggle-field">
                        <input
                          type="checkbox"
                          checked={formatHasTeams}
                          onChange={(event) => setFormatHasTeams(event.target.checked)}
                        />
                        <span>Use teams</span>
                      </label>
                      <label className="format-toggle-field">
                        <input
                          type="checkbox"
                          checked={formatOwnBall}
                          onChange={(event) => setFormatOwnBall(event.target.checked)}
                        />
                        <span>Everybody plays own ball</span>
                      </label>
                    </div>
                    <div className="player-action-row">
                      <button
                        type="button"
                        className="reveal-player-btn"
                        onClick={saveGlobalFormat}
                        disabled={isSavingFormat}
                      >
                        {isSavingFormat ? 'Saving...' : editingFormatId ? 'Save format' : 'Create format'}
                      </button>
                      <button
                        type="button"
                        className="reveal-player-btn secondary"
                        onClick={closeFormatPanel}
                        disabled={isSavingFormat}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}

                <p className="quick-player-copy">
                  Built-in formats are always available. Add custom formats here for all rounds and tournaments.
                </p>

                {globalSessionFormats.length > 0 && (
                  <div className="round-picker-list">
                    {globalSessionFormats.map((format) => (
                      <div key={format.id} className="round-picker-item">
                        <span className="round-picker-name">{format.name}</span>
                        <span className="round-picker-meta">
                          {format.scoringMode === 'stroke'
                            ? 'Stroke play'
                            : format.scoringMode === 'skins'
                              ? 'Skins'
                              : 'Match play'}{' '}
                          · {format.hasTeams ? `${format.playersPerSide} per side` : 'No teams'} ·{' '}
                          {format.useHandicaps ? 'Handicaps on' : 'Handicaps off'} ·{' '}
                          {format.ownBall ? 'Own ball' : 'Shared side ball'}
                        </span>
                        <div className="format-item-actions">
                          <button
                            type="button"
                            className="reveal-player-btn secondary"
                            onClick={() => openEditFormat(format)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="reveal-player-btn secondary"
                            onClick={() => void deleteGlobalFormat(format)}
                            disabled={isSavingFormat}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {formatMessage && <p className="share-notice">{formatMessage}</p>}
                {formatError && <p className="sync-error">{formatError}</p>}
              </div>

              <div className="quick-course-panel">
                <h3>Tournaments</h3>
                {tournamentPanelMode === 'closed' ? (
                  <>
                    <div className="player-action-row">
                      <button
                        type="button"
                        className="reveal-player-btn"
                        onClick={() => openTournamentPanel('add')}
                      >
                        Add new
                      </button>
                      <button
                        type="button"
                        className="reveal-player-btn secondary"
                        onClick={() => openTournamentPanel('edit')}
                      >
                        Edit existing
                      </button>
                    </div>

                    {tournaments.length > 0 && (
                      <div className="round-picker-list">
                        {tournaments.map((tournament) => (
                          <button
                            key={tournament.id}
                            type="button"
                            className="round-picker-item"
                            onClick={() => openTournamentDashboard(tournament.id)}
                          >
                            <span className="round-picker-name">{tournament.name}</span>
                            <span className="round-picker-meta">
                              {tournament.format === 'team' ? 'Team' : 'Individual'} ·{' '}
                              {tournament.entries.length}{' '}
                              {tournament.format === 'team' ? 'teams' : 'players'} ·{' '}
                              {(tournament.sessions ?? tournament.rounds ?? []).length} session
                              {(tournament.sessions ?? tournament.rounds ?? []).length === 1 ? '' : 's'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <TournamentManager
                      mode={tournamentPanelMode}
                      tournaments={tournaments}
                      playerProfiles={playerProfiles}
                      isSaving={isSavingTournament}
                      onCreate={handleCreateTournament}
                      onUpdate={handleUpdateTournament}
                      onDelete={handleDeleteTournament}
                    />
                    {tournamentNotice && <p className="share-notice">{tournamentNotice}</p>}
                    {tournamentError && <p className="sync-error">{tournamentError}</p>}
                    <button
                      type="button"
                      className="collapse-player-btn"
                      onClick={() => setTournamentPanelMode('closed')}
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {homeStep === 'join' && (
            <>
              <div className="step-header">
                <button type="button" className="back-link-btn" onClick={() => openHomeStep('choose')}>
                  Back
                </button>
                <h2>Join an existing round</h2>
              </div>

              <div className="input-group">
                <label>Choose a round</label>
                {isLoadingRounds ? (
                  <p className="sync-note">Loading existing rounds...</p>
                ) : availableRounds.length === 0 ? (
                  <p className="sync-note">No existing rounds found yet.</p>
                ) : (
                  <div className="round-picker-list">
                    {availableRounds.map((round) => {
                      const displayName = round.alias?.trim() || round.scorecardName?.trim() || 'Round in progress';

                      return (
                        <button
                          key={round.id}
                          type="button"
                          className={`round-picker-item${selectedJoinRoundId === round.id ? ' selected' : ''}`}
                          onClick={() => setSelectedJoinRoundId(round.id)}
                        >
                          <span className="round-picker-name">{displayName}</span>
                          <span className="round-picker-meta">Round code: {round.id}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={joinSharedRound}
                disabled={isConnectingRound || !selectedJoinRoundId.trim() || !isFirebaseConfigured}
                className="start-btn"
              >
                {isConnectingRound ? 'Joining...' : 'Join round'}
              </button>
            </>
          )}

          {homeStep === 'new' && newRoundStep === 'course' && (
            <>
              <div className="step-header">
                <button type="button" className="back-link-btn" onClick={() => openHomeStep('choose')}>
                  Back
                </button>
                <h2>Step 2: choose a course</h2>
              </div>

              <div className="input-group">
                <label>Use an existing course or add a new one</label>
                <ScorecardSelector
                  scorecards={scorecards}
                  selectedId={selectedScorecard?.id ?? null}
                  onSelect={handleScorecardSelect}
                  onCreate={handleCreateScorecard}
                  onUpdate={handleUpdateScorecard}
                  isSaving={isCreatingScorecard}
                />
              </div>

              {selectedScorecard && selectedScorecard.sets.length > 1 && (
                <div className="input-group">
                  <label>Which nines are you playing?</label>
                  <div className="set-picker-list">
                    {selectedScorecard.sets.map((set, index) => {
                      const playPosition = selectedSetIndexes.indexOf(index);
                      const isChecked = playPosition >= 0;
                      const startHole = playPosition * 9 + 1;

                      return (
                        <div key={index} className={`set-picker-item${isChecked ? ' selected' : ''}`}>
                          <label className="set-picker-label">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSetSelection(index)}
                            />
                            <span className="set-picker-text">
                              <span className="set-picker-name">
                                {set.alias?.trim() || `Set ${index + 1}`}
                              </span>
                              <span className="set-picker-meta">
                                {isChecked ? `Plays as holes ${startHole}-${startHole + 8}` : 'Not in this round'}
                              </span>
                            </span>
                          </label>

                          {isChecked && selectedSetIndexes.length > 1 && (
                            <div className="set-picker-order">
                              <button
                                type="button"
                                onClick={() => moveSetInPlayOrder(playPosition, -1)}
                                disabled={playPosition === 0}
                                aria-label={`Move ${set.alias?.trim() || `Set ${index + 1}`} earlier`}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSetInPlayOrder(playPosition, 1)}
                                disabled={playPosition === selectedSetIndexes.length - 1}
                                aria-label={`Move ${set.alias?.trim() || `Set ${index + 1}`} later`}
                              >
                                ↓
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {getStrokeIndexAllocation(getPlayOrder()) && (
                    <p className="sync-note">Using this combination's published stroke indexes.</p>
                  )}
                </div>
              )}

              {!selectedScorecard && (
                <div className="input-group">
                  <label>Round length</label>
                  <div className="hole-count-toggle">
                    {DEFAULT_HOLE_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={totalHoles === option ? 'active' : ''}
                        onClick={() => setTotalHoles(option)}
                      >
                        {option} holes
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="step-actions">
                <button type="button" className="step-btn secondary" onClick={() => openHomeStep('choose')}>
                  Cancel
                </button>
                <button type="button" className="step-btn primary" onClick={() => setNewRoundStep('details')}>
                  Continue
                </button>
              </div>
            </>
          )}

          {homeStep === 'new' && newRoundStep === 'details' && (
            <>
              <div className="step-header">
                <button type="button" className="back-link-btn" onClick={() => setNewRoundStep('course')}>
                  Back
                </button>
                <h2>Step 3: setup round details</h2>
              </div>

              <div className="course-summary">
                <strong>{selectedScorecard?.name || 'Blank default course'}</strong>
                <span>{totalHoles} holes</span>
              </div>

              <div className="input-group">
                <label>Round name (optional)</label>
                <input
                  type="text"
                  value={roundAlias}
                  onChange={(e) => setRoundAlias(e.target.value)}
                  placeholder="e.g. Saturday at Pebble Beach"
                  maxLength={40}
                />
              </div>

              <div className="input-group">
                <label>Competition</label>
                <select
                  value={competitionType}
                  onChange={(event) => {
                    const nextFormat = normalizeStandaloneFormat(event.target.value);
                    setCompetitionType(nextFormat);

                    const nextDefinition = getSessionFormatDefinition(nextFormat, globalSessionFormats);
                    if (!nextDefinition.hasTeams) {
                      setPlayerProfileError('');
                      return;
                    }

                    const neededPlayers = getSessionFormatPlayerCount(nextFormat, globalSessionFormats) * 2;
                    if (gameState.players.length > neededPlayers) {
                      setPlayerProfileError(
                        `${getSessionFormatLabel(nextFormat, globalSessionFormats)} requires exactly ${neededPlayers} players. Remove players before starting.`
                      );
                    } else {
                      setPlayerProfileError('');
                    }
                  }}
                >
                  {allSessionFormats.map((formatOption) => (
                    <option key={formatOption.id} value={formatOption.id}>
                      {formatOption.name}
                    </option>
                  ))}
                </select>
                {usesTeamSides && (
                  <p className="sync-note">
                    {competitionLabel} requires exactly {requiredRoundPlayers} players.
                  </p>
                )}
              </div>

              <div className="input-group">
                <label>Add players</label>
                {!showRoundPlayerForm && !showEditPlayerForm ? (
                  <div className="player-action-row">
                    <button
                      type="button"
                      className="reveal-player-btn"
                      onClick={openRoundPlayerPicker}
                    >
                      Add a player
                    </button>
                    <button
                      type="button"
                      className="reveal-player-btn secondary"
                      onClick={() => {
                        setShowEditPlayerForm(true)
                        void refreshPlayerProfiles()
                      }}
                    >
                      Edit existing player
                    </button>
                  </div>
                ) : (
                  <>
                    {showRoundPlayerForm && (
                      <>
                        <div className="player-picker-panel">
                          <strong>Select an existing player</strong>
                          {isLoadingPlayerProfiles ? (
                            <p className="sync-note">Loading players...</p>
                          ) : playerProfiles.filter((profile) => !gameState.players.some((player) => player.id === profile.id)).length === 0 ? (
                            <p className="sync-note">No available players to add. Create a new player below.</p>
                          ) : (
                            <div className="player-picker-list">
                              {playerProfiles
                                .filter((profile) => !gameState.players.some((player) => player.id === profile.id))
                                .map((profile) => (
                                  <button
                                    key={profile.id}
                                    type="button"
                                    className="player-picker-item"
                                    onClick={() => addExistingPlayerToRound(profile)}
                                  >
                                    <span className="player-picker-name">{getRoundPlayerDisplayName(profile)}</span>
                                    <span className="player-picker-meta">Player ID: {profile.id}</span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>

                        {!showRoundNewPlayerForm ? (
                          <button
                            type="button"
                            className="reveal-player-btn secondary"
                            onClick={() => setShowRoundNewPlayerForm(true)}
                          >
                            Create new player
                          </button>
                        ) : (
                          <>
                            <div className="player-profile-grid">
                              <input
                                type="text"
                                value={newPlayerFirstName}
                                onChange={(e) => setNewPlayerFirstName(e.target.value)}
                                placeholder="First name"
                                maxLength={30}
                              />
                              <input
                                type="text"
                                value={newPlayerLastName}
                                onChange={(e) => setNewPlayerLastName(e.target.value)}
                                placeholder="Last name"
                                maxLength={30}
                              />
                              <input
                                type="text"
                                value={newPlayerNickname}
                                onChange={(e) => setNewPlayerNickname(e.target.value)}
                                placeholder="Nickname (optional)"
                                maxLength={20}
                              />
                              <div className="field-with-label">
                                <label htmlFor="round-player-handicap">Handicap</label>
                                <input
                                  id="round-player-handicap"
                                  type="number"
                                  inputMode="decimal"
                                  value={newPlayerHandicap}
                                  onChange={(e) => setNewPlayerHandicap(e.target.value)}
                                  placeholder="e.g. 12.4"
                                  min={-10}
                                  max={54}
                                />
                              </div>
                            </div>
                            <div className="add-player-form">
                              <button
                                onClick={handleCreatePlayerAndAdd}
                                disabled={
                                  isSavingPlayer ||
                                  !newPlayerFirstName.trim() ||
                                  !newPlayerLastName.trim() ||
                                  gameState.players.length >= 8
                                }
                              >
                                {isSavingPlayer ? 'Saving player...' : 'Create player and add to round'}
                              </button>
                            </div>
                            <button
                              type="button"
                              className="collapse-player-btn"
                              onClick={() => setShowRoundNewPlayerForm(false)}
                            >
                              Cancel new player
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          className="collapse-player-btn"
                          onClick={closeRoundPlayerPicker}
                        >
                          Done
                        </button>
                      </>
                    )}
                  </>
                )}
                <p className="sync-note">Each player gets a unique ID when created. Use that ID to edit the profile.</p>

                {createdPlayerSummary && (
                  <div className="player-created-summary">
                    <strong>New player created</strong>
                    <span>ID: {createdPlayerSummary.id}</span>
                    <span>First name: {createdPlayerSummary.firstName}</span>
                    <span>Last name: {createdPlayerSummary.lastName}</span>
                    <span>Nickname: {createdPlayerSummary.nickname || 'None'}</span>
                    <span>Handicap: {createdPlayerSummary.handicap}</span>
                  </div>
                )}
              </div>

              {showEditPlayerForm && (
                <div className="input-group">
                  <label>Edit or delete player by unique ID</label>
                  {renderPlayerSelectionEditor('round', () => setShowEditPlayerForm(false))}
                </div>
              )}

              {gameState.players.length > 0 && (
                <div className="players-list">
                  {resolvedPlayers.map(player => (
                    <div key={player.id} className="player-item">
                      <div
                        className="color-indicator"
                        style={{ backgroundColor: player.color }}
                      />
                      <div className="player-info-wrap">
                        <span className="player-name">{player.name}</span>
                        <span className="player-meta">ID: {player.id}</span>
                      </div>
                      <button
                        onClick={() => removePlayer(player.id)}
                        className="remove-btn"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={startGame}
                disabled={
                  gameState.players.length === 0 ||
                  (usesTeamSides && gameState.players.length !== requiredRoundPlayers)
                }
                className="start-btn"
              >
                Start round
              </button>

              <div className="share-actions">
                <button
                  onClick={createSharedRound}
                  disabled={
                    isConnectingRound ||
                    gameState.players.length === 0 ||
                    (usesTeamSides && gameState.players.length !== requiredRoundPlayers) ||
                    !isFirebaseConfigured
                  }
                  className="share-btn"
                >
                  {isConnectingRound ? 'Connecting...' : 'Create shared round'}
                </button>
              </div>

              {sharedRoundId && (
                <div className="setup-round-code-panel">
                  <span>Share this code with players:</span>
                  <strong className="setup-round-code">{sharedRoundId}</strong>
                  <button onClick={copyRoundCode} className="copy-round-code-btn">
                    Copy code
                  </button>
                </div>
              )}
            </>
          )}

          {shareNotice && <p className="share-notice">{shareNotice}</p>}
          {playerProfileNotice && <p className="share-notice">{playerProfileNotice}</p>}

          {!isFirebaseConfigured && (
            <p className="sync-note">Configure Firebase in .env.local to enable shared rounds.</p>
          )}
          {syncError && <p className="sync-error">{syncError}</p>}
          {playerProfileError && <p className="sync-error">{playerProfileError}</p>}
        </div>
      </div>
    );
  }

  const playedSetSummary =
    gameState.playedSetLabels?.length
      ? gameState.playedSetLabels.join(' · ')
      : `Set 1 (1-${Math.min(9, gameState.totalHoles)})`;
  const playersIncluded =
    gameState.players.length > 0
      ? resolvedPlayers.map((player) => player.name).join(', ')
      : 'No players';
  const matchupLabel = getSessionFormatLabel(competitionType, globalSessionFormats);
  // Prefer the saved course's current name so renames show up in existing rounds.
  const liveCourseName =
    scorecards.find((sc) => sc.id === gameState.scorecardId)?.name || gameState.scorecardName;
  const roundTitle = roundAlias || liveCourseName || 'Round in progress';
  const activeRoundTournament =
    activeRoundTournamentId
      ? tournaments.find((tournament) => tournament.id === activeRoundTournamentId) ?? null
      : null;

  return (
    <div className="app">
      {toastMessage && <div className="toast-notice">{toastMessage}</div>}
      <div className="scorecard-nav" aria-label="Scorecard navigation">
        <button type="button" onClick={goHome} className="scorecard-logo-btn" aria-label="Return to home">
          <img src={golphyBanner} width="82" alt="Golphy logo" className="scorecard-logo" />
        </button>

        <div className="round-info-wrap">
          <button
            ref={roundInfoButtonRef}
            type="button"
            className="round-info-btn"
            aria-label="Show round info"
            aria-expanded={showRoundInfoPopover}
            aria-controls="round-info-popover"
            onClick={() => setShowRoundInfoPopover((prev) => !prev)}
          >
            <span aria-hidden="true">i</span>
          </button>

          {showRoundInfoPopover && (
            <div
              id="round-info-popover"
              ref={roundInfoPopoverRef}
              className="round-info-popover"
              role="dialog"
              aria-label="Round details"
            >
              <strong>{roundTitle}</strong>
              <span>Course: {liveCourseName || 'Custom course'}</span>
              <span>Holes: {gameState.totalHoles} · Sets: {playedSetSummary}</span>
              <span>Players: {playersIncluded}</span>
              <span>Match type: {matchupLabel}</span>
              <div className="round-player-management">
                <strong>Manage players</strong>
                {gameState.players.length > 0 && (
                  <div className="round-player-list">
                    {resolvedPlayers.map((player) => (
                      <div key={player.id} className="round-player-item">
                        <span>{player.name}</span>
                        <button
                          type="button"
                          className="round-player-remove-btn"
                          onClick={() => {
                            const removed = removePlayer(player.id);
                            if (removed) {
                              setShowRoundInfoPopover(false);
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {!showRoundPlayerForm ? (
                  <button
                    type="button"
                    className="round-player-add-btn"
                    onClick={openRoundPlayerPicker}
                    disabled={gameState.players.length >= maxRoundPlayers}
                  >
                    Add player
                  </button>
                ) : (
                  <>
                    <div className="round-player-list">
                      {isLoadingPlayerProfiles ? (
                        <span>Loading players...</span>
                      ) : playerProfiles.filter((profile) => !gameState.players.some((player) => player.id === profile.id)).length === 0 ? (
                        <span>No available players to add.</span>
                      ) : (
                        playerProfiles
                          .filter((profile) => !gameState.players.some((player) => player.id === profile.id))
                          .map((profile) => (
                            <div key={profile.id} className="round-player-item">
                              <span>{getRoundPlayerDisplayName(profile)}</span>
                              <button
                                type="button"
                                className="round-player-add-btn"
                                onClick={() => addExistingPlayerToRound(profile)}
                              >
                                Add
                              </button>
                            </div>
                          ))
                      )}
                    </div>

                    {!showRoundNewPlayerForm ? (
                      <button
                        type="button"
                        className="round-player-add-btn"
                        onClick={() => setShowRoundNewPlayerForm(true)}
                      >
                        Create new player
                      </button>
                    ) : (
                      <>
                        <div className="player-profile-grid round-player-grid">
                          <input
                            type="text"
                            value={newPlayerFirstName}
                            onChange={(e) => setNewPlayerFirstName(e.target.value)}
                            placeholder="First name"
                            maxLength={30}
                          />
                          <input
                            type="text"
                            value={newPlayerLastName}
                            onChange={(e) => setNewPlayerLastName(e.target.value)}
                            placeholder="Last name"
                            maxLength={30}
                          />
                          <input
                            type="text"
                            value={newPlayerNickname}
                            onChange={(e) => setNewPlayerNickname(e.target.value)}
                            placeholder="Nickname (optional)"
                            maxLength={20}
                          />
                          <div className="field-with-label">
                            <label htmlFor="popover-round-player-handicap">Handicap</label>
                            <input
                              id="popover-round-player-handicap"
                              type="number"
                              inputMode="decimal"
                              value={newPlayerHandicap}
                              onChange={(e) => setNewPlayerHandicap(e.target.value)}
                              placeholder="e.g. 12.4"
                              min={-10}
                              max={54}
                            />
                          </div>
                        </div>
                        <div className="add-player-form compact">
                          <button
                            type="button"
                            onClick={handleCreatePlayerAndAdd}
                            disabled={isSavingPlayer || !newPlayerFirstName.trim() || !newPlayerLastName.trim()}
                          >
                            {isSavingPlayer ? 'Saving player...' : 'Create and add'}
                          </button>
                        </div>
                        <button
                          type="button"
                          className="collapse-player-btn"
                          onClick={() => setShowRoundNewPlayerForm(false)}
                        >
                          Cancel new player
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="collapse-player-btn"
                      onClick={closeRoundPlayerPicker}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
              {activeRoundTournamentId && sharedRoundId && (
                <button
                  type="button"
                  className="round-match-delete-btn"
                  onClick={() => void deleteTournamentMatch()}
                >
                  Delete match
                </button>
              )}
              {syncError && <span className="sync-error">Sync issue: {syncError}</span>}
            </div>
          )}
        </div>
      </div>

      <ScoreTable
        players={resolvedPlayers}
        scores={gameState.scores}
        totalHoles={gameState.totalHoles}
        parValues={gameState.parValues ?? buildDefaultPars(gameState.totalHoles)}
        roundTitle={roundTitle}
        tournamentName={activeRoundTournament?.name}
        onTournamentLinkClick={
          activeRoundTournamentId
            ? () => openTournamentDashboard(activeRoundTournamentId)
            : undefined
        }
        holeDetails={gameState.holeDetails}
        courseName={liveCourseName}
        setLabels={gameState.playedSetLabels}
        matchup={gameState.matchup}
        onScoreUpdate={updateScore}
      />
    </div>
  );
}

export default App
