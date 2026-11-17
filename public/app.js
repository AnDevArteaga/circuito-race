import { createTrack } from './track.js';

const $ = (id) => document.getElementById(id);
const broadcast = location.pathname === '/live';
document.documentElement.classList.toggle('broadcast', broadcast);
if (broadcast) document.title = 'Circuito Lunar · Emisión';
const draw = createTrack($('track'));
const phases = { ready: 'Parrilla', countdown: 'Salida', running: 'En carrera', paused: 'En pausa', finished: 'Finalizada' };
const statuses = {
  off: ['Modo demo', 'Prueba la carrera con pilotos de muestra.'],
  connecting: ['Conectando', 'Buscando TikFinity Desktop en este equipo.'],
  retry: ['Reconectando', 'Abre TikFinity Desktop en Windows y conéctalo a tu directo.'],
  connected: ['TikFinity conectado', 'Esperando el primer evento del LIVE.'],
};
let state;
let previous;
let frameAt = 0;
let streamReady = false;
let framePeriod = 100;
let lastRound;
let lastLog;
let lastRoster = '';
let lastRules = '';
let lastBoard = '';
let lastStageBoard = '';
let effectTimer;
let noticeTimer;

function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

function addAvatar(row, avatar) {
  if (!avatar) return;
  const image = element('img', '', 'avatar');
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.remove(), { once: true });
  image.src = avatar;
  row.append(image);
}

function displayCallout(title, subtitle = '', count = false) {
  const callout = $('callout');
  callout.classList.toggle('count', count);
  callout.textContent = title;
  if (subtitle) callout.append(element('small', subtitle));
}

function stageHud() {
  const { phase, settings, players, elapsed, countdown, winner, log } = state;
  const seconds = Math.ceil(settings.seconds - elapsed);
  $('clock').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  const leadLap = Math.floor(Math.max(0, players[0]?.distance ?? 0)) + 1;
  $('lap').textContent = 'VUELTA ' + Math.min(leadLap, settings.laps) + '/' + settings.laps;
  const top = players.slice(0, 3);
  const stageBoard = JSON.stringify(top.map(({ name, avatar }) => [name, avatar]));
  if (stageBoard !== lastStageBoard) {
    $('stageRanking').replaceChildren(...top.map((player, index) => {
      const row = element('div');
      row.append(element('b', '#' + (index + 1)));
      addAvatar(row, player.avatar);
      row.append(element('span', player.name, 'driver'));
      return row;
    }));
    lastStageBoard = stageBoard;
  }
  $('chatJoin').textContent = 'Escribe «' + settings.join + '» para correr';
  $('chatBoost').textContent = '«' + settings.boost + '» para acelerar';
  if (!streamReady) displayCallout('Reconectando con el juego');
  else if (phase === 'ready') displayCallout('Parrilla abierta', players.length + ' pilotos listos');
  else if (phase === 'countdown') displayCallout(String(Math.ceil(countdown)), '', true);
  else if (phase === 'paused') displayCallout('Carrera en pausa');
  else if (phase === 'finished') {
    const first = players.find((player) => player.id === winner);
    displayCallout(first ? '🏆 ' + first.name : 'Ronda finalizada', first ? 'Primer lugar' : '');
  } else displayCallout('');

  if (lastRound !== state.round || phase === 'finished') {
    $('effect').hidden = true;
    clearTimeout(effectTimer);
  }
  if (lastLog !== undefined && log[0]?.id !== lastLog && phase === 'running') {
    const newEvents = lastRound === state.round ? log.filter((entry) => entry.id > lastLog) : [];
    const effect = newEvents.find((entry) => entry.kind === 'gift' || entry.kind === 'boost' || entry.title.startsWith('¡Arrancaron') || entry.title.endsWith(' ganó!'));
    if (effect) {
      const icons = { gift: '✦ ', boost: '⚡ ', system: '' };
      $('effect').textContent = icons[effect.kind] + effect.title;
      if (effect.detail) $('effect').append(element('small', effect.detail));
      $('effect').hidden = false;
      clearTimeout(effectTimer);
      effectTimer = setTimeout(() => { $('effect').hidden = true; }, 3200);
    }
  }
}

function panelHud() {
  const { mode, bridge, lastLiveEvent, settings, phase, players, queued, log } = state;
  const [status, help] = statuses[bridge];
  const connection = $('connection');
  connection.classList.toggle('good', streamReady && bridge === 'connected');
  connection.classList.toggle('warn', !streamReady || bridge === 'retry');
  connection.replaceChildren(element('i'), document.createTextNode(streamReady ? status : 'Servidor desconectado'));
  $('bridgeHelp').textContent = bridge === 'connected' && lastLiveEvent
    ? 'Último evento del LIVE a las ' + new Date(lastLiveEvent).toLocaleTimeString('es')
    : help;
  $('modeTag').textContent = mode === 'demo' ? 'DEMO' : 'EN VIVO';
  $('phaseTag').textContent = phases[phase].toUpperCase();
  $('racers').textContent = players.length + (players.length === 1 ? ' PILOTO' : ' PILOTOS');
  $('queueHelp').textContent = queued + ' en espera para la próxima ronda';
  $('start').disabled = !streamReady || phase !== 'ready' || !players.length;
  $('pause').disabled = !streamReady || !['running', 'paused'].includes(phase);
  $('pause').textContent = phase === 'paused' ? 'Reanudar' : 'Pausar';
  $('simulator').hidden = mode !== 'demo';
  $('reconnect').hidden = mode !== 'live';
  $('reconnect').disabled = !streamReady;
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    button.disabled = !streamReady || !['ready', 'finished'].includes(phase);
  }
  for (const button of document.querySelectorAll('[data-event]')) {
    button.disabled = !streamReady || phase !== 'running' || !players.length || (button.dataset.event === 'gift' && !settings.gifts);
  }
  const roster = players.map(({ id }) => id).sort().join('\u0000');
  if (roster !== lastRoster) {
    const target = $('target');
    const selected = target.value;
    target.replaceChildren(...players.map((player) => {
      const option = element('option', player.name);
      option.value = player.id;
      return option;
    }));
    if (players.some((player) => player.id === selected)) target.value = selected;
    lastRoster = roster;
  }

  const board = players.map(({ id, name, avatar, color, distance, finishAt }) =>
    [id, name, avatar, color, Math.floor(Math.max(0, distance)), finishAt]);
  const boardKey = JSON.stringify(board);
  if (boardKey !== lastBoard) {
    $('ranking').replaceChildren(...board.map(([, name, avatar, color, lap, finish], index) => {
      const row = element('li');
      const dot = element('span', '', 'dot');
      dot.style.backgroundColor = color;
      row.append(element('span', String(index + 1), 'place'), dot);
      addAvatar(row, avatar);
      row.append(element('span', name, 'driver'), element('small', finish === null ? 'V ' + (lap + 1) : finish.toFixed(1) + ' s'));
      return row;
    }));
    if (!board.length) $('ranking').append(element('li', 'Esperando pilotos.', 'muted'));
    lastBoard = boardKey;
  }

  if (lastLog !== log[0]?.id) {
    const icons = { system: '●', join: '+', boost: '⚡', gift: '✦' };
    $('activity').replaceChildren(...log.map((entry) => {
      const row = element('li');
      const contents = element('div');
      contents.append(element('strong', entry.title));
      if (entry.detail) contents.append(element('small', entry.detail));
      row.append(element('span', icons[entry.kind], 'event-icon'), contents);
      return row;
    }));
  }

  const form = $('rules');
  const settingsKey = JSON.stringify(settings);
  if (settingsKey !== lastRules) {
    for (const [name, value] of Object.entries(settings)) {
      const field = form.elements.namedItem(name);
      if (field.type === 'checkbox') field.checked = value;
      else field.value = value;
    }
    lastRules = settingsKey;
  }
  for (const field of form.elements) field.disabled = !streamReady || phase !== 'ready';
}

const events = new EventSource('/events');
events.addEventListener('message', (message) => {
  const frame = JSON.parse(message.data);
  const now = performance.now();
  const sameRound = state?.round === frame.round;
  previous = sameRound ? new Map(state.players.map((player) => [player.id, player.distance])) : new Map();
  framePeriod = Math.max(45, Math.min(180, now - frameAt));
  frameAt = now;
  state = frame;
  streamReady = true;
  stageHud();
  if (!broadcast) panelHud();
  lastRound = frame.round;
  lastLog = frame.log[0]?.id ?? 0;
});
events.addEventListener('error', () => {
  streamReady = false;
  if (state) {
    stageHud();
    if (!broadcast) panelHud();
  } else displayCallout('Conectando con el juego');
});

function render(now) {
  const progress = Math.min(1, (now - frameAt) / framePeriod);
  const players = state?.players.map((player) => {
    const from = previous.get(player.id) ?? player.distance;
    return { ...player, distance: from + (player.distance - from) * progress };
  }) ?? [];
  draw(players, now);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

let commandPending = false;
async function command(payload) {
  if (commandPending) return false;
  commandPending = true;
  try {
    const response = await fetch('/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return true;
  } catch (error) {
    notice(error instanceof TypeError ? 'Revisa que el servidor siga abierto.' : error.message);
    return false;
  } finally {
    commandPending = false;
  }
}

function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 4500);
}

if (!broadcast) {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const { action, mode, clear, event: simulatedEvent } = button.dataset;
    if (action === 'reset' && clear && state && (state.players.length || state.queued) &&
        !window.confirm('¿Vaciar la lista de pilotos y la cola?')) return;
    if (action === 'reset' && state && ['running', 'paused', 'countdown'].includes(state.phase) && !clear &&
        !window.confirm('¿Terminar esta carrera para abrir una nueva ronda?')) return;
    void command({ action, mode, clear: clear === 'true', event: simulatedEvent, playerId: $('target').value });
  });
  $('joinForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (await command({ action: 'simulate', event: 'join', name: $('demoName').value })) $('demoName').value = '';
  });
  $('rules').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const settings = Object.fromEntries(data);
    for (const name of ['laps', 'seconds', 'maxRacers']) settings[name] = Number(settings[name]);
    settings.gifts = data.has('gifts');
    if (await command({ action: 'settings', settings })) notice('Reglas guardadas.');
  });
}
