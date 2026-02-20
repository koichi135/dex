const canvas = document.getElementById("game");
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
const stageResetInvincible = 96;
const touchPerkSelectLockMs = 420;

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
  speed: 7,
  score: 0,
  best: 0,
  lives: 3,
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
  levelUpTouchArmed: false,
  kitten: {
    active: false,
    x: 70,
    y: groundY + 20,
    growthPoints: 0,
    big: false,
  },
};

function resetGame() {
  world.speed = 7;
  world.score = 0;
  world.lives = 3;
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
  world.levelUpTouchArmed = false;
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

  const canSelectPerk = world.levelUpTouchArmed && Date.now() >= world.perkTouchLockedUntil;
  touchPerkButtons.forEach((button, index) => {
    button.disabled = !canSelectPerk || !world.levelUpChoices[index];
    button.textContent = world.levelUpChoices[index] ? `PERK ${index + 1}` : "---";
  });
}

function enterLevelUpState() {
  world.state = GAME_STATE.LEVEL_UP;
  world.levelUpTouchArmed = false;
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
    world.levelUpTouchArmed = true;
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
  world.levelUpTouchArmed = false;
  syncTouchControls();
}

function selectPerkByPointer(e) {
  if (!e) {
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
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.6,
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
  world.speed += 0.0007 + world.perks.speedRank * 0.00012;
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
    createObstacle();
    if (Math.random() < 0.24) {
      createObstacle(68 + Math.random() * 40, 0.78 + Math.random() * 0.18);
    }
    if (Math.random() < 0.12) {
      createObstacle(160 + Math.random() * 48, 0.7 + Math.random() * 0.15);
    }
    world.obstacleTimer = 48 + Math.random() * 34;
  }

  world.itemTimer -= 1;
  if (world.itemTimer <= 0) {
    createHeartItem();
    world.itemTimer = 250 + Math.random() * 180;
  }

  world.powerupTimer -= 1;
  if (world.powerupTimer <= 0) {
    createInvincibleItem();
    world.powerupTimer = 520 + Math.random() * 260;
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

function drawEffects() {
  world.effects.forEach((particle) => {
    ctx.globalAlpha = Math.max(0, particle.life / 36);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;
}

function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function drawBackground() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#1a1a1a";
  for (let i = 0; i < canvas.width; i += 24) {
    const h = 14 + ((i / 24) % 3) * 9;
    ctx.fillRect((i - (world.score % 24)) | 0, groundY + player.height + 6 - h, 12, h);
  }

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, groundY + player.height, canvas.width, 3);
}

function drawCat() {
  const x = player.x;
  const y = player.y;
  const runPhase = Math.floor(player.frame) % 2;

  if (world.invincibleTimer > 0) {
    ctx.fillStyle = world.invincibleTimer % 8 < 4 ? "#fff" : "#7ff";
  } else {
    ctx.fillStyle = world.flashTime > 0 ? "#888" : "#fff";
  }

  ctx.fillRect(x + 6, y + 18, 40, 26);
  ctx.fillRect(x + 12, y + 4, 28, 18);

  // ears
  ctx.fillRect(x + 12, y, 8, 8);
  ctx.fillRect(x + 32, y, 8, 8);

  // legs
  const legOffset = runPhase === 0 ? 0 : 4;
  ctx.fillRect(x + 10, y + 44, 8, 8 + legOffset);
  ctx.fillRect(x + 34, y + 44, 8, 12 - legOffset);

  // face details
  ctx.fillStyle = "#000";
  ctx.fillRect(x + 18, y + 10, 4, 4);
  ctx.fillRect(x + 30, y + 10, 4, 4);
  ctx.fillRect(x + 24, y + 14, 4, 3);

  // tail
  ctx.fillStyle = world.invincibleTimer > 0 ? "#7ff" : "#fff";
  ctx.fillRect(x, y + 24, 8, 5);

  if (player.isCharging && player.onGround) {
    ctx.fillStyle = "#fff";
    const gaugeW = 42;
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(x + 5, y - 12, gaugeW, 5);
    ctx.fillRect(x + 6, y - 11, (gaugeW - 2) * (player.chargeFrames / getChargeFrameLimit()), 3);
  }
}

function drawBuddyKitten() {
  if (!world.kitten.active) {
    return;
  }

  const kittenSize = world.kitten.big ? player.width : 30;
  const x = world.kitten.x;
  const y = world.kitten.y;
  const bodyH = world.kitten.big ? 26 : 16;
  const headW = world.kitten.big ? 28 : 16;
  const headH = world.kitten.big ? 18 : 12;

  ctx.fillStyle = world.kitten.big ? "#7ff" : "#ddd";
  ctx.fillRect(x + 4, y + 12, kittenSize - 8, bodyH);
  ctx.fillRect(x + 8, y + 2, headW, headH);
  ctx.fillRect(x + 8, y - 2, 6, 6);
  ctx.fillRect(x + headW + 2, y - 2, 6, 6);

  ctx.fillStyle = "#000";
  ctx.fillRect(x + 12, y + 7, 3, 3);
  ctx.fillRect(x + 20, y + 7, 3, 3);

  if (!world.kitten.big) {
    ctx.fillStyle = "#fff";
    ctx.font = "14px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${world.kitten.growthPoints}/3`, x, y - 8);
  }
}

function drawCucumber(obstacle) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

  ctx.fillStyle = "#000";
  const cut = Math.max(4, Math.floor(obstacle.width / 5));
  ctx.fillRect(obstacle.x + cut, obstacle.y + 6, 4, obstacle.height - 12);
  ctx.fillRect(obstacle.x + cut * 2, obstacle.y + 4, 4, obstacle.height - 8);
  ctx.fillRect(obstacle.x + cut * 3, obstacle.y + 6, 4, obstacle.height - 12);
}

function drawHeartItem(item) {
  const x = item.x;
  const y = item.y;

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(x + item.width / 2, y + item.height);
  ctx.bezierCurveTo(x - 4, y + item.height * 0.62, x + 2, y + item.height * 0.16, x + item.width * 0.3, y + item.height * 0.25);
  ctx.bezierCurveTo(x + item.width * 0.44, y - 2, x + item.width * 0.56, y - 2, x + item.width * 0.7, y + item.height * 0.25);
  ctx.bezierCurveTo(x + item.width - 2, y + item.height * 0.16, x + item.width + 4, y + item.height * 0.62, x + item.width / 2, y + item.height);
  ctx.fill();
}

function drawInvincibleItem(item) {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  const outer = item.width / 2;
  const inner = outer * 0.44;

  ctx.fillStyle = "#7ff";
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * i) / 5;
    const radius = i % 2 === 0 ? outer : inner;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.fillRect(cx - 2, cy - 6, 4, 12);
  ctx.fillRect(cx - 6, cy - 2, 12, 4);
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
  drawCenteredLines(["NEKO RUNNER", "HOLD TO CHARGE JUMP", "TAP TO START"], 170);
  ctx.font = "22px 'Courier New', monospace";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText("HOLD SPACE / TAP : HIGHER JUMP", canvas.width / 2, 356);
  ctx.fillText("GET HEARTS + STAR (INVINCIBLE)", canvas.width / 2, 392);
}

function drawGameOver() {
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
  drawBackground();

  world.obstacles.forEach(drawCucumber);
  world.items.forEach(drawHeartItem);
  world.powerups.forEach(drawInvincibleItem);
  drawEffects();
  drawBuddyKitten();
  drawCat();
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
