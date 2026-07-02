import * as THREE from "./vendor/three.module.min.js";

const canvas = document.getElementById("game");
const glCanvas = document.getElementById("game-3d");
const touchJumpButton = document.getElementById("touch-jump");
const touchPerkControls = document.getElementById("touch-perk-controls");
const touchPerkButtons = Array.from(document.querySelectorAll(".touch-perk"));
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
  best: 0,
  lives: 2,
  obstacles: [],
  items: [],
  powerups: [],
  effects: [],
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
  perkCardBounds: [],
  comboCount: 0,
  comboTimer: 0,
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
  world.obstacleTimer = 0;
  world.itemTimer = 0;
  world.powerupTimer = 200;
  world.flashTime = 0;
  world.invincibleTimer = 0;
  world.level = 1;
  world.xp = 0;
  world.nextLevelXp = 420;
  world.levelUpChoices = [];
  world.perkCardBounds = [];
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

function addKittenGrowthPoint(reason) {
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
  syncTouchControls();
}

function syncTouchControls() {
  if (!touchJumpButton || !touchPerkControls) {
    return;
  }

  const isLevelUp = world.state === GAME_STATE.LEVEL_UP;
  touchJumpButton.hidden = isLevelUp;
  touchPerkControls.hidden = !isLevelUp;

  if (!isLevelUp) {
    touchPerkButtons.forEach((button) => {
      button.disabled = true;
    });
    return;
  }

  const canSelectPerk = Date.now() >= world.perkTouchLockedUntil;
  touchPerkButtons.forEach((button, index) => {
    const perk = world.levelUpChoices[index];
    const indexLabel = button.querySelector(".touch-perk-index");
    const nameLabel = button.querySelector(".touch-perk-name");
    const axisLabel = button.querySelector(".touch-perk-axis");
    const descLabel = button.querySelector(".touch-perk-desc");

    button.disabled = !canSelectPerk || !perk;

    if (!perk) {
      if (nameLabel) {
        nameLabel.textContent = "---";
      }
      if (axisLabel) {
        axisLabel.textContent = "---";
      }
      if (descLabel) {
        descLabel.textContent = "---";
      }
      return;
    }

    if (indexLabel) {
      indexLabel.textContent = `[${index + 1}]`;
    }
    if (nameLabel) {
      nameLabel.textContent = perk.name;
    }
    if (axisLabel) {
      axisLabel.textContent = `AXIS: ${perkAxisLabels[perk.axis]}`;
    }
    if (descLabel) {
      descLabel.textContent = perk.description;
    }
  });
}

function enterLevelUpState() {
  world.state = GAME_STATE.LEVEL_UP;
  world.perkTouchLockedUntil = Date.now() + touchPerkSelectLockMs;
  syncTouchControls();
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
    selectPerkByPointer(e);
    return;
  }

  if (world.state === GAME_STATE.GAME_OVER) {
    world.state = GAME_STATE.TITLE;
    syncTouchControls();
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

  if (world.state === GAME_STATE.LEVEL_UP) {
    syncTouchControls();
    return;
  }

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

if (touchPerkButtons.length > 0) {
  touchPerkButtons.forEach((button) => {
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (button.disabled) {
        return;
      }
      const perkIndex = Number(button.dataset.perkIndex);
      choosePerk(perkIndex);
    });
  });
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
    addKittenGrowthPoint("level-up");
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
  world.perkCardBounds = [];
  world.comboCount = 0;
  world.comboTimer = 0;
  world.state = GAME_STATE.PLAYING;
  syncTouchControls();
}

function resetStageAfterPerk() {
  world.obstacles = [];
  world.items = [];
  world.powerups = [];
  world.effects = [];
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
  syncTouchControls();
}

function selectPerkByPointer(e) {
  if (!e || Date.now() < world.perkTouchLockedUntil) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
  world.perkCardBounds.forEach((card, index) => {
    if (px >= card.x && px <= card.x + card.w && py >= card.y && py <= card.y + card.h) {
      choosePerk(index);
    }
  });
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
        world.best = Math.max(world.best, world.score);
        world.state = GAME_STATE.GAME_OVER;
      }
    }
  });

  world.items.forEach((item) => {
    item.x -= world.speed;

    if (!item.taken && intersects(player, item)) {
      item.taken = true;
      if (world.lives >= world.perks.maxLives) {
        addKittenGrowthPoint("overheal");
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
      addKittenGrowthPoint("invincible");
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
// 3D rendering (Three.js)
// ---------------------------------------------------------------------------

const WORLD_SCALE = 20;
const groundLineY = groundY + player.height;
const toX = (px) => (px - canvas.width / 2) / WORLD_SCALE;
const toY = (py) => (groundLineY - py) / WORLD_SCALE;

const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
renderer.setSize(canvas.width, canvas.height, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070912);
scene.fog = new THREE.Fog(0x070912, 34, 90);

const camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.1, 220);
camera.position.set(-4, 6.5, 26);
camera.lookAt(-2, 4.2, 0);

scene.add(new THREE.AmbientLight(0x8f9ab5, 1.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(-14, 24, 18);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x77ffff, 0.6);
rimLight.position.set(20, 8, -14);
scene.add(rimLight);

let scrollPx = 0;
let renderTick = 0;

// --- ground ---
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(260, 60),
  new THREE.MeshLambertMaterial({ color: 0x10131d })
);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.set(0, -0.02, -12);
scene.add(groundPlane);

const GRID_SPACING = 2.4;
const GRID_COUNT = 50;
const gridLines = [];
const gridLineMat = new THREE.MeshBasicMaterial({ color: 0x2a3147 });
const gridLineGeo = new THREE.BoxGeometry(0.06, 0.02, 36);
for (let i = 0; i < GRID_COUNT; i += 1) {
  const line = new THREE.Mesh(gridLineGeo, gridLineMat);
  line.position.set(0, 0, -4);
  scene.add(line);
  gridLines.push(line);
}

const laneEdge = new THREE.Mesh(
  new THREE.BoxGeometry(240, 0.06, 0.14),
  new THREE.MeshBasicMaterial({ color: 0xe8ecf5 })
);
laneEdge.position.set(0, 0.03, 3.4);
scene.add(laneEdge);

// --- skyline (parallax background blocks) ---
const skyline = [];
const skylineMat = new THREE.MeshLambertMaterial({ color: 0x1b2132 });
for (let i = 0; i < 26; i += 1) {
  const w = 2 + Math.random() * 3;
  const h = 2 + Math.random() * 7;
  const block = new THREE.Mesh(new THREE.BoxGeometry(w, 1, 2.4), skylineMat);
  block.scale.y = h;
  block.position.set(-64 + i * 5 + Math.random() * 2, h / 2, -16 - Math.random() * 8);
  scene.add(block);
  skyline.push(block);
}

// --- stars in the sky ---
{
  const starPositions = [];
  for (let i = 0; i < 240; i += 1) {
    starPositions.push(
      (Math.random() - 0.5) * 220,
      6 + Math.random() * 60,
      -30 - Math.random() * 60
    );
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xaebadb, size: 0.35, sizeAttenuation: true, fog: false })
  );
  scene.add(stars);
}

// --- cat ---
const catBodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const catDarkMat = new THREE.MeshLambertMaterial({ color: 0x11131a });

function buildCat(scale, bodyMat) {
  const cat = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.15, 1.05), bodyMat);
  body.position.set(-0.1, 1.15, 0);
  cat.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 0.95), bodyMat);
  head.position.set(0.95, 1.95, 0);
  cat.add(head);

  const earGeo = new THREE.BoxGeometry(0.3, 0.34, 0.2);
  const earL = new THREE.Mesh(earGeo, bodyMat);
  earL.position.set(0.8, 2.55, 0.3);
  cat.add(earL);
  const earR = new THREE.Mesh(earGeo, bodyMat);
  earR.position.set(0.8, 2.55, -0.3);
  cat.add(earR);

  const eyeGeo = new THREE.BoxGeometry(0.08, 0.18, 0.16);
  const eyeL = new THREE.Mesh(eyeGeo, catDarkMat);
  eyeL.position.set(1.54, 2.05, 0.26);
  cat.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, catDarkMat);
  eyeR.position.set(1.54, 2.05, -0.26);
  cat.add(eyeR);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.2), catDarkMat);
  nose.position.set(1.54, 1.78, 0);
  cat.add(nose);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.24), bodyMat);
  tail.geometry.translate(-0.45, 0, 0);
  tail.position.set(-1.1, 1.5, 0);
  tail.rotation.z = 0.5;
  cat.add(tail);
  cat.userData.tail = tail;

  const legGeo = new THREE.BoxGeometry(0.34, 0.68, 0.3);
  legGeo.translate(0, -0.34, 0);
  const legs = [];
  [
    [0.55, 0.32],
    [0.55, -0.32],
    [-0.75, 0.32],
    [-0.75, -0.32],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.position.set(lx, 0.68, lz);
    cat.add(leg);
    legs.push(leg);
  });
  cat.userData.legs = legs;

  cat.scale.setScalar(scale);
  return cat;
}

const catGroup = buildCat(1, catBodyMat);
scene.add(catGroup);

const kittenBodyMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
const kittenGroup = buildCat(0.55, kittenBodyMat);
kittenGroup.visible = false;
scene.add(kittenGroup);

function updateCatPose(group, gamePlayerLike, runSpeed) {
  const legs = group.userData.legs;
  const tail = group.userData.tail;
  const phase = gamePlayerLike.frame * 1.4;
  legs.forEach((leg, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    leg.rotation.z = Math.sin(phase + (i < 2 ? 0 : Math.PI)) * 0.55 * dir * runSpeed;
  });
  if (tail) {
    tail.rotation.z = 0.5 + Math.sin(phase * 0.5) * 0.18;
  }
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

  updateCatPose(catGroup, player, player.onGround ? 1 : 0.35);

  if (world.invincibleTimer > 0) {
    catBodyMat.color.set(world.invincibleTimer % 8 < 4 ? "#ffffff" : "#77ffff");
    catBodyMat.emissive.set(world.invincibleTimer % 8 < 4 ? "#223344" : "#116677");
  } else if (world.flashTime > 0) {
    catBodyMat.color.set("#888888");
    catBodyMat.emissive.set("#000000");
  } else {
    catBodyMat.color.set("#ffffff");
    catBodyMat.emissive.set("#000000");
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
  kittenGroup.position.set(cx, Math.max(0, cy), 1.4);
  kittenGroup.scale.setScalar(world.kitten.big ? 0.95 : 0.55);
  kittenBodyMat.color.set(world.kitten.big ? "#77ffff" : "#dddddd");
  updateCatPose(kittenGroup, player, 1);
}

// --- obstacles (cucumbers) ---
const cucumberBodyMat = new THREE.MeshLambertMaterial({ color: 0x9fe08a });
const cucumberStripeMat = new THREE.MeshLambertMaterial({ color: 0x2f6b33 });

function createCucumberMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.8), cucumberBodyMat);
  group.add(body);
  const stripeGeo = new THREE.BoxGeometry(0.14, 0.8, 0.84);
  [-0.26, 0, 0.26].forEach((sx, i) => {
    const stripe = new THREE.Mesh(stripeGeo, cucumberStripeMat);
    stripe.position.set(sx, i === 1 ? 0.06 : -0.02, 0);
    group.add(stripe);
  });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.34), cucumberStripeMat);
  cap.position.set(0, 0.58, 0);
  group.add(cap);
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
    bevelSegments: 2,
  });
}

const heartGeo = makeHeartGeometry();
heartGeo.center();
const heartMat = new THREE.MeshLambertMaterial({ color: 0xff5f87, emissive: 0x551122 });

function createHeartMesh() {
  return new THREE.Mesh(heartGeo, heartMat);
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
    bevelSegments: 2,
  });
}

const starGeo = makeStarGeometry();
starGeo.center();
const starMat = new THREE.MeshLambertMaterial({ color: 0x77ffff, emissive: 0x117788 });

function createStarMesh() {
  return new THREE.Mesh(starGeo, starMat);
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
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
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
function updateScenery() {
  const offset = -((scrollPx / WORLD_SCALE) % GRID_SPACING);
  for (let i = 0; i < GRID_COUNT; i += 1) {
    gridLines[i].position.x = -GRID_SPACING * (GRID_COUNT / 2) + i * GRID_SPACING + offset;
  }

  if (world.state === GAME_STATE.PLAYING) {
    const parallax = (world.speed / WORLD_SCALE) * 0.35;
    skyline.forEach((block) => {
      block.position.x -= parallax;
      if (block.position.x < -66) {
        block.position.x += 132;
        const h = 2 + Math.random() * 7;
        block.scale.y = h;
        block.position.y = h / 2;
      }
    });
  }
}

function render3D() {
  renderTick += 1;
  if (world.state === GAME_STATE.PLAYING) {
    scrollPx += world.speed;
  }

  updateScenery();
  updateCatMesh();
  updateKittenMesh();
  syncMeshes(world.obstacles, obstacleMeshes, createCucumberMesh, updateCucumberMesh);
  syncMeshes(world.items, heartMeshes, createHeartMesh, updateHeartMesh);
  syncMeshes(world.powerups, starMeshes, createStarMesh, updateStarMesh);
  updateParticles3D();

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
// HUD / overlays (2D canvas on top of the WebGL canvas)
// ---------------------------------------------------------------------------

function drawPlayerOverlays() {
  if (world.state === GAME_STATE.PLAYING && player.isCharging && player.onGround) {
    const p = projectToScreen(catGroup.position.x, catGroup.position.y + 3.3, 0);
    const gaugeW = 64;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - gaugeW / 2, p.y - 8, gaugeW, 8);
    ctx.fillStyle = "#7ff";
    ctx.fillRect(
      p.x - gaugeW / 2 + 1,
      p.y - 7,
      (gaugeW - 2) * (player.chargeFrames / getChargeFrameLimit()),
      6
    );
  }

  if (world.kitten.active && !world.kitten.big) {
    const p = projectToScreen(kittenGroup.position.x, kittenGroup.position.y + 2.2, kittenGroup.position.z);
    ctx.fillStyle = "#fff";
    ctx.font = "14px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${world.kitten.growthPoints}/3`, p.x, p.y);
  }
}

function drawHUD() {
  ctx.fillStyle = "#fff";
  ctx.font = "24px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${world.score}`, 24, 40);
  ctx.fillText(`LIFE ${world.lives}`, 24, 74);
  ctx.fillText(`LV ${world.level}`, 24, 108);
  ctx.fillText(`XP ${world.xp}/${world.nextLevelXp}`, 24, 142);
  ctx.fillText(`REROLL ${world.perkRerolls}`, 24, 176);

  if (world.invincibleTimer > 0) {
    ctx.fillStyle = "#7ff";
    ctx.fillText(`INV ${Math.ceil(world.invincibleTimer / 60)}`, 24, 210);
  }

  if (world.perks.shieldCharges > 0) {
    ctx.fillStyle = "#fff";
    ctx.fillText(`SHIELD ${world.perks.shieldCharges}`, 24, 244);
  }

  if (world.comboCount > 1 && world.comboTimer > 0) {
    ctx.fillStyle = "#7ff";
    ctx.fillText(`COMBO x${getComboMultiplier().toFixed(2)}`, 24, 278);
  }
}

function drawLevelUpOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCenteredLines([`LEVEL UP! ${world.level}`, "PERKを1つ選んで進化せよ"], 80, 36);
  ctx.fillStyle = "#fff";
  ctx.font = "18px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`Rキーでリロール (${world.perkRerolls}回)`, canvas.width / 2, 142);

  const cardW = 260;
  const cardH = 264;
  const gap = 34;
  const startX = (canvas.width - cardW * 3 - gap * 2) / 2;
  const y = 170;
  world.perkCardBounds = [];

  world.levelUpChoices.forEach((perk, index) => {
    const x = startX + index * (cardW + gap);
    world.perkCardBounds.push({ x, y, w: cardW, h: cardH });

    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, cardW, cardH);

    ctx.fillStyle = "#7ff";
    ctx.font = "20px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`[${index + 1}] ${perk.name}`, x + 14, y + 36);

    ctx.fillStyle = "#aaa";
    ctx.font = "16px 'Courier New', monospace";
    ctx.fillText(`AXIS: ${perkAxisLabels[perk.axis]}`, x + 14, y + 62);

    ctx.fillStyle = "#fff";
    ctx.font = "16px 'Courier New', monospace";
    wrapText(perk.description, x + 14, y + 92, cardW - 28, 24);
  });
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const tokens = text.includes(" ") ? text.split(/(\s+)/).filter(Boolean) : Array.from(text);
  let line = "";
  let lineIndex = 0;

  tokens.forEach((token) => {
    const testLine = `${line}${token}`;
    if (line && ctx.measureText(testLine).width > maxWidth) {
      ctx.fillText(line.trimEnd(), x, y + lineIndex * lineHeight);
      line = token.trimStart();
      lineIndex += 1;
    } else {
      line = testLine;
    }
  });

  if (line) {
    ctx.fillText(line.trimEnd(), x, y + lineIndex * lineHeight);
  }
}

function drawCenteredLines(lines, top, size = 34) {
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `${size}px 'Courier New', monospace`;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, top + i * (size + 14));
  });
}

function drawTitle() {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCenteredLines(["NEKO RUNNER 3D", "HOLD TO CHARGE JUMP", "TAP TO START"], 170);
  ctx.font = "22px 'Courier New', monospace";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText("HOLD SPACE / TAP : HIGHER JUMP", canvas.width / 2, 356);
  ctx.fillText("GET HEARTS + STAR (INVINCIBLE)", canvas.width / 2, 392);
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCenteredLines(["GAME OVER"], 185, 44);
  ctx.font = "26px 'Courier New', monospace";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(`RESULT ${world.score}`, canvas.width / 2, 285);
  ctx.fillText(`BEST ${Math.max(world.best, world.score)}`, canvas.width / 2, 328);
  ctx.font = "20px 'Courier New', monospace";
  ctx.fillText("TAP TO RETURN TITLE", canvas.width / 2, 390);
}

function render() {
  render3D();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPlayerOverlays();
  drawHUD();

  if (world.state === GAME_STATE.TITLE) {
    drawTitle();
  }

  if (world.state === GAME_STATE.GAME_OVER) {
    drawGameOver();
  }

  if (world.state === GAME_STATE.LEVEL_UP) {
    syncTouchControls();
    drawLevelUpOverlay();
  }
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

syncTouchControls();
loop();
