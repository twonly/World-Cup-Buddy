// Match-day smoke test: is ESPN fifa.world up, and does its schema still match
// what the poller expects? Unlike poller-live.mjs this makes NO assumptions about
// match state (pre/in/post all fine), so it can run before/during/after games.
// Exit 0 = all good, exit 1 = something broke. Run: node test/matchday-smoke.mjs
// Designed to be run by a scheduler (WorkBuddy 计划任务 / cron) — last line is a
// single machine-readable summary: SMOKE PASS|FAIL passed/total latency_ms.
import * as https from 'https';

function get(url) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'WorldCupBuddy/1.0' } }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => {
        try { resolve({ json: JSON.parse(body), ms: Date.now() - t0, code: res.statusCode }); }
        catch (e) { reject(new Error(`non-JSON response (HTTP ${res.statusCode})`)); }
      });
    }).on('error', reject);
  });
}

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail}`); }
}

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

// Same field contract as poller.fetchEspnScoreboard — if any of this throws or
// returns undefined where it shouldn't, the app's parser would break too.
function checkEvent(ev) {
  const comp = ev.competitions?.[0];
  const cs = comp?.competitors;
  const home = cs?.find(c => c.homeAway === 'home') ?? cs?.[0];
  const away = cs?.find(c => c.homeAway === 'away') ?? cs?.[1];
  const st = ev.status?.type;
  const problems = [];
  if (!home?.team?.displayName || !away?.team?.displayName) problems.push('missing team.displayName');
  if (home?.score === undefined || isNaN(Number(home.score))) problems.push(`home.score=${home?.score}`);
  if (away?.score === undefined || isNaN(Number(away.score))) problems.push(`away.score=${away?.score}`);
  if (!['pre', 'in', 'post'].includes(st?.state)) problems.push(`state=${st?.state}`);
  if (typeof st?.completed !== 'boolean') problems.push(`completed=${st?.completed}`);
  if (st?.state === 'in' && !ev.status?.displayClock && !st?.shortDetail) problems.push('in-progress but no clock');
  return { label: `${away?.team?.displayName ?? '?'} @ ${home?.team?.displayName ?? '?'}`, state: st?.state, problems };
}

async function main() {
  console.log('\n=== 1. scoreboard reachable ===');
  let sb;
  try {
    sb = await get(`${BASE}/scoreboard`);
    ok('HTTP 200 + JSON', sb.code === 200);
    ok(`latency ${sb.ms}ms < 5000ms`, sb.ms < 5000);
  } catch (e) {
    ok('scoreboard fetch', false, String(e.message));
    return finish();
  }

  console.log('\n=== 2. schema invariants on every event returned ===');
  const events = sb.json.events ?? [];
  ok('season is 2026', sb.json.leagues?.[0]?.season?.year === 2026, `got ${sb.json.leagues?.[0]?.season?.year}`);
  ok('events array present', Array.isArray(events) && events.length > 0, `events=${events.length}`);
  let broken = 0;
  for (const ev of events) {
    const r = checkEvent(ev);
    if (r.problems.length) { broken++; console.log(`     ⚠️  ${r.label} [${r.state}]: ${r.problems.join(', ')}`); }
  }
  ok(`all ${events.length} events parse cleanly`, broken === 0, `${broken} broken`);
  const inPlay = events.filter(e => e.status?.type?.state === 'in').length;
  console.log(`     (states: ${events.map(e => e.status?.type?.state).join(', ')} — ${inPlay} in play)`);

  console.log('\n=== 3. summary endpoint (goal/card feed source) ===');
  const evId = events[0]?.id;
  try {
    const sum = await get(`${BASE}/summary?event=${evId}`);
    ok('summary HTTP 200 + JSON', sum.code === 200);
    const ke = sum.json.keyEvents;
    ok('keyEvents absent-or-array (pre-game: absent is fine)', ke === undefined || Array.isArray(ke), `typeof=${typeof ke}`);
    if (Array.isArray(ke) && ke.length) {
      const k = ke[0];
      ok('keyEvent has type.text + team/clock shape', !!k.type?.text, JSON.stringify(k).slice(0, 120));
    }
  } catch (e) {
    ok('summary fetch', false, String(e.message));
  }

  finish();
}

function finish() {
  const total = pass + fail;
  console.log(`\nSMOKE ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${total}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('fatal:', e); console.log('\nSMOKE FAIL 0/1'); process.exit(1); });
