import { useState } from 'react';
import type {
  MatchupSide,
  PlayerProfile,
  PlayerTier,
  Scorecard,
  TournamentEntry,
  TournamentSession,
  TournamentSessionFormat,
} from '../types/index.ts';
import { getPlayerDisplayName } from '../tournaments/roundBuilder';
import './TournamentSessions.scss';

export interface MatchDraft {
  name: string;
  scorecard: Scorecard;
  setIndexes: number[];
  sides: MatchupSide[];
}

interface TournamentMatchBuilderProps {
  session: TournamentSession;
  formatDefinition: TournamentSessionFormat;
  entries: TournamentEntry[];
  playerProfiles: PlayerProfile[];
  scorecards: Scorecard[];
  defaultName: string;
  isSaving: boolean;
  onCancel: () => void;
  onCreate: (draft: MatchDraft) => void;
}

export default function TournamentMatchBuilder({
  session,
  formatDefinition,
  entries,
  playerProfiles,
  scorecards,
  defaultName,
  isSaving,
  onCancel,
  onCreate,
}: TournamentMatchBuilderProps) {
  const [name, setName] = useState(defaultName);
  const [scorecardId, setScorecardId] = useState(scorecards[0]?.id ?? '');
  const [setIndexes, setSetIndexes] = useState<number[]>([]);
  const [sideEntryIds, setSideEntryIds] = useState<[string, string]>(['', '']);
  const [sidePlayerIds, setSidePlayerIds] = useState<[string[], string[]]>([[], []]);
  const [fieldPlayers, setFieldPlayers] = useState<Array<{ entryId: string; playerId: string }>>([]);
  const [error, setError] = useState('');

  const requiredSets = Math.max(1, Math.round(session.holes / 9));
  const playersPerSide = Math.max(1, formatDefinition.playersPerSide);
  const enforcesTiers = formatDefinition.lineupRule === 'same-tier-only';
  const scorecard = scorecards.find((item) => item.id === scorecardId) ?? null;
  // Stroke play is a field, so any number of players from any teams can share one card.
  const isStrokeField = formatDefinition.baseFormat === 'stroke' && !formatDefinition.hasTeams;

  const getEntry = (entryId: string) => entries.find((entry) => entry.id === entryId) ?? null;

  const getEntryLabel = (entry: TournamentEntry) =>
    entry.name.trim() || getPlayerDisplayName(entry.playerIds[0] ?? '', playerProfiles);

  const getTier = (entryId: string, playerId: string): PlayerTier | undefined =>
    getEntry(entryId)?.playerTiers?.[playerId];

  const toggleSet = (setIndex: number) => {
    setError('');
    setSetIndexes((prev) => {
      if (prev.includes(setIndex)) {
        return prev.filter((index) => index !== setIndex);
      }

      // Play order follows selection order, so drop the oldest pick once the session length is met.
      const next = [...prev, setIndex];
      return next.length > requiredSets ? next.slice(next.length - requiredSets) : next;
    });
  };

  const changeSideEntry = (sideIndex: 0 | 1, entryId: string) => {
    setError('');
    setSideEntryIds((prev) => {
      const next: [string, string] = [...prev] as [string, string];
      next[sideIndex] = entryId;
      return next;
    });
    setSidePlayerIds((prev) => {
      const next: [string[], string[]] = [[...prev[0]], [...prev[1]]];
      next[sideIndex] = [];
      return next;
    });
  };

  const togglePlayer = (sideIndex: 0 | 1, playerId: string) => {
    const entryId = sideEntryIds[sideIndex];
    const current = sidePlayerIds[sideIndex];

    if (current.includes(playerId)) {
      setError('');
      setSidePlayerIds((prev) => {
        const next: [string[], string[]] = [[...prev[0]], [...prev[1]]];
        next[sideIndex] = current.filter((id) => id !== playerId);
        return next;
      });
      return;
    }

    if (enforcesTiers) {
      const tier = getTier(entryId, playerId);

      if (!tier) {
        setError('This format needs A and B tiers. Assign player tiers in the tournament first.');
        return;
      }

      const sideTier = current
        .map((selectedId) => getTier(entryId, selectedId))
        .find((value): value is PlayerTier => value === 'A' || value === 'B');

      if (sideTier && sideTier !== tier) {
        setError('This format needs each side to use players from one tier (all A or all B).');
        return;
      }

      const otherIndex = sideIndex === 0 ? 1 : 0;
      const otherTier = sidePlayerIds[otherIndex]
        .map((selectedId) => getTier(sideEntryIds[otherIndex], selectedId))
        .find((value): value is PlayerTier => value === 'A' || value === 'B');

      if (otherTier && otherTier !== tier) {
        setError('This format needs A against A and B against B. Match both sides to one tier.');
        return;
      }
    }

    setError('');
    setSidePlayerIds((prev) => {
      const next: [string[], string[]] = [[...prev[0]], [...prev[1]]];
      next[sideIndex] =
        playersPerSide === 1 ? [playerId] : [...current, playerId].slice(-playersPerSide);
      return next;
    });
  };

  const toggleFieldPlayer = (entryId: string, playerId: string) => {
    setError('');
    setFieldPlayers((prev) =>
      prev.some((item) => item.playerId === playerId)
        ? prev.filter((item) => item.playerId !== playerId)
        : [...prev, { entryId, playerId }]
    );
  };

  const handleCreate = () => {
    if (!scorecard) {
      setError('Choose a course for this match.');
      return;
    }

    if (setIndexes.length !== requiredSets) {
      setError(
        `Choose ${requiredSets} set${requiredSets === 1 ? '' : 's'} of nine to match the ${session.holes}-hole session.`
      );
      return;
    }

    if (isStrokeField) {
      if (fieldPlayers.length < 2) {
        setError('Pick at least two players for a stroke play match.');
        return;
      }

      onCreate({
        name: name.trim(),
        scorecard,
        setIndexes,
        sides: fieldPlayers.map((item) => ({
          entryId: item.entryId,
          playerIds: [item.playerId],
          scores: Array.from({ length: session.holes }, () => 0),
        })),
      });
      return;
    }

    if (!sideEntryIds[0] || !sideEntryIds[1]) {
      setError(`Choose both ${formatDefinition.hasTeams ? 'teams' : 'players'} for this match.`);
      return;
    }

    if (sideEntryIds[0] === sideEntryIds[1]) {
      setError('A match needs two different sides.');
      return;
    }

    if (sidePlayerIds[0].length !== playersPerSide || sidePlayerIds[1].length !== playersPerSide) {
      setError(
        `Each side needs ${playersPerSide} player${playersPerSide === 1 ? '' : 's'} for ${formatDefinition.name}.`
      );
      return;
    }

    onCreate({
      name: name.trim(),
      scorecard,
      setIndexes,
      sides: [0, 1].map((sideIndex) => ({
        entryId: sideEntryIds[sideIndex],
        playerIds: [...sidePlayerIds[sideIndex]],
        scores: Array.from({ length: session.holes }, () => 0),
      })),
    });
  };

  return (
    <div className="session-match-builder">
      <p className="session-match-builder-title">
        New match in {session.name} · {formatDefinition.name} · {session.holes} holes
      </p>

      <label className="session-field">
        <span>Match name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Match name"
          maxLength={40}
          disabled={isSaving}
        />
      </label>

      <label className="session-field">
        <span>Course</span>
        <select
          value={scorecardId}
          onChange={(event) => {
            setScorecardId(event.target.value);
            setSetIndexes([]);
            setError('');
          }}
          disabled={isSaving}
        >
          <option value="">Pick a course</option>
          {scorecards.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      {scorecard && (
        <div className="session-field">
          <span>
            Nines to play ({setIndexes.length}/{requiredSets})
          </span>
          <div className="session-chip-row">
            {scorecard.sets.map((set, index) => {
              const position = setIndexes.indexOf(index);

              return (
                <button
                  key={index}
                  type="button"
                  className={`session-chip${position >= 0 ? ' is-selected' : ''}`}
                  onClick={() => toggleSet(index)}
                  disabled={isSaving}
                >
                  {set.alias?.trim() || `Set ${index + 1}`}
                  {position >= 0 && <span className="session-chip-badge">{position + 1}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isStrokeField ? (
        <div className="session-side">
          <div className="session-field">
            <span>Players in this match ({fieldPlayers.length} selected)</span>
            {entries.length === 0 && (
              <p className="session-empty">Add players to the tournament first.</p>
            )}
            {entries.map((entry) => (
              <div key={entry.id} className="session-field">
                <span>{getEntryLabel(entry)}</span>
                <div className="session-chip-row">
                  {entry.playerIds.map((playerId) => {
                    const isSelected = fieldPlayers.some((item) => item.playerId === playerId);

                    return (
                      <button
                        key={playerId}
                        type="button"
                        className={`session-chip${isSelected ? ' is-selected' : ''}`}
                        onClick={() => toggleFieldPlayer(entry.id, playerId)}
                        disabled={isSaving}
                      >
                        {getPlayerDisplayName(playerId, playerProfiles)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        ([0, 1] as const).map((sideIndex) => {
          const entryId = sideEntryIds[sideIndex];
          const entry = getEntry(entryId);

          return (
            <div key={sideIndex} className="session-side">
              <label className="session-field">
                <span>
                  {formatDefinition.hasTeams ? `Side ${sideIndex + 1} team` : `Player ${sideIndex + 1}`}
                </span>
                <select
                  value={entryId}
                  onChange={(event) => changeSideEntry(sideIndex, event.target.value)}
                  disabled={isSaving}
                >
                  <option value="">{formatDefinition.hasTeams ? 'Pick a team' : 'Pick a player'}</option>
                  {entries.map((option) => (
                    <option key={option.id} value={option.id}>
                      {getEntryLabel(option)}
                    </option>
                  ))}
                </select>
              </label>

              {entry && (
                <div className="session-chip-row">
                  {entry.playerIds.map((playerId) => {
                    const isSelected = sidePlayerIds[sideIndex].includes(playerId);
                    const tier = entry.playerTiers?.[playerId];

                    return (
                      <button
                        key={playerId}
                        type="button"
                        className={`session-chip${isSelected ? ' is-selected' : ''}`}
                        onClick={() => togglePlayer(sideIndex, playerId)}
                        disabled={isSaving}
                      >
                        {getPlayerDisplayName(playerId, playerProfiles)}
                        {tier && <span className="session-chip-badge">{tier}</span>}
                      </button>
                    );
                  })}
                  <span className="session-chip-count">
                    {sidePlayerIds[sideIndex].length}/{playersPerSide}
                  </span>
                </div>
              )}
            </div>
          );
        })
      )}

      {error && <p className="session-error">{error}</p>}

      <div className="session-form-actions">
        <button type="button" className="session-btn is-primary" onClick={handleCreate} disabled={isSaving}>
          {isSaving ? 'Creating...' : 'Create match'}
        </button>
        <button type="button" className="session-btn" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
      </div>
    </div>
  );
}
