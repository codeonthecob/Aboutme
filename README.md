# AETHER — Shared Frequency

A live, multiplayer **3D mindscape** where anyone can drop in as a glowing soul, cast whispers into space, and resonate with strangers in real time.

No accounts. No algorithmic feed. Just presence.

## What it is

- **Enter the field** with a soul name + aura hue
- **Drift** in a shared WebGL cosmos with everyone who's online
- **Cast whispers** — short thoughts that float as luminous capsules others can see
- **Resonate** by clicking a whisper — it blooms and grows
- **Pulse** to send a visual + sonic heartbeat across the field
- Ambient generative audio reacts to collective activity

## Stack

| Layer | Tech |
|-------|------|
| Realtime | Socket.IO |
| Server | Node.js + Express |
| 3D | Three.js (WebGL) |
| Sound | Web Audio API |
| UI | Modern CSS (glass, fluid type) |

## Run locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in a few browser tabs (or share the URL with friends) and whisper at each other.

```bash
npm run dev   # auto-restart on server changes
```

## Social loop

1. Someone joins → their aura appears for everyone
2. They cast a whisper → it materializes near them in 3D
3. Others click it to resonate → bloom + chime
4. Whispers fade after ~12 minutes so the field stays alive

Built to feel like a tiny shared ritual, not another chat app.
