import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player, PlayerProfile, Score, GameState, Scorecard } from './types/index.ts'
import ScoreTable from './components/ScoreTable'
import ScorecardSelector from './components/ScorecardSelector'
import { isFirebaseConfigured } from './firebase/config'
import {
  createRound,
  loadRound,
  normalizeRoundId,
  listRounds,
  subscribeToRound,
  updateRound,
} from './firebase/rounds'
import { createScorecard, listScorecards } from './firebase/scorecards'
import { createPlayer, deletePlayer, listPlayers, updatePlayer } from './firebase/players'
import './styles/App.scss'
import golphyBanner from './assets/Golphy-banner.svg'

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
  view: 'home' | 'game';
  homeStep: 'choose' | 'new' | 'join';
  newRoundStep: 'course' | 'details';
  competitionType: 'stroke' | 'match-play';
  gameStarted: boolean;
  gameState: GameState;
  totalHoles: number;
  roundAlias: string;
  sharedRoundId: string | null;
  selectedJoinRoundId: string;
  selectedScorecard: Scorecard | null;
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
  const [view, setView] = useState<'home' | 'game'>('home');
  const [homeStep, setHomeStep] = useState<'choose' | 'new' | 'join'>('choose');
  const [newRoundStep, setNewRoundStep] = useState<'course' | 'details'>('course');
  const [competitionType, setCompetitionType] = useState<'stroke' | 'match-play'>('stroke');
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
  const [isCreatingScorecard, setIsCreatingScorecard] = useState(false);
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
  const isMatchPlay = competitionType === 'match-play';

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    listScorecards().then(setScorecards).catch(() => {});
  }, []);

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

      if (session.view === 'home' || session.view === 'game') {
        setView(session.view);
      }

      if (session.homeStep === 'choose' || session.homeStep === 'new' || session.homeStep === 'join') {
        setHomeStep(session.homeStep);
      }

      if (session.newRoundStep === 'course' || session.newRoundStep === 'details') {
        setNewRoundStep(session.newRoundStep);
      }

      if (session.competitionType === 'stroke' || session.competitionType === 'match-play') {
        setCompetitionType(session.competitionType);
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

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    void refreshPlayerProfiles();
  }, []);

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
    };

    window.localStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify(sessionToPersist));
  }, [
    competitionType,
    gameStarted,
    gameState,
    homeStep,
    isSessionRestored,
    newRoundStep,
    roundAlias,
    selectedJoinRoundId,
    selectedScorecard,
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

  const buildMatchupConfig = (players: Player[]) => {
    if (competitionType !== 'match-play') {
      return undefined;
    }

    const playerA = players[0];
    const playerB = players[1];

    if (!playerA || !playerB) {
      return undefined;
    }

    return {
      format: 'match-play' as const,
      teams: [
        {
          id: 'team-a',
          name: playerA.name,
          playerIds: [playerA.id],
        },
        {
          id: 'team-b',
          name: playerB.name,
          playerIds: [playerB.id],
        },
      ],
    };
  };

  const buildPlayedSetLabels = () => {
    if (selectedScorecard?.sets?.length) {
      const availableSetCount = selectedScorecard.sets.length;
      const setsToUse = Math.min(Math.ceil(totalHoles / 9), availableSetCount);

      return selectedScorecard.sets.slice(0, setsToUse).map((set, index) => {
        const alias = set.alias?.trim();
        if (alias) {
          return alias;
        }

        const startHole = index * 9 + 1;
        const endHole = Math.min(startHole + 8, totalHoles);
        return `Set ${index + 1} (${startHole}-${endHole})`;
      });
    }

    const setCount = Math.max(1, Math.ceil(totalHoles / 9));
    return Array.from({ length: setCount }, (_, index) => {
      const startHole = index * 9 + 1;
      const endHole = Math.min(startHole + 8, totalHoles);
      return `Set ${index + 1} (${startHole}-${endHole})`;
    });
  };

  const addRoundPlayer = (id: string, name: string) => {
    if (!name.trim() || gameState.players.length >= 8) {
      return;
    }

    if (isMatchPlay && gameState.players.length >= 2) {
      setPlayerProfileError('1-on-1 match play requires exactly 2 players.');
      return;
    }

    const newPlayer: Player = {
      id,
      name: name.trim(),
      color: PLAYER_COLORS[gameState.players.length],
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
        addRoundPlayer(created.id, roundName);
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

    addRoundPlayer(profile.id, getRoundPlayerDisplayName(profile));
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
      setTotalHoles(sc.sets.length * 9);
    }
  };

  const handleCreateScorecard = async (name: string, sets: import('./types/index.ts').NineHoleSet[]) => {
    setIsCreatingScorecard(true);
    try {
      const created = await createScorecard(name, sets, clientId);
      setScorecards((prev) => [...prev, created]);
      setSelectedScorecard(created);
      setTotalHoles(created.sets.length * 9);
    } finally {
      setIsCreatingScorecard(false);
    }
  };

  const buildInitialRoundState = (): GameState => {
    const holeDetails = selectedScorecard?.sets.flatMap((set) => set.holes);
    const parValues = holeDetails?.map((hole) => hole.par);

    return {
      ...gameState,
      currentHole: 1,
      totalHoles,
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
      if (isMatchPlay && gameState.players.length !== 2) {
        setPlayerProfileError('1-on-1 match play requires exactly 2 players.');
        return;
      }

      const initialState = buildInitialRoundState();
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
    setSharedRoundId(null);
    setRoundAlias('');
    setSyncError('');
    setShareNotice('');
    setSelectedScorecard(null);
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

      if (competitionType === 'match-play' && gameState.players.length !== 2) {
        setSyncError('1-on-1 match play requires exactly 2 players before creating a shared round.');
        setIsConnectingRound(false);
        return;
      }

      const roundId = await createRound(initialState, clientId);
      skipNextSyncRef.current = true;
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

  const joinSharedRound = async () => {
    if (!isFirebaseConfigured) {
      setSyncError('Firebase is not configured. Add VITE_FIREBASE_* values in .env.local first.');
      return;
    }

    const normalizedRoundId = normalizeRoundId(selectedJoinRoundId);
    if (!normalizedRoundId) {
      setSyncError('Choose a round to join.');
      return;
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
      setCompetitionType(remoteState.matchup?.format === 'match-play' ? 'match-play' : 'stroke');
      subscribeToSharedRound(normalizedRoundId);
      setGameStarted(true);
      setView('game');
      setHomeStep('choose');
      setShareNotice('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join shared round.';
      setSharedRoundId(null);
      setSyncError(message);
    } finally {
      setIsConnectingRound(false);
    }
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
                <h3>Add a new player</h3>
                <p className="quick-player-copy">Create a player profile now and keep the unique player ID for future edits.</p>
                {!showQuickPlayerForm && !showQuickEditPlayerForm ? (
                  <div className="player-action-row">
                    <button
                      type="button"
                      className="reveal-player-btn"
                      onClick={() => setShowQuickPlayerForm(true)}
                    >
                      Add a new player
                    </button>
                    <button
                      type="button"
                      className="reveal-player-btn secondary"
                      onClick={() => {
                        setShowQuickEditPlayerForm(true)
                        void refreshPlayerProfiles()
                      }}
                    >
                      Edit existing player
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
                  isCreating={isCreatingScorecard}
                />
              </div>

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
                <strong>{selectedScorecard?.name || 'No saved course selected'}</strong>
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
                <div className="competition-toggle">
                  <button
                    type="button"
                    className={competitionType === 'stroke' ? 'active' : ''}
                    onClick={() => {
                      setCompetitionType('stroke')
                      setPlayerProfileError('')
                    }}
                  >
                    Stroke round
                  </button>
                  <button
                    type="button"
                    className={competitionType === 'match-play' ? 'active' : ''}
                    onClick={() => {
                      setCompetitionType('match-play')
                      if (gameState.players.length > 2) {
                        setPlayerProfileError('1-on-1 match play requires exactly 2 players. Remove players before starting.')
                      } else {
                        setPlayerProfileError('')
                      }
                    }}
                  >
                    1-on-1 match play
                  </button>
                </div>
                {isMatchPlay && (
                  <p className="sync-note">1-on-1 match play requires exactly 2 players.</p>
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
                  {gameState.players.map(player => (
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
                disabled={gameState.players.length === 0 || (isMatchPlay && gameState.players.length !== 2)}
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
                    (isMatchPlay && gameState.players.length !== 2) ||
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
      ? gameState.players.map((player) => player.name).join(', ')
      : 'No players';
  const matchupLabel =
    gameState.matchup?.format === 'match-play' ? '1-on-1 match play' : 'Stroke play';
  const roundTitle = roundAlias || gameState.scorecardName || 'Round in progress';

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
              <span>Course: {gameState.scorecardName || 'Custom course'}</span>
              <span>Holes: {gameState.totalHoles} · Sets: {playedSetSummary}</span>
              <span>Players: {playersIncluded}</span>
              <span>Match type: {matchupLabel}</span>
              <div className="round-player-management">
                <strong>Manage players</strong>
                {gameState.players.length > 0 && (
                  <div className="round-player-list">
                    {gameState.players.map((player) => (
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
                    disabled={gameState.players.length >= 8 || (isMatchPlay && gameState.players.length >= 2)}
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
              {syncError && <span className="sync-error">Sync issue: {syncError}</span>}
            </div>
          )}
        </div>
      </div>

      <ScoreTable
        players={gameState.players}
        scores={gameState.scores}
        totalHoles={gameState.totalHoles}
        parValues={gameState.parValues ?? buildDefaultPars(gameState.totalHoles)}
        holeDetails={gameState.holeDetails}
        courseName={roundTitle}
        setLabels={gameState.playedSetLabels}
        onScoreUpdate={updateScore}
      />
    </div>
  );
}

export default App
