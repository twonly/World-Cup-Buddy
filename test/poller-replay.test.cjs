const test = require('node:test');
const assert = require('node:assert/strict');

const poller = require('../dist-electron/poller.js');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test.afterEach(() => {
  poller.stopPoller();
});

test('replay mode publishes scoreboard, win probability, and activity events', async () => {
  const scores = [];
  const winProbUpdates = [];
  const events = [];

  assert.equal(typeof poller.getCurrentScore, 'function');
  assert.equal(typeof poller.getCurrentWinProb, 'function');

  poller.startPoller({
    favoriteTeams: ['San Antonio Spurs'],
    mode: 'replay',
    onEvent: ev => events.push(ev),
    onScore: score => scores.push(score),
    onWinProb: points => winProbUpdates.push(points),
  });

  await wait(1800);

  const score = poller.getCurrentScore();
  const winProb = poller.getCurrentWinProb();

  assert.ok(scores.some(Boolean), 'expected replay mode to emit a visible scoreboard');
  assert.equal(score?.myTeam, 'San Antonio Spurs');
  assert.ok(winProbUpdates.some(points => Array.isArray(points) && points.length > 1), 'expected replay mode to emit a win probability curve');
  assert.ok(Array.isArray(winProb) && winProb.length > 1, 'expected latest win probability to be readable as a snapshot');
  assert.ok(events.length > 0, 'expected replay mode to keep emitting activity events');
});
