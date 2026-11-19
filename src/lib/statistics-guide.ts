// Stable terminology, not current numerical fighter data. This explanation requires
// no model call, fighter roster, live API credits, or time-sensitive statistics.
export function isGeneralStatisticsQuestion(query: string) {
  const q = query.trim().replace(/[?.!]+$/g, '').trim();
  return /^(?:(?:please\s+)?(?:explain|describe|define|understand|what(?:\s+are|'s)|how(?:\s+do\s+i\s+read)?|tell\s+me\s+about)\s+)?(?:ufc|mma)(?:\s+fight(?:er)?)?\s+(?:stats|statistics)(?:\s+(?:work|mean|definitions|explained))?$/i.test(q);
}

export const statisticsGuide = [
  '**Understanding UFC fight statistics**',
  '',
  '- **SLpM:** Significant Strikes Landed per Minute — how frequently a fighter lands significant strikes.',
  '- **SApM:** Significant Strikes Absorbed per Minute — how often opponents land significant strikes against them.',
  '- **Str. Acc.:** Significant Striking Accuracy — percentage of attempted significant strikes that land.',
  '- **Str. Def.:** Significant Strike Defense — percentage of opponents’ attempted significant strikes that miss.',
  '- **TD Avg.:** Average successful takedowns per 15 minutes.',
  '- **TD Acc.:** Percentage of takedown attempts that succeed.',
  '- **TD Def.:** Percentage of opponents’ takedown attempts defended.',
  '- **Sub. Avg.:** Submission attempts per 15 minutes.',
  '- **Fight-by-fight:** Knockdowns, strikes, takedowns, submissions, control time and round-by-round numbers describe an individual bout rather than a career average.',
  '',
  'These metrics describe different aspects of performance; none alone determines who is the better fighter.',
  '',
  'Definitions: [UFCStats](https://ufcstats.com). Name a fighter or bout to examine verified statistics for that specific subject.',
].join('\n');
