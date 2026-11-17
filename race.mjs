export const defaults = { laps: 3, seconds: 120, maxRacers: 24, join: 'yo', boost: 'turbo', gifts: true };
const colors = ['#ffd64c', '#ff779c', '#60ecd1', '#a898ff', '#fca268', '#7bd7ff', '#f692e7', '#d2f976'];
const demoNames = ['Luna', 'Nico', 'Kiara', 'Drako', 'Nova', 'Sol', 'Axel', 'Mika'];
const word = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase();
const integer = (value, min, max, fallback) => Number.isInteger(value) && value >= min && value <= max ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class Race {
  constructor() {
    this.mode = 'demo';
    this.settings = { ...defaults };
    this.serial = 0;
    this.log = [];
    this.bridge = 'off';
    this.lastLiveEvent = null;
    this.seen = new Map();
    this.reset(true);
  }

  reset(clear) {
    const previous = clear ? [] : [...this.queue.values(), ...this.players.values()].filter((player) => !player.bot);
    this.round = ++this.serial;
    this.phase = 'ready';
    this.players = new Map();
    this.queue = new Map();
    this.elapsed = 0;
    this.countdown = 3;
    this.winner = null;
    for (const player of previous) this.join(player);
    if (this.mode === 'demo') {
      for (const [index, name] of demoNames.entries()) this.join({ id: 'demo-' + index, name, bot: true });
    }
    this.note('system', 'Parrilla abierta', 'Escribe ' + this.settings.join + ' para correr');
  }

  note(kind, title, detail = '') {
    this.log.unshift({ id: ++this.serial, kind, title, detail, at: Date.now() });
    this.log.length = Math.min(this.log.length, 18);
  }

  join(profile) {
    if (this.players.has(profile.id) || this.queue.has(profile.id)) return this.players.get(profile.id);
    if (this.phase !== 'ready' || this.players.size >= this.settings.maxRacers) {
      if (profile.bot || this.queue.size >= 250) return;
      this.queue.set(profile.id, profile);
      this.note('join', profile.name, 'En fila para la próxima ronda');
      return;
    }
    const slot = this.players.size;
    const player = {
      ...profile, color: colors[slot % colors.length], lane: (slot % 3 - 1) * 15,
      distance: -0.014 * Math.floor(slot / 3 + 1), speed: 0.036 + Math.random() * 0.005,
      effectUntil: 0, nextBoost: 0, finishAt: null,
    };
    this.players.set(profile.id, player);
    if (!player.bot) this.note('join', player.name, 'Entró a la parrilla');
    return player;
  }

  applySettings(input) {
    if (this.phase !== 'ready') throw new Error('Abre una ronda nueva para cambiar las reglas.');
    const { laps, seconds, maxRacers, join, boost, gifts } = input ?? {};
    const joinWord = word(join);
    const boostWord = word(boost);
    const valid = /^[!\p{L}\p{N}_-]{1,20}$/u;
    if (!valid.test(joinWord) || !valid.test(boostWord) || joinWord === boostWord) {
      throw new Error('Usa dos comandos distintos de hasta 20 caracteres, sin espacios.');
    }
    this.settings = {
      laps: integer(laps, 1, 8, this.settings.laps),
      seconds: integer(seconds, 30, 600, this.settings.seconds),
      maxRacers: integer(maxRacers, 6, 48, this.settings.maxRacers),
      join: joinWord, boost: boostWord, gifts: gifts === true,
    };
    this.reset(false);
  }

  start() {
    if (this.phase !== 'ready') throw new Error('La parrilla solo se puede iniciar una vez por ronda.');
    if (!this.players.size) throw new Error('Hace falta al menos un piloto en la parrilla.');
    this.phase = 'countdown';
    this.note('system', 'Salida en 3 segundos');
  }

  turbo(player, seconds, kind, detail) {
    if (this.phase !== 'running' || !player || player.finishAt !== null) return false;
    if (kind === 'boost') {
      if (this.elapsed < player.nextBoost) return false;
      player.nextBoost = this.elapsed + 8;
    }
    player.effectUntil = Math.min(this.elapsed + 8, Math.max(this.elapsed, player.effectUntil) + seconds);
    this.note(kind, player.name, detail);
    return true;
  }

  consume(packet, live = true) {
    if ((live ? 'live' : 'demo') !== this.mode || !packet || typeof packet !== 'object') return;
    const { event, data } = packet;
    if (!data || typeof data !== 'object') return;
    if (live) this.lastLiveEvent = Date.now();
    if (event !== 'chat' && event !== 'gift') return;
    const user = data.user ?? data;
    const handle = user.uniqueId ?? data.uniqueId;
    // Prefer the same public handle across the legacy and nested formats.
    const rawId = handle || user.userId || data.userId;
    if (!rawId) return;
    const id = String(rawId).slice(0, 100).toLowerCase();
    const name = String(user.nickname || data.nickname || handle || 'Piloto')
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 24) || 'Piloto';

    const details = data.giftDetails ?? data.gift ?? {};
    const giftType = Number(data.giftType ?? details.giftType ?? details.gift_type);
    const repeatEnd = data.repeatEnd ?? data.repeat_end ?? details.repeat_end;
    if (event === 'gift' && giftType === 1 && ![true, 1, '1', 'true'].includes(repeatEnd)) return;
    const messageId = data.msgId ?? data.msg_id ?? data.common?.msgId ?? data.common?.messageId;
    const groupId = data.groupId ?? data.giftGroupId;
    const giftId = data.giftId ?? details.giftId ?? details.gift_id ?? '';
    const hasGroup = groupId && String(groupId) !== '0';
    const key = event === 'gift' && giftType === 1 && hasGroup
      ? 'gift:' + id + ':' + giftId + ':' + groupId
      : messageId && String(messageId) !== '0' && event + ':' + messageId;
    if (key) {
      const now = Date.now();
      if ((this.seen.get(key) ?? 0) > now - 15 * 60_000) return;
      this.seen.delete(key);
      this.seen.set(key, now);
      if (this.seen.size > 10_000) this.seen.delete(this.seen.keys().next().value);
    }

    if (event === 'chat') {
      const command = word(data.comment);
      if (command === this.settings.join) this.join({ id, name });
      if (command === this.settings.boost) this.turbo(this.players.get(id), 1.5, 'boost', 'Turbo de chat');
      return;
    }
    if (!this.settings.gifts) return;
    const count = clamp(Math.trunc(Number(data.repeatCount ?? data.repeat_count ?? 1)) || 1, 1, 100);
    const label = String(data.giftName ?? details.giftName ?? details.name ?? 'Regalo').trim().slice(0, 32) || 'Regalo';
    const detail = label + ' ×' + count;
    if (!this.turbo(this.players.get(id), Math.min(5, 2 + 0.5 * (count - 1)), 'gift', detail)) {
      this.note('gift', name, detail);
    }
  }

  tick(dt) {
    if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown === 0) {
        this.phase = 'running';
        this.note('system', '¡Arrancaron!');
      }
      return;
    }
    if (this.phase !== 'running') return;
    this.elapsed = Math.min(this.settings.seconds, this.elapsed + dt);
    for (const player of this.players.values()) {
      if (player.finishAt !== null) continue;
      const activeBoost = this.elapsed < player.effectUntil;
      const speed = player.speed * (1 + Math.sin(this.elapsed * 0.89 + player.lane * 0.18) * 0.065);
      const travel = dt * speed * (activeBoost ? 1.55 : 1);
      const distance = player.distance + travel;
      if (distance >= this.settings.laps) {
        player.finishAt = this.elapsed - dt * (distance - this.settings.laps) / travel;
        player.distance = this.settings.laps;
      } else {
        player.distance = distance;
      }
    }
    const ranking = this.ranking();
    const leader = ranking[0];
    if (!this.winner && leader?.finishAt != null) {
      this.winner = leader.id;
      this.note('system', '¡' + leader.name + ' ganó!', 'Completó todas las vueltas');
    }
    if (ranking.every((player) => player.finishAt !== null) || this.elapsed >= this.settings.seconds) {
      this.phase = 'finished';
      this.winner ??= leader?.id ?? null;
      this.note('system', 'Ronda finalizada', leader ? 'Primer lugar · ' + leader.name : '');
    }
  }

  ranking() {
    return [...this.players.values()].sort((a, b) =>
      (a.finishAt ?? Infinity) - (b.finishAt ?? Infinity) || b.distance - a.distance);
  }

  snapshot() {
    return {
      mode: this.mode, bridge: this.bridge, lastLiveEvent: this.lastLiveEvent, round: this.round,
      phase: this.phase, elapsed: this.elapsed, countdown: this.countdown, winner: this.winner,
      settings: this.settings, queued: this.queue.size, log: this.log,
      players: this.ranking().map(({ id, name, color, lane, distance, effectUntil, finishAt }) =>
        ({ id, name, color, lane, distance, boosted: effectUntil > this.elapsed && finishAt === null, finishAt })),
    };
  }
}
