// DUSTLINE boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|buy|site with &seed=N sets up a deterministic frame
// for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap, PLAYER_SPAWN } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createGame, WIN_ROUNDS, ROUND_TIME } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createMap(scene);
const bomb = createBomb(scene);
const bots = createBots(scene, world, random);
const weapons = createWeapons(camera);
const hud = createHud();
const audio = createAudio();
const game = createGame();
const player = createPlayer(world.colliders, PLAYER_SPAWN);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const shootables = world.shootables.concat(bots.hitMeshes);

const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tempVec = new THREE.Vector3();
const body = player.state;

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let noise = null;
let defuseActive = false;
let stepSoundTimer = 0;
let plantHeld = 0;

const grenades = [];
const grenadeGeometry = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.5, metalness: 0.6 });
const explosions = [];
const explosionGeometry = new THREE.SphereGeometry(1, 20, 14);
for (let i = 0; i < 3; i += 1) {
  const mesh = new THREE.Mesh(
    explosionGeometry,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  mesh.visible = false;
  scene.add(mesh);
  explosions.push({ mesh, life: 0 });
}
const explosionLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 22, 1.6);
scene.add(explosionLight);

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function botName(bot) {
  return `RIVAL-${bot.index + 1}`;
}

function showBombStatus() {
  if (bomb.state.planted) {
    const left = Math.max(0, Math.ceil(bomb.state.timer));
    hud.setBomb(bomb.state.defuse > 0 ? `DEFUSE IN PROGRESS — ${left}s` : `BOMB PLANTED — SITE ${bomb.state.site} — ${left}s`);
  } else {
    hud.setBomb('');
  }
}

function resetRoundEntities() {
  player.reset(PLAYER_SPAWN);
  bots.reset();
  bomb.reset();
  weapons.refillAmmo();
  weapons.select('pistol');
  for (const grenade of grenades) scene.remove(grenade.mesh);
  grenades.length = 0;
  for (const explosion of explosions) {
    explosion.mesh.visible = false;
    explosion.life = 0;
  }
  explosionLight.intensity = 0;
  noise = null;
  plantHeld = 0;
  hud.hidePlant();
  hud.hideBuy();
}

function startMatch() {
  game.startMatch();
  resetRoundEntities();
  hud.banner('MATCH START', 'First to 5 rounds takes the match', 2600);
  hud.showBuy(game.state.money, weapons.state.owned);
}

function applyRoundTransition(event) {
  if (!event) return;
  if (event.type === 'buyEnd') {
    hud.hideBuy();
    hud.banner(`ROUND ${game.state.round}`, 'Plant the bomb at A or B — or drop every rival', 2400);
  } else if (event.type === 'roundEnd') {
    hud.banner('ROUND LOST', game.state.endReason, 3200);
    audio.round(false);
  } else if (event.type === 'nextRound') {
    resetRoundEntities();
    hud.banner(`ROUND ${game.state.round}`, 'Buy phase — press B to shop', 2400);
    hud.showBuy(game.state.money, weapons.state.owned);
  } else if (event.type === 'matchEnd') {
    const won = game.state.matchWinner === 'you';
    hud.showOverlay('match', won
      ? `You take the match ${game.state.wins}–${game.state.losses}. DUSTLINE is yours.`
      : `The rivals take the match ${game.state.losses}–${game.state.wins}. Run it back.`);
    audio.round(won);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function endRoundWon(reason) {
  if (game.state.phase !== 'live') return;
  game.endRound(true, reason);
  hud.banner('ROUND WON', reason, 3200);
  audio.round(true);
  if (document.pointerLockElement) document.exitPointerLock();
}

function endRoundLost(reason) {
  if (game.state.phase !== 'live') return;
  game.endRound(false, reason);
  hud.banner('ROUND LOST', reason, 3200);
  audio.round(false);
  if (document.pointerLockElement) document.exitPointerLock();
}

function onPlayerDamage(amount, fromPos) {
  if (!body.alive || game.state.phase !== 'live') return;
  body.health -= amount;
  hud.damageFlash();
  audio.hurt();
  if (body.health <= 0) {
    body.health = 0;
    body.alive = false;
    hud.showOverlay('dead', 0);
    if (document.pointerLockElement) document.exitPointerLock();
    endRoundLost('You are down. The rivals take the round.');
  }
}

function shoot(spread) {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryFire();
    weapons.reload();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  muzzle.set(0.24, -0.18, -0.95);
  camera.localToWorld(muzzle);
  if (hit) {
    bots.fireTracer(muzzle, hit.point);
    if (hit.object.userData.bot) {
      const isHead = hit.object.userData.part === 'head';
      const result = bots.damage(hit.object, isHead ? def.headDamage : def.damage);
      hud.hitMarker(result.killed, shot ? 4000 : 90);
      audio.hit(result.killed);
      if (result.killed) {
        game.addKill();
        hud.killfeedAdd(`You ▸ ${botName(result.bot)} [${def.name}]  +$300`);
        hud.setScore(game.state.wins, game.state.losses, game.state.round);
        if (bots.aliveCount() === 0) endRoundWon('All rivals eliminated.');
      }
    }
  } else {
    tempVec.copy(camera.position).addScaledVector(direction, 60);
    bots.fireTracer(muzzle, tempVec);
  }
  weapons.pullTrigger();
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(def.id);
  noise = { x: body.position.x, z: body.position.z, kind: 'shot' };
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.state.current, weapons.state.grenades);
  return true;
}

function throwGrenade() {
  if (weapons.state.grenades <= 0 || game.state.phase !== 'live') return;
  weapons.state.grenades -= 1;
  const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
  mesh.castShadow = true;
  camera.getWorldDirection(direction);
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  mesh.position.y -= 0.1;
  scene.add(mesh);
  const velocity = direction.clone().multiplyScalar(16);
  velocity.y += 3.5;
  velocity.addScaledVector(body.velocity, 0.5);
  grenades.push({ mesh, velocity, fuse: 1.8 });
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.state.current, weapons.state.grenades);
}

function detonateAt(position) {
  let slot = null;
  for (const explosion of explosions) {
    if (explosion.life <= 0) {
      slot = explosion;
      break;
    }
  }
  if (slot) {
    slot.mesh.position.copy(position);
    slot.mesh.visible = true;
    slot.life = 0.5;
  }
  explosionLight.position.set(position.x, position.y + 1, position.z);
  explosionLight.intensity = 60;
  audio.explosion();
  noise = { x: position.x, z: position.z, kind: 'boom' };
}

function explodeGrenade(grenade) {
  const position = grenade.mesh.position;
  scene.remove(grenade.mesh);
  detonateAt(position);
  for (const bot of bots.items) {
    if (!bot.alive) continue;
    const distance = Math.hypot(bot.position.x - position.x, bot.position.z - position.z);
    if (distance > 6) continue;
    const amount = Math.round(90 - (distance / 6) * 70);
    const result = bots.damage(bot.torso, amount);
    if (result.killed) {
      game.addKill();
      hud.killfeedAdd(`You ▸ ${botName(bot)} [GRENADE]  +$300`);
      if (bots.aliveCount() === 0) endRoundWon('All rivals eliminated.');
    }
  }
  const playerDistance = Math.hypot(body.position.x - position.x, body.position.z - position.z);
  if (playerDistance < 6 && body.alive) {
    onPlayerDamage(Math.round((90 - (playerDistance / 6) * 70) * 0.5), position);
  }
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const grenade = grenades[i];
    grenade.fuse -= dt;
    grenade.velocity.y -= 12 * dt;
    const previous = grenade.mesh.position.clone();
    grenade.mesh.position.addScaledVector(grenade.velocity, dt);
    if (grenade.mesh.position.y < 0.15) {
      grenade.mesh.position.y = 0.15;
      grenade.velocity.y = -grenade.velocity.y * 0.4;
      grenade.velocity.x *= 0.6;
      grenade.velocity.z *= 0.6;
      if (Math.abs(grenade.velocity.y) < 1) grenade.velocity.y = 0;
    }
    for (const collider of world.colliders) {
      if (collider.containsPoint(grenade.mesh.position)) {
        grenade.mesh.position.copy(previous);
        grenade.velocity.multiplyScalar(0.4);
        break;
      }
    }
    if (grenade.fuse <= 0) {
      explodeGrenade(grenade);
      grenades.splice(i, 1);
    }
  }
  for (const explosion of explosions) {
    if (explosion.life <= 0) continue;
    explosion.life -= dt;
    const progress = 1 - Math.max(0, explosion.life) / 0.5;
    explosion.mesh.scale.setScalar(0.5 + progress * 11);
    explosion.mesh.material.opacity = Math.max(0, 0.7 * (1 - progress));
    if (explosion.life <= 0) explosion.mesh.visible = false;
  }
  explosionLight.intensity = Math.max(0, explosionLight.intensity - dt * 180);
}

function nearestSite() {
  for (const site of world.sites) {
    const dx = body.position.x - site.center.x;
    const dz = body.position.z - site.center.z;
    if (dx * dx + dz * dz < site.radius * site.radius) return site;
  }
  return null;
}

function step(dt) {
  elapsed += dt;
  const phase = game.state.phase;

  if (phase === 'live' || phase === 'buy') {
    player.step(dt, input.state.keys);
    weapons.step(dt);
    const speed = player.groundSpeed();
    if (speed > 1 && body.onGround) {
      stepSoundTimer -= dt;
      if (stepSoundTimer <= 0) {
        stepSoundTimer = 0.38;
        audio.step();
      }
    }
  }

  if (phase === 'live') {
    const firingEdge = input.state.firing && !prevFiring;
    const def = weapons.def();
    if (weapons.ready() && (def.auto ? input.state.firing : firingEdge)) {
      shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
    } else if (input.state.firing && weapons.ammo().mag === 0) {
      weapons.reload();
    }
    prevFiring = input.state.firing;
    if (input.takePressed('KeyR')) {
      weapons.reload();
      audio.reload();
    }
    if (input.takePressed('KeyG')) throwGrenade();
    if (input.takePressed('Digit1')) weapons.select('rifle');
    if (input.takePressed('Digit2')) weapons.select('pistol');
    if (input.takePressed('Digit3')) weapons.select('smg');

    // Bomb plant: hold E inside a site.
    const site = nearestSite();
    if (site && !bomb.state.planted && body.alive) {
      if (input.state.keys.has('KeyE')) {
        plantHeld += dt / bomb.plantTime();
        hud.showPlant(`PLANTING — SITE ${site.id}`, Math.min(1, plantHeld));
        if (plantHeld >= 1) {
          bomb.plantAt(site);
          game.addPlant();
          hud.killfeedAdd(`Bomb planted at Site ${site.id}  +$300`);
          hud.banner('BOMB PLANTED', `Defend Site ${site.id} — detonation in 35s`, 3000);
          audio.plant();
          noise = { x: site.center.x, z: site.center.z, kind: 'boom' };
          plantHeld = 0;
          hud.hidePlant();
        }
      } else {
        plantHeld = Math.max(0, plantHeld - dt * 2);
        hud.hidePlant();
      }
    } else {
      plantHeld = 0;
      hud.hidePlant();
    }
  }

  if (phase === 'buy') {
    if (input.takePressed('KeyB')) {
      if (hud.isBuyOpen()) {
        hud.hideBuy();
        if (!shot) input.requestLock();
      } else {
        hud.showBuy(game.state.money, weapons.state.owned);
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
    if (hud.isBuyOpen()) {
      if (input.takePressed('Digit1')) buyItem('rifle');
      if (input.takePressed('Digit2')) buyItem('smg');
      if (input.takePressed('Digit3')) buyItem('grenade');
    }
  }

  defuseActive = false;
  const ctx = {
    time: elapsed,
    live: phase === 'live',
    playerPos: body.position,
    playerAlive: body.alive,
    playerSpeed: player.groundSpeed(),
    playerCrouching: body.crouching,
    noise,
    bombPlanted: bomb.state.planted,
    bombPos: bomb.state.planted ? bomb.state.position : null,
    onPlayerDamage,
    onBotShot() {},
    onDefuse(dtStep) {
      defuseActive = true;
      bomb.state.defuse += dtStep;
    },
  };
  if (phase === 'live' || phase === 'buy') bots.step(dt, ctx);
  if (!defuseActive && bomb.state.planted) bomb.state.defuse = Math.max(0, bomb.state.defuse - dt * 0.5);
  noise = null;

  if (phase === 'live') {
    stepGrenades(dt);
    bomb.step(
      dt,
      () => audio.beep(),
      () => {
        detonateAt(bomb.state.position);
        endRoundWon(`The bomb detonated at Site ${bomb.state.site}.`);
      },
      () => endRoundLost('The bomb was defused.'),
    );
  }

  const transition = game.tick(dt);
  if (transition) applyRoundTransition(transition);

  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.state.current, weapons.state.grenades);
  hud.setHealth(body.health);
  hud.setMoney(game.state.money);
  hud.setScore(game.state.wins, game.state.losses, game.state.round);
  const shownTimer = phase === 'buy' ? game.state.buyTimer : phase === 'live' ? game.state.roundTimer : phase === 'menu' ? ROUND_TIME : game.state.endTimer;
  hud.setTimer(shownTimer, phase);
  hud.setSpread(4 + weapons.spread(player.groundSpeed()) * 900);
  showBombStatus();
}

function buyItem(id) {
  let cost = -1;
  if (id === 'grenade') cost = weapons.buyGrenade(game.state.money);
  else cost = weapons.buy(id, game.state.money);
  if (cost > 0) {
    game.state.money -= cost;
    audio.buy();
    hud.setMoney(game.state.money);
    hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.state.current, weapons.state.grenades);
    hud.showBuy(game.state.money, weapons.state.owned);
    hud.killfeedAdd(`Bought ${id === 'grenade' ? 'GRENADE' : WEAPONS[id].name}  −$${cost}`);
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (game.state.phase === 'live' && body.alive) {
    hud.showOverlay('paused', 0);
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (game.state.phase === 'menu') {
    startMatch();
    input.requestLock();
  } else if (game.state.phase === 'matchEnd' || game.state.matchWinner) {
    startMatch();
    input.requestLock();
  } else {
    hud.hideOverlay();
    input.requestLock();
  }
});

hud.onBuy((id) => buyItem(id));

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    // The cover: live gameplay from the spawn, looking down the mid lane at two
    // rivals, no menu in the way.
    game.state.phase = 'live';
    game.state.round = 1;
    game.state.roundTimer = 100;
    body.position.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
    settle(20);
    bots.place(2, -2, -8, Math.PI);
    bots.items[2].state = 'hold';
    bots.items[2].holdUntil = 999;
    bots.place(3, 4, -3, 2.6);
    bots.place(0, -12, -4, 2.2);
    bots.place(1, 12, -8, -2.2);
    aimAt(new THREE.Vector3(-2, 1.4, -8));
  } else if (name === 'play') {
    game.state.phase = 'live';
    game.state.round = 3;
    game.state.wins = 1;
    game.state.losses = 0;
    game.state.money = 3200;
    game.state.roundTimer = 87;
    weapons.buy('rifle', 99999);
    weapons.state.owned.rifle = { mag: 24, reserve: 60 };
    weapons.select('rifle');
    body.position.set(0, 0, 4);
    settle(20);
    // Place the bots after the settle so they stand where the shot expects them;
    // bot 2 holds still at mid so both rounds land on its torso.
    bots.place(2, -2, -6, Math.PI);
    bots.items[2].state = 'hold';
    bots.items[2].holdUntil = 999;
    bots.place(3, 5, -2, 2.6);
    bots.place(0, -12, -4, 2.2);
    bots.place(1, 12, -8, -2.2);
    aimAt(new THREE.Vector3(-2, 1.35, -6));
    shoot(0);
    settle(8);
    aimAt(new THREE.Vector3(-2, 1.35, -6));
    shoot(0);
    settle(12);
    aimAt(new THREE.Vector3(-2, 1.35, -6));
  } else if (name === 'buy') {
    game.state.phase = 'buy';
    game.state.round = 2;
    game.state.money = 3200;
    game.state.buyTimer = 12;
    body.position.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showBuy(3200, weapons.state.owned);
  } else if (name === 'site') {
    game.state.phase = 'live';
    game.state.round = 4;
    game.state.wins = 2;
    game.state.losses = 1;
    game.state.roundTimer = 42;
    weapons.buy('rifle', 99999);
    weapons.state.owned.rifle = { mag: 18, reserve: 60 };
    weapons.select('rifle');
    bomb.plantAt(world.sites[0]);
    bomb.state.timer = 28;
    bomb.state.defuse = 2.0;
    bots.place(0, -16, -7, 0.6);
    bots.items[0].state = 'plant-hunt';
    bots.items[0].defusing = true;
    bots.place(1, -10, -11, 0.4);
    bots.items[1].state = 'plant-hunt';
    bots.place(2, -6, -2, 0.9);
    bots.place(3, 12, -4, -2.4);
    body.position.set(-13, 0, -5);
    settle(20);
    aimAt(new THREE.Vector3(-17, 1, -9));
    hud.setBomb('BOMB PLANTED — SITE A — 28s');
  }
  hud.setScore(game.state.wins, game.state.losses, game.state.round);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.state.current, weapons.state.grenades);
  hud.setHealth(body.health);
  hud.setMoney(game.state.money);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve, weapons.state.current, weapons.state.grenades);
hud.setHealth(body.health);
hud.setMoney(game.state.money);
hud.setScore(0, 0, 1);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
