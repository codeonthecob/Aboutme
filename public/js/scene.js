/**
 * Three.js scene for AETHER — souls, whispers, starfield, resonance blooms.
 * Expects global THREE from CDN.
 */

const THREE = window.THREE;

function hsl(h, s = 70, l = 60) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function makeGlowSprite(hue, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `hsla(${hue}, 100%, 85%, 1)`);
  g.addColorStop(0.25, `hsla(${hue}, 90%, 65%, 0.85)`);
  g.addColorStop(0.55, `hsla(${hue}, 80%, 50%, 0.25)`);
  g.addColorStop(1, `hsla(${hue}, 80%, 40%, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeLabelTexture(text, hue) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // pill background
  const padX = 28;
  ctx.font = '600 36px Instrument Sans, system-ui, sans-serif';
  const metrics = ctx.measureText(text);
  const tw = Math.min(metrics.width, 440);
  const w = tw + padX * 2;
  const h = 72;
  const x = (canvas.width - w) / 2;
  const y = 40;

  ctx.fillStyle = 'rgba(8, 10, 24, 0.72)';
  ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.55)`;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#eef2ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(truncate(text, 42), canvas.width / 2, y + h / 2, 440);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeNameTexture(name, hue) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '600 28px Instrument Sans, system-ui, sans-serif';
  ctx.fillStyle = hsl(hue, 90, 78);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = hsl(hue, 100, 50);
  ctx.shadowBlur = 12;
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export class AetherScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.souls = new Map();
    this.whispers = new Map();
    this.blooms = [];
    this.selfId = null;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.target = new THREE.Vector3(0, 0, 0);
    this.spherical = new THREE.Spherical(28, Math.PI / 2.2, 0.4);
    this.dragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.onWhisperClick = null;
    this.onMove = null;
    this._moveAcc = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x050510, 1);
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050510, 0.018);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    this._updateCamera();

    this._buildBackdrop();
    this._bindInput();
    window.addEventListener('resize', () => this._onResize());

    this._raf = null;
    this.start();
  }

  _buildBackdrop() {
    // starfield
    const count = 1800;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 40 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xb8c4ff,
      size: 0.12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);

    // central energy core
    const coreGeo = new THREE.IcosahedronGeometry(1.6, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.scene.add(this.core);

    const coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowSprite(200, 256),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    coreGlow.scale.set(10, 10, 1);
    this.scene.add(coreGlow);
    this.coreGlow = coreGlow;

    // nebula rings
    const ringGeo = new THREE.TorusGeometry(14, 0.04, 8, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xa78bfa,
      transparent: true,
      opacity: 0.22,
    });
    this.ringA = new THREE.Mesh(ringGeo, ringMat);
    this.ringA.rotation.x = Math.PI / 2.4;
    this.scene.add(this.ringA);

    this.ringB = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
    this.ringB.material.color.set(0x38bdf8);
    this.ringB.rotation.x = Math.PI / 1.7;
    this.ringB.rotation.z = 0.6;
    this.ringB.scale.setScalar(1.35);
    this.scene.add(this.ringB);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);
  }

  _bindInput() {
    const el = this.canvas;

    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      this.spherical.theta -= dx * 0.005;
      this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi + dy * 0.005, 0.2, Math.PI - 0.2);
      this._updateCamera();
    });

    const endDrag = (e) => {
      this.dragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.spherical.radius = THREE.MathUtils.clamp(
        this.spherical.radius + e.deltaY * 0.02,
        10,
        60
      );
      this._updateCamera();
    }, { passive: false });

    el.addEventListener('click', (e) => {
      if (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4) return;
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const targets = [...this.whispers.values()].map((w) => w.hit);
      const hits = this.raycaster.intersectObjects(targets, false);
      if (hits.length && this.onWhisperClick) {
        const id = hits[0].object.userData.whisperId;
        this.onWhisperClick(id);
      }
    });
  }

  _updateCamera() {
    this.camera.position.setFromSpherical(this.spherical);
    this.camera.lookAt(this.target);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setSelf(id) {
    this.selfId = id;
  }

  upsertSoul(soul) {
    let entry = this.souls.get(soul.id);
    if (!entry) {
      const group = new THREE.Group();
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeGlowSprite(soul.hue),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sprite.scale.set(3.2, 3.2, 1);
      group.add(sprite);

      const nameSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeNameTexture(soul.name, soul.hue),
          transparent: true,
          depthWrite: false,
        })
      );
      nameSprite.scale.set(4.5, 1.1, 1);
      nameSprite.position.y = 1.8;
      group.add(nameSprite);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 16, 16),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(hsl(soul.hue)) })
      );
      group.add(core);

      group.position.set(soul.pos.x, soul.pos.y, soul.pos.z);
      this.scene.add(group);
      entry = {
        data: soul,
        group,
        sprite,
        core,
        nameSprite,
        target: new THREE.Vector3(soul.pos.x, soul.pos.y, soul.pos.z),
        phase: Math.random() * Math.PI * 2,
      };
      this.souls.set(soul.id, entry);
    } else {
      entry.data = { ...entry.data, ...soul };
      if (soul.pos) {
        entry.target.set(soul.pos.x, soul.pos.y, soul.pos.z);
      }
    }
    return entry;
  }

  removeSoul(id) {
    const entry = this.souls.get(id);
    if (!entry) return;
    this.scene.remove(entry.group);
    entry.sprite.material.map?.dispose();
    entry.sprite.material.dispose();
    entry.nameSprite.material.map?.dispose();
    entry.nameSprite.material.dispose();
    entry.core.geometry.dispose();
    entry.core.material.dispose();
    this.souls.delete(id);
  }

  moveSoul(id, pos) {
    const entry = this.souls.get(id);
    if (!entry) return;
    entry.target.set(pos.x, pos.y, pos.z);
  }

  pulseSoul(id) {
    const entry = this.souls.get(id);
    if (!entry) return;
    entry.sprite.scale.set(5.5, 5.5, 1);
    this.addBloom(entry.group.position.clone(), entry.data.hue, 1.2);
  }

  upsertWhisper(w) {
    let entry = this.whispers.get(w.id);
    if (!entry) {
      const group = new THREE.Group();
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeGlowSprite(w.hue, 96),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.9,
        })
      );
      sprite.scale.set(2.2, 2.2, 1);
      group.add(sprite);

      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: makeLabelTexture(w.text, w.hue),
          transparent: true,
          depthWrite: false,
        })
      );
      label.scale.set(7.5, 2.35, 1);
      label.position.y = 1.35;
      group.add(label);

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.userData.whisperId = w.id;
      group.add(hit);

      group.position.set(w.pos.x, w.pos.y, w.pos.z);
      this.scene.add(group);
      entry = {
        data: w,
        group,
        sprite,
        label,
        hit,
        phase: Math.random() * Math.PI * 2,
        baseScale: 2.2,
      };
      this.whispers.set(w.id, entry);
    } else {
      entry.data = { ...entry.data, ...w };
    }
    const boost = 1 + Math.min(entry.data.resonances || 0, 12) * 0.08;
    entry.sprite.scale.setScalar(entry.baseScale * boost);
    return entry;
  }

  removeWhisper(id) {
    const entry = this.whispers.get(id);
    if (!entry) return;
    this.scene.remove(entry.group);
    entry.sprite.material.map?.dispose();
    entry.sprite.material.dispose();
    entry.label.material.map?.dispose();
    entry.label.material.dispose();
    entry.hit.geometry.dispose();
    entry.hit.material.dispose();
    this.whispers.delete(id);
  }

  syncWhispers(list) {
    const ids = new Set(list.map((w) => w.id));
    for (const id of this.whispers.keys()) {
      if (!ids.has(id)) this.removeWhisper(id);
    }
    list.forEach((w) => this.upsertWhisper(w));
  }

  resonateWhisper(id, resonances) {
    const entry = this.whispers.get(id);
    if (!entry) return;
    entry.data.resonances = resonances;
    const boost = 1 + Math.min(resonances, 12) * 0.08;
    entry.sprite.scale.setScalar(entry.baseScale * boost);
    this.addBloom(entry.group.position.clone(), entry.data.hue, 0.9);
  }

  addBloom(pos, hue, strength = 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowSprite(hue, 128),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.85 * strength,
      })
    );
    sprite.position.copy(pos);
    sprite.scale.setScalar(2);
    this.scene.add(sprite);
    this.blooms.push({ sprite, age: 0, life: 0.9, strength });
  }

  /** Gently drift self soul and report position updates. */
  driftSelf(dt) {
    if (!this.selfId) return;
    const entry = this.souls.get(this.selfId);
    if (!entry) return;

    entry.phase += dt * 0.35;
    const t = entry.phase;
    const nx = entry.target.x + Math.sin(t) * 0.015;
    const ny = entry.target.y + Math.cos(t * 0.8) * 0.01;
    const nz = entry.target.z + Math.sin(t * 0.6) * 0.015;
    entry.group.position.lerp(new THREE.Vector3(nx, ny, nz), 0.05);

    this._moveAcc += dt;
    if (this._moveAcc > 0.35 && this.onMove) {
      this._moveAcc = 0;
      const p = entry.group.position;
      this.onMove({ x: p.x, y: p.y, z: p.z });
    }
  }

  start() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this._tick();
    };
    loop();
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    this.stars.rotation.y = t * 0.01;
    this.core.rotation.y = t * 0.2;
    this.core.rotation.x = t * 0.12;
    this.ringA.rotation.z = t * 0.08;
    this.ringB.rotation.z = -t * 0.05;
    this.coreGlow.material.opacity = 0.4 + Math.sin(t * 1.5) * 0.12;

    for (const entry of this.souls.values()) {
      entry.group.position.lerp(entry.target, 1 - Math.pow(0.001, dt));
      const bob = Math.sin(t * 1.4 + entry.phase) * 0.08;
      entry.sprite.position.y = bob;
      const breathe = 3.0 + Math.sin(t * 2 + entry.phase) * 0.25;
      entry.sprite.scale.setScalar(entry.data.id === this.selfId ? breathe + 0.4 : breathe);
    }

    for (const entry of this.whispers.values()) {
      entry.group.position.y = entry.data.pos.y + Math.sin(t * 1.2 + entry.phase) * 0.25;
      entry.label.material.rotation = Math.sin(t * 0.4 + entry.phase) * 0.02;
    }

    for (let i = this.blooms.length - 1; i >= 0; i--) {
      const b = this.blooms[i];
      b.age += dt;
      const k = b.age / b.life;
      b.sprite.scale.setScalar(2 + k * 10 * b.strength);
      b.sprite.material.opacity = Math.max(0, (1 - k) * 0.85 * b.strength);
      if (k >= 1) {
        this.scene.remove(b.sprite);
        b.sprite.material.map?.dispose();
        b.sprite.material.dispose();
        this.blooms.splice(i, 1);
      }
    }

    this.driftSelf(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
