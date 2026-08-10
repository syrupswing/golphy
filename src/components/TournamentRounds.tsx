import { useState } from 'react';
import type {
  PlayerProfile,
  Tournament,
  TournamentEntry,
  TournamentMatchup,
  TournamentMatchupFormat,
  TournamentSessionFormat,
  TournamentSession,
} from '../types/index.ts';
import {
  calculateStandings,
  createEmptyMatchup,
  createSessionWithConfig,
  getSessionFormatLabel,
  getSessionFormatPlayerCount,
  getTournamentSessionFormats,
  HOLES_PER_MATCH,
  POINTS_FOR_TIE,
  POINTS_FOR_WIN,
  resolveMatchup,
} from '../tournaments/scoring';
import './TournamentRounds.scss';

interface TournamentSessionsEditorProps {
  entries: TournamentEntry[];
  sessions: TournamentSession[];
  sessionFormats?: TournamentSessionFormat[];
  playerProfiles: PlayerProfile[];
  onChange: (sessions: TournamentSession[]) => void;
}

export default function TournamentSessionsEditor({
  entries,
  sessions,
  sessionFormats = [],
  playerProfiles,
  onChange,
}: TournamentSessionsEditorProps) {
  const formatOptions = getTournamentSessionFormats(sessionFormats);
  const [isSessionFormOpen, setIsSessionFormOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionFormat, setNewSessionFormat] = useState<TournamentMatchupFormat>(
    formatOptions[0]?.id ?? 'singles'
  );

  const getPlayerName = (playerId: string) => {
    const profile = playerProfiles.find((p) => p.id === playerId);
    if (!profile) return 'Unknown player';
    return profile.nickname?.trim() || `${profile.firstName} ${profile.lastName}`;
  };

  const getEntryName = (entryId: string, fallback = 'Pick a team') => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return fallback;
    return entry.name.trim() || getPlayerName(entry.playerIds[0] ?? '');
  };

  const updateSession = (sessionId: string, updater: (session: TournamentSession) => TournamentSession) => {
    onChange(sessions.map((session) => (session.id === sessionId ? updater(session) : session)));
  };

  const updateMatchup = (
    sessionId: string,
    matchupId: string,
    updater: (matchup: TournamentMatchup) => TournamentMatchup
  ) => {
    updateSession(sessionId, (session) => ({
      ...session,
      matchups: session.matchups.map((matchup) =>
        matchup.id === matchupId ? updater(matchup) : matchup
      ),
    }));
  };

  const openSessionForm = () => {
    setNewSessionName(`Session ${sessions.length + 1}`);
    setNewSessionFormat(formatOptions[0]?.id ?? 'singles');
    setIsSessionFormOpen(true);
  };

  const cancelSessionForm = () => {
    setIsSessionFormOpen(false);
    setNewSessionName('');
    setNewSessionFormat(formatOptions[0]?.id ?? 'singles');
  };

  const addSession = () => {
    const sessionName = newSessionName.trim();
    if (!sessionName) {
      return;
    }

    onChange([
      ...sessions,
      createSessionWithConfig(
        sessions.length,
        sessionName,
        newSessionFormat
      ),
    ]);

    cancelSessionForm();
  };

  const removeSession = (sessionId: string) => {
    onChange(sessions.filter((session) => session.id !== sessionId));
  };

  const changeSessionFormat = (sessionId: string, format: TournamentMatchupFormat) => {
    updateSession(sessionId, (session) => ({
      ...session,
      format,
      // Trim every match roster to the selected session format.
      matchups: session.matchups.map((matchup) => ({
        ...matchup,
        sides: matchup.sides.map((side) => ({
          ...side,
          playerIds: side.playerIds.slice(0, getSessionFormatPlayerCount(format, sessionFormats)),
        })),
      })),
    }));
  };

  const setSideEntry = (
    sessionId: string,
    matchupId: string,
    sideIndex: number,
    entryId: string
  ) => {
    updateMatchup(sessionId, matchupId, (matchup) => ({
      ...matchup,
      sides: matchup.sides.map((side, index) =>
        index === sideIndex ? { ...side, entryId, playerIds: [] } : side
      ),
    }));
  };

  const toggleSidePlayer = (
    sessionId: string,
    matchupId: string,
    sideIndex: number,
    playerId: string
  ) => {
    updateMatchup(sessionId, matchupId, (matchup) => {
      const session = sessions.find((item) => item.id === sessionId);
      const limit = getSessionFormatPlayerCount(session?.format ?? 'singles', sessionFormats);

      return {
        ...matchup,
        sides: matchup.sides.map((side, index) => {
          if (index !== sideIndex) return side;

          if (side.playerIds.includes(playerId)) {
            return { ...side, playerIds: side.playerIds.filter((id) => id !== playerId) };
          }

          const playerIds =
            limit === 1 ? [playerId] : [...side.playerIds, playerId].slice(-limit);
          return { ...side, playerIds };
        }),
      };
    });
  };

  const setHoleScore = (
    sessionId: string,
    matchupId: string,
    sideIndex: number,
    hole: number,
    value: string
  ) => {
    const parsed = value === '' ? 0 : parseInt(value);
    if (isNaN(parsed) || parsed < 0) return;

    updateMatchup(sessionId, matchupId, (matchup) => ({
      ...matchup,
      sides: matchup.sides.map((side, index) => {
        if (index !== sideIndex) return side;
        const scores = Array.from({ length: HOLES_PER_MATCH }, (_, i) => side.scores[i] ?? 0);
        scores[hole] = parsed;
        return { ...side, scores };
      }),
    }));
  };

  const standings = calculateStandings({ entries, sessions } as Tournament);

  return (
    <div className="tournament-rounds">
      <div className="tournament-rounds-header">
        <p className="tournament-rounds-title">Sessions and matches</p>
        <p className="tournament-rounds-copy">
          Each nine-hole match is worth {POINTS_FOR_WIN} points to the winning side, or{' '}
          {POINTS_FOR_TIE} point each if halved.
        </p>
      </div>

      {sessions.map((session) => (
        <div key={session.id} className="tournament-round">
          <div className="tournament-round-header">
            <input
              type="text"
              value={session.name}
              onChange={(e) =>
                updateSession(session.id, (current) => ({ ...current, name: e.target.value }))
              }
              placeholder="Session name"
              maxLength={40}
              aria-label="Session name"
            />
            <button type="button" className="tournament-round-remove" onClick={() => removeSession(session.id)}>
              Remove session
            </button>
          </div>

          <label className="tournament-round-link">
            <span>Session format</span>
            <select
              value={session.format}
              onChange={(e) => changeSessionFormat(session.id, e.target.value as TournamentMatchupFormat)}
            >
              {formatOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          {session.matchups.map((matchup, matchupIndex) => {
            const result = resolveMatchup(matchup, session.format, sessionFormats);

            return (
              <div key={matchup.id} className="tournament-matchup">
                <div className="tournament-matchup-top">
                  <span className="tournament-matchup-index">Match {matchupIndex + 1}</span>
                  <span className="game-format">{getSessionFormatLabel(session.format, sessionFormats)}</span>
                  <button
                    type="button"
                    className="tournament-matchup-remove"
                    onClick={() =>
                      updateSession(session.id, (current) => ({
                        ...current,
                        matchups: current.matchups.filter((m) => m.id !== matchup.id),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>

                {matchup.sides.map((side, sideIndex) => {
                  const entry = entries.find((e) => e.id === side.entryId);
                  const limit = getSessionFormatPlayerCount(session.format, sessionFormats);
                  const isWinner = result.winningSideIndex === sideIndex;

                  return (
                    <div
                      key={sideIndex}
                      className={`tournament-side${isWinner ? ' is-winner' : ''}`}
                    >
                      <select
                        value={side.entryId}
                        onChange={(e) =>
                          setSideEntry(session.id, matchup.id, sideIndex, e.target.value)
                        }
                        aria-label={`Match ${matchupIndex + 1} side ${sideIndex + 1} team`}
                      >
                        <option value="">Pick a team</option>
                        {entries.map((option) => (
                          <option key={option.id} value={option.id}>
                            {getEntryName(option.id)}
                          </option>
                        ))}
                      </select>

                      {entry && (
                        <div className="tournament-side-players">
                          {entry.playerIds.map((playerId) => {
                            const isSelected = side.playerIds.includes(playerId);
                            const tier = entry.playerTiers?.[playerId];

                            return (
                              <button
                                key={playerId}
                                type="button"
                                className={`tournament-side-chip${isSelected ? ' selected' : ''}`}
                                onClick={() =>
                                  toggleSidePlayer(session.id, matchup.id, sideIndex, playerId)
                                }
                              >
                                {getPlayerName(playerId)}
                                {tier && <span className="tournament-side-tier">{tier}</span>}
                              </button>
                            );
                          })}
                          <span className="tournament-side-count">
                            {side.playerIds.length}/{limit}
                          </span>
                        </div>
                      )}

                      <div className="tournament-side-scores">
                        {Array.from({ length: HOLES_PER_MATCH }, (_, hole) => (
                          <label key={hole} className="tournament-score-cell">
                            <span>{hole + 1}</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={20}
                              value={side.scores[hole] || ''}
                              onChange={(e) =>
                                setHoleScore(session.id, matchup.id, sideIndex, hole, e.target.value)
                              }
                              aria-label={`Match ${matchupIndex + 1} side ${sideIndex + 1} hole ${hole + 1}`}
                            />
                          </label>
                        ))}
                        <span className="tournament-side-total">
                          {result.totals[sideIndex] || '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}

                <p className="tournament-matchup-result">
                  {result.holesPlayed === 0
                    ? 'No scores yet'
                    : result.isTie
                      ? `Halved · ${POINTS_FOR_TIE} point each · ${result.summary}`
                      : `${getEntryName(matchup.sides[result.winningSideIndex ?? 0].entryId, 'Leading side')} +${POINTS_FOR_WIN} · ${result.summary}`}
                  {result.holesPlayed > 0 && !result.isComplete && ' (in progress)'}
                </p>

                <label
                  className={`tournament-confirm${matchup.confirmed ? ' is-confirmed' : ''}`}
                  title={
                    result.isComplete
                      ? 'Counts toward the official leaderboard'
                      : 'Enter all nine holes before confirming'
                  }
                >
                  <input
                    type="checkbox"
                    checked={Boolean(matchup.confirmed)}
                    disabled={!result.isComplete}
                    onChange={(e) =>
                      updateMatchup(session.id, matchup.id, (current) => ({
                        ...current,
                        confirmed: e.target.checked,
                      }))
                    }
                  />
                  {matchup.confirmed ? 'Result confirmed' : 'Confirm result'}
                </label>
              </div>
            );
          })}

          <button
            type="button"
            className="tournament-add-game"
            onClick={() =>
              updateSession(session.id, (current) => ({
                ...current,
                matchups: [...current.matchups, createEmptyMatchup()],
              }))
            }
          >
            Add match
          </button>
        </div>
      ))}

      {isSessionFormOpen ? (
        <div className="tournament-session-create-form">
          <input
            type="text"
            value={newSessionName}
            onChange={(event) => setNewSessionName(event.target.value)}
            placeholder="Session name"
            maxLength={40}
            aria-label="Session name"
          />
          <select
            value={newSessionFormat}
            onChange={(event) => setNewSessionFormat(event.target.value as TournamentMatchupFormat)}
            aria-label="Session format"
          >
            {formatOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <div className="tournament-session-create-actions">
            <button type="button" className="tournament-add-round" onClick={addSession}>
              Create session
            </button>
            <button type="button" className="tournament-add-round is-secondary" onClick={cancelSessionForm}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="tournament-add-round" onClick={openSessionForm}>
          Add session
        </button>
      )}

      {standings.length > 0 && (
        <div className="tournament-standings">
          <p className="tournament-rounds-title">Tournament standings</p>
          <table>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Pts</th>
                <th scope="col">W</th>
                <th scope="col">H</th>
                <th scope="col">L</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.entryId}>
                  <td>{getEntryName(row.entryId, 'Unknown')}</td>
                  <td className="is-points">{row.points}</td>
                  <td>{row.wins}</td>
                  <td>{row.ties}</td>
                  <td>{row.losses}</td>
                </tr>
              ))}            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
