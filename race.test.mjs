import test from 'node:test';
import assert from 'node:assert/strict';
import { Race } from './race.mjs';

function liveRace() {
  const race = new Race();
  race.mode = 'live';
  race.reset(true);
  return race;
}

function chat(race, uniqueId, comment) {
  race.consume({ event: 'chat', data: { user: { uniqueId, nickname: uniqueId }, comment } });
}

test('inscribe una sola vez y da prioridad a los pilotos de la cola en la próxima ronda', () => {
  const race = liveRace();
  assert.throws(() => race.start(), /Hace falta/);
  race.applySettings({ ...race.settings, maxRacers: 6, join: '!yo' });
  for (let i = 0; i < 6; i++) chat(race, 'piloto' + i, '!YO');
  chat(race, 'piloto0', '!yo');
  race.start();
  chat(race, 'siguiente', '!yo');
  assert.equal(race.players.size, 6);
  assert.equal(race.queue.size, 1);
  race.reset(false);
  assert.equal(race.players.size, 6);
  assert.ok(race.players.has('siguiente'));
  assert.equal(race.queue.size, 1);
});

test('acepta los dos formatos de TikFinity y aplica un combo de regalos una sola vez', () => {
  const race = liveRace();
  chat(race, 'Luna', 'yo');
  race.start();
  race.tick(3);
  const data = {
    uniqueId: 'luna', giftType: 1, repeatEnd: false, repeatCount: 2,
    giftName: 'Rosa', giftId: 42, groupId: '100', msgId: '500',
  };
  const gift = (payload) => race.consume({ event: 'gift', data: payload });
  gift(data);
  assert.equal(race.players.get('luna').effectUntil, 0);
  gift({ ...data, repeatEnd: true });
  gift({ ...data, repeatEnd: true, msgId: '501' });
  assert.equal(race.players.get('luna').effectUntil, 2.5);
  assert.equal(race.log.filter((entry) => entry.kind === 'gift').length, 1);
  gift({ user: { uniqueId: 'Luna' }, giftDetails: { giftType: 2, giftName: 'Estrella' }, msgId: '502' });
  assert.equal(race.players.get('luna').effectUntil, 4.5);
});

test('enfría el turbo de chat y finaliza por vueltas o por reloj', () => {
  const race = liveRace();
  race.applySettings({ ...race.settings, laps: 1, seconds: 50 });
  chat(race, 'Sol', 'yo');
  race.start();
  race.tick(3);
  chat(race, 'Sol', 'turbo');
  chat(race, 'Sol', 'turbo');
  assert.equal(race.log.filter((entry) => entry.kind === 'boost').length, 1);
  for (let i = 0; i < 500; i++) race.tick(0.1);
  assert.equal(race.phase, 'finished');
  assert.equal(race.winner, 'sol');
  assert.ok(race.players.get('sol').finishAt < 50);

  race.reset(false);
  race.applySettings({ ...race.settings, laps: 8, seconds: 30 });
  race.start();
  race.tick(3);
  for (let i = 0; i < 310; i++) race.tick(0.1);
  assert.equal(race.phase, 'finished');
  assert.equal(race.winner, 'sol');
  assert.equal(race.players.get('sol').finishAt, null);
});
