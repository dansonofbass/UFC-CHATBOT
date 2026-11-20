import type { Fighter } from './schemas';
import type { understand } from './understanding';

// Project evidence to the information need so record counts cannot become metric samples.
const metricTerms: [string, RegExp][] = [
  ['td_def', /takedown defen[cs]e|td def/i],
  ['td_acc', /takedown accuracy|td acc/i],
  ['td_avg', /takedown average|takedowns? per/i],
  ['slpm', /slpm|strikes? landed per minute/i],
  ['sapm', /sapm|strikes? absorbed per minute/i],
  ['str_acc', /striking accuracy|strike accuracy/i],
  ['str_def', /striking defen[cs]e|strike defen[cs]e/i],
  ['sub_avg', /submission (?:average|attempt)/i],
];
export function fighterFacts(fighter: Fighter, plan: ReturnType<typeof understand<Fighter>>) {
  const statsRequest = plan.intents.includes('fight_statistics');
  if (!statsRequest)
    return {
      ...fighter,
      credentials: fighter.credentials
        ? {
            credentials: [...fighter.credentials.credentials]
              .sort(
                (a, b) =>
                  Number(b.kind === 'professional-title') - Number(a.kind === 'professional-title'),
              )
              .slice(0, 12),
            affiliations: fighter.credentials.affiliations.slice(0, 8),
          }
        : undefined,
      stats: plan.intent === 'fighter_comparison' ? fighter.stats : undefined,
      career_stats: undefined,
    };
  const terms = `${plan.query} ${plan.topic || ''}`;
  const requested = metricTerms.filter(([, pattern]) => pattern.test(terms)).map(([key]) => key);
  const project = (stats: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(stats).filter(
        ([key]) => !requested.length || requested.includes(key) || key === 'basis',
      ),
    );
  return {
    id: fighter.id,
    name: fighter.name,
    performance_panel: fighter.stats ? project(fighter.stats) : null,
    scope_specific_panels: !fighter.stats
      ? fighter.career_stats?.map((row) => ({
          scope: row.scope,
          source: row.source,
          updated_at: row.updated_at,
          metrics: project(
            Object.fromEntries(
              Object.entries(row).filter(([key]) => metricTerms.some(([metric]) => metric === key)),
            ),
          ),
        }))
      : undefined,
    career_records: plan.intents.includes('fighter_history') ? fighter.records : undefined,
    interpretation:
      'Use basis.scope and basis.bouts exactly. Wins and losses are not sample sizes. Never combine samples or infer other-promotion coverage. Previous assistant claims are not verified evidence.',
  };
}
