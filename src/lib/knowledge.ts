// Original educational summaries; source review date is not a publisher update date.
export const knowledgeVersion = '2026-11-20';
export const essentialKnowledge = [
  {
    id: 'mma-basics',
    title: 'MMA fundamentals and techniques',
    source_url: 'https://www.ufc.com/intro-to-mma?language_content_entity=en',
    body: 'Mixed martial arts combines striking and grappling, standing and on the ground. UFC is a promotion, while MMA is the sport. Boxing, kickboxing, wrestling and submission grappling contribute different tools. A takedown brings an opponent to the ground; positional advancement can create striking or submission opportunities. Common submissions include chokes, armbars and other joint locks. Grappling also helps a fighter escape poor positions and decide where exchanges happen. A knockout ends a bout when an opponent cannot continue after a strike; a technical knockout involves a stoppage when a fighter cannot safely continue or intelligently defend. A submission can be a physical or verbal concession, with technical submissions possible after referee intervention. A decision uses judges scores when the scheduled bout ends without a finish. A unanimous decision means all judges select the same winner; a split decision means they disagree about the winner; a majority decision includes a drawn scorecard. Rules and permitted techniques vary by jurisdiction and competition.',
  },
  {
    id: 'mma-statistics',
    title: 'Interpreting MMA statistics',
    source_url: 'https://www.ufcalendar.com/glossary',
    body: 'Significant strikes include strikes at distance and power strikes in the clinch or on the ground. Total strikes also include shorter, less forceful contact in close positions. SLpM is significant strikes landed per minute; SApM is significant strikes absorbed per minute. Striking accuracy is the proportion of attempted significant strikes that land. Striking defense describes the share of opponent significant strike attempts avoided. Takedown accuracy measures successful takedowns relative to attempts; takedown defense measures opponent attempts stopped. Takedown averages and submission attempt averages are commonly presented per fifteen minutes; always check the provider units and sample. Control time describes time controlling a position, and does not automatically establish damage or a winning score. Career averages combine multiple bouts while fight statistics describe one contest. Different opponents, styles and small samples limit comparisons. Fight records distinguish wins, losses, draws and no contests; MMA and UFC-only records cover different sets of fights. A high activity metric alone does not prove superior skill.',
  },
  {
    id: 'mma-scoring',
    title: 'Judging and scoring rounds',
    source_url:
      'https://www.abcboxing.com/wp-content/uploads/2025/08/ABC-MMA-Scoring-Criteira-Clarification-7.2025.pdf',
    body: 'Judges evaluate rounds individually. Successful striking and grappling are evaluated by their effect, with damage central to the scoring clarification. A statistic counting contact does not measure its full effect. Takedowns and control positions should be interpreted through the effective offense they create. Passive possession of a position does not automatically outweigh damaging offense. A bout total is therefore insufficient to reconstruct the judges round-by-round evaluation. Consult the applicable commission rules for the exact scoring standard in a particular contest.',
  },
  {
    id: 'ufc-rankings',
    title: 'Rankings and championship terminology',
    source_url: 'https://www.ufc.com/news/ufc-and-meta-unveil-meta-ufc-rankings',
    body: 'Historically, UFC rankings used votes from a media panel. UFC announced a transition beginning June 22, 2026 toward Meta UFC Rankings, a data-based methodology. Do not describe the historical media panel as the sole current system, or infer that the transition is complete without a current source. Divisional rankings and pound-for-pound rankings answer different questions; neither is a direct numerical measurement of fighting ability. Championship status and a numerical ranking are distinct. Rankings change, and a current list requires a dated verified snapshot. Weight classes group competitors by weight limits; a fighter body weight alone does not establish their currently active division. A title fight contests a championship; an interim championship is distinct from an undisputed championship. Do not infer current champions or division membership from historical achievements.',
  },
  {
    id: 'ufc-weight-classes',
    title: 'Weight classes and weigh-ins',
    source_url: 'https://www.ufc.com/news/understanding-ufc-weight-classes-and-weigh-ins',
    body: 'Common UFC division limits in pounds include strawweight 115, flyweight 125, bantamweight 135, featherweight 145, lightweight 155, welterweight 170, middleweight 185, light heavyweight 205 and heavyweight 265. Division availability differs between competition categories. Non-title bouts generally allow one pound above the limit; title bouts require the championship limit. Catchweight bouts use an agreed weight rather than a standard division limit. Check the applicable commission and bout agreement for exceptions. A listed body weight does not establish a fighter current division or eligibility. Rankings, champion names and athlete division assignments require current dated sources.',
  },
];

export function localKnowledge(query: string) {
  const words = new Set(query.toLowerCase().match(/[a-z]{3,}/g) || []);
  return essentialKnowledge
    .map((doc) => ({
      doc,
      score: [...words].filter((w) => `${doc.title} ${doc.body}`.toLowerCase().includes(w)).length,
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => row.doc);
}
