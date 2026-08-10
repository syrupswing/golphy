import { useEffect, useState } from 'react';
import type { PlayerProfile, Tournament, TournamentSessionFormat } from '../types/index.ts';
import type { TournamentMatchupFormat } from '../types/index.ts';
import { saveTournamentSessions, subscribeToTournament } from '../firebase/tournaments';
import {
  calculateStandings,
  createSessionWithConfig,
  POINTS_FOR_TIE,
  POINTS_FOR_WIN,
  getSessionFormatLabel,
  getTournamentSessionFormats,
  resolveMatchup,
} from '../tournaments/scoring';
import './TournamentDashboard.scss';

interface TournamentDashboardProps {
  tournamentId: string;
  initialTournament?: Tournament | null;
  sessionFormats?: TournamentSessionFormat[];
  playerProfiles: PlayerProfile[];
  clientId: string;
  onManage: () => void;
}

export default function TournamentDashboard({
  tournamentId,
  initialTournament,
  sessionFormats = [],
  playerProfiles,
  clientId,
  onManage,
}: TournamentDashboardProps) {
  const [tournament, setTournament] = useState<Tournament | null>(initialTournament ?? null);
  const [error, setError] = useState('');
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [isDeletingSessionId, setIsDeletingSessionId] = useState<string | null>(null);
  const [isSessionFormOpen, setIsSessionFormOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionFormat, setNewSessionFormat] = useState<TournamentMatchupFormat>('singles');

  useEffect(() => {
    const unsubscribe = subscribeToTournament(
      tournamentId,
      (next) => {
        setTournament(next);
        setError('');
      },
      (subscriptionError) => setError(subscriptionError.message)
    );

    return unsubscribe;
  }, [tournamentId]);

  const getPlayerName = (playerId: string) => {
    const profile = playerProfiles.find((p) => p.id === playerId);
    if (!profile) return 'Unknown player';
    return profile.nickname?.trim() || `${profile.firstName} ${profile.lastName}`;
  };

  const getEntryName = (entryId: string) => {
    const entry = tournament?.entries.find((e) => e.id === entryId);
    if (!entry) return 'Unassigned';
    return entry.name.trim() || getPlayerName(entry.playerIds[0] ?? '');
  };

  const openSessionForm = () => {
    if (!tournament) return;

    const existingSessions = tournament.sessions ?? tournament.rounds ?? [];
    const formatOptions = getTournamentSessionFormats(sessionFormats);
    setNewSessionName(`Session ${existingSessions.length + 1}`);
    setNewSessionFormat(formatOptions[0]?.id ?? 'singles');
    setError('');
    setIsSessionFormOpen(true);
  };

  const cancelSessionForm = () => {
    setIsSessionFormOpen(false);
    setNewSessionName('');
    setNewSessionFormat(getTournamentSessionFormats(sessionFormats)[0]?.id ?? 'singles');
  };

  const addSession = async () => {
    if (!tournament) return;

    const sessionName = newSessionName.trim();
    if (!sessionName) {
      setError('Enter a session name.');
      return;
    }

    setIsAddingSession(true);
    setError('');

    const existingSessions = tournament.sessions ?? tournament.rounds ?? [];

    const nextSessions = [
      ...existingSessions,
      createSessionWithConfig(existingSessions.length, sessionName, newSessionFormat),
    ];

    try {
      // Write straight through so a session can be added mid-tournament without opening the editor.
      await saveTournamentSessions(tournamentId, nextSessions, clientId);
      setTournament({ ...tournament, sessions: nextSessions, rounds: nextSessions });
      cancelSessionForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not add the session.');
    } finally {
      setIsAddingSession(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!tournament) {
      return;
    }

    const session = (tournament.sessions ?? tournament.rounds ?? []).find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    const confirmed = window.confirm(`Delete ${session.name}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setIsDeletingSessionId(sessionId);
    setError('');

    const nextSessions = (tournament.sessions ?? tournament.rounds ?? []).filter((item) => item.id !== sessionId);

    try {
      await saveTournamentSessions(tournamentId, nextSessions, clientId);
      setTournament({ ...tournament, sessions: nextSessions, rounds: nextSessions });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not delete the session.');
    } finally {
      setIsDeletingSessionId(null);
    }
  };

  if (!tournament) {
    return (
      <div className="tournament-dashboard">
        <p className="tournament-dashboard-empty">
          {error || 'Loading tournament...'}
        </p>
      </div>
    );
  }

  const standings = calculateStandings(tournament);
  const sessions = tournament.sessions ?? tournament.rounds ?? [];
  const allFormats = getTournamentSessionFormats(sessionFormats);
  const totalMatches = sessions.reduce((sum, session) => sum + session.matchups.length, 0);
  const confirmedMatches = sessions.reduce(
    (sum, session) => sum + session.matchups.filter((matchup) => matchup.confirmed).length,
    0
  );
  const leader = standings[0];
  const isOutrightLeader = Boolean(leader && (standings[1]?.points ?? -1) < leader.points);

  return (
    <div className="tournament-dashboard">
      <div className="tournament-dashboard-header">
        <div>
          <h2>{tournament.name}</h2>
          <p>
            {tournament.entries.length} {tournament.format === 'team' ? 'teams' : 'players'} ·{' '}
            {sessions.length} session{sessions.length === 1 ? '' : 's'} · {totalMatches} match
            {totalMatches === 1 ? '' : 'es'}
          </p>
        </div>
        <div className="tournament-dashboard-header-actions">
          <button type="button" className="tournament-dashboard-manage" onClick={onManage}>
            Manage tournament
          </button>
        </div>
      </div>
      {error && <p className="tournament-dashboard-error">{error}</p>}

      <section className="tournament-dashboard-section">
        <h3>Leaderboard</h3>

        <p className="tournament-dashboard-note">
          {confirmedMatches} of {totalMatches} match{totalMatches === 1 ? '' : 'es'} confirmed.
          {leader && confirmedMatches > 0 && (
            <>
              {' '}
              {isOutrightLeader
                ? `${getEntryName(leader.entryId)} leads with ${leader.points}.`
                : `Tied at the top on ${leader.points}.`}
            </>
          )}
        </p>

        <table className="tournament-dashboard-standings">
          <thead>
            <tr>
              <th scope="col">{tournament.format === 'team' ? 'Team' : 'Player'}</th>
              <th scope="col">Pts</th>
              <th scope="col">Proj</th>
              <th scope="col">W</th>
              <th scope="col">H</th>
              <th scope="col">L</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.entryId}>
                <td>{getEntryName(row.entryId)}</td>
                <td className="is-points">{row.points}</td>
                <td className="is-projected">
                  {row.projectedPoints > row.points ? row.projectedPoints : '—'}
                </td>
                <td>{row.wins}</td>
                <td>{row.ties}</td>
                <td>{row.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {sessions.length === 0 && (
        <p className="tournament-dashboard-empty">
          No sessions yet. Add one to start scoring matches.
        </p>
      )}

      {sessions.map((session) => {
        return (
        <section key={session.id} className="tournament-dashboard-section">
          <div className="tournament-session-header">
            <h3>
              {session.name}
              <span className="tournament-dashboard-code">
                {getSessionFormatLabel(session.format, sessionFormats)}
              </span>
            </h3>
            <div className="tournament-session-actions">
              <button
                type="button"
                className="tournament-session-icon-btn"
                onClick={onManage}
                aria-label={`Edit ${session.name}`}
                title="Edit session"
              >
                <i className="bi bi-pencil" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="tournament-session-icon-btn is-danger"
                onClick={() => void deleteSession(session.id)}
                disabled={isDeletingSessionId === session.id}
                aria-label={`Delete ${session.name}`}
                title="Delete session"
              >
                <i className="bi bi-trash" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="tournament-dashboard-games">
            {session.matchups.map((matchup, index) => {
              const result = resolveMatchup(matchup, session.format, sessionFormats);
              const status =
                result.holesPlayed === 0
                  ? 'Not started'
                  : matchup.confirmed
                    ? 'Confirmed'
                    : result.isComplete
                      ? 'Awaiting confirmation'
                      : `Thru ${result.holesPlayed}`;

              return (
                <div
                  key={matchup.id}
                  className="tournament-dashboard-game"
                >
                  <header>
                    <span className="game-index">Match {index + 1}</span>
                    <span className="game-format">
                      {getSessionFormatLabel(session.format, sessionFormats)}
                    </span>
                    <span
                      className={`game-status${matchup.confirmed ? ' is-confirmed' : result.holesPlayed > 0 && !result.isComplete ? ' is-live' : ''}`}
                    >
                      {status}
                    </span>
                  </header>

                  {matchup.sides.map((side, sideIndex) => {
                    const isWinner = result.winningSideIndex === sideIndex;

                    return (
                      <div
                        key={sideIndex}
                        className={`game-side${isWinner ? ' is-winner' : ''}`}
                      >
                        <div className="game-side-names">
                          <span className="game-side-team">{getEntryName(side.entryId)}</span>
                          <span className="game-side-players">
                            {side.playerIds.length
                              ? side.playerIds.map(getPlayerName).join(' & ')
                              : 'No players yet'}
                          </span>
                        </div>
                        <div className="game-side-numbers">
                          <span className="game-side-holes">{result.holesWon[sideIndex]}</span>
                          <span className="game-side-total">{result.totals[sideIndex] || '—'}</span>
                        </div>
                      </div>
                    );
                  })}

                  <footer>
                    <span>
                      {result.holesPlayed === 0
                        ? 'Awaiting scores'
                        : result.isTie
                          ? `Halved · ${POINTS_FOR_TIE} point each`
                          : `${getEntryName(matchup.sides[result.winningSideIndex ?? 0].entryId)} ${result.summary} · +${POINTS_FOR_WIN}`}
                      {result.holesPlayed > 0 && !matchup.confirmed && ' (provisional)'}
                    </span>
                  </footer>
                </div>
              );
            })}
          </div>
        </section>
        );
      })}

      <div className="tournament-dashboard-actions">
        {isSessionFormOpen ? (
          <div className="tournament-session-create-form">
            <input
              type="text"
              value={newSessionName}
              onChange={(event) => setNewSessionName(event.target.value)}
              placeholder="Session name"
              maxLength={40}
              aria-label="Session name"
              disabled={isAddingSession}
            />
            <select
              value={newSessionFormat}
              onChange={(event) => setNewSessionFormat(event.target.value as TournamentMatchupFormat)}
              aria-label="Session format"
              disabled={isAddingSession}
            >
              {allFormats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.name}
                </option>
              ))}
            </select>
            <div className="tournament-session-create-actions">
              <button
                type="button"
                className="tournament-dashboard-add-round"
                onClick={() => void addSession()}
                disabled={isAddingSession}
              >
                {isAddingSession ? 'Creating...' : 'Create session'}
              </button>
              <button
                type="button"
                className="tournament-dashboard-add-round is-secondary"
                onClick={cancelSessionForm}
                disabled={isAddingSession}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="tournament-dashboard-add-round"
            onClick={openSessionForm}
          >
            Add session
          </button>
        )}
        <span className="tournament-dashboard-note">
          Set formats, sides and scores in sessions.
        </span>
      </div>
    </div>
  );
}
