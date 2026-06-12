const test = require('node:test');
const assert = require('node:assert/strict');

const poller = require('../dist-electron/poller.js');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test.afterEach(() => {
  poller.stopPoller();
});

test('replay mode publishes World Cup activity events without ESPN network access', async () => {
  const events = [];

  assert.equal(typeof poller.getCurrentScore, 'function');
  assert.equal(typeof poller.getCurrentPossession, 'function');

  poller.startPoller({
    favoriteTeams: ['Argentina'],
    mode: 'replay',
    onEvent: ev => events.push(ev),
  });

  await wait(1800);

  assert.ok(events.length > 0, 'expected replay mode to keep emitting activity events');
  assert.match(events[0].message, /Argentina|France|世界杯|决赛|开球/);
  assert.deepEqual(poller.getCurrentPossession(), []);
});
