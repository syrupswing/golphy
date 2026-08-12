import { useState } from 'react';
import type {
  PlayerProfile,
  Scorecard,
  Tournament,
  TournamentMatchupFormat,
  TournamentSession,
  TournamentSessionFormat,
} from '../types/index.ts';
import {
  getSessionFormatDefinition,
  getSessionFormatLabel,
  getTournamentSessionFormats,
  resolveMatchup,
  SESSION_HOLE_OPTIONS,
} from '../tournaments/scoring';
import { getPlayerDisplayName } from '../tournaments/roundBuilder';
import TournamentMatchBuilder, { type MatchDraft } from './TournamentMatchBuilder';
import './TournamentSessions.scss';

interface TournamentSessionsProps {
  tournament: Tournament;
  sessions: TournamentSession[];
  sessionFormats: TournamentSessionFormat[];
  playerProfiles: PlayerProfile[];
  scorecards: Scorecard[];
  isSaving: boolean;
  error: string;
  onCreateSession: (name: string, format: TournamentMatchupFormat, holes: number) => void;
  onUpdateSession: (
    sessionId: string,
    name: string,
    format: TournamentMatchupFormat,
    holes: number
  ) => void;
  onDeleteSession: (sessionId: string) => void;
  onCreateMatch: (sessionId: string, draft: MatchDraft) => void;
  onToggleConfirmed: (sessionId: string, matchupId: string, confirmed: boolean) => void;
  onOpenRound: (roundId: string) => void;
}

export default function TournamentSessions({
  tournament,
  sessions,
  sessionFormats,
  playerProfiles,
  scorecards,
  isSaving,
  error,
  onCreateSession,
  onUpdateSession,
  onDeleteSession,
  onCreateMatch,
  onToggleConfirmed,
  onOpenRound,
}: TournamentSessionsProps) {
  const formatOptions = getTournamentSessionFormats(sessionFormats);
  const [isSessionFormOpen, setIsSessionFormOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionFormat, setNewSessionFormat] = useState<TournamentMatchupFormat>(
    formatOptions[0]?.id ?? 'singles'
  );
  const [newSessionHoles, setNewSessionHoles] = useState<number>(SESSION_HOLE_OPTIONS[0]);
  const [matchFormSessionId, setMatchFormSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionName, setEditSessionName] = useState('');
  const [editSessionFormat, setEditSessionFormat] = useState<TournamentMatchupFormat>('singles');
  const [editSessionHoles, setEditSessionHoles] = useState<number>(SESSION_HOLE_OPTIONS[0]);

  const getEntryName = (entryId: string) => {
    const entry = tournament.entries.find((item) => item.id === entryId);
    if (!entry) return 'Unassigned';
    return entry.name.trim() || getPlayerDisplayName(entry.playerIds[0] ?? '', playerProfiles);
  };

  const openSessionForm = () => {
    setNewSessionName(`Session ${sessions.length + 1}`);
    setNewSessionFormat(formatOptions[0]?.id ?? 'singles');
    setNewSessionHoles(SESSION_HOLE_OPTIONS[0]);
    setIsSessionFormOpen(true);
  };

  const submitSessionForm = () => {
    onCreateSession(newSessionName, newSessionFormat, newSessionHoles);
    setIsSessionFormOpen(false);
  };

  const openSessionEditor = (session: TournamentSession) => {
    setEditingSessionId(session.id);
    setEditSessionName(session.name);
    setEditSessionFormat(session.format);
    setEditSessionHoles(session.holes);
  };

  const submitSessionEdit = () => {
    if (!editingSessionId) return;

    onUpdateSession(editingSessionId, editSessionName, editSessionFormat, editSessionHoles);
    setEditingSessionId(null);
  };

  return (
    <section className="tournament-sessions">
      <div className="tournament-sessions-header">
        <h3>Sessions</h3>
        {!isSessionFormOpen && (
          <button type="button" className="session-btn is-primary" onClick={openSessionForm}>
            Add session
          </button>
        )}
      </div>

      {error && <p className="session-error">{error}</p>}

      {isSessionFormOpen && (
        <div className="session-form">
          <label className="session-field">
            <span>Session name</span>
            <input
              type="text"
              value={newSessionName}
              onChange={(event) => setNewSessionName(event.target.value)}
              placeholder="Session name"
              maxLength={40}
              disabled={isSaving}
            />
          </label>

          <label className="session-field">
            <span>Format for every match</span>
            <select
              value={newSessionFormat}
              onChange={(event) => setNewSessionFormat(event.target.value)}
              disabled={isSaving}
            >
              {formatOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="session-field">
            <span>Holes per match</span>
            <select
              value={newSessionHoles}
              onChange={(event) => setNewSessionHoles(Number(event.target.value))}
              disabled={isSaving}
            >
              {SESSION_HOLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} holes
                </option>
              ))}
            </select>
          </label>

          <div className="session-form-actions">
            <button
              type="button"
              className="session-btn is-primary"
              onClick={submitSessionForm}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Create session'}
            </button>
            <button
              type="button"
              className="session-btn"
              onClick={() => setIsSessionFormOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {sessions.length === 0 && !isSessionFormOpen && (
        <p className="session-empty">No sessions yet. Add one to start building matches.</p>
      )}

      {sessions.map((session) => {
        const formatDefinition = getSessionFormatDefinition(session.format, sessionFormats);
        const isEditing = editingSessionId === session.id;
        // Matches are already built as rounds, so format and length are locked once one exists.
        const canChangeSetup = session.matchups.length === 0;

        return (
          <article key={session.id} className="session-card">
            <div className="session-card-header">
              <div>
                <h4>{session.name}</h4>
                <span className="session-card-meta">
                  {getSessionFormatLabel(session.format, sessionFormats)} · {session.holes} holes ·{' '}
                  {session.matchups.length} match{session.matchups.length === 1 ? '' : 'es'}
                </span>
              </div>
              <div className="session-card-actions">
                <button
                  type="button"
                  className="session-btn is-compact"
                  onClick={() =>
                    setMatchFormSessionId(matchFormSessionId === session.id ? null : session.id)
                  }
                  disabled={isSaving}
                  title="Add match"
                >
                  <i className="bi bi-plus-lg" aria-hidden="true" />
                  Match
                </button>
                <button
                  type="button"
                  className="session-icon-btn"
                  onClick={() => (isEditing ? setEditingSessionId(null) : openSessionEditor(session))}
                  disabled={isSaving}
                  aria-label={`Edit ${session.name}`}
                  title="Edit session"
                >
                  <i className="bi bi-pencil" aria-hidden="true" />
                </button>
              </div>
            </div>

            {isEditing && (
              <div className="session-form">
                <label className="session-field">
                  <span>Session name</span>
                  <input
                    type="text"
                    value={editSessionName}
                    onChange={(event) => setEditSessionName(event.target.value)}
                    placeholder="Session name"
                    maxLength={40}
                    disabled={isSaving}
                  />
                </label>

                <label className="session-field">
                  <span>Format for every match</span>
                  <select
                    value={editSessionFormat}
                    onChange={(event) => setEditSessionFormat(event.target.value)}
                    disabled={isSaving || !canChangeSetup}
                  >
                    {formatOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="session-field">
                  <span>Holes per match</span>
                  <select
                    value={editSessionHoles}
                    onChange={(event) => setEditSessionHoles(Number(event.target.value))}
                    disabled={isSaving || !canChangeSetup}
                  >
                    {SESSION_HOLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option} holes
                      </option>
                    ))}
                  </select>
                </label>

                {!canChangeSetup && (
                  <p className="session-empty">
                    Remove every match before changing the format or hole count.
                  </p>
                )}

                <div className="session-form-actions">
                  <button
                    type="button"
                    className="session-btn is-primary"
                    onClick={submitSessionEdit}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save session'}
                  </button>
                  <button
                    type="button"
                    className="session-btn"
                    onClick={() => setEditingSessionId(null)}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                </div>

                <button
                  type="button"
                  className="session-btn is-danger"
                  onClick={() => {
                    setEditingSessionId(null);
                    onDeleteSession(session.id);
                  }}
                  disabled={isSaving}
                >
                  Delete session
                </button>
              </div>
            )}

            {session.matchups.length === 0 && (
              <p className="session-empty">No matches yet.</p>
            )}

            {session.matchups.map((matchup, index) => {
              const result = resolveMatchup(matchup, session.format, sessionFormats, {
                playerProfiles,
                holesInMatch: session.holes,
                scoresAreNet: true,
              });

              const usesNetTotals =
                formatDefinition.resultMode === 'net-total' ||
                formatDefinition.baseFormat === 'stroke';

              const status =
                result.holesPlayed === 0
                  ? 'Not started'                  : matchup.confirmed
                    ? 'Confirmed'
                    : result.isComplete
                      ? 'Awaiting confirmation'
                      : `Thru ${result.holesPlayed}`;

              return (
                <div key={matchup.id} className="session-match">
                  <div className="session-match-top">
                    <span className="session-match-name">
                      {matchup.name?.trim() || `Match ${index + 1}`}
                    </span>
                    <span
                      className={`session-match-status${matchup.confirmed ? ' is-confirmed' : ''}`}
                    >
                      {status}
                    </span>
                  </div>

                  {matchup.sides.map((side, sideIndex) => (
                    <div
                      key={sideIndex}
                      className={`session-match-side${result.winningSideIndexes.includes(sideIndex) && !result.isTie ? ' is-winner' : ''}`}
                    >
                      <span className="session-match-team">{getEntryName(side.entryId)}</span>
                      <span className="session-match-players">
                        {side.playerIds.length
                          ? side.playerIds
                              .map((playerId) => getPlayerDisplayName(playerId, playerProfiles))
                              .join(' & ')
                          : 'No players'}
                      </span>
                      <span className="session-match-total">
                        {usesNetTotals
                          ? result.totals[sideIndex] || '—'
                          : result.holesWon[sideIndex]}
                      </span>
                    </div>
                  ))}

                  <div className="session-match-actions">
                    {matchup.roundId && (
                      <button
                        type="button"
                        className="session-btn is-primary"
                        onClick={() => onOpenRound(matchup.roundId as string)}
                      >
                        Open round
                      </button>
                    )}
                    <label className="session-confirm">
                      <input
                        type="checkbox"
                        checked={Boolean(matchup.confirmed)}
                        disabled={!result.isComplete || isSaving}
                        onChange={(event) =>
                          onToggleConfirmed(session.id, matchup.id, event.target.checked)
                        }
                      />
                      Sign card / confirm results
                    </label>
                  </div>
                </div>
              );
            })}

            {matchFormSessionId === session.id && (
              <TournamentMatchBuilder
                session={session}
                formatDefinition={formatDefinition}
                entries={tournament.entries}
                playerProfiles={playerProfiles}
                scorecards={scorecards}
                defaultName={`Match ${session.matchups.length + 1}`}
                isSaving={isSaving}
                onCancel={() => setMatchFormSessionId(null)}
                onCreate={(draft) => {
                  onCreateMatch(session.id, draft);
                  setMatchFormSessionId(null);
                }}
              />
            )}
          </article>
        );
      })}
    </section>
  );
}
