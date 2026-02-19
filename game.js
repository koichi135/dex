const canvas = document.getElementById("game");
const touchJumpButton = document.getElementById("touch-jump");
const ctx = canvas.getContext("2d");

const GAME_STATE = {
  TITLE: "title",
  PLAYING: "playing",
  GAME_OVER: "game_over",
};

const gravity = 0.8;
const jumpPowerMin = -10;
const jumpPowerMax = -19;
const maxChargeFrames = 28;
const groundY = canvas.height - 110;
const invincibleDuration = 360;

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
};

const world = {
  speed: 7,
  score: 0,
  best: 0,
  lives: 3,
  obstacles: [],
  items: [],
  powerups: [],
  obstacleTimer: 0,
  itemTimer: 0,
  powerupTimer: 0,
  state: GAME_STATE.TITLE,
  flashTime: 0,
  invincibleTimer: 0,
};

function resetGame() {
  world.speed = 7;
  world.score = 0;
  world.lives = 3;
  world.obstacles = [];
  world.items = [];
  world.powerups = [];
  world.obstacleTimer = 0;
  world.itemTimer = 0;
  world.powerupTimer = 200;
  world.flashTime = 0;
  world.invincibleTimer = 0;

  player.y = groundY;
  player.vy = 0;
  player.onGround = true;
  player.isCharging = false;
  player.chargeFrames = 0;
}

function startGame() {
  resetGame();
  world.state = GAME_STATE.PLAYING;
}

function onPressStart() {
  if (world.state === GAME_STATE.TITLE) {
    startGame();
    return;
  }

  if (world.state === GAME_STATE.GAME_OVER) {
    world.state = GAME_STATE.TITLE;
    return;
  }

  if (player.onGround && !player.isCharging) {
    player.isCharging = true;
    player.chargeFrames = 0;
  }
}

function onPressEnd() {
  if (world.state !== GAME_STATE.PLAYING || !player.isCharging || !player.onGround) {
    return;
  }

  const chargeRate = Math.min(1, player.chargeFrames / maxChargeFrames);
  const jumpPower = jumpPowerMin + (jumpPowerMax - jumpPowerMin) * chargeRate;
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

const pressedKeys = new Set();
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (pressedKeys.has(e.code)) {
      return;
    }
    pressedKeys.add(e.code);
    onPressStart();
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

function update() {
  if (world.state !== GAME_STATE.PLAYING) {
    return;
  }

  world.score += 1;
  world.speed += 0.0007;
  const difficulty = Math.floor(world.score / 650);

  if (player.isCharging && player.onGround) {
    player.chargeFrames = Math.min(maxChargeFrames, player.chargeFrames + 1);
  }

  player.vy += gravity;
  player.y += player.vy;

  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
  }

  world.obstacleTimer -= 1;
  if (world.obstacleTimer <= 0) {
    createObstacle();
    if (difficulty >= 1 && Math.random() < Math.min(0.65, 0.2 + difficulty * 0.08)) {
      createObstacle(68 + Math.random() * 40, 0.78 + Math.random() * 0.18);
    }
    if (difficulty >= 3 && Math.random() < 0.22) {
      createObstacle(160 + Math.random() * 48, 0.7 + Math.random() * 0.15);
    }
    const minInterval = Math.max(24, 56 - difficulty * 4.5);
    const variableInterval = Math.max(18, 45 - difficulty * 2.5);
    world.obstacleTimer = minInterval + Math.random() * variableInterval;
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
        return;
      }

      world.lives -= 1;
      world.flashTime = 8;

      if (world.lives <= 0) {
        world.best = Math.max(world.best, world.score);
        world.state = GAME_STATE.GAME_OVER;
      }
    }
  });

  world.items.forEach((item) => {
    item.x -= world.speed;

    if (!item.taken && intersects(player, item)) {
      item.taken = true;
      world.lives = Math.min(5, world.lives + 1);
    }
  });

  world.powerups.forEach((item) => {
    item.x -= world.speed;

    if (!item.taken && intersects(player, item)) {
      item.taken = true;
      world.invincibleTimer = invincibleDuration;
    }
  });

  world.obstacles = world.obstacles.filter((o) => o.x + o.width > -20 && !o.hit);
  world.items = world.items.filter((i) => !i.taken && i.x + i.width > -20);
  world.powerups = world.powerups.filter((i) => !i.taken && i.x + i.width > -20);

  if (world.flashTime > 0) {
    world.flashTime -= 1;
  }

  if (world.invincibleTimer > 0) {
    world.invincibleTimer -= 1;
  }

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
    ctx.fillRect(x + 6, y - 11, (gaugeW - 2) * (player.chargeFrames / maxChargeFrames), 3);
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

  if (world.invincibleTimer > 0) {
    ctx.fillStyle = "#7ff";
    ctx.fillText(`INV ${Math.ceil(world.invincibleTimer / 60)}`, 24, 108);
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
  drawCat();
  drawHUD();

  if (world.state === GAME_STATE.TITLE) {
    drawTitle();
  }

  if (world.state === GAME_STATE.GAME_OVER) {
    drawGameOver();
  }
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

loop();
