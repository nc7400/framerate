// Groups entries that have the same totalScore into one rank (a tie), highest
// score first. Ranks are consecutive: two players tied for 1st are followed by
// a "2nd" group, so the silver/bronze medals always go to the next scores down.
export function groupByRank(entries) {
  const sorted = [...entries].sort((a, b) => b.totalScore - a.totalScore);
  const groups = [];
  for (const entry of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.totalScore === entry.totalScore) {
      last.members.push(entry);
    } else {
      groups.push({ rank: groups.length + 1, totalScore: entry.totalScore, members: [entry] });
    }
  }
  return groups;
}

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function rankLabel(rank) {
  return MEDALS[rank] || `#${rank}`;
}
