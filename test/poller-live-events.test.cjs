const test = require('node:test');
const assert = require('node:assert/strict');

const poller = require('../dist-electron/poller.js');

test('extracts ESPN key events and commentary play-by-play into one ordered stream', () => {
  assert.equal(typeof poller.extractEspnPlaysFromSummary, 'function');

  const plays = poller.extractEspnPlaysFromSummary({
    keyEvents: [
      {
        id: 'goal-1',
        type: { text: 'Goal' },
        scoringPlay: true,
        team: { displayName: 'Mexico' },
        clock: { displayValue: "9'" },
        text: 'Goal! Mexico 1, South Africa 0. Julian Quinones (Mexico) right footed shot.',
      },
    ],
    commentary: [
      {
        sequence: 4,
        time: { displayValue: "4'" },
        text: 'Attempt blocked. Brian Gutierrez (Mexico) right footed shot from outside the box is blocked.',
        play: {
          id: 'shot-1',
          type: { text: 'Shot Blocked' },
          team: { displayName: 'Mexico' },
          clock: { displayValue: "4'" },
          text: 'Attempt blocked. Brian Gutierrez (Mexico) right footed shot from outside the box is blocked.',
        },
      },
      {
        sequence: 5,
        time: { displayValue: "5'" },
        text: 'Attempt saved. Raul Jimenez (Mexico) left footed shot is saved.',
        play: {
          id: 'shot-2',
          type: { text: 'Shot On Target' },
          team: { displayName: 'Mexico' },
          clock: { displayValue: "5'" },
          text: 'Attempt saved. Raul Jimenez (Mexico) left footed shot is saved.',
        },
      },
    ],
  });

  assert.deepEqual(plays.map(p => p.id), ['shot-1', 'shot-2', 'goal-1']);
  assert.deepEqual(plays.map(p => p.typeText), ['Shot Blocked', 'Shot On Target', 'Goal']);
});

test('surfaces non-scoring live moments as Chinese commentary bubbles', () => {
  const shot = {
    id: 'shot-2',
    typeText: 'Shot On Target',
    scoringPlay: false,
    teamName: 'Mexico',
    clock: "5'",
    text: 'Attempt saved. Raul Jimenez (Mexico) left footed shot is saved.',
    homeScore: 0,
    awayScore: 0,
  };
  const corner = {
    id: 'corner-1',
    typeText: 'Corner Awarded',
    scoringPlay: false,
    teamName: 'Mexico',
    clock: "6'",
    text: 'Corner, Mexico. Conceded by Ronwen Williams.',
    homeScore: 0,
    awayScore: 0,
  };
  const handball = {
    id: 'handball-1',
    typeText: 'Handball',
    scoringPlay: false,
    teamName: 'Mexico',
    clock: "10'",
    text: 'Handball by Raul Jimenez (Mexico).',
    homeScore: 0,
    awayScore: 0,
  };

  assert.equal(poller.collectNewKeyEvents([shot], undefined).length, 1);

  const shotEvent = poller.keyEventToGameEvent(shot, 'Mexico', 'South Africa', true, 0, 0);
  const cornerEvent = poller.keyEventToGameEvent(corner, 'Mexico', 'South Africa', true, 0, 0);
  const handballEvent = poller.keyEventToGameEvent(handball, 'Mexico', 'South Africa', true, 0, 0);

  assert.equal(shotEvent?.mood, 'cheer');
  assert.match(shotEvent?.message ?? '', /射正|扑出/);
  assert.equal(cornerEvent?.mood, 'watch');
  assert.match(cornerEvent?.message ?? '', /角球/);
  assert.equal(handballEvent?.mood, 'sad');
  assert.match(handballEvent?.message ?? '', /手球|失误/);
});

test('builds a capped possession curve from ESPN possessionPct values', () => {
  assert.equal(typeof poller.appendPossessionPoint, 'function');

  let points = [];
  points = poller.appendPossessionPoint(points, 54.5, 3);
  points = poller.appendPossessionPoint(points, 60.5, 3);
  points = poller.appendPossessionPoint(points, undefined, 3);
  points = poller.appendPossessionPoint(points, 62, 3);
  points = poller.appendPossessionPoint(points, 63, 3);

  assert.deepEqual(points, [0.605, 0.62, 0.63]);
});

test('second-half restart only fires after real halftime and period 2', () => {
  assert.equal(typeof poller.isSecondHalfRestartTransition, 'function');

  assert.equal(
    poller.isSecondHalfRestartTransition('STATUS_FIRST_HALF', {
      status: 'STATUS_IN_PROGRESS',
      state: 'in',
      period: 1,
    }),
    false,
  );
  assert.equal(
    poller.isSecondHalfRestartTransition('STATUS_HALFTIME', {
      status: 'STATUS_SECOND_HALF',
      state: 'in',
      period: 2,
    }),
    true,
  );
});
