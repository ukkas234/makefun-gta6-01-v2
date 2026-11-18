// Solmara — HUD. DOM + live canvas minimap. No network, system fonts only.
// Contract (spec): createHUD() returns { update(state), showMessage(text),
// setObjective(text), setMission(title), flash(text) }.
// state: { health, wanted, money, speed, clock, armed, muted, screen,
//          minimap: { player, cars, police, pedestrians, marker, north } }
//   player: { x, z, heading }; cars/police/pedestrians: [{x, z}] or car objects;
//   marker: { x, z } | null; clock: game hours 0-24 (seconds also accepted).
// City bounds for the minimap: -260..260 m on both axes (spec world size).

const CITY_MIN = -260;
const CITY_MAX = 260;
const CITY_SPAN = CITY_MAX - CITY_MIN;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatClock(clock) {
  if (typeof clock !== 'number' || Number.isNaN(clock)) return '--:--';
  let hours = clock;
  if (hours >= 24) hours = (hours / 3600) % 24; // seconds since midnight
  hours = ((hours % 24) + 24) % 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function createHUD() {
  const root = el('div', 'solmara-hud');
  root.id = 'solmara-hud';

  const objective = el('div', 'hud-objective', 'Free roam — open the pause menu to start a mission');
  objective.id = 'hud-objective';
  const missionLabel = el('div', 'hud-mission', '');
  missionLabel.id = 'hud-mission';

  const topLeft = el('div', 'hud-topleft');
  const healthWrap = el('div', 'hud-health');
  const healthBar = el('div', 'hud-health-bar');
  healthWrap.appendChild(healthBar);
  const healthText = el('span', 'hud-health-text', '100');
  const stars = el('div', 'hud-stars', '☆☆☆☆☆');
  stars.id = 'hud-stars';
  const cash = el('div', 'hud-cash', '$0');
  cash.id = 'hud-cash';
  topLeft.append(healthWrap, healthText, stars, cash);

  const topRight = el('div', 'hud-topright');
  const clockEl = el('div', 'hud-clock', '--:--');
  clockEl.id = 'hud-clock';
  const speedEl = el('div', 'hud-speed', '');
  speedEl.id = 'hud-speed';
  const muteEl = el('div', 'hud-mute', '');
  muteEl.id = 'hud-mute';
  topRight.append(clockEl, speedEl, muteEl);

  const minimap = document.createElement('canvas');
  minimap.id = 'hud-minimap';
  minimap.className = 'hud-minimap';
  minimap.width = 180;
  minimap.height = 180;
  const mapCtx = minimap.getContext('2d');

  const feed = el('div', 'hud-feed');
  feed.id = 'hud-feed';

  const crosshair = el('div', 'hud-crosshair', '+');
  crosshair.id = 'hud-crosshair';
  crosshair.style.display = 'none';

  const flashEl = el('div', 'hud-flash', '');
  flashEl.id = 'hud-flash';

  root.append(objective, missionLabel, topLeft, topRight, minimap, feed, crosshair, flashEl);
  document.body.appendChild(root);

  const messages = [];
  let flashTimer = null;

  function toMap(x, z) {
    return [
      ((x - CITY_MIN) / CITY_SPAN) * minimap.width,
      ((z - CITY_MIN) / CITY_SPAN) * minimap.height,
    ];
  }

  function drawMinimap(map) {
    const ctx = mapCtx;
    const w = minimap.width;
    const h = minimap.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12, 18, 26, 0.85)';
    ctx.fillRect(0, 0, w, h);
    // Roads: grid lines every 52 m, plus the coast strip at the south edge.
    ctx.strokeStyle = '#5a6472';
    ctx.lineWidth = 3;
    for (let c = CITY_MIN; c <= CITY_MAX; c += 52) {
      const [rx] = toMap(c, 0);
      const [, rz] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, rz); ctx.lineTo(w, rz); ctx.stroke();
    }
    ctx.fillStyle = '#2e6f8e';
    ctx.fillRect(0, h - 6, w, 6); // water along the south edge
    // Mission marker: pulsing yellow diamond.
    if (map && map.marker) {
      const [mx, my] = toMap(map.marker.x, map.marker.z);
      const pulse = 5 + 2 * Math.sin(performance.now() / 180);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse - 3); ctx.lineTo(mx + pulse, my);
      ctx.lineTo(mx, my + pulse + 3); ctx.lineTo(mx - pulse, my);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }
    const dot = (list, color, r) => {
      if (!Array.isArray(list)) return;
      ctx.fillStyle = color;
      for (const item of list) {
        if (!item) continue;
        const [dx, dy] = toMap(item.x, item.z);
        ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill();
      }
    };
    dot(map && map.pedestrians, '#9aa3ad', 1.5);
    dot(map && map.cars, '#e8e8e8', 2.5);
    dot(map && map.police, '#3fa9ff', 3);
    // Player: white triangle rotated by heading (heading 0 = facing north, -z).
    if (map && map.player) {
      const [px, py] = toMap(map.player.x, map.player.z);
      const heading = map.player.heading || 0;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-heading);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // North indicator.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', 6, 13);
  }

  function showMessage(text) {
    if (!text) return;
    messages.push(String(text));
    while (messages.length > 4) messages.shift();
    feed.innerHTML = '';
    for (const msg of messages) feed.appendChild(el('div', 'hud-feed-item', msg));
  }

  function setObjective(text) {
    objective.textContent = text || '';
  }

  function setMission(title) {
    missionLabel.textContent = title ? `Mission: ${title}` : '';
  }

  function flash(text) {
    flashEl.textContent = text || '';
    flashEl.classList.add('show');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove('show'), 2600);
  }

  function update(state) {
    if (!state) return;
    const playing = !state.screen || state.screen === 'play' || state.screen === 'paused';
    root.style.display = playing ? '' : 'none';
    if (!playing) return;

    const health = Math.max(0, Math.min(100, Math.round(state.health ?? 100)));
    healthBar.style.width = `${health}%`;
    healthBar.style.background = health > 50 ? '#37c978' : health > 25 ? '#f2a93b' : '#e5534b';
    healthText.textContent = String(health);

    const wanted = Math.max(0, Math.min(5, Math.round(state.wanted ?? 0)));
    stars.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
    stars.style.color = wanted > 0 ? '#ffd23f' : '#8b93a3';

    cash.textContent = `$${Math.floor(state.money ?? 0).toLocaleString('en-US')}`;
    clockEl.textContent = formatClock(state.clock);
    const speed = state.speed || 0;
    speedEl.textContent = speed > 0.5 ? `${Math.round(speed * 3.6)} km/h` : '';
    muteEl.textContent = state.muted ? 'MUTED (M)' : '';
    crosshair.style.display = state.armed ? '' : 'none';
    drawMinimap(state.minimap || null);
  }

  return { update, showMessage, setObjective, setMission, flash, root, minimap };
}
