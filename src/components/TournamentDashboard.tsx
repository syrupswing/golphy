import { useEffect, useMemo, useState } from 'react';
import type {
  GameState,
  PlayerProfile,
  Scorecard,
  Tournament,
  TournamentMatchupFormat,
  TournamentSession,
  TournamentSessionFormat,
} from '../types/index.ts';
import { saveTournamentSessions, subscribeToTournament } from '../firebase/tournaments';
import { createRound, loadRound } from '../firebase/rounds';
import {
  buildMatchRoundScores,
  calculateStandings,
  createSessionWithConfig,
  getSessionFormatDefinition,
} from '../tournaments/scoring';
import { buildMatchRoundState } from '../tournaments/roundBuilder';
import { buildLeaderboard, buildStandingsBoard, type LeaderboardScope } from '../tournaments/leaderboard';
import TournamentSessions from './TournamentSessions';
import TournamentLeaderboard from './TournamentLeaderboard';
import type { MatchDraft } from './TournamentMatchBuilder';
import './TournamentDashboard.scss';

interface TournamentDashboardProps {
  tournamentId: string;
  initialTournament?: Tournament | null;
  sessionFormats?: TournamentSessionFormat[];
  playerProfiles: PlayerProfile[];
  scorecards: Scorecard[];
  clientId: string;
  leaderboardScope?: LeaderboardScope | null;
  onCloseLeaderboard?: () => void;
  onManage: () => void;
  onOpenRound: (roundId: string) => void;
}

export default function TournamentDashboard({
  tournamentId,
  initialTournament,
  sessionFormats = [],
  playerProfiles,
  scorecards,
  clientId,
  leaderboardScope = null,
  onCloseLeaderboard,
  onManage,
  onOpenRound,
}: TournamentDashboardProps) {
  const [tournament, setTournament] = useState<Tournament | null>(initialTournament ?? null);
  const [error, setError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [roundStates, setRoundStates] = useState<Record<string, GameState>>({});

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

  const storedSessions = useMemo<TournamentSession[]>(
    () => tournament?.sessions ?? tournament?.rounds ?? [],
    [tournament]
  );

  const roundIdKey = useMemo(
    () =>
      storedSessions
        .flatMap((session) => session.matchups.map((matchup) => matchup.roundId ?? ''))
        .filter(Boolean)
        .sort()
        .join(','),
    [storedSessions]
  );

  // Matches are played as normal rounds, so pull their live scores back for the leaderboard.
  useEffect(() => {
    const roundIds = roundIdKey ? roundIdKey.split(',') : [];

    if (!roundIds.length) {
      setRoundStates({});
      return;
    }

    let cancelled = false;

    void Promise.all(
      roundIds.map(async (roundId) => {
        try {
          return [roundId, await loadRound(roundId)] as const;
        } catch {
          return [roundId, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;

      const next: Record<string, GameState> = {};
      entries.forEach(([roundId, state]) => {
        if (state) next[roundId] = state;
      });
      setRoundStates(next);
    });

    return () => {
      cancelled = true;
    };
  }, [roundIdKey]);

  const sessions = useMemo<TournamentSession[]>(
    () =>
      storedSessions.map((session) => {
        const format = getSessionFormatDefinition(session.format, sessionFormats);

        return {
          ...session,
          matchups: session.matchups.map((matchup) => {
            const roundState = matchup.roundId ? roundStates[matchup.roundId] : undefined;
            if (!roundState) return matchup;

            // The round carries the player handicaps actually used for scoring.
            const handicapOf = (playerId: string): number | null => {
              const fromRound = roundState.players.find((player) => player.id === playerId)?.handicap;
              if (Number.isFinite(fromRound)) return fromRound as number;

              const fromProfile = playerProfiles.find((profile) => profile.id === playerId)?.handicap;
              return Number.isFinite(fromProfile) ? (fromProfile as number) : null;
            };

            const { sideScores } = buildMatchRoundScores(
              matchup,
              format,
              session.holes,
              roundState.scores,
              roundState.holeDetails,
              handicapOf
            );

            return {
              ...matchup,
              sides: matchup.sides.map((side, sideIndex) => ({
                ...side,
                scores: sideScores[sideIndex] ?? side.scores,
              })),
            };
          }),
        };
      }),
    [storedSessions, roundStates, sessionFormats, playerProfiles]
  );

  const persistSessions = async (nextSessions: TournamentSession[]) => {
    setIsSaving(true);
    setSessionError('');

    try {
      await saveTournamentSessions(tournamentId, nextSessions, clientId);
    } catch (saveError) {
      setSessionError(saveError instanceof Error ? saveError.message : 'Could not save sessions.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateSession = (name: string, format: TournamentMatchupFormat, holes: number) => {
    void persistSessions([
      ...sessions,
      createSessionWithConfig(sessions.length, name, format, holes),
    ]);
  };

  const handleUpdateSession = (
    sessionId: string,
    name: string,
    format: TournamentMatchupFormat,
    holes: number
  ) => {
    void persistSessions(
      sessions.map((session) =>
        session.id === sessionId
          ? { ...session, name: name.trim() || session.name, format, holes }
          : session
      )
    );
  };

  const handleDeleteSession = (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;

    if (!window.confirm(`Delete ${session.name}? This cannot be undone.`)) {
      return;
    }

    void persistSessions(sessions.filter((item) => item.id !== sessionId));
  };

  const handleToggleConfirmed = (sessionId: string, matchupId: string, confirmed: boolean) => {
    void persistSessions(
      sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              matchups: session.matchups.map((matchup) =>
                matchup.id === matchupId ? { ...matchup, confirmed } : matchup
              ),
            }
          : session
      )
    );
  };

  const handleCreateMatch = async (sessionId: string, draft: MatchDraft) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session || !tournament) return;

    setIsSaving(true);
    setSessionError('');

    try {
      const roundState = buildMatchRoundState({
        sides: draft.sides,
        entries: tournament.entries,
        playerProfiles,
        formatDefinition: getSessionFormatDefinition(session.format, sessionFormats),
        scorecard: draft.scorecard,
        setIndexes: draft.setIndexes,
        holes: session.holes,
        matchName: draft.name,
      });

      const roundId = await createRound(roundState, clientId);

      await saveTournamentSessions(
        tournamentId,
        sessions.map((item) =>
          item.id === sessionId
            ? {
                ...item,
                matchups: [
                  ...item.matchups,
                  {
                    id: roundId,
                    confirmed: false,
                    roundId,
                    name: draft.name,
                    scorecardName: draft.scorecard.name,
                    sides: draft.sides,
                  },
                ],
              }
            : item
        ),
        clientId
      );
    } catch (createError) {
      setSessionError(
        createError instanceof Error ? createError.message : 'Could not create the match.'
      );
    } finally {
      setIsSaving(false);
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

  const getPlayerName = (playerId: string) => {
    const profile = playerProfiles.find((p) => p.id === playerId);
    if (!profile) return 'Unknown player';
    return profile.nickname?.trim() || `${profile.firstName} ${profile.lastName}`;
  };

  const getEntryName = (entryId: string) => {
    const entry = tournament.entries.find((e) => e.id === entryId);
    if (!entry) return 'Unassigned';
    return entry.name.trim() || getPlayerName(entry.playerIds[0] ?? '');
  };

  const standings = calculateStandings(
    { ...tournament, sessions },
    { playerProfiles, scoresAreNet: true }
  );  const totalMatches = sessions.reduce((sum, session) => sum + session.matchups.length, 0);
  const confirmedMatches = sessions.reduce(
    (sum, session) => sum + session.matchups.filter((matchup) => matchup.confirmed).length,
    0
  );
  const leader = standings[0];
  const isOutrightLeader = Boolean(leader && (standings[1]?.points ?? -1) < leader.points);

  if (leaderboardScope) {
    const board =
      leaderboardScope.type === 'tournament'
        ? buildStandingsBoard(tournament, standings, getEntryName)
        : buildLeaderboard(
            { ...tournament, sessions },
            sessions,
            roundStates,
            leaderboardScope,
            getEntryName
          );

    const scopedRoundId =
      leaderboardScope.type === 'match'
        ? sessions
            .find((session) => session.id === leaderboardScope.sessionId)
            ?.matchups.find((matchup) => matchup.id === leaderboardScope.matchupId)?.roundId
        : undefined;

    return (
      <div className="tournament-dashboard">
        <div className="tournament-dashboard-header">
          <div>
            <p>{board?.title ?? tournament.name}</p>
          </div>
          <div className="tournament-dashboard-header-actions">
            {scopedRoundId && (
              <button
                type="button"
                className="tournament-dashboard-manage"
                onClick={() => onOpenRound(scopedRoundId)}
              >
                View scorecard
              </button>
            )}
            {onCloseLeaderboard && (
              <button type="button" className="tournament-dashboard-manage" onClick={onCloseLeaderboard}>
                Back to tournament
              </button>
            )}
          </div>
        </div>

        <TournamentLeaderboard board={board} />
      </div>
    );
  }

  return (
    <div className="tournament-dashboard">
      <div className="tournament-dashboard-header">
        <div>
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

      <TournamentSessions
        tournament={tournament}
        sessions={sessions}
        sessionFormats={sessionFormats}
        playerProfiles={playerProfiles}
        scorecards={scorecards}
        isSaving={isSaving}
        error={sessionError}
        onCreateSession={handleCreateSession}
        onUpdateSession={handleUpdateSession}
        onDeleteSession={handleDeleteSession}
        onCreateMatch={(sessionId, draft) => void handleCreateMatch(sessionId, draft)}
        onToggleConfirmed={handleToggleConfirmed}
        onOpenRound={onOpenRound}
      />
    </div>
  );
}
