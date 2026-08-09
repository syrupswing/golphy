import type {
  PlayerProfile,
  Tournament,
  TournamentEntry,
  TournamentMatchup,
  TournamentMatchupFormat,
  TournamentRound,
} from '../types/index.ts';
import {
  calculateStandings,
  createEmptyMatchup,
  createEmptyRound,
  HOLES_PER_GAME,
  MATCHUP_FORMAT_LABELS,
  MATCHUP_FORMAT_PLAYER_COUNTS,
  POINTS_FOR_TIE,
  POINTS_FOR_WIN,
  resolveMatchup,
} from '../tournaments/scoring';
import './TournamentRounds.scss';

interface PlayableRound {
  id: string;
  alias?: string;
  scorecardName?: string;
  totalHoles: number;
}

interface TournamentRoundsProps {
  entries: TournamentEntry[];
  rounds: TournamentRound[];
  playerProfiles: PlayerProfile[];
  playableRounds: PlayableRound[];
  onChange: (rounds: TournamentRound[]) => void;
}

const FORMAT_OPTIONS = Object.keys(MATCHUP_FORMAT_LABELS) as TournamentMatchupFormat[];

export default function TournamentRounds({
  entries,
  rounds,
  playerProfiles,
  playableRounds,
  onChange,
}: TournamentRoundsProps) {
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

  const updateRound = (roundId: string, updater: (round: TournamentRound) => TournamentRound) => {
    onChange(rounds.map((round) => (round.id === roundId ? updater(round) : round)));
  };

  const updateMatchup = (
    roundId: string,
    matchupId: string,
    updater: (matchup: TournamentMatchup) => TournamentMatchup
  ) => {
    updateRound(roundId, (round) => ({
      ...round,
      matchups: round.matchups.map((matchup) =>
        matchup.id === matchupId ? updater(matchup) : matchup
      ),
    }));
  };

  const addRound = () => {
    onChange([
      ...rounds,
      createEmptyRound(rounds.length),
    ]);
  };

  const removeRound = (roundId: string) => {
    onChange(rounds.filter((round) => round.id !== roundId));
  };

  const changeFormat = (roundId: string, matchupId: string, format: TournamentMatchupFormat) => {
    updateMatchup(roundId, matchupId, (matchup) => ({
      ...matchup,
      format,
      // Trim rosters that no longer fit the new format.
      sides: matchup.sides.map((side) => ({
        ...side,
        playerIds: side.playerIds.slice(0, MATCHUP_FORMAT_PLAYER_COUNTS[format]),
      })),
    }));
  };

  const setSideEntry = (
    roundId: string,
    matchupId: string,
    sideIndex: number,
    entryId: string
  ) => {
    updateMatchup(roundId, matchupId, (matchup) => ({
      ...matchup,
      sides: matchup.sides.map((side, index) =>
        index === sideIndex ? { ...side, entryId, playerIds: [] } : side
      ),
    }));
  };

  const toggleSidePlayer = (
    roundId: string,
    matchupId: string,
    sideIndex: number,
    playerId: string
  ) => {
    updateMatchup(roundId, matchupId, (matchup) => {
      const limit = MATCHUP_FORMAT_PLAYER_COUNTS[matchup.format];

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
    roundId: string,
    matchupId: string,
    sideIndex: number,
    hole: number,
    value: string
  ) => {
    const parsed = value === '' ? 0 : parseInt(value);
    if (isNaN(parsed) || parsed < 0) return;

    updateMatchup(roundId, matchupId, (matchup) => ({
      ...matchup,
      sides: matchup.sides.map((side, index) => {
        if (index !== sideIndex) return side;
        const scores = Array.from({ length: HOLES_PER_GAME }, (_, i) => side.scores[i] ?? 0);
        scores[hole] = parsed;
        return { ...side, scores };
      }),
    }));
  };

  const standings = calculateStandings({ entries, rounds } as Tournament);

  return (
    <div className="tournament-rounds">
      <div className="tournament-rounds-header">
        <p className="tournament-rounds-title">Rounds and matchups</p>
        <p className="tournament-rounds-copy">
          Each nine-hole game is worth {POINTS_FOR_WIN} points to the winning side, or{' '}
          {POINTS_FOR_TIE} point each if halved.
        </p>
      </div>

      {rounds.map((round) => (
        <div key={round.id} className="tournament-round">
          <div className="tournament-round-header">
            <input
              type="text"
              value={round.name}
              onChange={(e) =>
                updateRound(round.id, (current) => ({ ...current, name: e.target.value }))
              }
              placeholder="Round name"
              maxLength={40}
              aria-label="Round name"
            />
            <button type="button" className="tournament-round-remove" onClick={() => removeRound(round.id)}>
              Remove round
            </button>
          </div>

          <label className="tournament-round-link">
            <span>Played round</span>
            <select
              value={round.roundId ?? ''}
              onChange={(e) =>
                updateRound(round.id, (current) => ({ ...current, roundId: e.target.value }))
              }
            >
              <option value="">Not linked to a round</option>
              {playableRounds.map((option) => (
                <option key={option.id} value={option.id}>
                  {(option.alias?.trim() || option.scorecardName?.trim() || 'Round') +
                    ` · ${option.totalHoles} holes · ${option.id}`}
                </option>
              ))}
            </select>
          </label>

          {round.matchups.map((matchup, matchupIndex) => {
            const result = resolveMatchup(matchup);

            return (
              <div key={matchup.id} className="tournament-matchup">
                <div className="tournament-matchup-top">
                  <span className="tournament-matchup-index">Game {matchupIndex + 1}</span>
                  <select
                    value={matchup.format}
                    onChange={(e) =>
                      changeFormat(round.id, matchup.id, e.target.value as TournamentMatchupFormat)
                    }
                    aria-label={`Game ${matchupIndex + 1} format`}
                  >
                    {FORMAT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {MATCHUP_FORMAT_LABELS[option]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="tournament-matchup-remove"
                    onClick={() =>
                      updateRound(round.id, (current) => ({
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
                  const limit = MATCHUP_FORMAT_PLAYER_COUNTS[matchup.format];
                  const isWinner = result.winningSideIndex === sideIndex;

                  return (
                    <div
                      key={sideIndex}
                      className={`tournament-side${isWinner ? ' is-winner' : ''}`}
                    >
                      <select
                        value={side.entryId}
                        onChange={(e) =>
                          setSideEntry(round.id, matchup.id, sideIndex, e.target.value)
                        }
                        aria-label={`Game ${matchupIndex + 1} side ${sideIndex + 1} team`}
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
                                  toggleSidePlayer(round.id, matchup.id, sideIndex, playerId)
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
                        {Array.from({ length: HOLES_PER_GAME }, (_, hole) => (
                          <label key={hole} className="tournament-score-cell">
                            <span>{hole + 1}</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={20}
                              value={side.scores[hole] || ''}
                              onChange={(e) =>
                                setHoleScore(round.id, matchup.id, sideIndex, hole, e.target.value)
                              }
                              aria-label={`Game ${matchupIndex + 1} side ${sideIndex + 1} hole ${hole + 1}`}
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
                      updateMatchup(round.id, matchup.id, (current) => ({
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
              updateRound(round.id, (current) => ({
                ...current,
                matchups: [...current.matchups, createEmptyMatchup()],
              }))
            }
          >
            Add game
          </button>
        </div>
      ))}

      <button type="button" className="tournament-add-round" onClick={addRound}>
        Add round
      </button>

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
