// Live integration test for the World Cup Buddy data path.
// Hits the real ESPN fifa.world API and exercises the same parsing + classification
// the poller uses, asserting the tricky branches (penalties, goals, cards) against
// known ground truth. Run: node test/poller-live.mjs
import * as https from 'https';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'WorldCupBuddy/1.0' } }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail}`); }
}

const SB = (dates) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard${dates ? `?dates=${dates}` : ''}`;

// Mirror of poller.fetchEspnScoreboard's per-event parse (the fields we rely on).
function parseEvent(ev) {
  const comp = ev.competitions[0];
  const cs = comp.competitors;
  const home = cs.find(c => c.homeAway === 'home') ?? cs[0];
  const away = cs.find(c => c.homeAway === 'away') ?? cs[1];
  const st = ev.status.type;
  const shoot = c => (c.shootoutScore !== undefined && c.shootoutScore !== null) ? Number(c.shootoutScore) : undefined;
  return {
    home: home.team.displayName, away: away.team.displayName,
    homeScore: Number(home.score ?? 0), awayScore: Number(away.score ?? 0),
    homeShootout: shoot(home), awayShootout: shoot(away),
    homeWinner: home.winner === true, awayWinner: away.winner === true,
    status: st.name, state: st.state, completed: !!st.completed,
    period: Number(ev.status.period ?? 0),
  };
}

async function main() {
  console.log('\n=== 1. 2026 opener is scheduled (data is live) ===');
  const opener = await get(SB('20260611'));
  ok('2026 season present', opener.leagues?.[0]?.season?.year === 2026, `got ${opener.leagues?.[0]?.season?.year}`);
  ok('opener events exist', (opener.events?.length ?? 0) > 0, `events=${opener.events?.length}`);
  const m0 = parseEvent(opener.events[0]);
  ok('opener state=pre', m0.state === 'pre', `state=${m0.state}`);
  console.log(`     -> ${m0.home} vs ${m0.away} (${m0.status})`);

  console.log('\n=== 2. 2022 Final penalty-shootout path (Argentina–France) ===');
  const fin = await get(SB('20221218'));
  const f = parseEvent(fin.events[0]);
  ok('status=STATUS_FINAL_PEN', f.status === 'STATUS_FINAL_PEN', f.status);
  ok('state=post', f.state === 'post', f.state);
  ok('regulation score level 3-3', f.homeScore === 3 && f.awayScore === 3, `${f.homeScore}-${f.awayScore}`);
  ok('shootout 4-2', f.homeShootout === 4 && f.awayShootout === 2, `${f.homeShootout}-${f.awayShootout}`);
  ok('winner flag = Argentina (home)', f.homeWinner === true && f.awayWinner === false);

  // Emulate poller.emitFullTime for an Argentina fan -> must say WIN despite level score.
  const myWon = f.homeWinner; // Argentina = home, fan's team
  const hasPens = f.homeShootout !== undefined;
  const won = hasPens ? myWon : f.homeScore > f.awayScore;
  ok('Argentina fan sees WIN (not draw)', won === true, `won=${won}`);
  console.log(`     -> bubble: 🏁 点球大战: Argentina ${f.homeScore}-${f.awayScore} France (点球 ${f.homeShootout}-${f.awayShootout}), 赢了! ⚽🎉`);

  console.log('\n=== 3. Goal / card classification from real keyEvents (EPL finished match) ===');
  // Find a finished EPL match and run its keyEvents through the classifier.
  const epl = await get('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20260524');
  const finished = (epl.events ?? []).find(e => e.status.type.state === 'post');
  if (!finished) { console.log('  (no finished EPL match on probe date — skipping)'); }
  else {
    const sum = await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=${finished.id}`);
    const ke = sum.keyEvents ?? [];
    ok('keyEvents present', ke.length > 0, `count=${ke.length}`);
    const goals = ke.filter(k => k.scoringPlay);
    const cards = ke.filter(k => /card/i.test(k.type?.text ?? ''));
    ok('detected ≥1 goal', goals.length > 0, `goals=${goals.length}`);
    console.log(`     -> goals=${goals.length}, cards=${cards.length}`);
    const g = goals[0];
    if (g) {
      const m = (g.text || '').match(/\.\s+([A-ZÀ-Ž][\p{L}'.\-]+(?:\s+[A-ZÀ-Ž][\p{L}'.\-]+){0,3})\s*\(/u);
      console.log(`     -> sample goal [${g.clock?.displayValue}] ${g.team?.displayName} scorer="${m ? m[1] : '?'}"`);
      ok('scorer name parsed from goal text', !!m, `text="${(g.text||'').slice(0,50)}"`);
    }
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
