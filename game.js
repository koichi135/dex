import * as THREE from "./vendor/three.module.min.js";

const canvas = document.getElementById("game");
const glCanvas = document.getElementById("game-3d");
const stageEl = document.getElementById("stage");
const touchJumpButton = document.getElementById("touch-jump");
const ctx = canvas.getContext("2d");

const GAME_STATE = {
  TITLE: "title",
  PLAYING: "playing",
  LEVEL_UP: "level_up",
  GAME_OVER: "game_over",
};

const gravity = 0.8;
const jumpPowerMin = -10;
const jumpPowerMax = -19;
const maxChargeFrames = 28;
const minChargeFrames = 10;
const groundY = canvas.height - 110;
const invincibleDuration = 360;
const stageResetInvincible = 72;
const touchPerkSelectLockMs = 1000;
const gameOverInputLockMs = 600;
const BEST_SCORE_KEY = "neko-runner-best";

const PERK_AXIS = {
  MOBILITY: "mobility",
  BREAK: "break",
  VITAL: "vital",
  SPECIAL: "special",
};

const perkAxisLabels = {
  [PERK_AXIS.MOBILITY]: "移動",
  [PERK_AXIS.BREAK]: "破壊",
  [PERK_AXIS.VITAL]: "ライフ",
  [PERK_AXIS.SPECIAL]: "特殊",
};

const perkPool = [
  {
    id: "quick-charge",
    axis: PERK_AXIS.MOBILITY,
    name: "QUICK CHARGE",
    description: "長押しジャンプの最大チャージ時間を短縮",
    apply: () => {
      world.perks.chargeTimeRank += 1;
    },
  },
  {
    id: "turbo-paws",
    axis: PERK_AXIS.BREAK,
    name: "TURBO PAWS",
    description: "+走行速度アップ + 障害物を吹き飛ばした時の得点増加",
    apply: () => {
      world.perks.speedRank += 1;
      world.perks.explosionBonus += 15;
    },
  },
  {
    id: "buddy-kitten",
    axis: PERK_AXIS.SPECIAL,
    name: "BUDDY KITTEN",
    description: "子猫が追従。成長3ptでエクストラライフ化",
    apply: () => {
      world.perks.buddyKitten = true;
      world.kitten.active = true;
    },
  },
  {
    id: "sky-hover",
    axis: PERK_AXIS.MOBILITY,
    name: "SKY HOVER",
    description: "空中長押しで一定時間ホバリングできる",
    apply: () => {
      world.perks.hoverRank += 1;
      player.hoverFramesRemaining = getMaxHoverFrames();
    },
  },
  {
    id: "air-hop",
    axis: PERK_AXIS.MOBILITY,
    name: "AIR HOP",
    description: "空中ジャンプ回数+1、空中でも攻められる",
    apply: () => {
      world.perks.maxAirJumps += 1;
      player.airJumpsRemaining = world.perks.maxAirJumps;
    },
  },
  {
    id: "star-eater",
    axis: PERK_AXIS.BREAK,
    name: "STAR EATER",
    description: "無敵時間+1秒。無敵中の衝突爆発がより派手に",
    apply: () => {
      world.perks.invincibleBonus += 60;
      world.perks.explosionPower += 4;
    },
  },
  {
    id: "cat-missile",
    axis: PERK_AXIS.BREAK,
    name: "CAT MISSILE",
    description: "一定間隔で前方障害物をロックオン爆破",
    apply: () => {
      world.perks.missileRank += 1;
    },
  },
  {
    id: "heart-engine",
    axis: PERK_AXIS.VITAL,
    name: "HEART ENGINE",
    description: "最大ライフ+1、今すぐ1回復",
    apply: () => {
      world.perks.maxLives += 1;
      world.lives = Math.min(world.perks.maxLives, world.lives + 1);
    },
  },
  {
    id: "overcharge",
    axis: PERK_AXIS.SPECIAL,
    name: "OVERCHARGE",
    description: "長押しジャンプの上限強化、重力を少し軽減",
    apply: () => {
      world.perks.chargeRank += 1;
      world.perks.gravityScale = Math.max(0.75, world.perks.gravityScale - 0.04);
    },
  },
  {
    id: "trail-dancer",
    axis: PERK_AXIS.MOBILITY,
    name: "TRAIL DANCER",
    description: "空中ジャンプ+1、チャージ短縮。移動自由度を上げる",
    apply: () => {
      world.perks.maxAirJumps += 1;
      world.perks.chargeTimeRank += 1;
      player.airJumpsRemaining = world.perks.maxAirJumps;
    },
  },
  {
    id: "chain-blast",
    axis: PERK_AXIS.BREAK,
    name: "CHAIN BLAST",
    description: "障害物破壊時、近くの障害物にも連鎖爆発",
    apply: () => {
      world.perks.chainBlastRank += 1;
    },
  },
  {
    id: "guardian-fur",
    axis: PERK_AXIS.VITAL,
    name: "GUARDIAN FUR",
    description: "シールド+1。被弾時にライフの代わりに消費",
    apply: () => {
      world.perks.shieldCharges += 1;
    },
  },
  {
    id: "fever-instinct",
    axis: PERK_AXIS.SPECIAL,
    name: "FEVER INSTINCT",
    description: "連続破壊コンボの持続と得点倍率を強化",
    apply: () => {
      world.perks.comboDecayBonus += 18;
      world.perks.comboScoreBonus += 0.08;
    },
  },
];

function loadBestScore() {
  try {
    return Number(window.localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch (err) {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(value));
  } catch (err) {
    /* storage unavailable */
  }
}

const player = {
  x: 120,
  y: groundY,
  width: 52,
  height: 52,
  vy: 0,
  onGround: true,
  frame: 0,
  isCharging: false,
  chargeFrames: 0,
  airJumpsRemaining: 0,
  isPressing: false,
  hoverFramesRemaining: 0,
};

const world = {
  speed: 7.4,
  score: 0,
  best: loadBestScore(),
  lives: 2,
  obstacles: [],
  items: [],
  powerups: [],
  effects: [],
  scorePopups: [],
  obstacleTimer: 0,
  itemTimer: 0,
  powerupTimer: 0,
  state: GAME_STATE.TITLE,
  flashTime: 0,
  invincibleTimer: 0,
  level: 1,
  xp: 0,
  nextLevelXp: 420,
  levelUpChoices: [],
  comboCount: 0,
  comboTimer: 0,
  gameOverAt: 0,
  perks: {
    speedRank: 0,
    maxAirJumps: 0,
    invincibleBonus: 0,
    missileRank: 0,
    missileCooldown: 0,
    maxLives: 5,
    explosionPower: 0,
    explosionBonus: 0,
    chargeRank: 0,
    chargeTimeRank: 0,
    gravityScale: 1,
    buddyKitten: false,
    hoverRank: 0,
    chainBlastRank: 0,
    shieldCharges: 0,
    comboDecayBonus: 0,
    comboScoreBonus: 0,
  },
  perkRerolls: 1,
  perkTouchLockedUntil: 0,
  kitten: {
    active: false,
    x: 70,
    y: groundY + 20,
    growthPoints: 0,
    big: false,
  },
};

function resetGame() {
  world.speed = 7.4;
  world.score = 0;
  world.lives = 2;
  world.obstacles = [];
  world.items = [];
  world.powerups = [];
  world.effects = [];
  world.scorePopups = [];
  world.obstacleTimer = 0;
  world.itemTimer = 0;
  world.powerupTimer = 200;
  world.flashTime = 0;
  world.invincibleTimer = 0;
  world.level = 1;
  world.xp = 0;
  world.nextLevelXp = 420;
  world.levelUpChoices = [];
  world.comboCount = 0;
  world.comboTimer = 0;
  world.perks = {
    speedRank: 0,
    maxAirJumps: 0,
    invincibleBonus: 0,
    missileRank: 0,
    missileCooldown: 0,
    maxLives: 5,
    explosionPower: 0,
    explosionBonus: 0,
    chargeRank: 0,
    chargeTimeRank: 0,
    gravityScale: 1,
    buddyKitten: false,
    hoverRank: 0,
    chainBlastRank: 0,
    shieldCharges: 0,
    comboDecayBonus: 0,
    comboScoreBonus: 0,
  };
  world.perkRerolls = 1;
  world.perkTouchLockedUntil = 0;
  world.kitten = {
    active: false,
    x: 70,
    y: groundY + 20,
    growthPoints: 0,
    big: false,
  };

  player.y = groundY;
  player.vy = 0;
  player.onGround = true;
  player.isCharging = false;
  player.chargeFrames = 0;
  player.airJumpsRemaining = 0;
  player.isPressing = false;
  player.hoverFramesRemaining = 0;
}

function getChargeFrameLimit() {
  return Math.max(minChargeFrames, maxChargeFrames - world.perks.chargeTimeRank * 4);
}

function getMaxHoverFrames() {
  return 36 + world.perks.hoverRank * 28;
}

function getComboWindowFrames() {
  return 120 + world.perks.comboDecayBonus;
}

function resetCombo() {
  world.comboCount = 0;
  world.comboTimer = 0;
}

function addComboFromBreak() {
  world.comboCount += 1;
  world.comboTimer = getComboWindowFrames();
}

function getComboMultiplier() {
  const stepBonus = Math.floor(world.comboCount / 3) * 0.25;
  return 1 + Math.min(1.25, stepBonus + world.perks.comboScoreBonus);
}

function addKittenGrowthPoint() {
  if (!world.perks.buddyKitten || !world.kitten.active || world.kitten.big) {
    return;
  }
  world.kitten.growthPoints += 1;
  spawnBurst(world.kitten.x + 10, world.kitten.y + 10, 8, "#fff", 1.5);
  if (world.kitten.growthPoints >= 3) {
    world.kitten.growthPoints = 3;
    world.kitten.big = true;
    spawnBurst(world.kitten.x + 24, world.kitten.y + 24, 24, "#7ff", 2.2);
  }
}

function consumeKittenRevive() {
  if (!world.perks.buddyKitten || !world.kitten.big) {
    return false;
  }
  world.kitten.active = false;
  world.kitten.big = false;
  world.kitten.growthPoints = 0;
  world.lives = Math.max(1, Math.ceil(world.perks.maxLives / 2));
  world.flashTime = 0;
  world.invincibleTimer = stageResetInvincible;
  resetStageAfterPerk();
  return true;
}

function startGame() {
  resetGame();
  world.state = GAME_STATE.PLAYING;
  syncUI();
}

function enterLevelUpState() {
  world.state = GAME_STATE.LEVEL_UP;
  world.perkTouchLockedUntil = Date.now() + touchPerkSelectLockMs;
  syncUI();
}

function enterGameOverState() {
  const isNewRecord = world.score > world.best;
  world.best = Math.max(world.best, world.score);
  saveBestScore(world.best);
  world.gameOverAt = Date.now();
  world.state = GAME_STATE.GAME_OVER;
  ui.newRecord.hidden = !isNewRecord;
  syncUI();
}

function onPressStart(e) {
  if (world.state === GAME_STATE.PLAYING) {
    player.isPressing = true;
  }

  if (world.state === GAME_STATE.TITLE) {
    startGame();
    return;
  }

  if (world.state === GAME_STATE.LEVEL_UP) {
    return;
  }

  if (world.state === GAME_STATE.GAME_OVER) {
    if (Date.now() - world.gameOverAt < gameOverInputLockMs) {
      return;
    }
    resetGame();
    world.state = GAME_STATE.TITLE;
    syncUI();
    return;
  }

  if (!player.onGround && player.airJumpsRemaining > 0) {
    player.vy = -13 - world.perks.chargeRank * 0.45;
    player.airJumpsRemaining -= 1;
    spawnBurst(player.x + player.width / 2, player.y + player.height / 2, 14, "#7ff", 2.4);
    return;
  }

  if (player.onGround && !player.isCharging) {
    player.isCharging = true;
    player.chargeFrames = 0;
  }
}

function onPressEnd() {
  player.isPressing = false;

  if (world.state !== GAME_STATE.PLAYING || !player.isCharging || !player.onGround) {
    return;
  }

  const chargeRate = Math.min(1, player.chargeFrames / getChargeFrameLimit());
  const boostedJumpMax = jumpPowerMax - world.perks.chargeRank * 1.1;
  const jumpPower = jumpPowerMin + (boostedJumpMax - jumpPowerMin) * chargeRate;
  player.vy = jumpPower;
  player.onGround = false;
  player.isCharging = false;
  player.chargeFrames = 0;
}

canvas.addEventListener("pointerdown", onPressStart);
canvas.addEventListener("pointerup", onPressEnd);
canvas.addEventListener("pointercancel", onPressEnd);
canvas.addEventListener("pointerleave", onPressEnd);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

if (touchJumpButton) {
  touchJumpButton.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    onPressStart();
  });
  touchJumpButton.addEventListener("pointerup", (e) => {
    e.preventDefault();
    onPressEnd();
  });
  touchJumpButton.addEventListener("pointercancel", onPressEnd);
  touchJumpButton.addEventListener("pointerleave", onPressEnd);
}

const pressedKeys = new Set();
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (pressedKeys.has(e.code)) {
      return;
    }
    pressedKeys.add(e.code);
    onPressStart(e);
  }

  if (world.state === GAME_STATE.LEVEL_UP) {
    if (e.code === "Digit1") {
      choosePerk(0);
    } else if (e.code === "Digit2") {
      choosePerk(1);
    } else if (e.code === "Digit3") {
      choosePerk(2);
    } else if (e.code === "KeyR") {
      rerollPerkChoices();
    }
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    pressedKeys.delete(e.code);
    onPressEnd();
  }
});

function createObstacle(offsetX = 0, sizeScale = 1) {
  const size = (42 + Math.random() * 18) * sizeScale;
  world.obstacles.push({
    x: canvas.width + 20 + offsetX,
    y: groundY + player.height - size,
    width: size,
    height: size,
    hit: false,
  });
}

function getObstacleDifficulty() {
  const lv = world.level;
  const phase = Math.max(0, lv - 1);
  return {
    minInterval: Math.max(24, 68 - phase * 3.2),
    intervalRange: Math.max(14, 28 - phase * 0.8),
    secondChance: Math.min(0.82, Math.max(0.2, phase * 0.07)),
    thirdChance: Math.min(0.56, Math.max(0.05, (phase - 1) * 0.05)),
    secondOffset: 84 + Math.min(90, phase * 7),
    thirdOffset: 188 + Math.min(110, phase * 8),
  };
}

function createHeartItem() {
  const yBase = groundY - 120 - Math.random() * 120;
  world.items.push({
    x: canvas.width + 20,
    y: yBase,
    width: 34,
    height: 30,
    taken: false,
  });
}

function createInvincibleItem() {
  const yBase = groundY - 150 - Math.random() * 140;
  world.powerups.push({
    x: canvas.width + 20,
    y: yBase,
    width: 30,
    height: 30,
    taken: false,
  });
}

function gainXp(amount) {
  world.xp += amount;
  if (world.xp >= world.nextLevelXp) {
    world.level += 1;
    if (world.level % 3 === 0) {
      world.perkRerolls += 1;
    }
    world.xp -= world.nextLevelXp;
    world.nextLevelXp = Math.floor(world.nextLevelXp * 1.35);
    world.levelUpChoices = pickPerks(3);
    addKittenGrowthPoint();
    enterLevelUpState();
  }
}

function pickRandomPerk(candidates, pickedIds) {
  const available = candidates.filter((perk) => !pickedIds.has(perk.id));
  if (available.length <= 0) {
    return null;
  }
  return available[Math.floor(Math.random() * available.length)];
}

function pickPerks(count) {
  const axisOrder = [PERK_AXIS.MOBILITY, PERK_AXIS.BREAK, PERK_AXIS.VITAL];
  const pickedIds = new Set();
  const picks = [];

  axisOrder.forEach((axis) => {
    if (picks.length >= count) {
      return;
    }
    const axisPerks = perkPool.filter((perk) => perk.axis === axis);
    const selected = pickRandomPerk(axisPerks, pickedIds);
    if (selected) {
      picks.push(selected);
      pickedIds.add(selected.id);
    }
  });

  if (count >= 3 && Math.random() < 0.35) {
    const specialPerk = pickRandomPerk(perkPool.filter((perk) => perk.axis === PERK_AXIS.SPECIAL), pickedIds);
    if (specialPerk && picks.length > 0) {
      const replaceIndex = Math.floor(Math.random() * picks.length);
      pickedIds.delete(picks[replaceIndex].id);
      picks[replaceIndex] = specialPerk;
      pickedIds.add(specialPerk.id);
    }
  }

  while (picks.length < count) {
    const selected = pickRandomPerk(perkPool, pickedIds);
    if (!selected) {
      break;
    }
    picks.push(selected);
    pickedIds.add(selected.id);
  }

  return picks.sort(() => Math.random() - 0.5);
}

function choosePerk(index) {
  if (world.state !== GAME_STATE.LEVEL_UP || Date.now() < world.perkTouchLockedUntil) {
    return;
  }

  const perk = world.levelUpChoices[index];
  if (!perk) {
    return;
  }
  perk.apply();
  resetStageAfterPerk();
  world.levelUpChoices = [];
  world.comboCount = 0;
  world.comboTimer = 0;
  world.state = GAME_STATE.PLAYING;
  syncUI();
}

function resetStageAfterPerk() {
  world.obstacles = [];
  world.items = [];
  world.powerups = [];
  world.effects = [];
  world.scorePopups = [];
  world.obstacleTimer = 42;
  world.itemTimer = 120;
  world.powerupTimer = Math.max(world.powerupTimer, 220);
  world.invincibleTimer = Math.max(world.invincibleTimer, stageResetInvincible);

  player.y = groundY;
  player.vy = 0;
  player.onGround = true;
  player.isCharging = false;
  player.chargeFrames = 0;
  player.airJumpsRemaining = world.perks.maxAirJumps;
  player.hoverFramesRemaining = getMaxHoverFrames();
}

function rerollPerkChoices() {
  if (world.state !== GAME_STATE.LEVEL_UP || world.perkRerolls <= 0) {
    return;
  }
  world.perkRerolls -= 1;
  world.levelUpChoices = pickPerks(3);
  world.perkTouchLockedUntil = Date.now() + touchPerkSelectLockMs;
  syncUI();
}

function spawnBurst(x, y, power, color = "#fff", spread = 1) {
  const count = Math.floor(power + Math.random() * power * 0.7);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * (power / 4) * spread;
    world.effects.push({
      x,
      y,
      z: (Math.random() - 0.5) * 1.6,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.6,
      vz: (Math.random() - 0.5) * 0.12,
      life: 25 + Math.random() * 24,
      color,
      size: 2 + Math.random() * 4,
    });
  }
}

function triggerChainBlast(sourceObstacle) {
  if (world.perks.chainBlastRank <= 0) {
    return;
  }

  const sourceX = sourceObstacle.x + sourceObstacle.width / 2;
  const sourceY = sourceObstacle.y + sourceObstacle.height / 2;
  const radius = 76 + world.perks.chainBlastRank * 26;

  world.obstacles.forEach((obstacle) => {
    if (obstacle.hit || obstacle === sourceObstacle) {
      return;
    }
    const centerX = obstacle.x + obstacle.width / 2;
    const centerY = obstacle.y + obstacle.height / 2;
    const dx = centerX - sourceX;
    const dy = centerY - sourceY;
    if (dx * dx + dy * dy > radius * radius) {
      return;
    }
    obstacle.hit = true;
    explodeObstacle(obstacle, world.perks.chainBlastRank * 2, false);
  });
}

function explodeObstacle(obstacle, extra = 0, allowChain = true) {
  const centerX = obstacle.x + obstacle.width / 2;
  const centerY = obstacle.y + obstacle.height / 2;
  const power = 20 + world.perks.explosionPower + extra;
  spawnBurst(centerX, centerY, power, "#7ff", 2.8);
  spawnBurst(centerX, centerY, Math.floor(power * 0.7), "#fff", 1.6);
  addComboFromBreak();
  const scoreGain = Math.floor((18 + world.perks.explosionBonus) * getComboMultiplier());
  world.score += scoreGain;
  world.scorePopups.push({
    x: centerX,
    y: centerY,
    text: `+${scoreGain}`,
    life: 42,
  });
  gainXp(20 + Math.floor((world.comboCount - 1) * 1.4));

  if (allowChain) {
    triggerChainBlast(obstacle);
  }
}

function updateEffects() {
  world.effects.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.z += particle.vz;
    particle.vy += 0.06;
    particle.vx *= 0.98;
    particle.life -= 1;
  });
  world.effects = world.effects.filter((particle) => particle.life > 0);
}

function fireMissileIfNeeded() {
  if (world.perks.missileRank <= 0 || world.obstacles.length === 0) {
    return;
  }

  world.perks.missileCooldown -= 1;
  if (world.perks.missileCooldown > 0) {
    return;
  }

  const target = world.obstacles.find((o) => o.x > player.x + player.width - 10);
  if (!target) {
    return;
  }

  target.hit = true;
  explodeObstacle(target, world.perks.missileRank * 3);
  world.perks.missileCooldown = Math.max(45, 220 - world.perks.missileRank * 24);
}

function update() {
  if (world.state !== GAME_STATE.PLAYING) {
    return;
  }

  world.score += 1;
  world.speed += 0.00095 + world.perks.speedRank * 0.00014;
  gainXp(1);

  if (player.isCharging && player.onGround) {
    player.chargeFrames = Math.min(getChargeFrameLimit(), player.chargeFrames + 1);
  }

  const hovering = world.perks.hoverRank > 0 && !player.onGround && player.isPressing && player.hoverFramesRemaining > 0;
  if (hovering) {
    player.vy += gravity * world.perks.gravityScale * 0.16;
    player.vy = Math.min(player.vy, 1.1);
    player.hoverFramesRemaining -= 1;
    spawnBurst(player.x + player.width / 2, player.y + player.height, 1.2, "#7ff", 0.4);
  } else {
    player.vy += gravity * world.perks.gravityScale;
  }
  player.y += player.vy;

  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
    player.airJumpsRemaining = world.perks.maxAirJumps;
    player.hoverFramesRemaining = getMaxHoverFrames();
  }

  world.obstacleTimer -= 1;
  if (world.obstacleTimer <= 0) {
    const difficulty = getObstacleDifficulty();
    createObstacle();
    if (Math.random() < difficulty.secondChance) {
      createObstacle(difficulty.secondOffset + Math.random() * 42, 0.8 + Math.random() * 0.17);
    }
    if (Math.random() < difficulty.thirdChance) {
      createObstacle(difficulty.thirdOffset + Math.random() * 56, 0.72 + Math.random() * 0.16);
    }
    world.obstacleTimer = difficulty.minInterval + Math.random() * difficulty.intervalRange;
  }

  world.itemTimer -= 1;
  if (world.itemTimer <= 0) {
    createHeartItem();
    world.itemTimer = 340 + Math.random() * 220;
  }

  world.powerupTimer -= 1;
  if (world.powerupTimer <= 0) {
    createInvincibleItem();
    world.powerupTimer = 680 + Math.random() * 320;
  }

  world.obstacles.forEach((obstacle) => {
    obstacle.x -= world.speed;

    if (!obstacle.hit && intersects(player, obstacle)) {
      obstacle.hit = true;

      if (world.invincibleTimer > 0) {
        explodeObstacle(obstacle);
        return;
      }

      resetCombo();
      if (world.perks.shieldCharges > 0) {
        world.perks.shieldCharges -= 1;
        world.flashTime = 5;
        spawnBurst(player.x + player.width / 2, player.y + player.height / 2, 16, "#fff", 1.2);
        return;
      }

      world.lives -= 1;
      world.flashTime = 8;

      if (world.lives <= 0) {
        if (consumeKittenRevive()) {
          return;
        }
        enterGameOverState();
      }
    }
  });

  world.items.forEach((item) => {
    item.x -= world.speed;

    if (!item.taken && intersects(player, item)) {
      item.taken = true;
      if (world.lives >= world.perks.maxLives) {
        addKittenGrowthPoint();
      }
      world.lives = Math.min(world.perks.maxLives, world.lives + 1);
      gainXp(26);
    }
  });

  world.powerups.forEach((item) => {
    item.x -= world.speed;

    if (!item.taken && intersects(player, item)) {
      item.taken = true;
      world.invincibleTimer = invincibleDuration + world.perks.invincibleBonus;
      addKittenGrowthPoint();
      gainXp(30);
      spawnBurst(player.x + player.width / 2, player.y + player.height / 2, 18, "#7ff", 1.8);
    }
  });

  fireMissileIfNeeded();

  world.obstacles = world.obstacles.filter((o) => o.x + o.width > -20 && !o.hit);
  world.items = world.items.filter((i) => !i.taken && i.x + i.width > -20);
  world.powerups = world.powerups.filter((i) => !i.taken && i.x + i.width > -20);

  if (world.flashTime > 0) {
    world.flashTime -= 1;
  }

  if (world.invincibleTimer > 0) {
    world.invincibleTimer -= 1;
  }

  if (world.comboTimer > 0) {
    world.comboTimer -= 1;
  } else if (world.comboCount > 0) {
    world.comboCount = 0;
  }

  updateEffects();

  player.frame += 0.25;
}

function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// ---------------------------------------------------------------------------
// DOM UI (HUD / title / level-up / game-over)
// ---------------------------------------------------------------------------

const ui = {
  hud: document.getElementById("hud"),
  score: document.getElementById("hud-score"),
  lives: document.getElementById("hud-lives"),
  buffs: document.getElementById("hud-buffs"),
  level: document.getElementById("hud-level"),
  xpFill: document.getElementById("hud-xp"),
  xpText: document.getElementById("hud-xp-text"),
  combo: document.getElementById("hud-combo"),
  comboMult: document.getElementById("combo-mult"),
  comboCount: document.getElementById("combo-count"),
  vignette: document.getElementById("damage-vignette"),
  screenTitle: document.getElementById("screen-title"),
  screenLevelUp: document.getElementById("screen-levelup"),
  screenGameOver: document.getElementById("screen-gameover"),
  titleBest: document.getElementById("title-best"),
  levelUpLevel: document.getElementById("levelup-level"),
  perkCards: Array.from(document.querySelectorAll(".perk-card")),
  rerollBtn: document.getElementById("perk-reroll"),
  rerollCount: document.getElementById("reroll-count"),
  goScore: document.getElementById("go-score"),
  goBest: document.getElementById("go-best"),
  goLevel: document.getElementById("go-level"),
  newRecord: document.getElementById("new-record"),
};

const AXIS_CLASSES = ["axis-mobility", "axis-break", "axis-vital", "axis-special"];

const hudCache = {
  score: -1,
  lives: -1,
  maxLives: -1,
  shields: -1,
  level: -1,
  xpPct: -1,
  xpText: "",
  comboVisible: false,
  comboCount: -1,
  invSeconds: -1,
  invincibleClass: false,
};

ui.perkCards.forEach((button) => {
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (button.disabled) {
      return;
    }
    choosePerk(Number(button.dataset.perkIndex));
  });
});

if (ui.rerollBtn) {
  ui.rerollBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    rerollPerkChoices();
  });
}

function populatePerkCards() {
  ui.perkCards.forEach((button, index) => {
    const perk = world.levelUpChoices[index];
    button.classList.remove(...AXIS_CLASSES);
    if (!perk) {
      button.hidden = true;
      button.disabled = true;
      return;
    }
    button.hidden = false;
    button.disabled = true;
    button.classList.add(`axis-${perk.axis}`);
    button.querySelector(".perk-name").textContent = perk.name;
    button.querySelector(".perk-axis").textContent = perkAxisLabels[perk.axis];
    button.querySelector(".perk-desc").textContent = perk.description;
    // restart the entry animation
    button.style.animation = "none";
    void button.offsetWidth;
    button.style.animation = "";
  });

  ui.levelUpLevel.textContent = `LV ${world.level}`;
  ui.rerollCount.textContent = `×${world.perkRerolls}`;
  ui.rerollBtn.disabled = world.perkRerolls <= 0;
}

function renderLives() {
  const parts = [];
  for (let i = 0; i < world.perks.maxLives; i += 1) {
    parts.push(`<span class="life${i < world.lives ? "" : " empty"}">♥</span>`);
  }
  for (let i = 0; i < world.perks.shieldCharges; i += 1) {
    parts.push('<span class="life shield">♦</span>');
  }
  ui.lives.innerHTML = parts.join("");
}

function syncUI() {
  const state = world.state;

  ui.hud.hidden = state !== GAME_STATE.PLAYING && state !== GAME_STATE.LEVEL_UP;
  ui.screenTitle.hidden = state !== GAME_STATE.TITLE;
  ui.screenLevelUp.hidden = state !== GAME_STATE.LEVEL_UP;
  ui.screenGameOver.hidden = state !== GAME_STATE.GAME_OVER;

  if (touchJumpButton) {
    touchJumpButton.hidden = state === GAME_STATE.LEVEL_UP;
  }

  if (state === GAME_STATE.TITLE) {
    ui.titleBest.hidden = world.best <= 0;
    ui.titleBest.textContent = `BEST ${world.best}`;
  }

  if (state === GAME_STATE.LEVEL_UP) {
    populatePerkCards();
  }

  if (state === GAME_STATE.GAME_OVER) {
    ui.goScore.textContent = String(world.score);
    ui.goBest.textContent = String(world.best);
    ui.goLevel.textContent = String(world.level);
  }

  // force refresh of cached hud values
  hudCache.lives = -1;
  hudCache.score = -1;
}

function updateHUDFrame() {
  const inGame = world.state === GAME_STATE.PLAYING || world.state === GAME_STATE.LEVEL_UP;

  if (inGame) {
    if (world.score !== hudCache.score) {
      hudCache.score = world.score;
      ui.score.textContent = String(world.score);
    }

    if (
      world.lives !== hudCache.lives ||
      world.perks.maxLives !== hudCache.maxLives ||
      world.perks.shieldCharges !== hudCache.shields
    ) {
      hudCache.lives = world.lives;
      hudCache.maxLives = world.perks.maxLives;
      hudCache.shields = world.perks.shieldCharges;
      renderLives();
    }

    if (world.level !== hudCache.level) {
      hudCache.level = world.level;
      ui.level.textContent = `LV ${world.level}`;
    }

    const xpPct = Math.min(100, Math.floor((world.xp / world.nextLevelXp) * 100));
    if (xpPct !== hudCache.xpPct) {
      hudCache.xpPct = xpPct;
      ui.xpFill.style.width = `${xpPct}%`;
    }

    const xpText = `XP ${world.xp} / ${world.nextLevelXp}`;
    if (xpText !== hudCache.xpText) {
      hudCache.xpText = xpText;
      ui.xpText.textContent = xpText;
    }

    const invSeconds = world.invincibleTimer > 0 ? Math.ceil(world.invincibleTimer / 60) : 0;
    if (invSeconds !== hudCache.invSeconds) {
      hudCache.invSeconds = invSeconds;
      ui.buffs.innerHTML = invSeconds > 0 ? `<span class="buff inv">★ INVINCIBLE ${invSeconds}s</span>` : "";
    }

    const comboVisible = world.comboCount > 1 && world.comboTimer > 0;
    if (comboVisible !== hudCache.comboVisible || world.comboCount !== hudCache.comboCount) {
      hudCache.comboVisible = comboVisible;
      const bumped = comboVisible && world.comboCount !== hudCache.comboCount;
      hudCache.comboCount = world.comboCount;
      ui.combo.hidden = !comboVisible;
      if (comboVisible) {
        ui.comboMult.textContent = `×${getComboMultiplier().toFixed(2)}`;
        ui.comboCount.textContent = `${world.comboCount} CHAIN`;
        if (bumped) {
          ui.combo.classList.remove("bump");
          void ui.combo.offsetWidth;
          ui.combo.classList.add("bump");
        }
      }
    }
  }

  ui.vignette.style.opacity = world.flashTime > 0 ? String((world.flashTime / 8) * 0.85) : "0";

  const invincibleClass = world.invincibleTimer > 0 && world.state === GAME_STATE.PLAYING;
  if (invincibleClass !== hudCache.invincibleClass) {
    hudCache.invincibleClass = invincibleClass;
    stageEl.classList.toggle("is-invincible", invincibleClass);
  }

  if (world.state === GAME_STATE.LEVEL_UP && Date.now() >= world.perkTouchLockedUntil) {
    ui.perkCards.forEach((button) => {
      if (!button.hidden && button.disabled) {
        button.disabled = false;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 3D rendering (Three.js)
// ---------------------------------------------------------------------------

const WORLD_SCALE = 20;
const groundLineY = groundY + player.height;
const toX = (px) => (px - canvas.width / 2) / WORLD_SCALE;
const toY = (py) => (groundLineY - py) / WORLD_SCALE;

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(canvas.width, canvas.height, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a24);
scene.fog = new THREE.Fog(0x241448, 34, 150);

const camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.1, 260);
camera.position.set(-4, 6.5, 26);
camera.lookAt(-2, 4.2, 0);

scene.add(new THREE.HemisphereLight(0x8d9cff, 0x241030, 0.85));

const keyLight = new THREE.DirectionalLight(0xffe9d2, 2.1);
keyLight.position.set(-12, 24, 16);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -32;
keyLight.shadow.camera.right = 32;
keyLight.shadow.camera.top = 24;
keyLight.shadow.camera.bottom = -10;
keyLight.shadow.camera.near = 4;
keyLight.shadow.camera.far = 80;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x66f0ff, 0.7);
rimLight.position.set(20, 8, -14);
scene.add(rimLight);

const backGlow = new THREE.DirectionalLight(0xff6f9a, 0.4);
backGlow.position.set(8, 5, -30);
scene.add(backGlow);

let scrollPx = 0;
let renderTick = 0;
let cameraLift = 0;

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) {
    s += 2147483646;
  }
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.4)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const glowTexture = makeGlowTexture();

function makeGlowSprite(color, scale, opacity = 0.75) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

// --- sky dome ---
const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    topColor: { value: new THREE.Color(0x060a26) },
    midColor: { value: new THREE.Color(0x2c1a58) },
    horizonColor: { value: new THREE.Color(0xd6467c) },
  },
  vertexShader: `
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 horizonColor;
    varying vec3 vPos;
    void main() {
      float h = normalize(vPos).y;
      vec3 col = mix(midColor, topColor, smoothstep(0.08, 0.55, h));
      col = mix(horizonColor, col, smoothstep(-0.02, 0.18, h));
      col = mix(vec3(0.02, 0.015, 0.05), col, smoothstep(-0.45, -0.04, h));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 20), skyMaterial);
skyDome.renderOrder = -10;
scene.add(skyDome);

// --- retro sun ---
const sunMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    time: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      vec3 top = vec3(1.0, 0.86, 0.5);
      vec3 bottom = vec3(1.0, 0.32, 0.55);
      vec3 col = mix(bottom, top, smoothstep(-0.8, 0.9, p.y));
      float alpha = 1.0 - smoothstep(0.93, 1.0, r);
      float stripe = smoothstep(0.32, 0.42, abs(fract(p.y * 5.0 - time * 0.08) - 0.5));
      alpha *= mix(1.0, stripe, smoothstep(0.15, -0.25, p.y));
      gl_FragColor = vec4(col, alpha);
    }
  `,
});
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(15, 48), sunMaterial);
sunDisc.position.set(12, 10, -110);
sunDisc.renderOrder = -9;
scene.add(sunDisc);

const sunHalo = makeGlowSprite(0xff5f87, 68, 0.5);
sunHalo.position.copy(sunDisc.position);
sunHalo.position.z -= 1;
scene.add(sunHalo);

// --- distant mountain ridges ---
function makeRidge(width, maxHeight, step, color, seed) {
  const rand = seededRandom(seed);
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -3);
  const n = Math.ceil(width / step);
  for (let i = 0; i <= n; i += 1) {
    const x = -width / 2 + i * step;
    const peak = i % 2 === 0 ? 0.55 + rand() * 0.45 : 0.18 + rand() * 0.3;
    shape.lineTo(x, maxHeight * peak);
  }
  shape.lineTo(width / 2, -3);
  shape.closePath();
  return new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color })
  );
}

const ridgeFar = makeRidge(360, 22, 17, 0x2a1c5c, 11);
ridgeFar.position.set(0, 0, -95);
scene.add(ridgeFar);

const ridgeNear = makeRidge(360, 14, 13, 0x191238, 47);
ridgeNear.position.set(0, 0, -68);
scene.add(ridgeNear);

// --- stars ---
function makeStars(count, size, seed) {
  const rand = seededRandom(seed);
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    positions.push((rand() - 0.5) * 300, 12 + rand() * 90, -60 - rand() * 90);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xcfd9ff,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    fog: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = -8;
  return points;
}

const starsA = makeStars(160, 0.5, 3);
const starsB = makeStars(140, 0.34, 91);
scene.add(starsA);
scene.add(starsB);

// --- clouds ---
const clouds = [];
for (let i = 0; i < 5; i += 1) {
  const cloud = makeGlowSprite(0x4a3585, 30 + Math.random() * 18, 0.22);
  cloud.scale.y = 8 + Math.random() * 4;
  cloud.position.set(-90 + i * 45 + Math.random() * 20, 16 + Math.random() * 10, -55 - Math.random() * 20);
  cloud.userData.drift = 0.008 + Math.random() * 0.01;
  scene.add(cloud);
  clouds.push(cloud);
}

// --- city skyline with lit windows ---
function makeWindowTexture(seed) {
  const rand = seededRandom(seed);
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#0c1020";
  g.fillRect(0, 0, 32, 64);
  const litColors = ["#ffd97a", "#8ff6ff", "#ff9ecf", "#ffe9b8"];
  for (let ry = 0; ry < 8; ry += 1) {
    for (let rx = 0; rx < 4; rx += 1) {
      const lit = rand() < 0.42;
      g.fillStyle = lit ? litColors[Math.floor(rand() * litColors.length)] : "#161d33";
      g.fillRect(3 + rx * 7, 4 + ry * 7, 4, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const windowTextures = [makeWindowTexture(5), makeWindowTexture(23), makeWindowTexture(77), makeWindowTexture(131)];
const antennaMat = new THREE.MeshBasicMaterial({ color: 0x11131f });
const antennaTipMat = new THREE.MeshBasicMaterial({ color: 0xff4455 });

const skyline = [];
const SKYLINE_SPAN = 170;
for (let i = 0; i < 20; i += 1) {
  const w = 2.4 + Math.random() * 3.4;
  const h = 4 + Math.random() * 10;
  const tex = windowTextures[i % windowTextures.length].clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(w / 1.5)), Math.max(2, Math.round(h / 1.5)));
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0x9aa2c0,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.22 + Math.random() * 0.2,
    roughness: 0.9,
  });
  const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.6), mat);
  block.position.set(-SKYLINE_SPAN / 2 + i * (SKYLINE_SPAN / 20) + Math.random() * 3, h / 2 - 0.4, -18 - Math.random() * 11);
  scene.add(block);
  skyline.push(block);

  if (i % 3 === 0) {
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), antennaMat);
    antenna.position.set(0, h / 2 + 0.8, 0);
    block.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), antennaTipMat);
    tip.position.set(0, 0.85, 0);
    antenna.add(tip);
  }
}

// --- ground ---
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(320, 90),
  new THREE.MeshStandardMaterial({ color: 0x10131f, roughness: 0.95 })
);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.set(0, -0.04, -18);
groundPlane.receiveShadow = true;
scene.add(groundPlane);

const lanePlane = new THREE.Mesh(
  new THREE.PlaneGeometry(320, 8.6),
  new THREE.MeshStandardMaterial({ color: 0x171b2e, roughness: 0.85 })
);
lanePlane.rotation.x = -Math.PI / 2;
lanePlane.position.set(0, -0.02, -0.6);
lanePlane.receiveShadow = true;
scene.add(lanePlane);

const GRID_SPACING = 2.4;
const GRID_COUNT = 60;
const gridLines = [];
const gridLineMat = new THREE.MeshBasicMaterial({
  color: 0x2de2ff,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const gridLineGeo = new THREE.BoxGeometry(0.06, 0.02, 19);
for (let i = 0; i < GRID_COUNT; i += 1) {
  const line = new THREE.Mesh(gridLineGeo, gridLineMat);
  line.position.set(0, 0.01, 4);
  scene.add(line);
  gridLines.push(line);
}

// faint cross lines filling the foreground
[6.4, 9.6, 13].forEach((z, i) => {
  const cross = new THREE.Mesh(
    new THREE.BoxGeometry(320, 0.02, 0.07),
    new THREE.MeshBasicMaterial({
      color: 0x2de2ff,
      transparent: true,
      opacity: 0.16 - i * 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  cross.position.set(0, 0.01, z);
  scene.add(cross);
});

const laneEdgeFront = new THREE.Mesh(
  new THREE.BoxGeometry(320, 0.07, 0.16),
  new THREE.MeshBasicMaterial({
    color: 0xff4f9e,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
laneEdgeFront.position.set(0, 0.03, 3.6);
scene.add(laneEdgeFront);

const laneEdgeBack = new THREE.Mesh(
  new THREE.BoxGeometry(320, 0.07, 0.16),
  new THREE.MeshBasicMaterial({
    color: 0x2de2ff,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
laneEdgeBack.position.set(0, 0.03, -4.9);
scene.add(laneEdgeBack);

// --- roadside props: street lamps + cherry trees ---
function buildLamp() {
  const lamp = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1c2136, roughness: 0.7, metalness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.6, 8), poleMat);
  pole.position.y = 1.8;
  pole.castShadow = true;
  lamp.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), poleMat);
  arm.position.set(0.42, 3.55, 0);
  lamp.add(arm);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xffe6b8,
      emissive: 0xffc87a,
      emissiveIntensity: 2.4,
      roughness: 0.4,
    })
  );
  head.position.set(0.82, 3.48, 0);
  lamp.add(head);
  const glow = makeGlowSprite(0xffc87a, 2.4, 0.6);
  glow.position.copy(head.position);
  lamp.add(glow);
  return lamp;
}

function buildCherryTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a2f2e, roughness: 0.95 })
  );
  trunk.position.y = 0.75;
  trunk.castShadow = true;
  tree.add(trunk);

  const petalMats = [
    new THREE.MeshStandardMaterial({ color: 0xf097b8, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xe87fa8, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xf7b3cc, roughness: 0.9 }),
  ];
  [
    [0, 2.1, 0, 0.85],
    [0.6, 1.75, 0.25, 0.6],
    [-0.55, 1.8, -0.2, 0.62],
    [0.1, 1.6, 0.45, 0.5],
  ].forEach(([x, y, z, r], i) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), petalMats[i % petalMats.length]);
    puff.position.set(x, y, z);
    puff.castShadow = true;
    tree.add(puff);
  });
  return tree;
}

const roadsideProps = [];
const LAMP_SPAN = 180;
for (let i = 0; i < 8; i += 1) {
  const lamp = buildLamp();
  lamp.position.set(-LAMP_SPAN / 2 + i * (LAMP_SPAN / 8), 0, -6.2);
  scene.add(lamp);
  roadsideProps.push({ mesh: lamp, span: LAMP_SPAN, factor: 0.92 });
}

const TREE_SPAN = 200;
for (let i = 0; i < 7; i += 1) {
  const tree = buildCherryTree();
  const scale = 0.85 + Math.random() * 0.5;
  tree.scale.setScalar(scale);
  tree.position.set(-TREE_SPAN / 2 + i * (TREE_SPAN / 7) + Math.random() * 8, 0, -8.5 - Math.random() * 3);
  scene.add(tree);
  roadsideProps.push({ mesh: tree, span: TREE_SPAN, factor: 0.82 });
}

// --- drifting sakura petals ---
const PETAL_COUNT = 70;
const petalPositions = new Float32Array(PETAL_COUNT * 3);
const petalDrift = [];
for (let i = 0; i < PETAL_COUNT; i += 1) {
  petalPositions[i * 3] = (Math.random() - 0.5) * 120;
  petalPositions[i * 3 + 1] = Math.random() * 18;
  petalPositions[i * 3 + 2] = -12 + Math.random() * 16;
  petalDrift.push({
    vx: 0.02 + Math.random() * 0.05,
    vy: 0.008 + Math.random() * 0.016,
    sway: Math.random() * Math.PI * 2,
  });
}
const petalGeo = new THREE.BufferGeometry();
petalGeo.setAttribute("position", new THREE.BufferAttribute(petalPositions, 3));
const petals = new THREE.Points(
  petalGeo,
  new THREE.PointsMaterial({
    color: 0xffb3cf,
    size: 0.26,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  })
);
scene.add(petals);

// --- cat ---
function buildCat(scale, palette) {
  const furMat = new THREE.MeshStandardMaterial({ color: palette.fur, roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1c2a, roughness: 0.5 });
  const pinkMat = new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.7 });
  const scarfMat = new THREE.MeshStandardMaterial({ color: palette.scarf, roughness: 0.75 });
  const patchMat = new THREE.MeshStandardMaterial({ color: palette.patch, roughness: 0.85 });

  const cat = new THREE.Group();
  cat.userData.furMat = furMat;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.0, 6, 14), furMat);
  body.rotation.z = Math.PI / 2;
  body.position.set(-0.15, 1.2, 0);
  cat.add(body);

  // back patches
  [
    [-0.4, 1.72, 0.32, 0],
    [0.05, 1.78, 0.3, 0.4],
    [-0.7, 1.6, 0.26, -0.3],
  ].forEach(([x, y, r, rot]) => {
    const patch = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), patchMat);
    patch.position.set(x, y, 0);
    patch.scale.set(1, 0.42, 0.95);
    patch.rotation.z = rot;
    cat.add(patch);
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 18, 16), furMat);
  head.position.set(0.95, 2.08, 0);
  head.scale.set(1, 0.94, 0.96);
  cat.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12), furMat);
  muzzle.position.set(1.38, 1.92, 0);
  muzzle.scale.set(0.95, 0.72, 0.95);
  cat.add(muzzle);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), pinkMat);
  nose.position.set(1.62, 2.0, 0);
  nose.scale.set(0.7, 0.6, 0.9);
  cat.add(nose);

  const eyeGeo = new THREE.SphereGeometry(0.085, 10, 10);
  const highlightGeo = new THREE.SphereGeometry(0.028, 6, 6);
  const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [0.24, -0.24].forEach((z) => {
    const eye = new THREE.Mesh(eyeGeo, darkMat);
    eye.position.set(1.42, 2.22, z);
    cat.add(eye);
    const hl = new THREE.Mesh(highlightGeo, highlightMat);
    hl.position.set(1.49, 2.26, z + (z > 0 ? 0.02 : -0.02));
    cat.add(hl);
  });

  const earGeo = new THREE.ConeGeometry(0.21, 0.44, 4);
  const innerEarGeo = new THREE.ConeGeometry(0.11, 0.24, 4);
  [0.3, -0.3].forEach((z) => {
    const ear = new THREE.Mesh(earGeo, furMat);
    ear.position.set(0.78, 2.66, z);
    ear.rotation.y = Math.PI / 4;
    ear.rotation.z = z > 0 ? -0.12 : 0.12;
    cat.add(ear);
    const inner = new THREE.Mesh(innerEarGeo, pinkMat);
    inner.position.set(0.83, 2.64, z);
    inner.rotation.y = Math.PI / 4;
    cat.add(inner);
  });

  // whiskers
  const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xe8e8f2 });
  const whiskerGeo = new THREE.BoxGeometry(0.4, 0.014, 0.014);
  [0.22, -0.22].forEach((z) => {
    [-0.08, 0, 0.08].forEach((tilt, i) => {
      const whisker = new THREE.Mesh(whiskerGeo, whiskerMat);
      whisker.position.set(1.52, 1.92 + i * 0.05, z * 1.4);
      whisker.rotation.y = z > 0 ? -0.5 : 0.5;
      whisker.rotation.z = tilt;
      cat.add(whisker);
    });
  });

  // scarf
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.13, 10, 20), scarfMat);
  scarf.position.set(0.58, 1.78, 0);
  scarf.rotation.y = Math.PI / 2;
  scarf.rotation.x = 0.2;
  cat.add(scarf);

  const scarfTail = new THREE.Group();
  const scarfBand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.34), scarfMat);
  scarfBand.geometry.translate(0, -0.27, 0);
  scarfTail.add(scarfBand);
  scarfTail.position.set(0.32, 1.72, 0.12);
  scarfTail.rotation.z = -0.5;
  cat.add(scarfTail);
  cat.userData.scarfTail = scarfTail;

  // tail (curved tube with tip)
  const tailGroup = new THREE.Group();
  const tailCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.55, 0.3, 0),
    new THREE.Vector3(-0.72, 1.05, 0)
  );
  const tailTube = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 10, 0.11, 8), furMat);
  tailGroup.add(tailTube);
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), patchMat);
  tailTip.position.set(-0.72, 1.05, 0);
  tailGroup.add(tailTip);
  tailGroup.position.set(-1.05, 1.4, 0);
  cat.add(tailGroup);
  cat.userData.tail = tailGroup;

  // legs
  const legGeo = new THREE.CapsuleGeometry(0.14, 0.36, 4, 10);
  legGeo.translate(0, -0.32, 0);
  const legs = [];
  [
    [0.55, 0.32],
    [0.55, -0.32],
    [-0.75, 0.32],
    [-0.75, -0.32],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, furMat);
    leg.position.set(lx, 0.66, lz);
    cat.add(leg);
    legs.push(leg);
  });
  cat.userData.legs = legs;

  cat.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
    }
  });

  cat.scale.setScalar(scale);
  return cat;
}

const catGroup = buildCat(1, { fur: 0xfff4e6, patch: 0xb9bed4, scarf: 0xff4f6d });
const catFurMat = catGroup.userData.furMat;
scene.add(catGroup);

const kittenGroup = buildCat(0.55, { fur: 0xffb36b, patch: 0xe08a3c, scarf: 0x63d8a2 });
const kittenFurMat = kittenGroup.userData.furMat;
kittenGroup.visible = false;
scene.add(kittenGroup);

function updateCatPose(group, phase, runSpeed) {
  const legs = group.userData.legs;
  const tail = group.userData.tail;
  const scarfTail = group.userData.scarfTail;
  legs.forEach((leg, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    leg.rotation.z = Math.sin(phase + (i < 2 ? 0 : Math.PI)) * 0.55 * dir * runSpeed;
  });
  if (tail) {
    tail.rotation.z = Math.sin(phase * 0.5) * 0.22;
    tail.rotation.x = Math.sin(phase * 0.35) * 0.26;
  }
  if (scarfTail) {
    scarfTail.rotation.z = -0.5 + Math.sin(phase * 0.9) * 0.28;
  }
}

function getPoseFrame() {
  return world.state === GAME_STATE.PLAYING ? player.frame : renderTick * 0.2;
}

function updateCatMesh() {
  const cx = toX(player.x + player.width / 2);
  const cy = toY(player.y + player.height);
  catGroup.position.set(cx, Math.max(0, cy), 0);

  const airborne = !player.onGround;
  catGroup.rotation.z = airborne ? Math.max(-0.35, Math.min(0.35, -player.vy * 0.028)) : 0;

  if (player.isCharging && player.onGround) {
    const rate = player.chargeFrames / getChargeFrameLimit();
    catGroup.scale.set(1 + rate * 0.12, 1 - rate * 0.22, 1 + rate * 0.12);
  } else {
    catGroup.scale.setScalar(1);
  }

  updateCatPose(catGroup, getPoseFrame() * 1.4, player.onGround || world.state !== GAME_STATE.PLAYING ? 1 : 0.35);

  if (world.invincibleTimer > 0) {
    catFurMat.color.set(world.invincibleTimer % 8 < 4 ? "#fff4e6" : "#9df3ff");
    catFurMat.emissive.set(world.invincibleTimer % 8 < 4 ? "#332211" : "#0e5566");
  } else if (world.flashTime > 0) {
    catFurMat.color.set("#8d8d99");
    catFurMat.emissive.set("#330000");
  } else {
    catFurMat.color.set("#fff4e6");
    catFurMat.emissive.set("#000000");
  }
}

function updateKittenMesh() {
  kittenGroup.visible = world.kitten.active;
  if (!world.kitten.active) {
    return;
  }
  const size = world.kitten.big ? player.width : 30;
  const cx = toX(world.kitten.x + size / 2);
  const cy = toY(world.kitten.y + size);
  kittenGroup.position.set(cx, Math.max(0, cy), 1.6);
  kittenGroup.scale.setScalar(world.kitten.big ? 0.95 : 0.55);
  if (world.kitten.big) {
    kittenFurMat.color.set("#8df0ff");
    kittenFurMat.emissive.set("#0e5566");
  } else {
    kittenFurMat.color.set("#ffb36b");
    kittenFurMat.emissive.set("#000000");
  }
  updateCatPose(kittenGroup, getPoseFrame() * 1.4, 1);
}

// --- obstacles (cucumbers) ---
const cucumberBodyMat = new THREE.MeshStandardMaterial({ color: 0x5ecb4a, roughness: 0.55 });
const cucumberDarkMat = new THREE.MeshStandardMaterial({ color: 0x2c6b2e, roughness: 0.7 });
const cucumberEyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const cucumberPupilMat = new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 0.3 });

function createCucumberMesh() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.42, 6, 14), cucumberBodyMat);
  body.castShadow = true;
  group.add(body);

  // darker ends
  [0.34, -0.34].forEach((y) => {
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), cucumberDarkMat);
    end.position.set(0, y, 0);
    end.scale.set(1, 0.7, 1);
    group.add(end);
  });

  // stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.16, 6), cucumberDarkMat);
  stem.position.set(0, 0.52, 0);
  group.add(stem);

  // warty bumps
  const bumpGeo = new THREE.SphereGeometry(0.045, 6, 6);
  for (let i = 0; i < 9; i += 1) {
    const bump = new THREE.Mesh(bumpGeo, cucumberDarkMat);
    const angle = (i / 9) * Math.PI * 2 + (i % 2) * 0.4;
    const yy = -0.3 + (i / 9) * 0.62;
    bump.position.set(Math.cos(angle) * 0.29, yy, Math.sin(angle) * 0.29);
    group.add(bump);
  }

  // angry cartoon eyes facing the runner (-x)
  [0.13, -0.13].forEach((z) => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), cucumberEyeWhiteMat);
    eyeWhite.position.set(-0.24, 0.2, z);
    group.add(eyeWhite);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), cucumberPupilMat);
    pupil.position.set(-0.3, 0.2, z);
    group.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.02), cucumberPupilMat);
    brow.position.set(-0.28, 0.32, z);
    brow.rotation.x = z > 0 ? -0.6 : 0.6;
    group.add(brow);
  });

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
    }
  });

  return group;
}

function updateCucumberMesh(obstacle, mesh) {
  const w = obstacle.width / WORLD_SCALE;
  const h = obstacle.height / WORLD_SCALE;
  mesh.scale.set(w, h, w);
  mesh.position.set(
    toX(obstacle.x + obstacle.width / 2),
    toY(obstacle.y + obstacle.height) + h / 2,
    0
  );
  mesh.rotation.y = Math.sin(renderTick * 0.02 + obstacle.x * 0.01) * 0.25;
}

// --- heart items ---
function makeHeartGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.bezierCurveTo(-0.62, -0.12, -0.55, 0.42, -0.25, 0.42);
  shape.bezierCurveTo(-0.08, 0.42, 0, 0.3, 0, 0.18);
  shape.bezierCurveTo(0, 0.3, 0.08, 0.42, 0.25, 0.42);
  shape.bezierCurveTo(0.55, 0.42, 0.62, -0.12, 0, -0.5);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.3,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 3,
  });
}

const heartGeo = makeHeartGeometry();
heartGeo.center();
const heartMat = new THREE.MeshStandardMaterial({
  color: 0xff4d79,
  emissive: 0xff1a4d,
  emissiveIntensity: 0.5,
  roughness: 0.3,
  metalness: 0.15,
});

function createHeartMesh() {
  const mesh = new THREE.Mesh(heartGeo, heartMat);
  mesh.castShadow = true;
  const glow = makeGlowSprite(0xff5f87, 2.6, 0.55);
  mesh.add(glow);
  mesh.userData.glow = glow;
  return mesh;
}

function updateHeartMesh(item, mesh) {
  const s = item.width / WORLD_SCALE;
  mesh.scale.setScalar(s * 1.1);
  mesh.position.set(
    toX(item.x + item.width / 2),
    toY(item.y + item.height / 2) + Math.sin(renderTick * 0.06 + item.x * 0.02) * 0.2,
    0
  );
  mesh.rotation.y = renderTick * 0.035;
  mesh.userData.glow.material.opacity = 0.45 + Math.sin(renderTick * 0.12 + item.x * 0.03) * 0.18;
}

// --- invincible star items ---
function makeStarGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * i) / 5;
    const radius = i % 2 === 0 ? 0.5 : 0.22;
    const px = Math.cos(angle) * radius;
    const py = -Math.sin(angle) * radius;
    if (i === 0) {
      shape.moveTo(px, py);
    } else {
      shape.lineTo(px, py);
    }
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
}

const starItemGeo = makeStarGeometry();
starItemGeo.center();
const starItemMat = new THREE.MeshStandardMaterial({
  color: 0x6ef7ff,
  emissive: 0x22c8dd,
  emissiveIntensity: 0.65,
  roughness: 0.25,
  metalness: 0.35,
});

function createStarMesh() {
  const mesh = new THREE.Mesh(starItemGeo, starItemMat);
  mesh.castShadow = true;
  const glow = makeGlowSprite(0x6ef7ff, 2.8, 0.55);
  mesh.add(glow);
  mesh.userData.glow = glow;
  return mesh;
}

function updateStarMesh(item, mesh) {
  const s = item.width / WORLD_SCALE;
  mesh.scale.setScalar(s * 1.2);
  mesh.position.set(
    toX(item.x + item.width / 2),
    toY(item.y + item.height / 2) + Math.sin(renderTick * 0.07 + item.x * 0.02) * 0.22,
    0
  );
  mesh.rotation.y = renderTick * 0.05;
  mesh.userData.glow.material.opacity = 0.45 + Math.sin(renderTick * 0.15 + item.x * 0.03) * 0.2;
}

// --- generic game-object <-> mesh sync ---
const obstacleMeshes = new Map();
const heartMeshes = new Map();
const starMeshes = new Map();

function syncMeshes(list, map, factory, updateFn) {
  const seen = new Set();
  list.forEach((obj) => {
    let mesh = map.get(obj);
    if (!mesh) {
      mesh = factory(obj);
      scene.add(mesh);
      map.set(obj, mesh);
    }
    seen.add(obj);
    updateFn(obj, mesh);
  });
  map.forEach((mesh, obj) => {
    if (!seen.has(obj)) {
      scene.remove(mesh);
      map.delete(obj);
    }
  });
}

// --- particles ---
const PARTICLE_POOL_SIZE = 320;
const particlePool = [];
const particleGeo = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < PARTICLE_POOL_SIZE; i += 1) {
  const mesh = new THREE.Mesh(
    particleGeo,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  mesh.visible = false;
  scene.add(mesh);
  particlePool.push(mesh);
}

function updateParticles3D() {
  for (let i = 0; i < PARTICLE_POOL_SIZE; i += 1) {
    const mesh = particlePool[i];
    const particle = world.effects[i];
    if (!particle) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    const s = particle.size / WORLD_SCALE;
    mesh.scale.setScalar(Math.max(0.05, s));
    mesh.position.set(toX(particle.x), toY(particle.y), particle.z);
    mesh.rotation.set(particle.life * 0.15, particle.life * 0.11, 0);
    mesh.material.color.setStyle(particle.color);
    mesh.material.opacity = Math.max(0, particle.life / 36);
  }
}

// --- scrolling scenery ---
function updateScenery(moveSpeed) {
  const offset = -((scrollPx / WORLD_SCALE) % GRID_SPACING);
  for (let i = 0; i < GRID_COUNT; i += 1) {
    gridLines[i].position.x = -GRID_SPACING * (GRID_COUNT / 2) + i * GRID_SPACING + offset;
  }

  const unitSpeed = moveSpeed / WORLD_SCALE;

  const parallax = unitSpeed * 0.35;
  skyline.forEach((block) => {
    block.position.x -= parallax;
    if (block.position.x < -SKYLINE_SPAN / 2 - 5) {
      block.position.x += SKYLINE_SPAN;
    }
  });

  roadsideProps.forEach((prop) => {
    prop.mesh.position.x -= unitSpeed * prop.factor;
    if (prop.mesh.position.x < -prop.span / 2 - 6) {
      prop.mesh.position.x += prop.span;
    }
  });

  clouds.forEach((cloud) => {
    cloud.position.x -= cloud.userData.drift + unitSpeed * 0.04;
    if (cloud.position.x < -120) {
      cloud.position.x += 240;
    }
  });

  const positions = petalGeo.attributes.position;
  for (let i = 0; i < PETAL_COUNT; i += 1) {
    const drift = petalDrift[i];
    drift.sway += 0.02;
    let px = positions.getX(i) - drift.vx - unitSpeed * 0.55;
    let py = positions.getY(i) - drift.vy;
    const pz = positions.getZ(i) + Math.sin(drift.sway) * 0.008;
    if (py < -0.5 || px < -62) {
      px = 40 + Math.random() * 40;
      py = 6 + Math.random() * 14;
    }
    positions.setXYZ(i, px, py, pz);
  }
  positions.needsUpdate = true;

  // twinkling stars
  starsA.material.opacity = 0.65 + Math.sin(renderTick * 0.03) * 0.25;
  starsB.material.opacity = 0.65 + Math.cos(renderTick * 0.021) * 0.25;

  sunMaterial.uniforms.time.value = renderTick * 0.1;
}

function render3D() {
  renderTick += 1;
  const moveSpeed = world.state === GAME_STATE.PLAYING ? world.speed : 1.4;
  scrollPx += moveSpeed;

  updateScenery(moveSpeed);
  updateCatMesh();
  updateKittenMesh();
  syncMeshes(world.obstacles, obstacleMeshes, createCucumberMesh, updateCucumberMesh);
  syncMeshes(world.items, heartMeshes, createHeartMesh, updateHeartMesh);
  syncMeshes(world.powerups, starMeshes, createStarMesh, updateStarMesh);
  updateParticles3D();

  // camera: soft follow + hit shake
  const targetLift = Math.min(3.4, Math.max(0, catGroup.position.y) * 0.18);
  cameraLift += (targetLift - cameraLift) * 0.07;
  const shake = world.flashTime > 0 ? world.flashTime * 0.045 : 0;
  camera.position.set(
    -4 + (Math.random() - 0.5) * shake,
    6.5 + cameraLift + (Math.random() - 0.5) * shake,
    26
  );
  camera.lookAt(-2, 4.2 + cameraLift * 0.6, 0);

  renderer.render(scene, camera);
}

const projectionVector = new THREE.Vector3();

function projectToScreen(x, y, z) {
  projectionVector.set(x, y, z).project(camera);
  return {
    x: (projectionVector.x * 0.5 + 0.5) * canvas.width,
    y: (-projectionVector.y * 0.5 + 0.5) * canvas.height,
  };
}

// ---------------------------------------------------------------------------
// In-world 2D overlays (charge gauge, kitten counter, score popups)
// ---------------------------------------------------------------------------

function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function drawPlayerOverlays() {
  if (world.state === GAME_STATE.PLAYING && player.isCharging && player.onGround) {
    const p = projectToScreen(catGroup.position.x, catGroup.position.y + 3.4, 0);
    const rate = player.chargeFrames / getChargeFrameLimit();
    const gaugeW = 72;
    const gaugeH = 10;

    ctx.fillStyle = "rgba(5, 8, 20, 0.72)";
    roundRectPath(p.x - gaugeW / 2 - 2, p.y - gaugeH - 2, gaugeW + 4, gaugeH + 4, 7);
    ctx.fill();

    const grad = ctx.createLinearGradient(p.x - gaugeW / 2, 0, p.x + gaugeW / 2, 0);
    grad.addColorStop(0, "#4ff2ff");
    grad.addColorStop(1, "#ff5f87");
    ctx.fillStyle = grad;
    ctx.shadowColor = rate >= 1 ? "#ff5f87" : "#4ff2ff";
    ctx.shadowBlur = rate >= 1 ? 14 : 8;
    roundRectPath(p.x - gaugeW / 2, p.y - gaugeH, Math.max(4, gaugeW * rate), gaugeH, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (world.kitten.active && !world.kitten.big) {
    const p = projectToScreen(kittenGroup.position.x, kittenGroup.position.y + 2.4, kittenGroup.position.z);
    const label = `♥ ${world.kitten.growthPoints}/3`;
    ctx.font = "600 13px 'Outfit', 'Hiragino Kaku Gothic ProN', sans-serif";
    const w = ctx.measureText(label).width + 16;
    ctx.fillStyle = "rgba(5, 8, 20, 0.7)";
    roundRectPath(p.x - w / 2, p.y - 16, w, 20, 10);
    ctx.fill();
    ctx.fillStyle = "#ffb3cf";
    ctx.textAlign = "center";
    ctx.fillText(label, p.x, p.y - 2);
  }
}

function drawScorePopups() {
  if (world.scorePopups.length === 0) {
    return;
  }
  ctx.textAlign = "center";
  world.scorePopups.forEach((popup) => {
    popup.life -= 1;
    popup.y -= 1.7;
    const p = projectToScreen(toX(popup.x), toY(popup.y), 0.6);
    const alpha = Math.min(1, popup.life / 22);
    ctx.globalAlpha = alpha;
    ctx.font = "700 21px 'Chakra Petch', 'Outfit', sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(4, 6, 16, 0.75)";
    ctx.strokeText(popup.text, p.x, p.y);
    ctx.fillStyle = "#8ff6ff";
    ctx.fillText(popup.text, p.x, p.y);
  });
  ctx.globalAlpha = 1;
  world.scorePopups = world.scorePopups.filter((popup) => popup.life > 0);
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------

function render() {
  render3D();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPlayerOverlays();
  drawScorePopups();
  updateHUDFrame();
}

function loop() {
  update();

  if (world.kitten.active) {
    const followDistance = world.kitten.big ? 80 : 56;
    const targetX = player.x - followDistance;
    const targetY = player.y + player.height - (world.kitten.big ? player.height : 30);
    world.kitten.x += (targetX - world.kitten.x) * 0.18;
    world.kitten.y += (targetY - world.kitten.y) * 0.2;
  }

  render();
  requestAnimationFrame(loop);
}

// debug / testing hook
window.__neko = { world, player };

syncUI();
loop();
