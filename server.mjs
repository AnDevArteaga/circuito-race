import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Race, avatarDomains } from './race.mjs';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 8765);
const avatarSources = avatarDomains.map((domain) => 'https://*.' + domain).join(' ');
const race = new Race();
const clients = new Set();
let socket;
let retry;
let retryDelay = 1000;
let demoId = 0;

function connectBridge() {
  if (race.mode !== 'live' || socket) return;
  race.bridge = 'connecting';
  const connection = new WebSocket('ws://127.0.0.1:21213/');
  socket = connection;
  const timeout = setTimeout(() => connection.close(), 5000);
  connection.addEventListener('open', () => {
    if (socket !== connection) return;
    clearTimeout(timeout);
    race.bridge = 'connected';
    retryDelay = 1000;
  });
  connection.addEventListener('message', ({ data }) => {
    if (socket !== connection || typeof data !== 'string' || data.length > 256_000) return;
    try { race.consume(JSON.parse(data)); } catch { /* Ignore malformed events. */ }
  });
  connection.addEventListener('close', () => {
    clearTimeout(timeout);
    if (socket !== connection) return;
    socket = undefined;
    race.bridge = 'retry';
    retry = setTimeout(connectBridge, retryDelay);
    retryDelay = Math.min(12_000, retryDelay * 2);
  });
}

function disconnectBridge() {
  clearTimeout(retry);
  const connection = socket;
  socket = undefined;
  connection?.close();
  race.bridge = 'off';
  race.lastLiveEvent = null;
  retryDelay = 1000;
}

const demoPacket = (event, data) => race.consume({ event, data }, false);
const commands = {
  start: () => race.start(),
  pause: () => {
    if (race.phase === 'running') race.phase = 'paused';
    else if (race.phase === 'paused') race.phase = 'running';
    else throw new Error('La carrera tiene que estar en marcha.');
  },
  reset: ({ clear }) => race.reset(clear === true),
  settings: ({ settings }) => race.applySettings(settings),
  mode: ({ mode }) => {
    if (mode !== 'demo' && mode !== 'live') throw new Error('Modo desconocido.');
    if (mode === race.mode) return;
    if (!['ready', 'finished'].includes(race.phase)) throw new Error('Abre una ronda nueva antes de cambiar de modo.');
    disconnectBridge();
    race.mode = mode;
    race.log = [];
    race.reset(true);
    if (mode === 'live') connectBridge();
  },
  reconnect: () => {
    if (race.mode !== 'live') throw new Error('Activa el modo TikTok LIVE primero.');
    disconnectBridge();
    connectBridge();
  },
  simulate: ({ event, playerId, name }) => {
    if (race.mode !== 'demo') throw new Error('La simulación está disponible en el modo demo.');
    if (event === 'join') {
      const index = ++demoId;
      demoPacket('chat', { uniqueId: 'sim-' + index, nickname: String(name || '').trim() || 'Invitado ' + index, comment: race.settings.join });
      return;
    }
    const player = race.players.get(playerId) ?? race.ranking()[0];
    if (!player || !['boost', 'gift'].includes(event)) throw new Error('Selecciona un piloto y un evento de prueba.');
    const user = { uniqueId: player.id, nickname: player.name };
    if (event === 'boost') demoPacket('chat', { user, comment: race.settings.boost });
    if (event === 'gift') {
      if (!race.settings.gifts) throw new Error('Los efectos de regalos están desactivados.');
      demoPacket('gift', { user, giftType: 1, repeatEnd: true, repeatCount: 3, giftName: 'Rosa de prueba' });
    }
  },
};

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/live', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/track.js', ['track.js', 'text/javascript; charset=utf-8']],
  ['/observatorio.png', ['observatorio.png', 'image/png']],
]);

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function publish() {
  if (!clients.size) return;
  const frame = 'data: ' + JSON.stringify(race.snapshot()) + '\n\n';
  for (const client of clients) {
    if (client.writableLength < 32_000) client.write(frame);
  }
}

let lastTick = performance.now();
let lastPublish = lastTick;
setInterval(() => {
  const now = performance.now();
  race.tick(Math.min(0.2, (now - lastTick) / 1000));
  lastTick = now;
  if (now - lastPublish >= 90) {
    publish();
    lastPublish = now;
  }
}, 1000 / 30).unref();

const server = createServer(async (request, response) => {
  const requestedHost = request.headers.host;
  if (![host + ':' + port, 'localhost:' + port].includes(requestedHost)) {
    return json(response, 403, { error: 'Abre el juego con su dirección local.' });
  }
  const path = request.url.split('?')[0];
  if (request.method === 'GET' && path === '/events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    response.write('retry: 1000\ndata: ' + JSON.stringify(race.snapshot()) + '\n\n');
    clients.add(response);
    response.on('close', () => clients.delete(response));
    return;
  }
  if (request.method === 'POST' && path === '/control') {
    if (request.headers.origin !== 'http://' + requestedHost ||
        request.headers['content-type']?.split(';')[0] !== 'application/json') {
      return json(response, 403, { error: 'Control disponible desde el panel local.' });
    }
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 8192) {
          json(response, 413, { error: 'Solicitud demasiado grande.' });
          return;
        }
      }
      const payload = JSON.parse(body);
      if (!payload || !Object.hasOwn(commands, payload.action)) throw new Error('Acción desconocida.');
      commands[payload.action](payload);
      publish();
      return json(response, 200, { ok: true });
    } catch (error) {
      return json(response, 400, { error: error instanceof SyntaxError ? 'Solicitud inválida.' : error.message });
    }
  }
  const file = request.method === 'GET' && files.get(path);
  if (!file) return json(response, 404, { error: 'Página no encontrada.' });
  try {
    const content = await readFile(new URL('./public/' + file[0], import.meta.url));
    response.writeHead(200, {
      'Content-Type': file[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' " + avatarSources + "; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
    });
    response.end(content);
  } catch {
    json(response, 500, { error: 'Falta un archivo del juego.' });
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? 'El puerto ' + port + ' ya está ocupado. Si el juego ya está abierto, usa el panel existente.' : error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log('Circuito Lunar');
  console.log('Panel   http://' + host + ':' + port + '/');
  console.log('Directo http://' + host + ':' + port + '/live');
});
