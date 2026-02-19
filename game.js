const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const GAME_STATE = {
  TITLE: "title",
  PLAYING: "playing",
  GAME_OVER: "game_over",
};

const gravity = 0.8;
const jumpPower = -14;
const groundY = canvas.height - 110;

const player = {
  x: 120,
  y: groundY,
  width: 52,
  height: 52,
  vy: 0,
  onGround: true,
  frame: 0,
};

const world = {
  speed: 7,
  score: 0,
  best: 0,
  lives: 3,
  obstacles: [],
  items: [],
  obstacleTimer: 0,
  itemTimer: 0,
  state: GAME_STATE.TITLE,
  flashTime: 0,
};

function resetGame() {
  world.speed = 7;
  world.score = 0;
  world.lives = 3;
  world.obstacles = [];
  world.items = [];
  world.obstacleTimer = 0;
  world.itemTimer = 0;
  world.flashTime = 0;

  player.y = groundY;
  player.vy = 0;
  player.onGround = true;
}

function startGame() {
  resetGame();
  world.state = GAME_STATE.PLAYING;
}

function onTap() {
  if (world.state === GAME_STATE.TITLE) {
    startGame();
    return;
  }

  if (world.state === GAME_STATE.GAME_OVER) {
    world.state = GAME_STATE.TITLE;
    return;
  }

  if (player.onGround) {
    player.vy = jumpPower;
    player.onGround = false;
  }
}

canvas.addEventListener("pointerdown", onTap);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    onTap();
  }
});

function createObstacle() {
  const size = 42 + Math.random() * 18;
  world.obstacles.push({
    x: canvas.width + 20,
    y: groundY + player.height - size,
    width: size,
    height: size,
    hit: false,
  });
}

function createItem() {
  const yBase = groundY - 120 - Math.random() * 120;
  world.items.push({
    x: canvas.width + 20,
    y: yBase,
    width: 34,
    height: 30,
    taken: false,
  });
}

function update() {
  if (world.state !== GAME_STATE.PLAYING) {
    return;
  }

  world.score += 1;
  world.speed += 0.0006;

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
    world.obstacleTimer = 56 + Math.random() * 45;
  }

  world.itemTimer -= 1;
  if (world.itemTimer <= 0) {
    createItem();
    world.itemTimer = 250 + Math.random() * 180;
  }

  world.obstacles.forEach((obstacle) => {
    obstacle.x -= world.speed;

    if (!obstacle.hit && intersects(player, obstacle)) {
      obstacle.hit = true;
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

  world.obstacles = world.obstacles.filter((o) => o.x + o.width > -20);
  world.items = world.items.filter((i) => !i.taken && i.x + i.width > -20);

  if (world.flashTime > 0) {
    world.flashTime -= 1;
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

  ctx.fillStyle = world.flashTime > 0 ? "#888" : "#fff";

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
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y + 24, 8, 5);
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

function drawCatCan(item) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(item.x, item.y, item.width, item.height);

  ctx.fillStyle = "#000";
  ctx.fillRect(item.x + 6, item.y + 8, item.width - 12, 3);
  ctx.fillRect(item.x + 6, item.y + 15, item.width - 12, 3);
  ctx.fillRect(item.x + 10, item.y + 21, item.width - 20, 4);
}

function drawHUD() {
  ctx.fillStyle = "#fff";
  ctx.font = "24px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${world.score}`, 24, 40);
  ctx.fillText(`LIFE ${world.lives}`, 24, 74);
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
  drawCenteredLines(["NEKO RUNNER", "TAP TO START"], 200);
  ctx.font = "22px 'Courier New', monospace";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText("TAP / SPACE : JUMP", canvas.width / 2, 360);
  ctx.fillText("AVOID CUCUMBERS, GET CAT CANS", canvas.width / 2, 398);
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
  world.items.forEach(drawCatCan);
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
