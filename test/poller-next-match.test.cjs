/**
 * Tests for Issue #1 fixes:
 * 1. parseEspnScoreboardJson — extracted parsing function works identically
 * 2. getTeamAliases — exported, returns Chinese/abbr aliases
 * 3. formatMatchTime helpers used in announceNoMatch (indirectly, via data shape)
 *
 * Note: fetchNextMatchForTeam uses net.fetch (Electron-only), so we can't call
 * it directly in Node. We test the building blocks instead.
 */
const path = require('path');
const assert = require('node:assert/strict');
const test = require('node:test');

const poller = require(path.resolve(__dirname, '../dist-electron/poller.js'));

// ============================================================
// 1. parseEspnScoreboardJson
// ============================================================

// Minimal ESPN scoreboard response fixture
const makeEspnEvent = ({ id, homeName, awayName, state = 'pre', period = 0, clock = '', date = '2026-06-14T03:00Z', headline = '' }) => ({
  id,
  date,
  status: {
    type: { name: 'STATUS_SCHEDULED', state, completed: false, detail: '1st Half' },
    period,
    displayClock: clock,
  },
  season: { type: { name: '' } },
  competitions: [{
    notes: headline ? [{ headline }] : [],
    venue: { fullName: 'MetLife Stadium' },
    competitors: [
      {
        homeAway: 'home',
        score: '2',
        shootoutScore: null,
        winner: false,
        team: { id: '1', displayName: homeName, abbreviation: homeName.slice(0, 3).toUpperCase(), logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/home.png' },
        statistics: [
          { name: 'possessionPct', value: '56.0' },
          { name: 'totalShots', value: '8' },
          { name: 'shotsOnTarget', value: '3' },
          { name: 'wonCorners', value: '4' },
          { name: 'foulsCommitted', value: '11' },
        ],
      },
      {
        homeAway: 'away',
        score: '1',
        shootoutScore: null,
        winner: false,
        team: { id: '2', displayName: awayName, abbreviation: awayName.slice(0, 3).toUpperCase(), logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/away.png' },
        statistics: [],
      },
    ],
  }],
});

test('parseEspnScoreboardJson: exported and returns correct team names', () => {
  assert.equal(typeof poller.parseEspnScoreboardJson, 'function', 'parseEspnScoreboardJson should be exported');

  const json = {
    events: [
      makeEspnEvent({ id: '42', homeName: 'Argentina', awayName: 'France', state: 'in', period: 1, clock: "23'" }),
    ],
  };

  const events = poller.parseEspnScoreboardJson(json);
  assert.equal(events.length, 1);
  assert.equal(events[0].home, 'Argentina');
  assert.equal(events[0].away, 'France');
  assert.equal(events[0].state, 'in');
  assert.equal(events[0].period, 1);
  assert.equal(events[0].clock, "23'");
  assert.equal(events[0].id, '42');
  assert.equal(events[0].homeScore, 2);
  assert.equal(events[0].awayScore, 1);
});

test('parseEspnScoreboardJson: extracts venue correctly', () => {
  const json = {
    events: [
      makeEspnEvent({ id: '43', homeName: 'Brazil', awayName: 'Germany', state: 'pre' }),
    ],
  };
  const events = poller.parseEspnScoreboardJson(json);
  assert.equal(events[0].venue, 'MetLife Stadium');
});

test('parseEspnScoreboardJson: extracts groupName from notes headline', () => {
  const json = {
    events: [
      makeEspnEvent({ id: '44', homeName: 'Spain', awayName: 'England', state: 'pre', headline: 'Group E' }),
    ],
  };
  const events = poller.parseEspnScoreboardJson(json);
  assert.match(events[0].groupName ?? '', /group\s+e/i, 'groupName should contain group letter');
  assert.equal(events[0].roundName, undefined);
});

test('parseEspnScoreboardJson: extracts roundName when no group', () => {
  const json = {
    events: [
      makeEspnEvent({ id: '45', homeName: 'Netherlands', awayName: 'Portugal', state: 'pre', headline: 'Round of 32' }),
    ],
  };
  const events = poller.parseEspnScoreboardJson(json);
  assert.equal(events[0].groupName, undefined);
  assert.equal(events[0].roundName, 'Round of 32');
});

test('parseEspnScoreboardJson: handles empty events array', () => {
  const events = poller.parseEspnScoreboardJson({ events: [] });
  assert.equal(events.length, 0);
});

test('parseEspnScoreboardJson: handles missing/null json gracefully', () => {
  assert.equal(poller.parseEspnScoreboardJson(null).length, 0);
  assert.equal(poller.parseEspnScoreboardJson(undefined).length, 0);
  assert.equal(poller.parseEspnScoreboardJson({}).length, 0);
});

test('parseEspnScoreboardJson: skips events with fewer than 2 competitors', () => {
  const json = {
    events: [
      {
        id: '99',
        date: '2026-06-14T03:00Z',
        status: { type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false }, period: 0, displayClock: '' },
        competitions: [{ competitors: [{ homeAway: 'home', score: '0', team: { displayName: 'Alone', abbreviation: 'ALO', logo: '' }, statistics: [] }], notes: [], venue: null }],
      },
    ],
  };
  const events = poller.parseEspnScoreboardJson(json);
  assert.equal(events.length, 0, 'Should skip events with < 2 competitors');
});

test('parseEspnScoreboardJson: multiple events all parsed', () => {
  const json = {
    events: [
      makeEspnEvent({ id: '1', homeName: 'Argentina', awayName: 'Brazil', state: 'in' }),
      makeEspnEvent({ id: '2', homeName: 'France', awayName: 'Spain', state: 'post' }),
      makeEspnEvent({ id: '3', homeName: 'Germany', awayName: 'Italy', state: 'pre' }),
    ],
  };
  const events = poller.parseEspnScoreboardJson(json);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(e => e.state), ['in', 'post', 'pre']);
});

// ============================================================
// 2. getTeamAliases — Chinese alias lookup
// ============================================================

test('getTeamAliases: exported and returns object', () => {
  assert.equal(typeof poller.getTeamAliases, 'function', 'getTeamAliases should be exported');
  const aliases = poller.getTeamAliases();
  assert.equal(typeof aliases, 'object');
});

test('getTeamAliases: Argentina includes 阿根廷', () => {
  const aliases = poller.getTeamAliases();
  assert.ok(aliases['argentina'], 'argentina key should exist');
  assert.ok(aliases['argentina'].includes('阿根廷'), 'should include 阿根廷');
});

test('getTeamAliases: Brazil includes 巴西 and bra', () => {
  const aliases = poller.getTeamAliases();
  assert.ok(aliases['brazil'].includes('巴西'), 'should include 巴西');
  assert.ok(aliases['brazil'].includes('bra'), 'should include bra');
});

test('getTeamAliases: South Korea includes 韩国', () => {
  const aliases = poller.getTeamAliases();
  assert.ok(aliases['south korea'].includes('韩国'), 'should include 韩国');
});

test('getTeamAliases: United States includes 美国', () => {
  const aliases = poller.getTeamAliases();
  assert.ok(aliases['united states'].includes('美国'), 'should include 美国');
  assert.ok(aliases['united states'].includes('usa'), 'should include usa');
});

test('getTeamAliases: all WC_TEAMS have alias entries', () => {
  const teams = poller.getKnownTeams();
  const aliases = poller.getTeamAliases();
  const missing = teams.filter(t => !aliases[t.toLowerCase()]);
  assert.equal(missing.length, 0, `Teams missing aliases: ${missing.join(', ')}`);
});

test('getTeamAliases: returns a copy (mutating does not affect original)', () => {
  const a1 = poller.getTeamAliases();
  a1['argentina'] = ['hacked'];
  const a2 = poller.getTeamAliases();
  assert.ok(a2['argentina'].includes('阿根廷'), 'Original should be unaffected by mutation of returned copy');
});

// ============================================================
// 3. Existing functions unharmed — regression checks
// ============================================================

test('regression: collectNewKeyEvents still works after refactor', () => {
  const plays = [
    { id: '1', typeText: 'Goal', scoringPlay: true, teamName: 'Argentina', clock: "45'", text: 'Goal!', homeScore: 1, awayScore: 0 },
    { id: '2', typeText: 'Yellow Card', scoringPlay: false, teamName: 'France', clock: "50'", text: 'Booking.', homeScore: 1, awayScore: 0 },
  ];
  const fresh = poller.collectNewKeyEvents(plays, '1');
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].id, '2');
});

test('regression: appendPossessionPoint still works after refactor', () => {
  let pts = [];
  pts = poller.appendPossessionPoint(pts, 60, 3);
  pts = poller.appendPossessionPoint(pts, 55, 3);
  pts = poller.appendPossessionPoint(pts, 65, 3);
  assert.equal(pts.length, 3);
  assert.equal(pts[pts.length - 1], 0.65);
});

test('regression: isSecondHalfRestartTransition still works after refactor', () => {
  assert.equal(
    poller.isSecondHalfRestartTransition('STATUS_HALFTIME', { status: 'STATUS_SECOND_HALF', state: 'in', period: 2 }),
    true,
  );
  assert.equal(
    poller.isSecondHalfRestartTransition('STATUS_FIRST_HALF', { status: 'STATUS_IN_PROGRESS', state: 'in', period: 1 }),
    false,
  );
});

test('regression: getKnownTeams still works after refactor', () => {
  const teams = poller.getKnownTeams();
  assert.ok(Array.isArray(teams));
  assert.ok(teams.includes('Argentina'));
  assert.ok(teams.includes('Brazil'));
  assert.ok(teams.length >= 48, `Expected >= 48 teams, got ${teams.length}`);
});

// ============================================================
// 4. pickAutoFollowMatch — auto-follow a match with NO favorite team (Issue #1)
// ============================================================

const ev = (over) => Object.assign({
  id: '0', home: 'H', away: 'A', homeAbbr: 'H', awayAbbr: 'A', homeLogo: '', awayLogo: '',
  homeId: '', awayId: '', homeScore: 0, awayScore: 0, status: 'STATUS_SCHEDULED',
  state: 'pre', completed: false, statusText: '', period: 0, clock: '', utcDate: '',
  homeStats: {}, awayStats: {},
}, over);

const MIN = 60_000;
const NOW = Date.parse('2026-06-14T18:00:00Z');

test('pickAutoFollowMatch: returns null when there are no matches', () => {
  assert.equal(poller.pickAutoFollowMatch([], NOW), null);
});

test('pickAutoFollowMatch: prefers an in-progress match over everything else', () => {
  const live = ev({ id: 'live', state: 'in', utcDate: '2026-06-14T17:00:00Z' });
  const pre = ev({ id: 'pre', state: 'pre', utcDate: '2026-06-14T18:10:00Z' });
  assert.equal(poller.pickAutoFollowMatch([pre, live], NOW).id, 'live');
});

test('pickAutoFollowMatch: switches to the next match within 30 min of kickoff', () => {
  const post = ev({ id: 'post', state: 'post', utcDate: '2026-06-14T15:00:00Z' });
  const soon = ev({ id: 'soon', state: 'pre', utcDate: new Date(NOW + 20 * MIN).toISOString() });
  assert.equal(poller.pickAutoFollowMatch([post, soon], NOW).id, 'soon');
});

test('pickAutoFollowMatch: lingers on the last result until next match is imminent', () => {
  const post = ev({ id: 'post', state: 'post', utcDate: '2026-06-14T15:00:00Z' });
  const later = ev({ id: 'later', state: 'pre', utcDate: new Date(NOW + 180 * MIN).toISOString() });
  assert.equal(poller.pickAutoFollowMatch([post, later], NOW).id, 'post');
});

test('pickAutoFollowMatch: shows upcoming countdown when nothing finished yet', () => {
  const later = ev({ id: 'later', state: 'pre', utcDate: new Date(NOW + 180 * MIN).toISOString() });
  assert.equal(poller.pickAutoFollowMatch([later], NOW).id, 'later');
});

test('pickAutoFollowMatch: falls back to the most recent finished match', () => {
  const p1 = ev({ id: 'p1', state: 'post', utcDate: '2026-06-14T12:00:00Z' });
  const p2 = ev({ id: 'p2', state: 'post', utcDate: '2026-06-14T15:00:00Z' });
  assert.equal(poller.pickAutoFollowMatch([p1, p2], NOW).id, 'p2');
});

// ============================================================
// 5. neutralKeyEvent — team-named commentary when no fav picked (Issue #1)
// ============================================================

test('neutralKeyEvent: goal names the scoring team and stays excited (dance)', () => {
  const play = { id: 'g', typeText: 'Goal', scoringPlay: true, teamName: 'France', clock: "70'", text: 'Goal! Argentina 1, France 1. Kylian Mbappe (France).', homeScore: 1, awayScore: 1 };
  const e = poller.neutralKeyEvent(play, 'Argentina', 'France', false, 'Argentina 1-1 France', 'goal', 'Kylian Mbappe', "70' ");
  assert.equal(e.mood, 'dance');
  assert.match(e.message, /France/);
  assert.match(e.message, /进球|破门/);
});

test('neutralKeyEvent: an away goal is NOT framed as sad in neutral mode', () => {
  const play = { id: 'g', typeText: 'Goal', scoringPlay: true, teamName: 'France', clock: '', text: '', homeScore: 0, awayScore: 1 };
  const e = poller.neutralKeyEvent(play, 'Argentina', 'France', false, 'Argentina 0-1 France', 'goal', null, '');
  assert.notEqual(e.mood, 'sad');
});

test('neutralKeyEvent: red card stays neutral (watch) and names the team', () => {
  const play = { id: 'r', typeText: 'Red Card', scoringPlay: false, teamName: 'Brazil', clock: "55'", text: 'Red card.', homeScore: 0, awayScore: 0 };
  const e = poller.neutralKeyEvent(play, 'Brazil', 'Spain', true, 'Brazil 0-0 Spain', 'red card', null, "55' ");
  assert.equal(e.mood, 'watch');
  assert.match(e.message, /Brazil/);
  assert.match(e.message, /红牌/);
});

test('keyEventToGameEvent: rooting=false delegates to neutral commentary', () => {
  const play = { id: 'g', typeText: 'Goal', scoringPlay: true, teamName: 'Spain', clock: "10'", text: 'Goal! Spain.', homeScore: 0, awayScore: 1 };
  const e = poller.keyEventToGameEvent(play, 'Brazil', 'Spain', true, 0, 1, false);
  assert.notEqual(e.mood, 'sad', 'neutral viewer should not be sad about either goal');
  assert.match(e.message, /Spain/);
});

test('keyEventToGameEvent: rooting still partisan by default (我方/对方)', () => {
  const play = { id: 'g', typeText: 'Goal', scoringPlay: true, teamName: 'Brazil', clock: "10'", text: 'Goal! Brazil.', homeScore: 1, awayScore: 0 };
  const e = poller.keyEventToGameEvent(play, 'Brazil', 'Spain', true, 1, 0);
  assert.equal(e.mood, 'dance');
});

// ============================================================
// 6. buildKeyEventsFromPlays — expandable key-event panel (goal/card scorer+time)
//    Fixtures use the REAL ESPN fifa.world text formats observed on 2026-06-16.
// ============================================================

const KE_PLAYS = [
  { id: 'g1', typeText: 'Goal', scoringPlay: true, teamName: 'New Zealand', clock: "7'",
    text: 'Goal! IR Iran 0, New Zealand 1. Elijah Just (New Zealand) right footed shot from the centre of the box.' },
  { id: 'c1', typeText: 'Yellow Card', scoringPlay: false, teamName: 'Iran', clock: "89'",
    text: 'Ehsan Hajisafi (IR Iran) is shown the yellow card for a bad foul.' },
  { id: 'og', typeText: 'Own Goal', scoringPlay: true, teamName: 'Belgium', clock: "66'",
    text: 'Own Goal by Mohamed Hany, Egypt. Belgium 1, Egypt 1.' },
  { id: 'pa', typeText: 'Goal', scoringPlay: true, teamName: 'Spain', clock: "30'",
    text: 'Goal! Spain 1, France 0. Pedri (Spain) right footed shot from the centre of the penalty area.' },
  { id: 'pk', typeText: 'Goal - Penalty', scoringPlay: true, teamName: 'Spain', clock: "40'",
    text: 'Goal! Spain 2, France 0. Alvaro Morata (Spain) converts the penalty with a right footed shot.' },
  { id: 'corner', typeText: 'Corner', scoringPlay: false, teamName: 'Spain', clock: "12'", text: 'Corner, Spain.' },
];

test('buildKeyEventsFromPlays: filters to goals + cards only (drops corners etc.)', () => {
  assert.equal(typeof poller.buildKeyEventsFromPlays, 'function');
  const out = poller.buildKeyEventsFromPlays(KE_PLAYS, true);
  assert.equal(out.length, 5, 'corner should be filtered out');
});

test('buildKeyEventsFromPlays: goal carries scorer + running score', () => {
  const g = poller.buildKeyEventsFromPlays(KE_PLAYS, true).find(e => e.id === 'g1');
  assert.equal(g.type, 'goal');
  assert.equal(g.player, 'Elijah Just');
  assert.equal(g.clock, "7'");
  assert.equal(g.score, '0-1');   // myIsHome=true → Iran(home) 0 - NZ(away) 1
});

test('buildKeyEventsFromPlays: score orients to my-opp when fav is the away side', () => {
  const g = poller.buildKeyEventsFromPlays(KE_PLAYS, false).find(e => e.id === 'g1');
  assert.equal(g.score, '1-0');   // myIsHome=false → away 1 - home 0
});

test('buildKeyEventsFromPlays: yellow card carries the booked player, no score', () => {
  const c = poller.buildKeyEventsFromPlays(KE_PLAYS, true).find(e => e.id === 'c1');
  assert.equal(c.type, 'yellow');
  assert.equal(c.player, 'Ehsan Hajisafi');
  assert.equal(c.score, undefined);
});

test('buildKeyEventsFromPlays: own goal — distinct player parse + score', () => {
  const og = poller.buildKeyEventsFromPlays(KE_PLAYS, true).find(e => e.id === 'og');
  assert.equal(og.type, 'own-goal');
  assert.equal(og.player, 'Mohamed Hany');
  assert.equal(og.score, '1-1');
});

test('buildKeyEventsFromPlays: "penalty area" goal is NOT misread as a penalty', () => {
  const pa = poller.buildKeyEventsFromPlays(KE_PLAYS, true).find(e => e.id === 'pa');
  assert.equal(pa.type, 'goal');
  assert.equal(pa.player, 'Pedri');
});

test('buildKeyEventsFromPlays: real penalty (type "Goal - Penalty") classified as penalty', () => {
  const pk = poller.buildKeyEventsFromPlays(KE_PLAYS, true).find(e => e.id === 'pk');
  assert.equal(pk.type, 'penalty');
  assert.equal(pk.player, 'Alvaro Morata');
  assert.equal(pk.score, '2-0');
});
