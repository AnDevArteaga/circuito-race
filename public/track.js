const width = 540;
const height = 960;
const anchors = [
  [232, 225], [342, 225], [430, 250], [473, 310], [456, 394],
  [408, 480], [431, 555], [473, 640], [445, 719], [373, 759],
  [265, 770], [144, 757], [74, 712], [55, 640], [90, 558],
  [122, 485], [91, 411], [56, 334], [82, 266], [151, 231],
];

function spline(t) {
  const segment = Math.floor(t);
  const f = t - segment;
  const [a, b, c, d] = [-1, 0, 1, 2].map((offset) => anchors[(segment + offset + anchors.length) % anchors.length]);
  return [0, 1].map((axis) => (
    (2 * b[axis] + (-a[axis] + c[axis]) * f +
      (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * f ** 2 +
      (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * f ** 3) * 0.5
  ));
}

const points = [];
let length = 0;
for (let i = 0; i <= 800; i++) {
  const [x, y] = spline(i * anchors.length / 800);
  const last = points.at(-1);
  if (last) length += Math.hypot(x - last.x, y - last.y);
  points.push({ x, y, length });
}

function position(lap, lane = 0) {
  const distance = ((lap % 1 + 1) % 1) * length;
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid].length <= distance) low = mid;
    else high = mid;
  }
  const a = points[low];
  const b = points[high];
  const t = (distance - a.length) / (b.length - a.length);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return {
    x: a.x + (b.x - a.x) * t - Math.sin(angle) * lane,
    y: a.y + (b.y - a.y) * t + Math.cos(angle) * lane,
    angle,
  };
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function tile(ctx, x, y, w, h, radius, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function tree(ctx, x, y, size, palette) {
  ellipse(ctx, x + size * .5, y + 1, size * 1.12, size * .38, '#18373548');
  tile(ctx, x - size * .12, y - size * .58, size * .23, size * .64, 2, '#704a48');
  ellipse(ctx, x, y - size * .65, size * .77, size * .63, palette[0]);
  ellipse(ctx, x - size * .31, y - size * .86, size * .47, size * .43, palette[1]);
  ellipse(ctx, x + size * .22, y - size * .99, size * .42, size * .52, palette[1]);
  ellipse(ctx, x + size * .09, y - size * 1.23, size * .24, size * .16, palette[2]);
}

function stone(ctx, x, y, size) {
  ellipse(ctx, x + size * .55, y + 1, size * 1.15, size * .43, '#18373562');
  ellipse(ctx, x, y, size, size * .57, '#52668c');
  ellipse(ctx, x - size * .11, y - size * .27, size * .65, size * .36, '#909fc0');
}

function flower(ctx, x, y, size, color) {
  tile(ctx, x - 1, y - size, 2, size * 1.5, 1, '#295a43');
  for (let i = 0; i < 4; i++) {
    ellipse(ctx, x + Math.cos(i * Math.PI / 2) * size * .52, y - size + Math.sin(i * Math.PI / 2) * size * .52,
      size * .5, size * .44, color);
  }
  ellipse(ctx, x, y - size, size * .27, size * .27, '#ffe8a5');
}

const palettes = [
  ['#235742', '#378c65', '#71c486'],
  ['#694875', '#a369a3', '#e4a8ca'],
  ['#2f6264', '#529a88', '#8ed0a0'],
];

export function createTrack(canvas) {
  const ctx = canvas.getContext('2d');
  const scenery = document.createElement('canvas');
  scenery.width = canvas.width;
  scenery.height = canvas.height;
  const bg = scenery.getContext('2d');
  bg.scale(scenery.width / width, scenery.height / height);
  ctx.scale(canvas.width / width, canvas.height / height);
  const art = new Image();
  art.addEventListener('load', paintScenery);
  art.src = '/observatorio.png';

  const track = new Path2D();
  points.forEach(({ x, y }, index) => index ? track.lineTo(x, y) : track.moveTo(x, y));
  track.closePath();

  function paintScenery() {
    let seed = 4818;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const ground = bg.createLinearGradient(0, 0, width, height);
    ground.addColorStop(0, '#274e49');
    ground.addColorStop(.34, '#67954f');
    ground.addColorStop(.71, '#477e54');
    ground.addColorStop(1, '#204a46');
    bg.fillStyle = ground;
    bg.fillRect(0, 0, width, height);
    const floodlight = bg.createRadialGradient(221, 440, 28, 270, 458, 440);
    floodlight.addColorStop(0, '#bbc96775');
    floodlight.addColorStop(.67, '#96bd4530');
    floodlight.addColorStop(1, '#193c5d54');
    bg.fillStyle = floodlight;
    bg.fillRect(0, 0, width, height);
    // Paint over the field details later wherever the road passes.
    for (let i = 0; i < 1800; i++) {
      const x = random() * width;
      const y = random() * height;
      ellipse(bg, x, y, 1 + random() * 6, .5 + random() * 1.7, i % 2 ? '#d6ea7622' : '#163e4634');
    }
    for (let i = 0; i < 125; i++) {
      const x = random() * width;
      const y = random() * height;
      const outsideRoad = points.every((point) => Math.hypot(x - point.x, y - point.y) > 50);
      if (!outsideRoad) continue;
      if (i % 6 === 0) tree(bg, x, y, 11 + random() * 18, palettes[i % 11 < 4 ? 1 : i % 2 ? 2 : 0]);
      else if (i % 4 === 0) stone(bg, x, y, 4 + random() * 6);
      else for (let j = 0; j < 3; j++) flower(bg, x + 7 * j, y + random() * 5, 1.5 + random() * 2.5, i % 2 ? '#ffc6cf' : '#f4ce71');
    }
    tree(bg, 470, 161, 33, palettes[1]);
    tree(bg, 59, 165, 25, palettes[2]);
    tree(bg, 65, 806, 28, palettes[1]);
    tree(bg, 471, 825, 27, palettes[0]);
    tree(bg, 494, 869, 26, palettes[1]);
    tree(bg, 122, 866, 32, palettes[2]);

    bg.lineJoin = 'round';
    for (const [lineWidth, color] of [[91, '#1f463e85'], [84, '#283545'], [79, '#f5e3b6']]) {
      bg.lineWidth = lineWidth;
      bg.strokeStyle = color;
      bg.stroke(track);
    }
    bg.lineWidth = 79;
    bg.strokeStyle = '#9f80c9';
    bg.setLineDash([10, 11]);
    bg.stroke(track);
    bg.setLineDash([]);
    const road = bg.createLinearGradient(40, 180, 480, 800);
    road.addColorStop(0, '#4a536c');
    road.addColorStop(1, '#343f59');
    bg.lineWidth = 67;
    bg.strokeStyle = road;
    bg.stroke(track);
    bg.lineWidth = 1;
    bg.strokeStyle = '#d3e2ff2e';
    bg.setLineDash([10, 14]);
    bg.stroke(track);
    bg.setLineDash([]);

    for (const lap of [.18, .42, .66, .92]) {
      const { x, y, angle } = position(lap, -15);
      bg.save();
      bg.translate(x, y);
      bg.rotate(angle);
      tile(bg, -12, -8, 24, 16, 3, '#805c62');
      for (const shift of [-5, 3]) {
        bg.beginPath();
        bg.moveTo(shift - 3, -5);
        bg.lineTo(shift + 2, 0);
        bg.lineTo(shift - 3, 5);
        bg.lineWidth = 2;
        bg.strokeStyle = '#ffdc76';
        bg.stroke();
      }
      bg.restore();
    }

    const start = position(0);
    bg.save();
    bg.translate(start.x, start.y);
    bg.rotate(start.angle);
    for (let column = 0; column < 2; column++) {
      for (let row = 0; row < 10; row++) {
        bg.fillStyle = (column + row) % 2 ? '#23263e' : '#fff8df';
        bg.fillRect(-7 + column * 7, -35 + row * 7, 7, 7);
      }
    }
    for (const side of [-1, 1]) {
      const y = side * 43;
      ellipse(bg, 4, y + 2, 11, 4, '#121b355d');
      tile(bg, -4, y - 14, 8, 15, 3, '#493760');
      ellipse(bg, 0, y - 14, 5, 5, '#eed2ff');
    }
    bg.restore();

    ellipse(bg, 277, 599, 113, 90, '#38584434');
    if (art.complete && art.naturalWidth) bg.drawImage(art, 147, 296, 246, 394);
  }

  function kart(player, { x, y, angle }, time, rank) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = player.finishAt === null ? 1 : .78;
    ellipse(ctx, -1, 3, 15, 9, '#1016258f');
    if (player.boosted) {
      const pulse = Math.sin(time * 0.018 + rank) * 5;
      const flame = ctx.createLinearGradient(-31 - pulse, 0, -8, 0);
      flame.addColorStop(0, '#ff9c7900');
      flame.addColorStop(.7, '#ff9856');
      flame.addColorStop(1, '#fff4ad');
      ellipse(ctx, -19 - pulse * .5, 0, 13 + pulse * .5, 4, flame);
    }
    for (const wheelX of [-7, 8]) {
      for (const wheelY of [-8, 4]) tile(ctx, wheelX - 4, wheelY, 8, 4.8, 1.8, '#121925');
    }
    tile(ctx, -11.5, -6, 22, 12, 3, '#262237');
    tile(ctx, -9, -5.7, 22, 11, 3, player.color);
    tile(ctx, 3.3, -5.5, 9.7, 10.5, 3, '#ffffff37');
    tile(ctx, -11, -6.2, 4, 12.4, 1.4, player.color);
    ellipse(ctx, -2, .15, 4.6, 4.6, '#24273b');
    ellipse(ctx, -2.5, -.6, 3.9, 3.7, player.color);
    ellipse(ctx, -1.4, -1.4, 2, 1.6, '#fff2de');
    ctx.restore();
  }

  const portraits = new Map();

  function driverLabel(player, { x, y }, rank, occupied) {
    let portrait = portraits.get(player.avatar);
    if (player.avatar && !portrait) {
      portrait = new Image();
      portrait.referrerPolicy = 'no-referrer';
      portrait.src = player.avatar;
      if (portraits.size >= 144) portraits.delete(portraits.keys().next().value);
      portraits.set(player.avatar, portrait);
    }
    const hasPhoto = portrait?.complete && portrait.naturalWidth > 0;
    const name = [...player.name].slice(0, 12).join('');
    ctx.font = '800 11px system-ui, sans-serif';
    const labelWidth = hasPhoto ? 24 : Math.ceil(ctx.measureText(name).width) + 12;
    const labelHeight = hasPhoto ? 24 : 15;
    const offsets = [[0, 0], [-24, -7], [24, -7], [0, -24], [-45, -20], [45, -20], [-26, -34], [26, -34]];
    for (const [dx, dy] of offsets) {
      const left = Math.min(width - labelWidth - 2, Math.max(2, x - labelWidth / 2 + dx));
      const top = y - 13 - labelHeight + dy;
      const right = left + labelWidth;
      const bottom = top + labelHeight;
      const fits = occupied.every((box) => right + 2 < box.left || left > box.right + 2 ||
        bottom + 2 < box.top || top > box.bottom + 2);
      if (!fits) continue;
      occupied.push({ left, top, right, bottom });
      const center = left + labelWidth / 2;
      if (hasPhoto) {
        ctx.beginPath();
        ctx.moveTo(center, bottom - 1);
        ctx.lineTo(x, y - 8);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = player.color;
        ctx.stroke();
        ellipse(ctx, center, top + 12, 12, 12, player.color);
        const crop = Math.min(portrait.naturalWidth, portrait.naturalHeight);
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, top + 12, 10, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(portrait, (portrait.naturalWidth - crop) / 2, (portrait.naturalHeight - crop) / 2,
          crop, crop, left + 2, top + 2, 20, 20);
        ctx.restore();
      } else {
        tile(ctx, left, top, labelWidth, labelHeight, 4, '#17182bf1');
        ctx.fillStyle = rank === 0 ? '#f8e983' : '#fff';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(name, center, top + 8);
      }
      break;
    }
  }

  paintScenery();
  return (players, time) => {
    ctx.drawImage(scenery, 0, 0, width, height);
    const poses = players.map((player, index) => {
      if (player.finishAt === null) return position(player.distance, player.lane);
      return position(player.distance + .016 * Math.floor(index / 3), (index % 3 - 1) * 15);
    });
    for (let index = players.length - 1; index >= 0; index--) {
      kart(players[index], poses[index], time, index);
    }
    const occupied = [];
    for (const [index, player] of players.entries()) {
      driverLabel(player, poses[index], index, occupied);
    }
  };
}
