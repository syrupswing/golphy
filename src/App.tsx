import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player, Score, GameState } from './types/index.ts'
import ScoreCard from './components/ScoreCard'
import ScoreTable from './components/ScoreTable'
import { isFirebaseConfigured } from './firebase/config'
import {
  createRound,
  loadRound,
  normalizeRoundId,
  subscribeToRound,
  updateRound,
} from './firebase/rounds'
import './styles/App.scss'
import golphyBanner from './assets/Golphy-banner.svg'

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
];

// Default par values for 18 holes
const DEFAULT_PAR = [4, 3, 4, 4, 5, 3, 5, 4, 4, 4, 5, 4, 4, 5, 4, 3, 3, 4];

const createClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    scores: [],
    currentHole: 1,
    totalHoles: 18
  });
  const [newPlayerName, setNewPlayerName] = useState('');
  const [totalHoles, setTotalHoles] = useState('18');
  const [roundCodeInput, setRoundCodeInput] = useState('');
  const [sharedRoundId, setSharedRoundId] = useState<string | null>(null);
  const [isConnectingRound, setIsConnectingRound] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [shareNotice, setShareNotice] = useState('');
  const clientId = useMemo(() => createClientId(), []);
  const skipNextSyncRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

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
        setTotalHoles(String(remoteState.totalHoles));
        setGameStarted(true);
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

  const addPlayer = () => {
    if (newPlayerName.trim() && gameState.players.length < 8) {
      const newPlayer: Player = {
        id: Date.now().toString(),
        name: newPlayerName.trim(),
        color: PLAYER_COLORS[gameState.players.length]
      };
      
      updateGameState(prev => ({
        ...prev,
        players: [...prev.players, newPlayer]
      }));
      setNewPlayerName('');
    }
  };

  const removePlayer = (playerId: string) => {
    updateGameState(prev => ({
      ...prev,
      players: prev.players.filter(p => p.id !== playerId)
    }));
  };

  const startGame = () => {
    if (gameState.players.length > 0) {
      updateGameState(prev => ({
        ...prev,
        totalHoles: parseInt(totalHoles) || 18
      }));
      setGameStarted(true);
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
      const initialState: GameState = {
        ...gameState,
        currentHole: 1,
        totalHoles: parseInt(totalHoles) || 18,
      };

      const roundId = await createRound(initialState, clientId);
      skipNextSyncRef.current = true;
      setSharedRoundId(roundId);
      setRoundCodeInput(roundId);
      setShareNotice(`Shared round created. Code: ${roundId}`);
      setGameState(initialState);
      setTotalHoles(String(initialState.totalHoles));
      setGameStarted(true);
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

    const normalizedRoundId = normalizeRoundId(roundCodeInput);
    if (!normalizedRoundId) {
      setSyncError('Enter a valid round code to join a shared round.');
      return;
    }

    setIsConnectingRound(true);
    setSyncError('');

    try {
      const remoteState = await loadRound(normalizedRoundId);
      skipNextSyncRef.current = true;
      setSharedRoundId(normalizedRoundId);
      setGameState(remoteState);
      setTotalHoles(String(remoteState.totalHoles));
      subscribeToSharedRound(normalizedRoundId);
      setGameStarted(true);
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

  const nextHole = () => {
    if (gameState.currentHole < gameState.totalHoles) {
      updateGameState(prev => ({ ...prev, currentHole: prev.currentHole + 1 }));
    }
  };

  const prevHole = () => {
    if (gameState.currentHole > 1) {
      updateGameState(prev => ({ ...prev, currentHole: prev.currentHole - 1 }));
    }
  };

  if (!gameStarted) {
    return (
      <div className="app">
        <div className="header">
          <img src={golphyBanner} width="139" alt="Golphy Logo" className="logo" />
        </div>

        <div className="setup-screen">
          <h2>Setup Game</h2>
          
          <div className="input-group">
            <label>Number of Holes</label>
            <input
              type="number"
              value={totalHoles}
              onChange={(e) => setTotalHoles(e.target.value)}
              min="1"
              max="18"
            />
          </div>

          <div className="input-group">
            <label>Join Shared Round (optional)</label>
            <input
              type="text"
              value={roundCodeInput}
              onChange={(e) => setRoundCodeInput(e.target.value.toUpperCase())}
              placeholder="Enter round code"
              maxLength={10}
            />
          </div>

          <div className="input-group">
            <label>Add Players</label>
            <div className="add-player-form">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addPlayer()}
                placeholder="Enter player name"
                maxLength={20}
              />
              <button 
                onClick={addPlayer}
                disabled={!newPlayerName.trim() || gameState.players.length >= 8}
              >
                Add
              </button>
            </div>
          </div>

          {gameState.players.length > 0 && (
            <div className="players-list">
              {gameState.players.map(player => (
                <div key={player.id} className="player-item">
                  <div 
                    className="color-indicator" 
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="player-name">{player.name}</span>
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
            disabled={gameState.players.length === 0}
            className="start-btn"
          >
            Start Game
          </button>

          <div className="share-actions">
            <button
              onClick={createSharedRound}
              disabled={isConnectingRound || gameState.players.length === 0 || !isFirebaseConfigured}
              className="share-btn"
            >
              {isConnectingRound ? 'Connecting...' : 'Create Shared Round'}
            </button>
            <button
              onClick={joinSharedRound}
              disabled={isConnectingRound || !roundCodeInput.trim() || !isFirebaseConfigured}
              className="share-btn"
            >
              Join Shared Round
            </button>
          </div>

          {sharedRoundId && (
            <div className="setup-round-code-panel">
              <span>Share this code with players:</span>
              <strong className="setup-round-code">{sharedRoundId}</strong>
              <button onClick={copyRoundCode} className="copy-round-code-btn">
                Copy Code
              </button>
            </div>
          )}

          {shareNotice && <p className="share-notice">{shareNotice}</p>}

          {!isFirebaseConfigured && (
            <p className="sync-note">Configure Firebase in .env.local to enable shared rounds.</p>
          )}
          {syncError && <p className="sync-error">{syncError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <img src={golphyBanner} width="139" alt="Golphy Logo" className="logo" />
      </div>

      {sharedRoundId && (
        <div className="shared-round-banner">
          <div className="shared-round-code-wrap">
            <span>Share this code with players:</span>
            <strong className="shared-round-code">{sharedRoundId}</strong>
          </div>
          <button onClick={copyRoundCode} className="copy-round-code-btn">
            Copy Code
          </button>
          {syncError && <span className="sync-error">Sync issue: {syncError}</span>}
        </div>
      )}

      {shareNotice && <p className="share-notice">{shareNotice}</p>}

      <div className="view-toggle">
        <button 
          onClick={() => setShowTable(false)}
          className={!showTable ? 'active' : ''}
        >
          Quick Entry
        </button>
        <button 
          onClick={() => setShowTable(true)}
          className={showTable ? 'active' : ''}
        >
          Full Scorecard
        </button>
      </div>

      {!showTable ? (
        <ScoreCard
          players={gameState.players}
          scores={gameState.scores}
          currentHole={gameState.currentHole}
          onScoreUpdate={updateScore}
          onNextHole={nextHole}
          onPrevHole={prevHole}
          totalHoles={gameState.totalHoles}
        />
      ) : (
        <ScoreTable
          players={gameState.players}
          scores={gameState.scores}
          totalHoles={gameState.totalHoles}
          parValues={DEFAULT_PAR}
          onScoreUpdate={updateScore}
        />
      )}
    </div>
  );
}

export default App
