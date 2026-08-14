import type {
  GameState,
  HoleInfo,
  MatchupConfig,
  MatchupSide,
  Player,
  PlayerProfile,
  Scorecard,
  TournamentEntry,
  TournamentSessionFormat,
} from '../types/index.ts';

export const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
];

const DEFAULT_PAR = 4;

export const getPlayerDisplayName = (
  playerId: string,
  playerProfiles: PlayerProfile[]
): string => {
  const profile = playerProfiles.find((item) => item.id === playerId);
  if (!profile) return 'Unknown player';
  return profile.nickname?.trim() || `${profile.firstName} ${profile.lastName}`;
};

// Courses publish a separate stroke index order for each pairing of nines.
const getStrokeIndexAllocation = (scorecard: Scorecard, setIndexes: number[]) => {
  const key = [...setIndexes].sort((a, b) => a - b).join('-');
  return scorecard.strokeIndexAllocations?.find(
    (allocation) => [...allocation.setIndexes].sort((a, b) => a - b).join('-') === key
  );
};

export const buildHoleDetailsForSets = (
  scorecard: Scorecard,
  setIndexes: number[]
): HoleInfo[] => {
  const allocation = getStrokeIndexAllocation(scorecard, setIndexes);

  return setIndexes.flatMap((setIndex) => {
    const set = scorecard.sets[setIndex];
    if (!set) return [];

    const allocationPosition = allocation?.setIndexes.indexOf(setIndex) ?? -1;
    const overrides =
      allocationPosition >= 0 ? allocation?.handicapsBySet[allocationPosition] : undefined;

    return set.holes.map((hole, holeIndex) => {
      const override = overrides?.[holeIndex];
      return Number.isFinite(override) && (override as number) > 0
        ? { ...hole, handicap: override as number }
        : { ...hole };
    });
  });
};

export const buildSetLabelsForSets = (
  scorecard: Scorecard,
  setIndexes: number[],
  totalHoles: number
): string[] =>
  setIndexes.map((setIndex, position) => {
    const alias = scorecard.sets[setIndex]?.alias?.trim();
    if (alias) return alias;

    const startHole = position * 9 + 1;
    const endHole = Math.min(startHole + 8, totalHoles);
    return `Set ${position + 1} (${startHole}-${endHole})`;
  });

const buildSideLabel = (
  side: MatchupSide,
  entries: TournamentEntry[],
  playerProfiles: PlayerProfile[],
  fallback: string
): string => {
  const entry = entries.find((item) => item.id === side.entryId);
  const entryName = entry?.name.trim();
  if (entryName) return entryName;

  const names = side.playerIds.map((playerId) => getPlayerDisplayName(playerId, playerProfiles));
  return names.join(' & ') || fallback;
};

interface MatchRoundOptions {
  sides: MatchupSide[];
  entries: TournamentEntry[];
  playerProfiles: PlayerProfile[];
  formatDefinition: TournamentSessionFormat;
  scorecard: Scorecard;
  setIndexes: number[];
  holes: number;
  matchName: string;
}

export const buildMatchRoundState = ({
  sides,
  entries,
  playerProfiles,
  formatDefinition,
  scorecard,
  setIndexes,
  holes,
  matchName,
}: MatchRoundOptions): GameState => {
  // Side A plays first in the scorecard so team ordering stays readable.
  const orderedPlayerIds = sides.flatMap((side) => side.playerIds);

  const players: Player[] = orderedPlayerIds.map((playerId, index) => {
    const profile = playerProfiles.find((item) => item.id === playerId);

    return {
      id: playerId,
      name: getPlayerDisplayName(playerId, playerProfiles),
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      handicap: profile?.handicap ?? 0,
    };
  });

  const holeDetails = buildHoleDetailsForSets(scorecard, setIndexes);
  const parValues = holeDetails.length
    ? holeDetails.map((hole) => hole.par)
    : Array.from({ length: holes }, () => DEFAULT_PAR);

  const matchup: MatchupConfig | undefined = formatDefinition.hasTeams
    ? {
        format: formatDefinition.baseFormat,
        sessionFormatId: formatDefinition.id,
        scoringMode: formatDefinition.scoringMode,
        resultMode: formatDefinition.resultMode,
        ownBall: formatDefinition.ownBall,
        teams: sides.map((side, index) => ({
          id: index === 0 ? 'team-a' : index === 1 ? 'team-b' : `team-${index + 1}`,
          name: buildSideLabel(side, entries, playerProfiles, `Side ${index + 1}`),
          playerIds: [...side.playerIds],
        })),
        // Firestore rejects undefined, so only set a rule when the format has one.
        ...(formatDefinition.handicapRule?.type === 'scramble-pair-percentage'
          ? { handicapRule: { ...formatDefinition.handicapRule } }
          : {}),
      }
    : undefined;

  return {
    players,
    scores: [],
    currentHole: 1,
    totalHoles: holes,
    sessionFormatId: formatDefinition.id,
    alias: matchName.trim() || undefined,
    parValues,
    holeDetails: holeDetails.length
      ? holeDetails
      : parValues.map((par) => ({ par })),
    scorecardId: scorecard.id,
    scorecardName: scorecard.name,
    playedSetLabels: buildSetLabelsForSets(scorecard, setIndexes, holes),
    matchup,
  };
};
