import type { MatchResult } from '../results/match-result.js';

/**
 * The Telegram message, in French and in plain text, so that no team name is read as formatting:
 * `Score final · SUPER XIII` then `Carcassonne 22 – 18 Lézignan`. Names are kept as published.
 */
export function formatScoreMessage(result: MatchResult): string {
  const { competition, homeTeam, homeScore, awayScore, awayTeam } = result;
  return `Score final · ${competition}\n${homeTeam} ${String(homeScore)} – ${String(awayScore)} ${awayTeam}`;
}
