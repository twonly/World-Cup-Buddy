// Stateful simulation of the live event loop's dedup, using the REAL poller
// helpers. Mirrors exactly what tickLive does with lastSeenPlayId across polls:
// emits a goal once, never re-emits it on identical re-polls, and detects new
// events appended later. This is the "调通 for live moments" proof.
const path = require('path');
const poller = require(path.resolve(__dirname, '../dist-electron/poller.js'));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}  ${detail}`); }
};

// Synthetic keyEvents for Brazil (home, the fan's team) vs Argentina.
const kickoff = { id: '0', typeText: 'Kickoff', scoringPlay: false, teamName: undefined, clock: '', text: '', homeScore: 0, awayScore: 0 };
const goalBRA = { id: '1', typeText: 'Goal - Header', scoringPlay: true, teamName: 'Brazil', clock: "23'", text: 'Goal! Brazil 1, Argentina 0. Vinicius Junior (Brazil) header.', homeScore: 0, awayScore: 0 };
const yellowARG = { id: '2', typeText: 'Yellow Card', scoringPlay: false, teamName: 'Argentina', clock: "58'", text: 'Booking.', homeScore: 0, awayScore: 0 };
const goalARG = { id: '3', typeText: 'Goal - Penalty', scoringPlay: true, teamName: 'Argentina', clock: "67'", text: 'Goal! Brazil 1, Argentina 1. Lionel Messi (Argentina) penalty.', homeScore: 0, awayScore: 0 };

// Reproduce tickLive's per-poll handling around the exported helpers.
let lastSeenId = undefined;
let myScore = 0, oppScore = 0;
function poll(plays, my, opp) {
  myScore = my; oppScore = opp;
  const fresh = poller.collectNewKeyEvents(plays, lastSeenId);
  if (plays.length) lastSeenId = plays[plays.length - 1].id;
  const toEmit = fresh.slice(-3);
  return toEmit
    .map(p => poller.keyEventToGameEvent(p, 'Brazil', 'Argentina', true, myScore, oppScore))
    .filter(Boolean);
}

console.log('\n=== Live event-loop dedup simulation (Brazil fan) ===');

// Tick 1: kickoff + Brazil goal already on the board. First sight emits only the latest meaningful event.
let e = poll([kickoff, goalBRA], 1, 0);
ok('tick1 emits exactly 1', e.length === 1, `got ${e.length}`);
ok('tick1 is my goal (dance)', e[0] && e[0].mood === 'dance', JSON.stringify(e[0]));
ok('tick1 names scorer', e[0] && /Vinicius/.test(e[0].message), e[0] && e[0].message);
if (e[0]) console.log(`     -> ${e[0].message}`);

// Tick 2: identical re-poll → must NOT re-emit the goal.
e = poll([kickoff, goalBRA], 1, 0);
ok('tick2 re-poll emits 0 (dedup)', e.length === 0, `got ${e.length}`);

// Tick 3: opponent yellow + opponent goal appended.
e = poll([kickoff, goalBRA, yellowARG, goalARG], 1, 1);
ok('tick3 emits 2 new events', e.length === 2, `got ${e.length}`);
const moods = e.map(x => x.mood);
ok('tick3 has opp-goal as sad', moods.includes('sad'), moods.join(','));
ok('tick3 yellow is watch', moods.includes('watch'), moods.join(','));
e.forEach(x => console.log(`     -> ${x.message}`));

// Tick 4: identical re-poll → 0 again.
e = poll([kickoff, goalBRA, yellowARG, goalARG], 1, 1);
ok('tick4 re-poll emits 0 (dedup)', e.length === 0, `got ${e.length}`);

// Tick 5: a SECOND Brazil goal appended → exactly 1 new emit.
const goalBRA2 = { id: '4', typeText: 'Goal', scoringPlay: true, teamName: 'Brazil', clock: "81'", text: 'Goal! Brazil 2, Argentina 1. Rodrygo (Brazil) right-footed shot.', homeScore: 0, awayScore: 0 };
e = poll([kickoff, goalBRA, yellowARG, goalARG, goalBRA2], 2, 1);
ok('tick5 emits exactly 1 (new goal only)', e.length === 1, `got ${e.length}`);
ok('tick5 my goal, names Rodrygo', e[0] && e[0].mood === 'dance' && /Rodrygo/.test(e[0].message), e[0] && e[0].message);
if (e[0]) console.log(`     -> ${e[0].message}`);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail === 0 ? 0 : 1);
