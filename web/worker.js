// Runs season simulations off the main thread. Message in: {id, L, entries, sims, favs}; out: {id, sim, status, scen}.
import { prepare, simulate } from './sim.js';
import { statuses, scenarios } from './clinch.js';
import { LEAGUES } from './leagues.js';

self.onmessage = e => {
  const { id, L, entries, sims, live } = e.data, rules = LEAGUES[L.key];
  try {
    const matches = prepare(L, entries, live);
    const sim = simulate(L, rules, matches, { sims });
    const status = statuses(L, rules, matches, sim);
    // scenarios for every club whose place isn't settled yet (the page decides which are worth showing)
    const scen = [];
    for (const z of rules.zones) for (let t = 0; t < L.teams.length; t++) {
      if (status[z.key]?.[t]) continue;
      const s = scenarios(L, rules, matches, t, z);
      if (s && !s.already) scen.push({ t, z: z.key, s: { match: s.match.id, clinch: s.clinch, elim: s.elim } });
    }
    self.postMessage({ id, sim, status, scen });
  } catch (err) { self.postMessage({ id, error: String(err.stack || err) }); }
};
