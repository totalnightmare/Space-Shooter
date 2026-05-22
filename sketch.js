
// ─────────────────────────────────────────────────
//  CONSTANTS (Virtual Resolution)
// ─────────────────────────────────────────────────
const VIRTUAL_W = 480;
const VIRTUAL_H = 640;
const GRID_SIZE = 80;  // For spatial collision detection
let gameScale = 1;
let gameOffsetX = 0, gameOffsetY = 0;
let cnv;
let logoImg = null;
let bgMusic = null;
let musicEnabled = true;

// Place your logo file at: assets/logo.png (recommended)
function preload() {
  // Try several common paths so the user can place the logo in a few likely locations.
  let paths = ['assets/logo.png', 'logo.png', 'images/logo.png', 'assets/images/logo.png'];
  logoImg = null;
  // Use callback-style attempts so load errors don't throw
  function attempt(i) {
    if (i >= paths.length) { logoImg = null; return; }
    loadImage(paths[i], (img) => { logoImg = img; }, () => { attempt(i + 1); });
  }
  attempt(0);

  // Try loading background music from common locations (non-blocking)
  let musicPaths = ['assets/music.mp3', 'assets/music.ogg', 'music.mp3', 'music.ogg', 'assets/bg.mp3'];
  function loadMusic(i) {
    if (i >= musicPaths.length) { bgMusic = null; return; }
    try {
      loadSound(musicPaths[i], (s) => { bgMusic = s; bgMusic.setVolume(0.6); }, () => { loadMusic(i + 1); });
    } catch (e) { loadMusic(i + 1); }
  }
  loadMusic(0);
}

// ─────────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────────
let state = 'loading';   // 'loading' | 'start' | 'playing' | 'paused' | 'gameOver'
let score = 0;
let highScore = 0;
let lives = 3;
let wave = 1;
let combo = 0;
let comboTimer = 0;

// Wave management
let totalEnemies = 0;
let enemiesSpawned = 0;
let enemiesLeft = 0;
let spawnTimer = 0;
let spawnInterval = 80;
let waveBonus = false;
let waveBonusTimer = 0;

// Screen shake
let shakeMag = 0;

// Collections
let stars = [];
let bullets = [];
let bulletPool = [];
let enemyBullets = [];
let enemyBulletPool = [];
let bosses = [];
let enemies = [];
let bossSpawnedForWave = false;
let particles = [];
let particlePool = [];
let powerUps = [];
let spatialGrid = {};  // For optimized collision detection

// Input
let keys = {};
let shootCD = 0;
let loadingTimer = 0;
let loadingDuration = 120; // frames (~2s at 60fps)

// Player
let P;
let playerShield = 0;
let playerMultiShot = 0;
let playerRapidFire = 0;
let rawKeyListenersAdded = false;

// ─────────────────────────────────────────────────
//  SETUP & RESIZING
// ─────────────────────────────────────────────────
function setup() {
  cnv = createCanvas(windowWidth, windowHeight);
  // Make the canvas focusable so keyboard input works after clicks
  if (cnv && cnv.elt) {
    cnv.elt.tabIndex = 0;
    cnv.elt.style.outline = 'none';
  }
  textFont('monospace');
  frameRate(60);
  initStarfield();
  initPlayer();
  computeScaleAndOffset();
  addGlobalKeyListeners();
}

function addGlobalKeyListeners() {
  if (rawKeyListenersAdded) return;
  rawKeyListenersAdded = true;

  window.addEventListener('keydown', (e) => {
    // Normalize single-character keys
    let k = (typeof e.key === 'string' && e.key.length === 1) ? e.key.toLowerCase() : e.key;
    keys[k] = true;
    // Also set by code for Arrow keys and Space
    if (e.code) keys[e.code] = true;
    // prevent page from scrolling when using arrows/space
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) || e.key === ' ') e.preventDefault();
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    let k = (typeof e.key === 'string' && e.key.length === 1) ? e.key.toLowerCase() : e.key;
    keys[k] = false;
    if (e.code) keys[e.code] = false;
  });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeScaleAndOffset();
}

function computeScaleAndOffset() {
  let scaleX = width / VIRTUAL_W;
  let scaleY = height / VIRTUAL_H;
  gameScale = min(scaleX, scaleY);
  gameOffsetX = (width - VIRTUAL_W * gameScale) / 2;
  gameOffsetY = (height - VIRTUAL_H * gameScale) / 2;
}

// Transform mouse coordinates to virtual space
function getVirtualMouse() {
  let vx = (mouseX - gameOffsetX) / gameScale;
  let vy = (mouseY - gameOffsetY) / gameScale;
  return { x: constrain(vx, 0, VIRTUAL_W), y: constrain(vy, 0, VIRTUAL_H) };
}

// Draw everything scaled
function drawScaled(callback) {
  push();
  translate(gameOffsetX, gameOffsetY);
  scale(gameScale);
  callback();
  pop();
}

// ─────────────────────────────────────────────────
//  INITIALIZATION
// ─────────────────────────────────────────────────
function initStarfield() {
  stars = [];
  // layered starfield: layer 0 = far, 1 = mid, 2 = near
  for (let i = 0; i < 160; i++) {
    let x = random(VIRTUAL_W), y = random(VIRTUAL_H);
    let s = makeStar(x, y);
    // bias layers: more far stars
    let r = random();
    s.layer = r < 0.6 ? 0 : (r < 0.9 ? 1 : 2);
    // adjust speed and size by layer
    s.speed *= (0.5 + s.layer * 0.9);
    s.size *= (0.8 + s.layer * 0.9);
    stars.push(s);
  }
}

function makeStar(x, y) {
  return {
    x, y,
    size: random(0.6, 3.0),
    speed: random(0.3, 1.6),
    bright: random(140, 255),
    twinkleSin: random(0, TWO_PI), // phase
    layer: 0
  };
}

function initPlayer() {
  P = {
    x: VIRTUAL_W / 2,
    y: VIRTUAL_H - 90,
    w: 38,
    h: 46,
    spd: 5,
    invTimer: 0,
    thrAnim: 0,
    // display/animation helpers
    displayX: VIRTUAL_W / 2,
    displayY: VIRTUAL_H - 90,
    rot: 0,
    rotTarget: 0
  };
  playerShield = 0;
  playerMultiShot = 0;
  playerRapidFire = 0;
}

function startGame() {
  score = 0;
  lives = 3;
  wave = 1;
  combo = 0;
  bullets = [];
  enemies = [];
  particles = [];
  powerUps = [];
  waveBonus = false;
  waveBonusTimer = 0;
  playerShield = 0;
  playerMultiShot = 0;
  playerRapidFire = 0;
  spatialGrid = {};
  initPlayer();
  initObjectPools();
  beginWave(1);
  state = 'playing';
  bosses = [];
  bossSpawnedForWave = false;
  if (cnv && cnv.elt) cnv.elt.focus();
  // Start background music if available and allowed. Make sure audio context is resumed on user gesture.
  if (bgMusic && musicEnabled) {
    try {
      if (typeof getAudioContext === 'function' && getAudioContext().state !== 'running') getAudioContext().resume();
    } catch (e) { }
    try { bgMusic.setLoop(true); bgMusic.setVolume(0.6); bgMusic.loop(); } catch (e) { }
  }
}

function initObjectPools() {
  bulletPool = [];
  particlePool = [];
  // Pre-create pool objects to avoid popping nulls (prevents runtime errors)
  for (let i = 0; i < 300; i++) bulletPool.push({ x: 0, y: 0, spd: 0, w: 0, h: 0, angle: 0, fromPlayer: true });
  for (let i = 0; i < 500; i++) particlePool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, col: color(255), drag: 1 });
  // Enemy bullet pool
  enemyBulletPool = [];
  for (let i = 0; i < 150; i++) enemyBulletPool.push({ x: 0, y: 0, vx: 0, vy: 0, spd: 0 });
}

function beginWave(w) {
  totalEnemies = 5 + w * 3;
  enemiesSpawned = 0;
  enemiesLeft = totalEnemies;
  spawnInterval = max(18, 82 - w * 7);
  spawnTimer = 0;
  // Boss will be spawned after regular enemies are cleared
  bossSpawnedForWave = false;
}

function spawnBoss(w) {
  // Boss appears near top-center with HP scaling by wave
  let b = {};
  b.x = VIRTUAL_W / 2;
  b.y = -80;
  b.r = 44 + w * 6;
  // Reduce HP scaling so bosses are less punishing
  b.hp = max(30, 40 + w * 20);
  b.maxHp = b.hp;
  b.speed = 0.35 + w * 0.04;
  b.col = color(220, 80, 180);
  b.type = 'boss';
  b.angle = 0;
  b.targetY = 90 + min(60, w * 6);
  b.shootTimer = int(random(40, 120));
  b.shootInterval = max(30, 110 - w * 6);
  b.phase = 0;
  bosses.push(b);
}

// ─────────────────────────────────────────────────
//  MAIN DRAW
// ─────────────────────────────────────────────────
function draw() {
  background(0, 0, 0);

  // Apply screen shake in scaled context
  push();
  if (shakeMag > 0.5) {
    translate(random(-shakeMag, shakeMag), random(-shakeMag, shakeMag));
    shakeMag *= 0.78;
  } else {
    shakeMag = 0;
  }

  drawScaled(() => {
    drawBackground();
    updateStars();

    if (state === 'loading') {
      drawLoading();
      loadingTimer++;
      if (loadingTimer >= loadingDuration) {
        state = 'start';
      }
    } else if (state === 'start') drawStart();
    else if (state === 'playing') { runGame(); drawHUD(); }
    else if (state === 'paused') { drawScene(); drawHUD(); drawPause(); }
    else if (state === 'gameOver') { drawScene(); drawHUD(); drawGameOver(); }
  });
  pop();
}

// ─────────────────────────────────────────────────
//  STARS
// ─────────────────────────────────────────────────
function updateStars() {
  noStroke();
  // subtle horizontal drift based on frame for parallax
  let t = frameCount * 0.002;
  for (let s of stars) {
    // vertical movement
    s.y += s.speed;
    // horizontal parallax drift
    s.x += sin(t + s.x * 0.01) * (0.2 + s.layer * 0.35);
    s.twinkleSin = sin(s.twinkleSin + 0.04 + s.layer * 0.01);
    if (s.y > VIRTUAL_H + 4) {
      s.y = -4;
      s.x = random(VIRTUAL_W);
    }
    if (s.x < -4) s.x = VIRTUAL_W + 4;
    if (s.x > VIRTUAL_W + 4) s.x = -4;
    // layer affects brightness and color tint
    let alpha = map(s.layer, 0, 2, 120, 255) * (0.7 + 0.3 * s.twinkleSin);
    let base = s.bright * (0.6 + 0.4 * s.twinkleSin);
    if (s.layer === 2) {
      fill(base + 40, base + 20, base, alpha);
    } else if (s.layer === 1) {
      fill(base + 10, base + 10, base + 30, alpha);
    } else {
      fill(base, base, base + 40, alpha * 0.85);
    }
    ellipse(s.x, s.y, s.size + s.layer * 0.9);
  }
}

// Draw layered nebula background
function drawBackground() {
  // base gradient
  for (let i = 0; i < 8; i++) {
    let a = map(i, 0, 7, 6, 22);
    let c = color(6 + i * 6, 10 + i * 6, 30 + i * 6);
    noStroke(); fill(c); rect(0, i * (VIRTUAL_H / 8), VIRTUAL_W, VIRTUAL_H / 8);
  }
  // additive nebula blobs
  blendMode(ADD);
  noStroke();
  let centerX = VIRTUAL_W / 2 + sin(frameCount * 0.006) * 40;
  for (let i = 0; i < 3; i++) {
    let rx = centerX + i * 80 - 80;
    let ry = VIRTUAL_H * 0.25 + i * 40;
    let sz = 260 + i * 60;
    let colA = color(50 + i * 30, 30 + i * 20, 120 + i * 30, 28 + i * 8);
    for (let s = 0; s < 6; s++) {
      fill(red(colA), green(colA), blue(colA), alpha(colA) * (1 - s * 0.12));
      ellipse(rx + sin(frameCount * 0.004 + s) * 12, ry + cos(frameCount * 0.005 + s) * 8, sz - s * 36, sz * 0.6 - s * 24);
    }
  }
  // subtle vignette
  blendMode(BLEND);
  noFill(); stroke(0, 0, 8, 120); strokeWeight(90);
  rect(-40, -40, VIRTUAL_W + 80, VIRTUAL_H + 80);
}

// ─────────────────────────────────────────────────
//  GAME LOGIC
// ─────────────────────────────────────────────────
function runGame() {
  if (waveBonus) {
    waveBonusTimer--;
    if (waveBonusTimer <= 0) {
      waveBonus = false;
      wave++;
      beginWave(wave);
    }
    drawScene();
    drawWaveBanner();
    return;
  }

  movePlayer();
  if (shootCD > 0) shootCD--;

  // Handle shooting with rapid fire power-up; use keyIsDown for reliability
  let fireInterval = playerRapidFire ? 5 : 11;
  if ((keyIsDown(32) || keys[' ']) && shootCD === 0) {
    firePlayerBullet();
    shootCD = fireInterval;
  }

  // Update power-ups duration
  if (playerShield > 0) playerShield--;
  if (playerMultiShot > 0) playerMultiShot--;
  if (playerRapidFire > 0) playerRapidFire--;

  // Only spawn small enemies when no boss is active
  if (enemiesSpawned < totalEnemies && bosses.length === 0) {
    spawnTimer++;
    if (spawnTimer >= spawnInterval) { spawnTimer = 0; spawnEnemy(); }
  }

  // Update bullets with pooling
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].y -= bullets[i].spd;
    if (bullets[i].y < -14) {
      bulletPool.push(bullets.splice(i, 1)[0]);
    }
  }

  // Enemies update
  for (let i = enemies.length - 1; i >= 0; i--) {
    stepEnemy(enemies[i]);
    if (enemies[i].y > VIRTUAL_H + 50) {
      enemies.splice(i, 1);
      enemiesLeft--;
      combo = 0;  // Reset combo if enemy escapes
    }
  }

  // Bosses update
  for (let i = bosses.length - 1; i >= 0; i--) {
    let b = bosses[i];
    // Move into position
    if (b.y < b.targetY) b.y += b.speed * 1.6;
    else {
      // Horizontal oscillation
      b.phase += 0.02 + wave * 0.002;
      b.x = VIRTUAL_W / 2 + sin(b.phase) * (VIRTUAL_W * 0.28 - b.r);
    }

    // Shooting
    if (b.shootInterval > 0) {
      b.shootTimer--;
      if (b.shootTimer <= 0) {
        // Boss fires a spread aimed at the player
        let shots = 5;
        let baseAngle = atan2(P.y - b.y, P.x - b.x);
        for (let s = 0; s < shots; s++) {
          let a = baseAngle + map(s, 0, shots - 1, -0.6, 0.6);
          let bb = enemyBulletPool.length > 0 ? enemyBulletPool.pop() : {};
          let speed = 3 + wave * 0.2;
          bb.x = b.x + cos(a) * (b.r - 6);
          bb.y = b.y + sin(a) * (b.r - 6);
          bb.vx = cos(a) * speed;
          bb.vy = sin(a) * speed;
          enemyBullets.push(bb);
        }
        b.shootTimer = int(random(max(20, b.shootInterval - 30), b.shootInterval + 20));
      }
    }

    // Boss out of bounds check
    if (b.y > VIRTUAL_H + 200) {
      bosses.splice(i, 1);
    }
  }

  // Update power-ups
  for (let i = powerUps.length - 1; i >= 0; i--) {
    let pu = powerUps[i];
    pu.y += 1.5;
    pu.angle += 0.06;
    if (pu.y > VIRTUAL_H) {
      powerUps.splice(i, 1);
    }
  }

  // Enemy bullets update
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    let eb = enemyBullets[i];
    eb.x += eb.vx;
    eb.y += eb.vy;
    if (eb.y > VIRTUAL_H + 30 || eb.x < -30 || eb.x > VIRTUAL_W + 30) {
      enemyBulletPool.push(enemyBullets.splice(i, 1)[0]);
    }
  }

  // Particles update with pooling
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.life--;
    if (p.life <= 0) {
      particlePool.push(particles.splice(i, 1)[0]);
    }
  }

  // Optimized collision detection with spatial grid
  updateSpatialGrid();
  checkCollisions();

  // Power-up collision
  for (let i = powerUps.length - 1; i >= 0; i--) {
    let pu = powerUps[i];
    if (dist(P.x, P.y, pu.x, pu.y) < 25) {
      activatePowerUp(pu.type);
      powerUps.splice(i, 1);
    }
  }

  // Enemy bullet vs Player collision
  if (P.invTimer <= 0) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      let b = enemyBullets[i];
      if (dist(P.x, P.y, b.x, b.y) < 12 + 8) {
        // hit
        enemyBulletPool.push(enemyBullets.splice(i, 1)[0]);
        if (playerShield > 0) {
          playerShield = 0;
          spawnHit(b.x, b.y, color(100, 200, 255));
        } else {
          lives--;
          P.invTimer = 110;
          shake(7);
          spawnBoom(b.x, b.y, color(255, 120, 120));
          if (lives <= 0) {
            if (score > highScore) highScore = score;
            state = 'gameOver';
          }
        }
        break;
      }
    }
  }

  // If regular enemies cleared, spawn the boss for this wave (once)
  if (!bossSpawnedForWave && enemiesSpawned >= totalEnemies && enemies.length === 0 && enemiesLeft <= 0) {
    spawnBoss(wave);
    bossSpawnedForWave = true;
  }

  // After the boss has been spawned and defeated, award wave bonus and prepare next wave
  if (!waveBonus && bossSpawnedForWave && bosses.length === 0 && enemies.length === 0) {
    let bonus = wave * 50 + combo * 5;  // Combo bonus
    score += bonus;
    waveBonus = true;
    waveBonusTimer = 190;
    bossSpawnedForWave = false;
  }

  if (comboTimer > 0) comboTimer--;
  else combo = 0;

  drawScene();
}

function updateSpatialGrid() {
  spatialGrid = {};
  for (let e of enemies) {
    let gridX = floor(e.x / GRID_SIZE);
    let gridY = floor(e.y / GRID_SIZE);
    let key = gridX + ',' + gridY;
    if (!spatialGrid[key]) spatialGrid[key] = [];
    spatialGrid[key].push(e);
  }
}

function checkCollisions() {
  // Bullet vs Enemy collision with spatial grid
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    let b = bullets[bi];
    let gridX = floor(b.x / GRID_SIZE);
    let gridY = floor(b.y / GRID_SIZE);

    // Check nearby grid cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        let key = (gridX + dx) + ',' + (gridY + dy);
        if (spatialGrid[key]) {
          for (let ei = spatialGrid[key].length - 1; ei >= 0; ei--) {
            let e = spatialGrid[key][ei];
            if (dist(b.x, b.y, e.x, e.y) < e.r + 6) {
              e.hp--;
              spawnHit(e.x, e.y, e.col);
              bulletPool.push(bullets.splice(bi, 1)[0]);

              if (e.hp <= 0) {
                spawnBoom(e.x, e.y, e.col);
                score += e.pts;
                combo++;
                comboTimer = 120;  // 2 second combo window
                score += combo > 1 ? combo * 2 : 0;  // Combo multiplier
                enemiesLeft--;
                enemies.splice(enemies.indexOf(e), 1);
              }
              bi = -1;  // Break outer loop
              break;
            }
          }
          if (bi === -1) break;
        }
      }
      if (bi === -1) break;
    }
  }

  // Enemy vs Player collision
  if (P.invTimer <= 0) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      let e = enemies[i];
      if (dist(P.x, P.y, e.x, e.y) < e.r + 13) {
        if (playerShield > 0) {
          playerShield = 0;
          spawnBoom(e.x, e.y, e.col);
          enemiesLeft--;
          enemies.splice(i, 1);
          combo = 0;
        } else {
          lives--;
          P.invTimer = 110;
          shakeMag = 9;
          spawnBoom(e.x, e.y, e.col);
          enemiesLeft--;
          enemies.splice(i, 1);
          combo = 0;
          if (lives <= 0) {
            if (score > highScore) highScore = score;
            state = 'gameOver';
          }
        }
        break;
      }
    }
  } else {
    P.invTimer--;
  }

  // Boss vs Player collision
  if (P.invTimer <= 0) {
    for (let i = bosses.length - 1; i >= 0; i--) {
      let b = bosses[i];
      if (dist(P.x, P.y, b.x, b.y) < b.r + 13) {
        if (playerShield > 0) {
          playerShield = 0;
          spawnBoom(b.x, b.y, b.col);
          bosses.splice(i, 1);
        } else {
          lives--;
          P.invTimer = 110;
          shakeMag = 12;
          spawnBoom(b.x, b.y, b.col);
          bosses.splice(i, 1);
          if (lives <= 0) {
            if (score > highScore) highScore = score;
            state = 'gameOver';
          }
        }
        break;
      }
    }
  }

  // Bullet vs Boss collision (player bullets)
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    let bl = bullets[bi];
    if (!bl) continue;
    // treat undefined active as true for compatibility
    if (typeof bl.active !== 'undefined' && !bl.active) continue;
    for (let i = bosses.length - 1; i >= 0; i--) {
      let boss = bosses[i];
      if (dist(bl.x, bl.y, boss.x, boss.y) < boss.r + 10) {
        boss.hp -= 1;
        spawnHit(bl.x, bl.y, boss.col);
        let removed = bullets.splice(bi, 1)[0];
        removed.active = false;
        bulletPool.push(removed);
        if (boss.hp <= 0) {
          spawnBoom(boss.x, boss.y, boss.col);
          // Boss drops a guaranteed multishot power-up for balance
          spawnPowerUpAt(boss.x, boss.y, 'multishot');
          score += 500 + wave * 100;
          combo++;
          comboTimer = 120;
          bosses.splice(i, 1);
        }
        bi = -1; // break outer loop
        break;
      }
    }
  }
}

// ─────────────────────────────────────────────────
//  PLAYER MOVEMENT
// ─────────────────────────────────────────────────
function movePlayer() {
  // Use keyIsDown for robust continuous input (supports lost key events/focus)
  let left = keyIsDown(LEFT_ARROW) || keyIsDown(65) || keys['ArrowLeft'] || keys['a'];
  let right = keyIsDown(RIGHT_ARROW) || keyIsDown(68) || keys['ArrowRight'] || keys['d'];
  let up = keyIsDown(UP_ARROW) || keyIsDown(87) || keys['ArrowUp'] || keys['w'];
  let down = keyIsDown(DOWN_ARROW) || keyIsDown(83) || keys['ArrowDown'] || keys['s'];

  if (left && !right) P.x -= P.spd;
  if (right && !left) P.x += P.spd;
  if (up && !down) P.y -= P.spd;
  if (down && !up) P.y += P.spd;

  P.x = constrain(P.x, P.w / 2 + 2, VIRTUAL_W - P.w / 2 - 2);
  P.y = constrain(P.y, P.h / 2 + 2, VIRTUAL_H - P.h / 2 - 2);
  P.thrAnim += 0.28;
}

function firePlayerBullet() {
  if (playerMultiShot > 0) {
    // Tri-shot
    let angles = [-0.3, 0, 0.3];
    for (let a of angles) {
      let bullet = bulletPool.length > 0 ? bulletPool.pop() : {};
      bullet.x = P.x + sin(a) * 8;
      bullet.y = P.y - P.h / 2 + 4;
      bullet.spd = 11;
      bullet.w = 4;
      bullet.h = 14;
      bullet.owner = 'player';
      bullet.active = true;
      bullet.angle = a;
      bullets.push(bullet);
    }
  } else {
    // Single shot
    let bullet = bulletPool.length > 0 ? bulletPool.pop() : {};
    bullet.x = P.x;
    bullet.y = P.y - P.h / 2 + 4;
    bullet.spd = 11;
    bullet.w = 4;
    bullet.h = 14;
    bullet.owner = 'player';
    bullet.active = true;
    bullets.push(bullet);
  }
}

function activatePowerUp(type) {
  switch (type) {
    case 'shield':
      playerShield = 600;  // 10 seconds
      shake(4);
      break;
    case 'multishot':
      playerMultiShot = 300;  // 5 seconds
      shake(3);
      break;
    case 'rapidfire':
      playerRapidFire = 300;  // 5 seconds
      shake(3);
      break;
    case 'health':
      if (lives < 3) lives++;
      shake(2);
      break;
  }
}

// ─────────────────────────────────────────────────
//  ENEMY SPAWN & BEHAVIOR
// ─────────────────────────────────────────────────
function spawnEnemy() {
  let x = random(34, VIRTUAL_W - 34);
  let y = random(-70, -22);
  let spd = 1.4 + wave * 0.18;
  let t = pickType();

  let e = { x, y, type: t, angle: 0, ampX: random(1.5, 3.5), oscSpd: random(0.04, 0.09) };

  switch (t) {
    case 'basic': e.r = 18; e.hp = 1; e.speed = spd; e.col = color(255, 80, 80); e.pts = 10; break;
    case 'fast': e.r = 14; e.hp = 1; e.speed = spd * 2.0; e.col = color(255, 220, 30); e.pts = 20; break;
    case 'tank': e.r = 24; e.hp = 3; e.speed = spd * 0.55; e.col = color(80, 190, 255); e.pts = 40; e.maxHp = 3; break;
    case 'zigzag': e.r = 16; e.hp = 1; e.speed = spd * 1.25; e.col = color(200, 80, 255); e.pts = 30; break;
    case 'chaser': e.r = 17; e.hp = 2; e.speed = spd * 1.35; e.col = color(255, 140, 40); e.pts = 35; e.maxHp = 2; break;
  }
  // Assign shooting behavior for certain enemy types
  e.shootTimer = 0;
  e.shootInterval = 0;
  if (t === 'tank') { e.shootInterval = int(random(80, 140)); }
  else if (t === 'fast') { e.shootInterval = int(random(180, 260)); }
  else if (t === 'chaser') { e.shootInterval = int(random(140, 220)); }
  if (e.shootInterval > 0) e.shootTimer = int(random(10, e.shootInterval));
  enemies.push(e);
  enemiesSpawned++;
}

function pickType() {
  let r = random(1);
  if (wave >= 6 && r < 0.12) return 'chaser';
  if (wave >= 5 && r < 0.20) return 'chaser';
  if (wave >= 4 && r < 0.18) return 'zigzag';
  if (wave >= 3 && r < 0.22) return 'tank';
  if (wave >= 2 && r < 0.30) return 'fast';
  return 'basic';
}

function stepEnemy(e) {
  // Pre-compute behavior type (more efficient than switch every frame)
  if (e.type === 'basic' || e.type === 'fast' || e.type === 'tank') {
    e.y += e.speed;
  } else if (e.type === 'zigzag') {
    e.y += e.speed;
    e.angle += e.oscSpd;
    e.x += sin(e.angle) * e.ampX * 2.5;
    e.x = constrain(e.x, 20, VIRTUAL_W - 20);  // Keep in bounds
  } else if (e.type === 'chaser') {
    let dx = P.x - e.x, dy = P.y - e.y;
    let d = sqrt(dx * dx + dy * dy);
    if (d > 0) {
      e.x += (dx / d) * e.speed;
      e.y += (dy / d) * e.speed * 0.65;
    }
  }

  // Handle enemy shooting timers
  if (e.shootInterval && e.shootInterval > 0) {
    e.shootTimer--;
    if (e.shootTimer <= 0) {
      spawnEnemyBullet(e);
      e.shootTimer = int(random(max(20, e.shootInterval - 30), e.shootInterval + 20));
    }
  }
}

function spawnEnemyBullet(e) {
  let b = enemyBulletPool.length > 0 ? enemyBulletPool.pop() : {};
  b.x = e.x;
  b.y = e.y + (e.r || 6) + 6;
  // Aim at player
  let dx = P.x - b.x, dy = P.y - b.y;
  let d = sqrt(dx * dx + dy * dy) || 1;
  let speed = (e.type === 'tank') ? 3.2 : 5.2;
  b.vx = (dx / d) * speed;
  b.vy = (dy / d) * speed;
  b.spd = speed;
  enemyBullets.push(b);
}

function spawnPowerUpAt(x, y) {
  // optional third argument: forcedType
  let forcedType = arguments.length > 2 ? arguments[2] : null;
  let types = ['shield', 'multishot', 'rapidfire', 'health'];
  let weights = [0.3, 0.35, 0.2, 0.15];
  let r = random(1);
  let cumulative = 0;
  let type = 'shield';
  if (forcedType) {
    type = forcedType;
  } else {
    for (let i = 0; i < types.length; i++) {
      cumulative += weights[i];
      if (r < cumulative) {
        type = types[i];
        break;
      }
    }
  }

  powerUps.push({ x: x, y: y, type: type, angle: 0 });
}

// ─────────────────────────────────────────────────
//  PARTICLES
// ─────────────────────────────────────────────────
function spawnBoom(x, y, col) {
  for (let i = 0; i < 22; i++) {
    let a = random(TWO_PI), sp = random(1, 5.5);
    let p = particlePool.length > 0 ? particlePool.pop() : {};
    p.x = x;
    p.y = y;
    p.vx = cos(a) * sp;
    p.vy = sin(a) * sp;
    p.life = int(random(22, 45));
    p.maxLife = 45;
    p.size = random(3, 9);
    p.col = col;
    p.drag = 0.93;
    particles.push(p);
  }

  // 15% chance to drop power-up
  if (random(1) < 0.15) {
    spawnPowerUpAt(x, y);
  }
}

function spawnHit(x, y, col) {
  for (let i = 0; i < 6; i++) {
    let a = random(TWO_PI), sp = random(0.5, 2.5);
    let p = particlePool.length > 0 ? particlePool.pop() : {};
    p.x = x;
    p.y = y;
    p.vx = cos(a) * sp;
    p.vy = sin(a) * sp;
    p.life = 14;
    p.maxLife = 14;
    p.size = random(2, 5);
    p.col = col;
    p.drag = 0.92;
    particles.push(p);
  }
}

function shake(mag) {
  shakeMag = mag;
}

// ─────────────────────────────────────────────────
//  DRAWING
// ─────────────────────────────────────────────────
function drawScene() {
  noStroke();
  for (let p of particles) {
    let a = map(p.life, 0, p.maxLife, 0, 220);
    fill(red(p.col), green(p.col), blue(p.col), a);
    ellipse(p.x, p.y, p.size * (p.life / p.maxLife));
  }
  for (let b of bullets) {
    noStroke();
    fill(120, 200, 255, 60);
    ellipse(b.x, b.y, 12, 22);
    fill(180, 230, 255);
    rect(b.x - 2, b.y - 7, 4, 14, 3);
    fill(255);
    ellipse(b.x, b.y - 4, 3, 5);
  }
  // Draw enemy bullets
  for (let eb of enemyBullets) {
    noStroke();
    fill(255, 140, 60);
    ellipse(eb.x, eb.y, 8, 12);
  }
  for (let e of enemies) drawEnemy(e);
  for (let pu of powerUps) drawPowerUp(pu);
  for (let b of bosses) drawBoss(b);
  drawPlayer();
}

function drawBoss(b) {
  push(); translate(b.x, b.y);
  noStroke();
  fill(red(b.col), green(b.col), blue(b.col), 30); ellipse(0, 0, b.r * 2.6, b.r * 2.6);
  fill(red(b.col), green(b.col), blue(b.col), 70); ellipse(0, 0, b.r * 2.1, b.r * 2.1);
  fill(b.col);
  beginShape();
  for (let i = 0; i < 10; i++) {
    let a = (TWO_PI / 10) * i + b.angle;
    let r2 = b.r * (0.6 + 0.25 * (i % 2));
    vertex(cos(a) * r2, sin(a) * r2);
  }
  endShape(CLOSE);
  // HP bar
  noStroke(); fill(20, 20, 30); rect(-b.r, -b.r - 14, b.r * 2, 6, 3);
  fill(120, 200, 255); rect(-b.r, -b.r - 14, map(b.hp, 0, b.maxHp, 0, b.r * 2), 6, 3);
  pop();
}

function drawPowerUp(pu) {
  push();
  translate(pu.x, pu.y);
  rotate(pu.angle);

  let col;
  let icon;
  switch (pu.type) {
    case 'shield': col = color(100, 200, 255); icon = '◆'; break;
    case 'multishot': col = color(255, 200, 100); icon = '✦'; break;
    case 'rapidfire': col = color(255, 150, 100); icon = '⚡'; break;
    case 'health': col = color(255, 100, 100); icon = '❤'; break;
  }

  noStroke();
  fill(col, 150);
  ellipse(0, 0, 22, 22);
  fill(col, 50);
  ellipse(0, 0, 30, 30);

  stroke(col, 200);
  strokeWeight(1);
  noFill();
  ellipse(0, 0, 26, 26);

  noStroke();
  fill(255);
  textSize(14);
  textAlign(CENTER, CENTER);
  text(icon, 0, 0);

  pop();
}

function drawPlayer() {
  if (P.invTimer > 0 && frameCount % 7 < 3) return;
  // Smooth display position and rotation for nicer animation
  P.displayX = lerp(P.displayX, P.x, 0.18);
  P.displayY = lerp(P.displayY, P.y, 0.18);
  // rotation target based on lateral movement input
  let left = keyIsDown(LEFT_ARROW) || keyIsDown(65) || keys['ArrowLeft'] || keys['a'];
  let right = keyIsDown(RIGHT_ARROW) || keyIsDown(68) || keys['ArrowRight'] || keys['d'];
  P.rotTarget = left && !right ? -0.28 : (right && !left ? 0.28 : 0);
  P.rot = lerp(P.rot || 0, P.rotTarget, 0.14);
  push(); translate(P.displayX, P.displayY); rotate(P.rot);
  noStroke();
  let thr = 13 + sin(P.thrAnim) * 6;
  fill(40, 120, 255, 45); ellipse(0, P.h / 2 + thr * 0.6, 18, thr + 12);
  fill(80, 160, 255, 90); ellipse(0, P.h / 2 + thr * 0.25, 11, thr);
  fill(200, 220, 255, 200); ellipse(0, P.h / 2, 6, 9);
  // Thruster particles when the player is moving
  if ((left || right || keyIsDown(UP_ARROW) || keyIsDown(87) || keys['w']) && frameCount % 2 === 0) {
    let p = particlePool.length > 0 ? particlePool.pop() : {};
    p.x = P.displayX;
    p.y = P.displayY + P.h / 2 + 6;
    p.vx = random(-0.6, 0.6) + sin(P.rot) * 0.6;
    p.vy = random(1.6, 3.0) + abs(P.rot) * 0.6;
    p.life = int(random(10, 16));
    p.maxLife = p.life;
    p.size = random(2, 5);
    p.col = color(255, int(random(120, 200)), 60);
    p.drag = 0.92;
    particles.push(p);
  }
  fill(50, 130, 230, 35);
  ellipse(-P.w / 2 + 2, P.h / 6, 22, 10);
  ellipse(P.w / 2 - 2, P.h / 6, 22, 10);
  fill(90, 165, 245);
  beginShape();
  vertex(0, -P.h / 2);
  vertex(P.w / 2, P.h / 4);
  vertex(P.w / 3, P.h / 2);
  vertex(0, P.h / 3);
  vertex(-P.w / 3, P.h / 2);
  vertex(-P.w / 2, P.h / 4);
  endShape(CLOSE);
  fill(170, 220, 255, 200);
  ellipse(0, -P.h / 9, P.w * 0.36, P.h * 0.42);
  fill(230, 245, 255, 100);
  ellipse(-3, -P.h / 7, 7, 14);
  stroke(160, 210, 255, 140); strokeWeight(1.2);
  line(-P.w / 3, P.h / 5, P.w / 3, P.h / 5);
  noStroke();

  // Shield effect
  if (playerShield > 0) {
    let shieldAlpha = map(playerShield, 0, 600, 0, 100);
    stroke(100, 200, 255, shieldAlpha);
    strokeWeight(2);
    noFill();
    ellipse(0, 0, P.w + 18, P.h + 18);
    ellipse(0, 0, P.w + 24, P.h + 24);
  }

  // Multi-shot indicator
  if (playerMultiShot > 0) {
    fill(255, 200, 100, 150);
    ellipse(-P.w / 2 - 8, -P.h / 3, 4, 4);
    ellipse(P.w / 2 + 8, -P.h / 3, 4, 4);
  }

  // Rapid-fire indicator
  if (playerRapidFire > 0) {
    stroke(255, 150, 100, 150);
    strokeWeight(1);
    for (let i = 0; i < 2; i++) {
      line(-2 - i * 3, P.h / 2, -2 - i * 3, P.h / 2 + 6);
      line(2 + i * 3, P.h / 2, 2 + i * 3, P.h / 2 + 6);
    }
  }

  pop();
}

function drawEnemy(e) {
  push(); translate(e.x, e.y);
  noStroke();
  let cr = red(e.col), cg = green(e.col), cb = blue(e.col);
  if (e.maxHp && e.hp > 0) {
    fill(30, 30, 50); rect(-20, -e.r - 11, 40, 5, 2);
    fill(80, 215, 100); rect(-20, -e.r - 11, map(e.hp, 0, e.maxHp, 0, 40), 5, 2);
  }
  fill(cr, cg, cb, 28); ellipse(0, 0, e.r * 2.8, e.r * 2.8);
  fill(cr, cg, cb, 55); ellipse(0, 0, e.r * 2.2, e.r * 2.2);
  fill(cr, cg, cb);
  switch (e.type) {
    case 'basic':
      beginShape();
      vertex(0, -e.r * 0.75);
      vertex(e.r, 0);
      vertex(e.r * 0.55, e.r * 0.55);
      vertex(-e.r * 0.55, e.r * 0.55);
      vertex(-e.r, 0);
      endShape(CLOSE);
      fill(255, 150, 150, 160); ellipse(0, 0, e.r * 0.8, e.r * 0.6);
      break;
    case 'fast':
      beginShape();
      vertex(0, -e.r);
      vertex(e.r * 0.5, e.r * 0.3);
      vertex(e.r * 0.2, 0);
      vertex(e.r * 0.2, e.r);
      vertex(-e.r * 0.2, e.r);
      vertex(-e.r * 0.2, 0);
      vertex(-e.r * 0.5, e.r * 0.3);
      endShape(CLOSE);
      fill(255, 255, 100, 150); ellipse(0, e.r * 0.2, e.r * 0.55, e.r * 0.4);
      break;
    case 'tank':
      beginShape();
      for (let i = 0; i < 6; i++) {
        let a = (TWO_PI / 6) * i - PI / 6;
        vertex(cos(a) * e.r, sin(a) * e.r);
      }
      endShape(CLOSE);
      fill(cr, cg, cb, 80);
      ellipse(0, 0, e.r * 1.0, e.r * 1.0);
      stroke(cr, cg, cb, 90); strokeWeight(1.2);
      for (let i = 0; i < 6; i++) {
        let a = (TWO_PI / 6) * i - PI / 6;
        line(0, 0, cos(a) * e.r, sin(a) * e.r);
      }
      noStroke();
      fill(180, 230, 255, 200); ellipse(0, 0, e.r * 0.5, e.r * 0.5);
      break;
    case 'zigzag':
      beginShape();
      for (let i = 0; i < 8; i++) {
        let a = (TWO_PI / 8) * i;
        let r2 = (i % 2 === 0) ? e.r : e.r * 0.45;
        vertex(cos(a) * r2, sin(a) * r2);
      }
      endShape(CLOSE);
      fill(220, 160, 255, 190); ellipse(0, 0, e.r * 0.55, e.r * 0.55);
      break;
    case 'chaser':
      let ang = atan2(P.y - e.y, P.x - e.x) + HALF_PI;
      rotate(ang);
      beginShape();
      vertex(0, -e.r);
      vertex(e.r, e.r * 0.65);
      vertex(0, e.r * 0.2);
      vertex(-e.r, e.r * 0.65);
      endShape(CLOSE);
      fill(255, 190, 100, 190); ellipse(0, 0, e.r * 0.5, e.r * 0.5);
      break;
  }
  pop();
}

// ─────────────────────────────────────────────────
//  HUD
// ─────────────────────────────────────────────────
function drawHUD() {
  noStroke();
  textAlign(LEFT, TOP); textSize(15); fill(255);
  text('SCORE  ' + score, 10, 10);
  textAlign(CENTER, TOP); textSize(12); fill(255, 215, 50);
  text('BEST ' + highScore, VIRTUAL_W / 2, 11);
  textAlign(RIGHT, TOP); textSize(15); fill(90, 200, 255);
  text('WAVE  ' + wave, VIRTUAL_W - 10, 10);

  // Combo indicator
  if (combo > 1) {
    textAlign(CENTER, CENTER); textSize(16);
    fill(255, 200, 100 + sin(frameCount * 0.1) * 55, 200);
    text('✦ COMBO x' + combo + ' ✦', VIRTUAL_W / 2, 35);
  }

  // Power-up status
  let puY = VIRTUAL_H - 50;
  textSize(10);
  textAlign(LEFT, TOP);
  if (playerShield > 0) {
    fill(100, 200, 255);
    text('⬤ SHIELD  ' + floor(playerShield / 60) + 's', 10, puY);
    puY -= 12;
  }
  if (playerMultiShot > 0) {
    fill(255, 200, 100);
    text('⬤ MULTISHOT  ' + floor(playerMultiShot / 60) + 's', 10, puY);
    puY -= 12;
  }
  if (playerRapidFire > 0) {
    fill(255, 150, 100);
    text('⬤ RAPID FIRE  ' + floor(playerRapidFire / 60) + 's', 10, puY);
  }

  // Life hearts
  for (let i = 0; i < 3; i++) {
    fill(i < lives ? color(255, 55, 75) : color(80, 28, 38));
    drawHeart(13 + i * 28, VIRTUAL_H - 24, 19);
  }
  if (!waveBonus && state === 'playing') {
    let bw = 110;
    fill(22, 22, 50); rect(VIRTUAL_W / 2 - bw / 2, VIRTUAL_H - 16, bw, 7, 3);
    fill(90, 200, 255);
    let filled = bw * (enemiesLeft / max(1, totalEnemies));
    rect(VIRTUAL_W / 2 - bw / 2, VIRTUAL_H - 16, filled, 7, 3);
    textAlign(CENTER, BOTTOM); textSize(10); fill(160, 215, 255);
    text('ENEMIES  ' + enemiesLeft, VIRTUAL_W / 2, VIRTUAL_H - 19);
  }
}

function drawHeart(cx, cy, s) {
  let hs = s / 2;
  beginShape();
  vertex(cx, cy + hs * 0.3);
  bezierVertex(cx, cy - hs * 0.65, cx - hs * 1.1, cy - hs * 0.65, cx - hs, cy + hs * 0.18);
  bezierVertex(cx - hs * 0.75, cy + hs * 0.95, cx, cy + hs * 1.35, cx, cy + hs * 1.35);
  bezierVertex(cx, cy + hs * 1.35, cx + hs * 0.75, cy + hs * 0.95, cx + hs, cy + hs * 0.18);
  bezierVertex(cx + hs * 1.1, cy - hs * 0.65, cx, cy - hs * 0.65, cx, cy + hs * 0.3);
  endShape(CLOSE);
}

function drawWaveBanner() {
  let t = waveBonusTimer;
  let a = 255;
  if (t > 160) a = map(t, 190, 160, 0, 255);
  if (t < 35) a = map(t, 35, 0, 255, 0);
  textAlign(CENTER, CENTER); noStroke();
  fill(40, 255, 120, a * 0.12);
  rect(0, VIRTUAL_H / 2 - 55, VIRTUAL_W, 110);
  textSize(38);
  fill(80, 255, 140, a);
  text('WAVE  ' + wave + '  COMPLETE!', VIRTUAL_W / 2, VIRTUAL_H / 2 - 16);
  textSize(18);
  fill(255, 210, 50, a);
  text('+' + (wave * 50) + '  BONUS', VIRTUAL_W / 2, VIRTUAL_H / 2 + 22);
  textSize(14);
  fill(180, 200, 255, a);
  text('WAVE  ' + (wave + 1) + '  INCOMING...', VIRTUAL_W / 2, VIRTUAL_H / 2 + 54);
}

// ─────────────────────────────────────────────────
//  MENU SCREENS
// ─────────────────────────────────────────────────
function drawStart() {
  noStroke();
  fill(20, 0, 60, 35);
  for (let i = 4; i >= 1; i--) ellipse(VIRTUAL_W / 2, VIRTUAL_H * 0.42, VIRTUAL_W * i * 0.7, VIRTUAL_H * i * 0.35);
  textAlign(CENTER, CENTER);
  if (logoImg) {
    push(); imageMode(CENTER);
    let maxW = VIRTUAL_W * 0.72;
    let scale = min(1, maxW / logoImg.width);
    image(logoImg, VIRTUAL_W / 2, VIRTUAL_H * 0.26, logoImg.width * scale, logoImg.height * scale);
    pop();
  } else {
    textSize(52); fill(80, 140, 255, 55);
    text('SPACE', VIRTUAL_W / 2 + 3, VIRTUAL_H * 0.28 + 3);
    text('SHOOTER', VIRTUAL_W / 2 + 3, VIRTUAL_H * 0.28 + 60);
    textSize(50); fill(175, 210, 255);
    text('SPACE', VIRTUAL_W / 2, VIRTUAL_H * 0.28);
    textSize(46); fill(90, 190, 255);
    text('SHOOTER', VIRTUAL_W / 2, VIRTUAL_H * 0.28 + 58);
  }
  stroke(90, 170, 255, 130); strokeWeight(1);
  line(VIRTUAL_W / 2 - 130, VIRTUAL_H * 0.28 + 84, VIRTUAL_W / 2 + 130, VIRTUAL_H * 0.28 + 84);
  noStroke();
  drawButton(VIRTUAL_W / 2, VIRTUAL_H * 0.56, 180, 48, '▶   START GAME');
  textSize(12.5); fill(130, 170, 255);
  text('ARROWS  /  WASD  —  Move', VIRTUAL_W / 2, VIRTUAL_H * 0.56 + 70);
  text('SPACE  —  Shoot', VIRTUAL_W / 2, VIRTUAL_H * 0.56 + 90);
  text('P  —  Pause', VIRTUAL_W / 2, VIRTUAL_H * 0.56 + 110);
  drawEnemyLegend();
  if (highScore > 0) {
    textSize(14); fill(255, 210, 50);
    text('BEST  ' + highScore, VIRTUAL_W / 2, VIRTUAL_H - 22);
  }
}

function drawEnemyLegend() {
  let types = [
    { col: color(255, 80, 80), label: 'Basic  +10' },
    { col: color(255, 220, 30), label: 'Fast   +20' },
    { col: color(80, 190, 255), label: 'Tank   +40' },
    { col: color(200, 80, 255), label: 'Zigzag +30' },
    { col: color(255, 140, 40), label: 'Chaser +35' }
  ];
  textSize(11); textAlign(LEFT, CENTER); noStroke();
  for (let i = 0; i < types.length; i++) {
    let x = 56, y = VIRTUAL_H * 0.72 + i * 21;
    fill(types[i].col); ellipse(x - 18, y, 12, 12);
    fill(180, 200, 255); text(types[i].label, x, y + 1);
  }

  // Power-ups legend
  let puTypes = [
    { col: color(100, 200, 255), label: 'Shield' },
    { col: color(255, 200, 100), label: 'Multishot' },
    { col: color(255, 150, 100), label: 'Rapid Fire' }
  ];
  textSize(10); textAlign(RIGHT, CENTER); fill(150, 200, 255);
  text('POWER-UPS:', VIRTUAL_W - 38, VIRTUAL_H * 0.72 - 16);
  for (let i = 0; i < puTypes.length; i++) {
    let x = VIRTUAL_W - 56, y = VIRTUAL_H * 0.72 + i * 16;
    fill(puTypes[i].col); ellipse(x - 18, y, 10, 10);
    fill(150, 200, 255); text(puTypes[i].label, x, y + 1);
  }
}

function drawLoading() {
  // Simple animated loading screen with progress bar
  noStroke();
  fill(10, 16, 40, 220); rect(0, 0, VIRTUAL_W, VIRTUAL_H);
  textAlign(CENTER, CENTER);
  textSize(34); fill(180, 205, 255);
  // If a logo image is provided at assets/logo.png, draw it; otherwise draw vector ship
  if (logoImg) {
    push(); imageMode(CENTER);
    let maxW = VIRTUAL_W * 0.6;
    let scale = min(1, maxW / logoImg.width);
    image(logoImg, VIRTUAL_W / 2, VIRTUAL_H * 0.22, logoImg.width * scale, logoImg.height * scale);
    pop();
  } else {
    push();
    let lx = VIRTUAL_W / 2, ly = VIRTUAL_H * 0.18;
    translate(lx, ly);
    let lr = sin(frameCount * 0.06) * 0.08;
    rotate(lr);
    // body
    noStroke(); fill(200, 230, 255);
    beginShape();
    vertex(0, -12);
    vertex(8, 8);
    vertex(4, 6);
    vertex(0, 4);
    vertex(-4, 6);
    vertex(-8, 8);
    endShape(CLOSE);
    // cockpit
    fill(60, 140, 240); ellipse(0, -6, 8, 6);
    // thruster glow
    fill(255, 160, 60, 160); ellipse(0, 12, 6, 10);
    pop();
  }

  text('SPACE', VIRTUAL_W / 2, VIRTUAL_H * 0.28 - 6);
  textSize(28); fill(130, 180, 255);
  text('LOADING', VIRTUAL_W / 2, VIRTUAL_H * 0.45 + 6);

  // progress bar
  let pw = VIRTUAL_W * 0.6, ph = 12;
  let px = (VIRTUAL_W - pw) / 2, py = VIRTUAL_H * 0.6;
  stroke(70, 110, 160); strokeWeight(2); noFill(); rect(px, py, pw, ph, 6);
  noStroke(); fill(80, 170, 255);
  let pct = constrain(loadingTimer / max(1, loadingDuration), 0, 1);
  rect(px + 2, py + 2, (pw - 4) * pct, ph - 4, 6);

  // hint to skip
  textSize(10); fill(160, 190, 255); text('Click to skip', VIRTUAL_W / 2, py + 28);
}

function drawPause() {
  fill(0, 0, 18, 168); rect(0, 0, VIRTUAL_W, VIRTUAL_H);
  textAlign(CENTER, CENTER); noStroke();
  textSize(42); fill(190, 215, 255);
  text('PAUSED', VIRTUAL_W / 2, VIRTUAL_H / 2 - 24);
  textSize(15); fill(130, 165, 255);
  text('Press  P  to resume', VIRTUAL_W / 2, VIRTUAL_H / 2 + 20);
}

function drawGameOver() {
  fill(0, 0, 18, 175); rect(0, 0, VIRTUAL_W, VIRTUAL_H);
  textAlign(CENTER, CENTER); noStroke();
  textSize(46); fill(255, 55, 75);
  text('GAME OVER', VIRTUAL_W / 2, VIRTUAL_H / 2 - 100);
  textSize(21); fill(255);
  text('SCORE  ' + score, VIRTUAL_W / 2, VIRTUAL_H / 2 - 45);
  textSize(15); fill(255, 210, 50);
  text('BEST  ' + highScore, VIRTUAL_W / 2, VIRTUAL_H / 2 - 14);
  textSize(15); fill(120, 190, 255);
  text('WAVE REACHED  ' + wave, VIRTUAL_W / 2, VIRTUAL_H / 2 + 16);
  if (combo > 1) {
    textSize(13); fill(255, 200, 100);
    text('MAX COMBO  ' + combo, VIRTUAL_W / 2, VIRTUAL_H / 2 + 40);
  }
  drawButton(VIRTUAL_W / 2, VIRTUAL_H / 2 + 80, 185, 48, '↺   PLAY AGAIN');
}

function drawButton(cx, cy, bw, bh, label) {
  let bx = cx - bw / 2, by = cy - bh / 2;
  let mouseV = getVirtualMouse();
  let hov = mouseV.x > bx && mouseV.x < bx + bw && mouseV.y > by && mouseV.y < by + bh;
  fill(hov ? color(70, 150, 255) : color(35, 92, 200));
  stroke(hov ? color(170, 215, 255) : color(90, 140, 255));
  strokeWeight(2);
  rect(bx, by, bw, bh, 9);
  noStroke();
  fill(255);
  textAlign(CENTER, CENTER); textSize(18);
  text(label, cx, cy);
}

// ─────────────────────────────────────────────────
//  INPUT HANDLING (with virtual mouse mapping)
// ─────────────────────────────────────────────────
function keyPressed() {
  // Normalize single-character keys to lowercase so map is consistent
  let k = (typeof key === 'string' && key.length === 1) ? key.toLowerCase() : key;
  keys[k] = true;
  if ((k === 'p') && (state === 'playing' || state === 'paused')) {
    state = (state === 'playing') ? 'paused' : 'playing';
    // pause/resume music with game pause
    try {
      if (bgMusic) {
        if (state === 'paused') bgMusic.pause();
        else if (state === 'playing' && musicEnabled) bgMusic.loop();
      }
    } catch (e) { }
  }
  // M to toggle music on/off
  if (k === 'm') {
    musicEnabled = !musicEnabled;
    try {
      if (!musicEnabled && bgMusic) bgMusic.pause();
      else if (musicEnabled && bgMusic && state === 'playing') bgMusic.loop();
    } catch (e) { }
  }
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return false;
}

function keyReleased() {
  let k = (typeof key === 'string' && key.length === 1) ? key.toLowerCase() : key;
  keys[k] = false;
}

function mousePressed() {
  let mouseV = getVirtualMouse();
  let bw = 180, bh = 48;
  // Allow clicking to skip the loading screen
  if (state === 'loading') {
    loadingTimer = loadingDuration;
    state = 'start';
    return;
  }
  if (state === 'start') {
    let bx = VIRTUAL_W / 2 - bw / 2, by = VIRTUAL_H * 0.56 - bh / 2;
    if (mouseV.x > bx && mouseV.x < bx + bw && mouseV.y > by && mouseV.y < by + bh) startGame();
  }
  if (state === 'gameOver') {
    let bx = VIRTUAL_W / 2 - bw / 2 - 2, by = VIRTUAL_H / 2 + 80 - bh / 2;
    if (mouseV.x > bx && mouseV.x < bx + bw + 5 && mouseV.y > by && mouseV.y < by + bh) startGame();
  }
  // Ensure canvas regains focus after clicking UI elements
  if (cnv && cnv.elt) cnv.elt.focus();
}
