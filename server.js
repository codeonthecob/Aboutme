import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

const PORT = process.env.PORT || 3000;
const MAX_WHISPERS = 80;
const WHISPER_TTL_MS = 1000 * 60 * 12; // 12 minutes
const NAME_MAX = 18;
const TEXT_MAX = 140;

/** @type {Map<string, Presence>} */
const presence = new Map();
/** @type {Whisper[]} */
let whispers = [];

app.use(express.static(join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    souls: presence.size,
    whispers: whispers.length,
    uptime: process.uptime(),
  });
});

function sanitize(str, max) {
  return String(str || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || 0));
}

function randomOrbit() {
  const r = 8 + Math.random() * 18;
  const theta = Math.random() * Math.PI * 2;
  const y = (Math.random() - 0.5) * 12;
  return {
    x: Math.cos(theta) * r,
    y,
    z: Math.sin(theta) * r,
  };
}

function publicPresence() {
  return [...presence.values()].map((p) => ({
    id: p.id,
    name: p.name,
    hue: p.hue,
    pos: p.pos,
    joinedAt: p.joinedAt,
  }));
}

function pruneWhispers() {
  const now = Date.now();
  whispers = whispers.filter((w) => now - w.createdAt < WHISPER_TTL_MS);
  if (whispers.length > MAX_WHISPERS) {
    whispers = whispers.slice(whispers.length - MAX_WHISPERS);
  }
}

io.on('connection', (socket) => {
  let self = null;

  socket.emit('bootstrap', {
    souls: publicPresence(),
    whispers: whispers.map(publicWhisper),
    serverTime: Date.now(),
  });

  socket.on('join', (payload = {}, ack) => {
    if (self) {
      if (typeof ack === 'function') ack({ ok: false, error: 'already_joined' });
      return;
    }

    const name = sanitize(payload.name, NAME_MAX) || `Soul-${socket.id.slice(0, 4)}`;
    const hue = clamp(payload.hue ?? Math.floor(Math.random() * 360), 0, 359);
    const pos = randomOrbit();

    self = {
      id: socket.id,
      name,
      hue,
      pos,
      joinedAt: Date.now(),
    };
    presence.set(socket.id, self);

    socket.emit('joined', { you: self, souls: publicPresence() });
    socket.broadcast.emit('soul:join', self);
    io.emit('stats', { souls: presence.size, whispers: whispers.length });

    if (typeof ack === 'function') ack({ ok: true, you: self });
  });

  socket.on('move', (payload = {}) => {
    if (!self) return;
    self.pos = {
      x: clamp(payload.x, -40, 40),
      y: clamp(payload.y, -20, 20),
      z: clamp(payload.z, -40, 40),
    };
    socket.broadcast.emit('soul:move', { id: self.id, pos: self.pos });
  });

  socket.on('whisper', (payload = {}, ack) => {
    if (!self) {
      if (typeof ack === 'function') ack({ ok: false, error: 'not_joined' });
      return;
    }

    const text = sanitize(payload.text, TEXT_MAX);
    if (!text) {
      if (typeof ack === 'function') ack({ ok: false, error: 'empty' });
      return;
    }

    pruneWhispers();

    const whisper = {
      id: randomUUID(),
      authorId: self.id,
      author: self.name,
      hue: self.hue,
      text,
      pos: {
        x: clamp(payload.x ?? self.pos.x + (Math.random() - 0.5) * 4, -40, 40),
        y: clamp(payload.y ?? self.pos.y + 1 + Math.random() * 2, -20, 20),
        z: clamp(payload.z ?? self.pos.z + (Math.random() - 0.5) * 4, -40, 40),
      },
      resonances: 0,
      resonatedBy: new Set(),
      createdAt: Date.now(),
    };

    whispers.push(whisper);
    const pub = publicWhisper(whisper);
    io.emit('whisper:new', pub);
    io.emit('stats', { souls: presence.size, whispers: whispers.length });

    if (typeof ack === 'function') ack({ ok: true, whisper: pub });
  });

  socket.on('resonate', (payload = {}) => {
    if (!self) return;
    const id = sanitize(payload.id, 64);
    const whisper = whispers.find((w) => w.id === id);
    if (!whisper) return;
    if (whisper.resonatedBy.has(self.id)) return;

    whisper.resonatedBy.add(self.id);
    whisper.resonances += 1;

    io.emit('whisper:resonate', {
      id: whisper.id,
      resonances: whisper.resonances,
      by: { id: self.id, name: self.name, hue: self.hue },
    });
  });

  socket.on('pulse', () => {
    if (!self) return;
    socket.broadcast.emit('soul:pulse', { id: self.id, hue: self.hue, at: Date.now() });
  });

  socket.on('disconnect', () => {
    if (!self) return;
    presence.delete(socket.id);
    io.emit('soul:leave', { id: self.id });
    io.emit('stats', { souls: presence.size, whispers: whispers.length });
    self = null;
  });
});

function publicWhisper(w) {
  return {
    id: w.id,
    authorId: w.authorId,
    author: w.author,
    hue: w.hue,
    text: w.text,
    pos: w.pos,
    resonances: w.resonances,
    createdAt: w.createdAt,
  };
}

setInterval(() => {
  const before = whispers.length;
  pruneWhispers();
  if (whispers.length !== before) {
    io.emit('whisper:sync', whispers.map(publicWhisper));
    io.emit('stats', { souls: presence.size, whispers: whispers.length });
  }
}, 30_000);

httpServer.listen(PORT, () => {
  console.log(`\n  ✦ AETHER is live on http://localhost:${PORT}\n`);
});
