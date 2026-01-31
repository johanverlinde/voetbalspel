const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  menu: document.getElementById("menu"),
  pause: document.getElementById("pause"),
  goal: document.getElementById("goal"),
  playBtn: document.getElementById("play-btn"),
  timer: document.getElementById("timer"),
  scorePlayer: document.getElementById("score-player"),
  scoreAi: document.getElementById("score-ai"),
  powerFill: document.getElementById("power-fill"),
  difficulty: document.getElementById("difficulty"),
  fxToggle: document.getElementById("fx-toggle"),
};

const KEYS = new Set();
let lastTime = 0;

class Vector {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  copy() {
    return new Vector(this.x, this.y);
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }
  scale(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }
  length() {
    return Math.hypot(this.x, this.y);
  }
  normalize() {
    const len = this.length() || 1;
    this.x /= len;
    this.y /= len;
    return this;
  }
  static distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

class Particle {
  constructor(pos, vel, life, color, size) {
    this.pos = pos.copy();
    this.vel = vel.copy();
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
  }
  update(dt) {
    this.life -= dt;
    this.pos.add(this.vel.copy().scale(dt));
    this.vel.scale(0.94);
  }
  draw(ctx) {
    const t = Math.max(this.life / this.maxLife, 0);
    ctx.globalAlpha = t;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.size * t, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

class Ball {
  constructor() {
    this.pos = new Vector(canvas.width / 2, canvas.height / 2);
    this.vel = new Vector();
    this.radius = 10;
    this.curve = 0;
    this.owner = null;
    this.lastTouch = null;
  }
  kick(dir, power, curve = 0) {
    this.owner = null;
    this.curve = curve;
    this.vel = dir.copy().normalize().scale(power);
  }
  update(dt, field, fx) {
    if (this.owner) {
      const offset = this.owner.facing.copy().scale(18);
      this.pos = this.owner.pos.copy().add(offset);
      this.vel.scale(0);
      return;
    }
    if (this.curve !== 0) {
      const perp = new Vector(-this.vel.y, this.vel.x).normalize();
      this.vel.add(perp.scale(this.curve * dt));
      this.curve *= 0.96;
    }
    this.pos.add(this.vel.copy().scale(dt));
    this.vel.scale(0.985);

    const bounce = 0.85;
    if (this.pos.x < field.left + this.radius) {
      this.pos.x = field.left + this.radius;
      this.vel.x *= -bounce;
      fx.shake(4);
    }
    if (this.pos.x > field.right - this.radius) {
      this.pos.x = field.right - this.radius;
      this.vel.x *= -bounce;
      fx.shake(4);
    }
    if (this.pos.y < field.top + this.radius) {
      this.pos.y = field.top + this.radius;
      this.vel.y *= -bounce;
      fx.shake(4);
    }
    if (this.pos.y > field.bottom - this.radius) {
      this.pos.y = field.bottom - this.radius;
      this.vel.y *= -bounce;
      fx.shake(4);
    }
  }
  draw(ctx) {
    const speed = this.vel.length();
    const squash = Math.min(speed / 400, 0.3);
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.scale(1 + squash, 1 - squash);
    ctx.fillStyle = "#fdfbff";
    ctx.shadowColor = "rgba(200, 240, 255, 0.9)";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }
}

class Player {
  constructor(x, y, color) {
    this.pos = new Vector(x, y);
    this.vel = new Vector();
    this.color = color;
    this.radius = 16;
    this.speed = 220;
    this.facing = new Vector(1, 0);
    this.hasPickup = null;
  }
  update(dt, input, field, fx) {
    const targetVel = new Vector();
    if (input.left) targetVel.x -= 1;
    if (input.right) targetVel.x += 1;
    if (input.up) targetVel.y -= 1;
    if (input.down) targetVel.y += 1;

    if (targetVel.length() > 0) {
      targetVel.normalize().scale(this.speed * (input.boost ? 1.3 : 1));
      this.facing = targetVel.copy().normalize();
    }

    this.vel = targetVel;
    this.pos.add(this.vel.copy().scale(dt));

    this.pos.x = Math.max(field.left + this.radius, Math.min(field.right - this.radius, this.pos.x));
    this.pos.y = Math.max(field.top + this.radius, Math.min(field.bottom - this.radius, this.pos.y));

    if (input.tackle && fx.enabled) {
      fx.spawnBurst(this.pos, this.color);
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Pickup {
  constructor(type, pos) {
    this.type = type;
    this.pos = pos;
    this.radius = 12;
    this.life = 12;
  }
  update(dt) {
    this.life -= dt;
  }
  draw(ctx) {
    const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.1;
    const colors = {
      speed: "#5efcff",
      curve: "#ff6e7f",
      goal: "#f9d976",
    };
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = colors[this.type];
    ctx.shadowColor = colors[this.type];
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class AudioFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  play(type) {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    if (type === "kick") {
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    }
    if (type === "pass") {
      osc.frequency.setValueAtTime(420, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    }
    if (type === "goal") {
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.4);
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    }
    if (type === "crowd") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(160, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    }
    osc.start(now);
    osc.stop(now + 0.9);
  }
}

class FXSystem {
  constructor() {
    this.particles = [];
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.enabled = true;
  }
  spawnBurst(pos, color) {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const speed = 80 + Math.random() * 80;
      const vel = new Vector(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.particles.push(new Particle(pos, vel, 0.6, color, 4));
    }
  }
  update(dt) {
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    this.particles = this.particles.filter((p) => p.life > 0);
    this.particles.forEach((p) => p.update(dt));
  }
  draw(ctx) {
    if (!this.enabled) return;
    this.particles.forEach((p) => p.draw(ctx));
  }
  shake(intensity) {
    if (!this.enabled) return;
    this.shakeTime = 0.2;
    this.shakeIntensity = intensity;
  }
  get shakeOffset() {
    if (this.shakeTime <= 0) return new Vector();
    const magnitude = this.shakeIntensity * (this.shakeTime / 0.2);
    return new Vector((Math.random() - 0.5) * magnitude, (Math.random() - 0.5) * magnitude);
  }
}

class Game {
  constructor() {
    this.field = {
      left: 80,
      right: canvas.width - 80,
      top: 70,
      bottom: canvas.height - 70,
      goalSize: 120,
    };
    this.player = new Player(this.field.left + 120, canvas.height / 2, "#5efcff");
    this.ai = new Player(this.field.right - 120, canvas.height / 2, "#ff6e7f");
    this.ball = new Ball();
    this.fx = new FXSystem();
    this.audio = new AudioFX();
    this.score = { player: 0, ai: 0 };
    this.timeLeft = 90;
    this.gameLength = 90;
    this.state = "menu";
    this.goalTimer = 0;
    this.freezeTimer = 0;
    this.power = 0;
    this.powerMode = null;
    this.pickups = [];
    this.pickupTimer = 6;
    this.settings = {
      difficulty: 1,
      fx: true,
    };
    this.paused = false;
  }

  resetPositions() {
    this.player.pos = new Vector(this.field.left + 120, canvas.height / 2);
    this.ai.pos = new Vector(this.field.right - 120, canvas.height / 2);
    this.ball.pos = new Vector(canvas.width / 2, canvas.height / 2);
    this.ball.vel = new Vector();
    this.ball.owner = null;
  }

  start() {
    this.state = "play";
    this.timeLeft = this.gameLength;
    this.score = { player: 0, ai: 0 };
    this.pickups = [];
    this.pickupTimer = 4;
    this.resetPositions();
  }

  update(dt) {
    if (this.state !== "play" || this.paused) return;

    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt;
      return;
    }

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      this.state = "menu";
      ui.menu.classList.add("visible");
    }

    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0) {
      this.spawnPickup();
      this.pickupTimer = 8 + Math.random() * 6;
    }

    this.handleInput(dt);
    this.handleAI(dt);

    this.player.update(dt, this.input, this.field, this.fx);
    this.ai.update(dt, this.aiInput, this.field, this.fx);
    this.ball.update(dt, this.field, this.fx);
    this.checkPossession();
    this.updatePickups(dt);

    this.fx.update(dt);
    this.handleGoals();
  }

  handleInput(dt) {
    const move = {
      left: KEYS.has("ArrowLeft") || KEYS.has("a"),
      right: KEYS.has("ArrowRight") || KEYS.has("d"),
      up: KEYS.has("ArrowUp") || KEYS.has("w"),
      down: KEYS.has("ArrowDown") || KEYS.has("s"),
      tackle: KEYS.has("Control"),
      boost: this.player.hasPickup === "speed",
    };
    this.input = move;

    const shootHeld = KEYS.has(" ");
    const passHeld = KEYS.has("Shift");
    if (shootHeld || passHeld) {
      const mode = shootHeld ? "shoot" : "pass";
      if (!this.powerMode) this.powerMode = mode;
      if (this.powerMode === mode) {
        this.power = Math.min(1, this.power + dt * 0.8);
      }
    }

    if (!shootHeld && !passHeld && this.powerMode) {
      if (this.canKick()) {
        const dir = this.player.facing.copy();
        const power = 200 + this.power * 420;
        const curve = this.player.hasPickup === "curve" ? 180 : 0;
        if (this.powerMode === "shoot") {
          this.ball.kick(dir, power, curve);
          this.audio.play("kick");
          this.fx.shake(8);
        } else {
          this.ball.kick(dir, power * 0.6, 0);
          this.audio.play("pass");
        }
        this.ball.lastTouch = "player";
        this.player.hasPickup = null;
      }
      this.power = 0;
      this.powerMode = null;
    }

    ui.powerFill.style.width = `${Math.round(this.power * 100)}%`;
  }

  handleAI(dt) {
    const aiSpeed = this.ai.speed * this.settings.difficulty;
    const ballDist = Vector.distance(this.ai.pos, this.ball.pos);
    const defendPos = new Vector(this.field.right - 90, canvas.height / 2);
    const target = ballDist < 180 ? this.ball.pos : defendPos;
    const dir = target.copy().sub(this.ai.pos).normalize();
    this.aiInput = {
      left: dir.x < -0.3,
      right: dir.x > 0.3,
      up: dir.y < -0.3,
      down: dir.y > 0.3,
      tackle: ballDist < 50,
      boost: this.ai.hasPickup === "speed",
    };
    this.ai.speed = aiSpeed;

    if (this.aiInput.tackle && ballDist < 48 && this.ball.owner === null) {
      this.ball.owner = this.ai;
    }

    if (this.ball.owner === this.ai) {
      const lineToGoal = this.field.left + 40;
      if (this.ai.pos.x < canvas.width / 2 || this.ai.pos.x > lineToGoal) {
        const shotDir = new Vector(-1, (Math.random() - 0.5) * 0.4).normalize();
        this.ball.kick(shotDir, 300 + Math.random() * 140, this.ai.hasPickup === "curve" ? 160 : 0);
        this.ball.lastTouch = "ai";
        this.audio.play("kick");
        this.ai.hasPickup = null;
      }
    }
  }

  canKick() {
    return this.ball.owner === this.player || Vector.distance(this.player.pos, this.ball.pos) < 26;
  }

  checkPossession() {
    if (this.ball.owner) return;
    if (Vector.distance(this.player.pos, this.ball.pos) < 22) {
      this.ball.owner = this.player;
      this.ball.lastTouch = "player";
    } else if (Vector.distance(this.ai.pos, this.ball.pos) < 22) {
      this.ball.owner = this.ai;
      this.ball.lastTouch = "ai";
    }
  }

  updatePickups(dt) {
    this.pickups.forEach((p) => p.update(dt));
    this.pickups = this.pickups.filter((p) => p.life > 0);
    for (const pickup of this.pickups) {
      if (Vector.distance(this.player.pos, pickup.pos) < 22) {
        this.player.hasPickup = pickup.type;
        pickup.life = 0;
        this.fx.spawnBurst(this.player.pos, "#7efcff");
      }
      if (Vector.distance(this.ai.pos, pickup.pos) < 22) {
        this.ai.hasPickup = pickup.type;
        pickup.life = 0;
      }
    }
  }

  spawnPickup() {
    const types = ["speed", "curve", "goal"];
    const type = types[Math.floor(Math.random() * types.length)];
    const x = this.field.left + 120 + Math.random() * (this.field.right - this.field.left - 240);
    const y = this.field.top + 80 + Math.random() * (this.field.bottom - this.field.top - 160);
    this.pickups.push(new Pickup(type, new Vector(x, y)));
    if (type === "goal") {
      this.field.goalSize = 160;
      setTimeout(() => (this.field.goalSize = 120), 6000);
    }
  }

  handleGoals() {
    const goalTop = canvas.height / 2 - this.field.goalSize / 2;
    const goalBottom = canvas.height / 2 + this.field.goalSize / 2;

    if (this.ball.pos.x < this.field.left - 10 && this.ball.pos.y > goalTop && this.ball.pos.y < goalBottom) {
      this.score.ai += 1;
      this.goalScored();
    }
    if (this.ball.pos.x > this.field.right + 10 && this.ball.pos.y > goalTop && this.ball.pos.y < goalBottom) {
      this.score.player += 1;
      this.goalScored();
    }
  }

  goalScored() {
    this.audio.play("goal");
    this.audio.play("crowd");
    this.fx.spawnBurst(this.ball.pos, "#f9d976");
    this.fx.shake(16);
    this.goalTimer = 1.2;
    this.freezeTimer = 0.25;
    ui.goal.classList.add("visible");
    setTimeout(() => ui.goal.classList.remove("visible"), 600);
    setTimeout(() => this.resetPositions(), 700);
  }

  drawField() {
    ctx.save();
    ctx.fillStyle = "rgba(4, 12, 24, 0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(12, 30, 54, 0.5)";
    for (let i = 0; i < 12; i++) {
      ctx.fillRect(0, i * 45, canvas.width, 24);
    }

    ctx.strokeStyle = "rgba(120, 220, 255, 0.6)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(120, 220, 255, 0.5)";
    ctx.shadowBlur = 12;
    ctx.strokeRect(this.field.left, this.field.top, this.field.right - this.field.left, this.field.bottom - this.field.top);

    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, this.field.top);
    ctx.lineTo(canvas.width / 2, this.field.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 70, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(120, 220, 255, 0.15)";
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 70, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();

    this.drawCrowd();
  }

  drawCrowd() {
    ctx.save();
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 8; i++) {
      const y = 20 + i * 12;
      ctx.fillStyle = i % 2 === 0 ? "#5efcff" : "#ff6e7f";
      for (let x = 0; x < canvas.width; x += 30) {
        const bob = Math.sin((Date.now() * 0.003) + x * 0.04 + i) * 3;
        ctx.fillRect(x, y + bob, 14, 6);
      }
    }
    ctx.restore();
  }

  drawGoals() {
    const goalTop = canvas.height / 2 - this.field.goalSize / 2;
    const goalBottom = canvas.height / 2 + this.field.goalSize / 2;
    ctx.strokeStyle = "rgba(249, 217, 118, 0.7)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(249, 217, 118, 0.6)";
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(this.field.left - 10, goalTop);
    ctx.lineTo(this.field.left - 10, goalBottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.field.right + 10, goalTop);
    ctx.lineTo(this.field.right + 10, goalBottom);
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  draw() {
    ctx.save();
    ctx.fillStyle = "rgba(4, 10, 18, 0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const shake = this.fx.shakeOffset;
    ctx.translate(shake.x, shake.y);

    this.drawField();
    this.drawGoals();

    this.pickups.forEach((pickup) => pickup.draw(ctx));

    this.player.draw(ctx);
    this.ai.draw(ctx);
    this.ball.draw(ctx);

    this.fx.draw(ctx);

    if (this.goalTimer > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.goalTimer -= 1 / 60;
    }

    ctx.restore();

    ui.scorePlayer.textContent = this.score.player;
    ui.scoreAi.textContent = this.score.ai;
    ui.timer.textContent = Math.ceil(this.timeLeft).toString().padStart(2, "0");
  }
}

const game = new Game();

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.033) || 0.016;
  lastTime = timestamp;
  if (game.state === "play") {
    game.update(dt);
  }
  game.draw();
  requestAnimationFrame(loop);
}

ui.playBtn.addEventListener("click", () => {
  ui.menu.classList.remove("visible");
  game.start();
});

ui.difficulty.addEventListener("input", (event) => {
  game.settings.difficulty = Number(event.target.value);
});

ui.fxToggle.addEventListener("change", (event) => {
  game.settings.fx = event.target.checked;
  game.fx.enabled = game.settings.fx;
  game.audio.enabled = game.settings.fx;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "p" || event.key === "P") {
    if (game.state === "play") {
      game.paused = !game.paused;
      ui.pause.classList.toggle("visible", game.paused);
    }
  }
  if (event.key === "Escape") {
    ui.menu.classList.add("visible");
    game.state = "menu";
  }
  KEYS.add(event.key);
  if (game.state === "menu") {
    game.audio.init();
  }
});

window.addEventListener("keyup", (event) => {
  KEYS.delete(event.key);
  if (event.key === " ") {
    KEYS.delete(" ");
  }
});

ui.menu.classList.add("visible");
requestAnimationFrame(loop);
