import { AetherScene } from './scene.js';
import { AetherAudio } from './audio.js';

const $ = (sel) => document.querySelector(sel);

const gate = $('#gate');
const joinForm = $('#join-form');
const nameInput = $('#name-input');
const hueInput = $('#hue-input');
const hueVal = $('#hue-val');
const auraPreview = $('#aura-preview');
const hud = $('#hud');
const composer = $('#composer');
const soulsPanel = $('#souls-panel');
const soulsList = $('#souls-list');
const whisperForm = $('#whisper-form');
const whisperInput = $('#whisper-input');
const pulseBtn = $('#pulse-btn');
const toastEl = $('#toast');
const feed = $('#whisper-feed');
const youChip = $('#you-chip');
const statSouls = $('#stat-souls');
const statWhispers = $('#stat-whispers');
const gateGlow = $('.gate-glow');

const scene = new AetherScene($('#stage'));
const audio = new AetherAudio();
const socket = io({ transports: ['websocket', 'polling'] });

/** @type {Map<string, object>} */
const souls = new Map();
let me = null;
let toastTimer = null;

function updateAuraUI() {
  const h = Number(hueInput.value);
  hueVal.textContent = `${h}°`;
  auraPreview.style.background = `linear-gradient(90deg, hsl(${h}, 90%, 65%), hsl(${(h + 60) % 360}, 90%, 70%))`;
  auraPreview.style.boxShadow = `0 0 28px hsla(${h}, 100%, 70%, 0.55)`;
  gateGlow.style.background = `radial-gradient(circle, hsla(${h}, 100%, 70%, 0.35), transparent 70%)`;
}

hueInput.addEventListener('input', updateAuraUI);
updateAuraUI();

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
}

function setStats({ souls: s, whispers: w }) {
  if (typeof s === 'number') statSouls.textContent = `${s} soul${s === 1 ? '' : 's'}`;
  if (typeof w === 'number') statWhispers.textContent = `${w} whisper${w === 1 ? '' : 's'}`;
  audio.setActivity(Math.min(1, ((s || 0) + (w || 0) * 0.15) / 12));
}

function renderSoulsList() {
  const items = [...souls.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  soulsList.innerHTML = items
    .map(
      (s) => `
      <li>
        <span class="swatch" style="background:hsl(${s.hue},80%,65%);color:hsl(${s.hue},80%,65%)"></span>
        <span>${escapeHtml(s.name)}${s.id === me?.id ? ' · you' : ''}</span>
      </li>`
    )
    .join('');
}

function pushFeed(whisper) {
  const el = document.createElement('div');
  el.className = 'feed-item';
  el.innerHTML = `
    <div class="who" style="color:hsl(${whisper.hue},80%,70%)">${escapeHtml(whisper.author)}</div>
    <div class="msg">${escapeHtml(whisper.text)}</div>
  `;
  feed.prepend(el);
  while (feed.children.length > 4) feed.lastChild.remove();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function enterField(you) {
  me = you;
  scene.setSelf(you.id);
  souls.set(you.id, you);
  scene.upsertSoul(you);

  gate.classList.add('hidden');
  hud.classList.remove('hidden');
  composer.classList.remove('hidden');
  soulsPanel.classList.remove('hidden');
  feed.classList.remove('hidden');

  youChip.innerHTML = `
    <span class="swatch" style="background:hsl(${you.hue},80%,65%);color:hsl(${you.hue},80%,65%)"></span>
    <span>${escapeHtml(you.name)}</span>
  `;
  renderSoulsList();
  toast(`Welcome, ${you.name}. The field hears you.`);
  whisperInput.focus();
}

joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await audio.unlock();

  const name = nameInput.value.trim();
  const hue = Number(hueInput.value);

  socket.emit('join', { name, hue }, (res) => {
    if (!res?.ok) {
      toast('Could not enter the field. Try again.');
      return;
    }
    enterField(res.you);
  });
});

whisperForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!me) return;
  const text = whisperInput.value.trim();
  if (!text) return;

  const soul = scene.souls.get(me.id);
  const pos = soul
    ? {
        x: soul.group.position.x + (Math.random() - 0.5) * 3,
        y: soul.group.position.y + 1.5,
        z: soul.group.position.z + (Math.random() - 0.5) * 3,
      }
    : undefined;

  socket.emit('whisper', { text, ...pos }, (res) => {
    if (!res?.ok) {
      toast('Whisper faded before it reached the aether.');
      return;
    }
    whisperInput.value = '';
    audio.whisperTone(me.hue);
  });
});

pulseBtn.addEventListener('click', async () => {
  await audio.unlock();
  if (!me) return;
  socket.emit('pulse');
  scene.pulseSoul(me.id);
  audio.pulseTone(me.hue);
});

scene.onWhisperClick = (id) => {
  if (!me) return;
  socket.emit('resonate', { id });
  audio.resonateTone();
};

scene.onMove = (pos) => {
  if (!me) return;
  socket.emit('move', pos);
};

// --- Socket events ---

socket.on('connect', () => {
  if (me) {
    // reconnect: rejoin with same vibe
    socket.emit('join', { name: me.name, hue: me.hue }, (res) => {
      if (res?.ok) {
        me = res.you;
        scene.setSelf(me.id);
        toast('Reconnected to the field.');
      }
    });
  }
});

socket.on('bootstrap', ({ souls: list, whispers, serverTime: _ }) => {
  list.forEach((s) => {
    souls.set(s.id, s);
    scene.upsertSoul(s);
  });
  whispers.forEach((w) => scene.upsertWhisper(w));
  setStats({ souls: list.length, whispers: whispers.length });
  renderSoulsList();
});

socket.on('joined', ({ you, souls: list }) => {
  // handled via ack mostly; keep as fallback
  if (!me) enterField(you);
  souls.clear();
  list.forEach((s) => {
    souls.set(s.id, s);
    scene.upsertSoul(s);
  });
  renderSoulsList();
});

socket.on('soul:join', (soul) => {
  souls.set(soul.id, soul);
  scene.upsertSoul(soul);
  renderSoulsList();
  if (me) toast(`${soul.name} entered the field`);
});

socket.on('soul:leave', ({ id }) => {
  const gone = souls.get(id);
  souls.delete(id);
  scene.removeSoul(id);
  renderSoulsList();
  if (gone && me) toast(`${gone.name} drifted away`);
});

socket.on('soul:move', ({ id, pos }) => {
  scene.moveSoul(id, pos);
  const s = souls.get(id);
  if (s) s.pos = pos;
});

socket.on('soul:pulse', ({ id, hue }) => {
  scene.pulseSoul(id);
  audio.pulseTone(hue);
});

socket.on('whisper:new', (whisper) => {
  scene.upsertWhisper(whisper);
  pushFeed(whisper);
  if (!me || whisper.authorId !== me.id) audio.whisperTone(whisper.hue);
});

socket.on('whisper:resonate', ({ id, resonances, by }) => {
  scene.resonateWhisper(id, resonances);
  if (by?.id !== me?.id) audio.resonateTone();
});

socket.on('whisper:sync', (list) => {
  scene.syncWhispers(list);
  setStats({ whispers: list.length });
});

socket.on('stats', setStats);

socket.on('disconnect', () => {
  toast('Connection lost — waiting for the aether…');
});

// random placeholder names vibe
const placeholders = ['nova', 'ember', 'drift', 'iris', 'kairo', 'lumen', 'ash', 'zen'];
nameInput.placeholder = `e.g. ${placeholders[Math.floor(Math.random() * placeholders.length)]}…`;
