// Enemy bots: four humanoid rivals that patrol routes, hold sites, see and hear.
// Each rival is built as a person, not a box: capsule legs with boots that walk,
// a tapered torso with a vest, belt and shoulder pads, a skinned head under a
// helmet dome with goggles, and two arms that carry a rifle — the rifle rises to
// aim when the bot spots the player and lowers to a carry when it patrols. A bot
// walks its waypoints, pauses to hold, and reacts to what it sees and hears: a
// player in its view cone with a clear line of sight draws aimed bursts; a gunshot
// or explosion within earshot pulls it to investigate; a planted bomb pulls every
// living bot to the site, where the nearest one defuses. No allocations in the
// step loop: one raycaster, one tracer pool.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, BOT_SPAWNS } from './map.js';

const HEALTH = 100;
const WALK_SPEED = 3.2;
const HOLD_SPEED = 1.6;
const VISION_RANGE = 34;
const VISION_HALF_FOV = 0.96;
const REACT_MIN = 0.35;
const REACT_MAX = 0.6;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.12;
const HEAR_SHOT = 26;
const HEAR_BOOM = 42;
const RADIUS = 0.34;
const HEIGHT = 1.72;

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _flat = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function createBots(scene, world, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const colliders = world.colliders;
  const shootables = world.shootables;

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.6, metalness: 0.05 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#23252b'), roughness: 0.85 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c89878'), roughness: 0.7 });
  const visorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.6 });
  const flashMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });

  // Tracer pool: 12 lines reused for every shot, bot or player.
  const tracers = [];
  for (let i = 0; i < 12; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  function fireTracer(from, to) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const positions = tracer.line.geometry.attributes.position;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    tracer.line.material.opacity = 0.9;
    tracer.line.visible = true;
    tracer.life = 0.09;
  }

  const items = [];
  const hitMeshes = [];
  const probe = new THREE.Box3();

  function overlaps(x, z) {
    probe.min.set(x - RADIUS, 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, HEIGHT - 0.04, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  // One capsule stretched between two points, in the parent's space: the arm
  // from a shoulder to the rifle grip, or to the foregrip.
  function limb(a, b, radius, material) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 4, 8);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(_up, _dir.normalize());
    mesh.castShadow = true;
    return mesh;
  }

  // Shared humanoid geometry. The leg capsule is translated so its top sits at
  // the group origin: the leg group hangs at the hip and swings from there.
  const legGeometry = new THREE.CapsuleGeometry(0.085, 0.58, 4, 8);
  legGeometry.translate(0, -0.375, 0);
  const bootGeometry = new THREE.BoxGeometry(0.15, 0.09, 0.26);
  const torsoGeometry = new THREE.CylinderGeometry(0.27, 0.21, 0.66, 8);
  const beltGeometry = new THREE.BoxGeometry(0.42, 0.1, 0.28);
  const vestGeometry = new THREE.BoxGeometry(0.44, 0.38, 0.07);
  const pouchGeometry = new THREE.BoxGeometry(0.12, 0.14, 0.05);
  const shoulderGeometry = new THREE.SphereGeometry(0.11, 12, 10);
  const neckGeometry = new THREE.CylinderGeometry(0.055, 0.065, 0.12, 8);
  const headGeometry = new THREE.SphereGeometry(0.15, 16, 12);
  const helmetGeometry = new THREE.SphereGeometry(0.165, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const visorGeometry = new THREE.BoxGeometry(0.2, 0.05, 0.05);
  const handGeometry = new THREE.SphereGeometry(0.06, 10, 8);
  const receiverGeometry = new THREE.BoxGeometry(0.07, 0.1, 0.42);
  const barrelGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8);
  const stockGeometry = new THREE.BoxGeometry(0.06, 0.09, 0.16);
  const magazineGeometry = new THREE.BoxGeometry(0.05, 0.15, 0.09);
  const sightGeometry = new THREE.BoxGeometry(0.04, 0.05, 0.1);
  const flashGeometry = new THREE.PlaneGeometry(0.24, 0.24);

  for (let index = 0; index < BOT_SPAWNS.length; index += 1) {
    const spawn = BOT_SPAWNS[index];
    const group = new THREE.Group();
    group.position.set(spawn.x, 0, spawn.z);

    // Legs: a group at each hip, capsule leg plus a boot, swinging from the hip.
    function makeLeg(side) {
      const leg = new THREE.Group();
      leg.position.set(0.13 * side, 0.88, 0);
      const shin = new THREE.Mesh(legGeometry, darkMaterial);
      shin.castShadow = true;
      const boot = new THREE.Mesh(bootGeometry, darkMaterial);
      boot.position.set(0, -0.72, 0.04);
      boot.castShadow = true;
      leg.add(shin, boot);
      return { leg, shin };
    }
    const legL = makeLeg(-1);
    const legR = makeLeg(1);
    group.add(legL.leg, legR.leg);

    // Torso: a tapered cylinder, wide at the shoulders and narrow at the waist,
    // flattened front to back so it reads as a chest, not a post.
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.y = 1.2;
    torso.rotation.y = Math.PI / 8;
    torso.scale.set(1, 1, 0.62);
    torso.userData.part = 'torso';
    // Belt, vest and pouches break up the silhouette; shoulder pads round it.
    const belt = new THREE.Mesh(beltGeometry, darkMaterial);
    belt.position.y = 0.92;
    const vest = new THREE.Mesh(vestGeometry, darkMaterial);
    vest.position.set(0, 1.28, -0.26);
    const pouchL = new THREE.Mesh(pouchGeometry, darkMaterial);
    pouchL.position.set(-0.11, 1.22, -0.3);
    const pouchR = new THREE.Mesh(pouchGeometry, darkMaterial);
    pouchR.position.set(0.11, 1.22, -0.3);
    const shoulderL = new THREE.Mesh(shoulderGeometry, bodyMaterial);
    shoulderL.position.set(-0.27, 1.5, 0);
    const shoulderR = new THREE.Mesh(shoulderGeometry, bodyMaterial);
    shoulderR.position.set(0.27, 1.5, 0);
    // Neck and head: a skin face under a helmet dome, goggles across the eyes.
    const neck = new THREE.Mesh(neckGeometry, skinMaterial);
    neck.position.y = 1.58;
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = 1.72;
    head.scale.set(1, 1.15, 1.02);
    head.userData.part = 'head';
    const helmet = new THREE.Mesh(helmetGeometry, darkMaterial);
    helmet.position.y = 1.74;
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.set(0, 1.73, -0.16);
    group.add(torso, belt, vest, pouchL, pouchR, shoulderL, shoulderR, neck, head, helmet, visor);

    // Arms and rifle on one pivot at the chest: the rifle rises to aim when the
    // bot engages and lowers to a carry when it patrols. The right hand grips
    // the rifle, the left hand holds the foregrip, both skinned.
    const aimGroup = new THREE.Group();
    aimGroup.position.set(0, 1.42, 0);
    aimGroup.rotation.x = 0.55;
    const armR = limb(new THREE.Vector3(0.27, 0.08, 0), new THREE.Vector3(0.13, -0.16, -0.3), 0.055, bodyMaterial);
    const armL = limb(new THREE.Vector3(-0.27, 0.08, 0), new THREE.Vector3(0.08, -0.14, -0.45), 0.055, bodyMaterial);
    const handR = new THREE.Mesh(handGeometry, skinMaterial);
    handR.position.set(0.13, -0.16, -0.3);
    const handL = new THREE.Mesh(handGeometry, skinMaterial);
    handL.position.set(0.08, -0.14, -0.45);
    // Rifle: receiver, barrel, stock, magazine and sight.
    const gun = new THREE.Group();
    const receiver = new THREE.Mesh(receiverGeometry, darkMaterial);
    receiver.position.set(0.1, -0.14, -0.3);
    const barrel = new THREE.Mesh(barrelGeometry, darkMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.1, -0.12, -0.66);
    const stock = new THREE.Mesh(stockGeometry, darkMaterial);
    stock.position.set(0.1, -0.13, -0.04);
    const magazine = new THREE.Mesh(magazineGeometry, darkMaterial);
    magazine.position.set(0.1, -0.24, -0.26);
    magazine.rotation.x = 0.12;
    const sight = new THREE.Mesh(sightGeometry, darkMaterial);
    sight.position.set(0.1, -0.065, -0.32);
    gun.add(receiver, barrel, stock, magazine, sight);
    const flash = new THREE.Mesh(flashGeometry, flashMaterial.clone());
    flash.position.set(0.1, -0.12, -0.86);
    flash.visible = false;
    aimGroup.add(armR, armL, handR, handL, gun, flash);
    group.add(aimGroup);

    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const item = {
      index, group, torso, head, gun, flash, aimGroup,
      legL: legL.leg, legR: legR.leg,
      position: group.position,
      yaw: Math.PI,
      health: HEALTH, alive: true, fall: 0,
      state: 'patrol', waypoint: 0, holdUntil: 0,
      lastSeen: null, lastSeenTime: -99, visible: false,
      reactUntil: 0, burstLeft: 0, burstTimer: 0, pauseUntil: 0,
      losTimer: index * 0.05, walkPhase: random() * 6,
      investigate: null, defusing: false,
    };
    torso.userData.bot = item;
    head.userData.bot = item;
    legL.shin.userData.bot = item;
    legR.shin.userData.bot = item;
    legL.shin.userData.part = 'torso';
    legR.shin.userData.part = 'torso';
    armR.userData.bot = item;
    armL.userData.bot = item;
    armR.userData.part = 'torso';
    armL.userData.part = 'torso';
    hitMeshes.push(torso, head, legL.shin, legR.shin, armR, armL);
    items.push(item);
  }

  function moveToward(bot, tx, tz, dt, speed) {
    _flat.set(tx - bot.position.x, 0, tz - bot.position.z);
    const distance = _flat.length();
    if (distance < 0.15) return true;
    _flat.multiplyScalar(1 / distance);
    const stepDistance = Math.min(distance, speed * dt);
    const nx = bot.position.x + _flat.x * stepDistance;
    if (!overlaps(nx, bot.position.z)) bot.position.x = nx;
    const nz = bot.position.z + _flat.z * stepDistance;
    if (!overlaps(bot.position.x, nz)) bot.position.z = nz;
    const targetYaw = Math.atan2(-_flat.x, -_flat.z);
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += diff * Math.min(1, dt * 8);
    bot.walkPhase += dt * speed * 2.2;
    return distance <= 0.15 + stepDistance;
  }

  function canSee(bot, playerPos, time) {
    _from.set(bot.position.x, 1.5, bot.position.z);
    _to.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
    _dir.subVectors(_to, _from);
    const distance = _dir.length();
    if (distance > VISION_RANGE) return false;
    _dir.multiplyScalar(1 / distance);
    const forwardX = -Math.sin(bot.yaw);
    const forwardZ = -Math.cos(bot.yaw);
    if (forwardX * _dir.x + forwardZ * _dir.z < Math.cos(VISION_HALF_FOV)) return false;
    raycaster.set(_from, _dir);
    raycaster.far = distance;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    return !hit;
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return { killed: false, bot: null };
    bot.health -= amount;
    if (bot.health > 0) return { killed: false, bot };
    bot.alive = false;
    bot.fall = 0;
    bot.defusing = false;
    return { killed: true, bot };
  }

  function reset() {
    for (let index = 0; index < items.length; index += 1) {
      const bot = items[index];
      const spawn = BOT_SPAWNS[index];
      bot.group.position.set(spawn.x, 0, spawn.z);
      bot.group.rotation.set(0, 0, 0);
      bot.yaw = Math.PI;
      bot.health = HEALTH;
      bot.alive = true;
      bot.fall = 0;
      bot.state = 'patrol';
      bot.waypoint = 0;
      bot.holdUntil = 0;
      bot.lastSeen = null;
      bot.visible = false;
      bot.burstLeft = 0;
      bot.defusing = false;
      bot.investigate = null;
      bot.flash.visible = false;
      bot.aimGroup.rotation.x = 0.55;
      bot.legL.rotation.x = 0;
      bot.legR.rotation.x = 0;
    }
  }

  function step(dt, ctx) {
    const time = ctx.time;
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.09) * 0.9;
      if (tracer.life <= 0) tracer.line.visible = false;
    }

    // Separation: bots never stack on each other.
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (!a.alive || !b.alive) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          if (!overlaps(a.position.x - nx * push, a.position.z - nz * push)) {
            a.position.x -= nx * push;
            a.position.z -= nz * push;
          }
          if (!overlaps(b.position.x + nx * push, b.position.z + nz * push)) {
            b.position.x += nx * push;
            b.position.z += nz * push;
          }
        }
      }
    }

    for (const bot of items) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
        continue;
      }
      bot.group.rotation.x = 0;
      bot.group.position.y = 0;
      bot.group.rotation.y = bot.yaw;
      bot.flash.visible = false;

      // Vision, staggered so only one raycast happens per bot per check. Bots only
      // hunt while the round is live; during the buy phase they walk their routes.
      bot.losTimer -= dt;
      if (bot.losTimer <= 0) {
        bot.losTimer = 0.15;
        const seen = ctx.live && ctx.playerAlive && canSee(bot, ctx.playerPos, time);
        bot.visible = seen;
        if (seen) {
          bot.lastSeen = { x: ctx.playerPos.x, z: ctx.playerPos.z };
          bot.lastSeenTime = time;
          if (bot.state !== 'engage') {
            bot.state = 'engage';
            bot.reactUntil = time + REACT_MIN + random() * (REACT_MAX - REACT_MIN);
            bot.burstLeft = 0;
          }
        }
      }

      // Hearing: a recent noise pulls a patrolling bot to investigate.
      if (bot.state === 'patrol' && ctx.noise) {
        const noise = ctx.noise;
        const dx = noise.x - bot.position.x;
        const dz = noise.z - bot.position.z;
        const radius = noise.kind === 'boom' ? HEAR_BOOM : HEAR_SHOT;
        if (dx * dx + dz * dz < radius * radius) {
          bot.state = 'investigate';
          bot.investigate = { x: noise.x, z: noise.z, until: time + 6 };
        }
      }

      // Bomb planted: every living bot converges on the site; the nearest defuses.
      if (ctx.bombPlanted && bot.state !== 'engage') {
        bot.state = 'plant-hunt';
        bot.investigate = null;
      }

      // Walk cycle and rifle pose: legs swing from the hips while moving, and
      // the rifle rises to aim when engaging, lowers to a carry otherwise.
      const swing = Math.sin(bot.walkPhase) * 0.35;
      bot.legL.rotation.x = swing;
      bot.legR.rotation.x = -swing;
      const aimTarget = bot.state === 'engage' ? 0 : 0.55;
      bot.aimGroup.rotation.x += (aimTarget - bot.aimGroup.rotation.x) * Math.min(1, dt * 6);

      if (bot.state === 'engage') {
        if (!ctx.live) {
          bot.state = 'patrol';
          bot.burstLeft = 0;
          continue;
        }
        if (bot.lastSeen) {
          const dx = bot.lastSeen.x - bot.position.x;
          const dz = bot.lastSeen.z - bot.position.z;
          const targetYaw = Math.atan2(-dx, -dz);
          let diff = targetYaw - bot.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          bot.yaw += diff * Math.min(1, dt * 10);
        }
        if (!bot.visible && time - bot.lastSeenTime > 4) {
          bot.state = 'patrol';
          bot.burstLeft = 0;
          continue;
        }
        if (time < bot.reactUntil || time < bot.pauseUntil) continue;
        if (bot.burstLeft <= 0) {
          bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
          bot.burstTimer = 0;
        }
        bot.burstTimer -= dt;
        if (bot.burstTimer > 0) continue;
        bot.burstTimer = SHOT_GAP;
        bot.burstLeft -= 1;
        if (bot.burstLeft <= 0) bot.pauseUntil = time + 0.5 + random() * 0.5;
        // A shot: hit chance falls with distance and target speed, rises on a still target.
        const dx = ctx.playerPos.x - bot.position.x;
        const dz = ctx.playerPos.z - bot.position.z;
        const distance = Math.hypot(dx, dz);
        let chance = 0.55 - distance * 0.011 - ctx.playerSpeed * 0.05 + (ctx.playerCrouching ? 0.08 : 0);
        chance = Math.max(0.08, Math.min(0.7, chance));
        const hit = random() < chance;
        // Tracer starts at the rifle muzzle, not the chest.
        _from.set(bot.position.x - Math.sin(bot.yaw) * 0.86, 1.3, bot.position.z - Math.cos(bot.yaw) * 0.86);
        if (hit) {
          _to.set(ctx.playerPos.x, ctx.playerPos.y + 1.2, ctx.playerPos.z);
          ctx.onPlayerDamage(11 + Math.floor(random() * 6), bot.position);
        } else {
          _to.set(
            ctx.playerPos.x + (random() * 2 - 1) * 1.4,
            ctx.playerPos.y + 0.6 + random() * 1.2,
            ctx.playerPos.z + (random() * 2 - 1) * 1.4,
          );
        }
        fireTracer(_from, _to);
        bot.flash.visible = true;
        ctx.onBotShot(bot);
        continue;
      }

      if (bot.state === 'plant-hunt' && ctx.bombPos) {
        const dx = ctx.bombPos.x - bot.position.x;
        const dz = ctx.bombPos.z - bot.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 2.5) {
          bot.defusing = true;
          ctx.onDefuse(dt);
          bot.yaw += (Math.atan2(-dx, -dz) - bot.yaw) * Math.min(1, dt * 6);
        } else {
          bot.defusing = false;
          moveToward(bot, ctx.bombPos.x, ctx.bombPos.z, dt, WALK_SPEED);
        }
        continue;
      }

      if (bot.state === 'investigate' && bot.investigate) {
        if (time > bot.investigate.until) {
          bot.state = 'patrol';
          bot.investigate = null;
          continue;
        }
        const arrived = moveToward(bot, bot.investigate.x, bot.investigate.z, dt, WALK_SPEED);
        if (arrived) {
          bot.holdUntil = time + 2;
          bot.state = 'hold';
        }
        continue;
      }

      if (bot.state === 'hold') {
        bot.yaw += dt * 0.7;
        if (time >= bot.holdUntil) bot.state = 'patrol';
        continue;
      }

      // Patrol: walk the route, hold two seconds at each stop.
      const route = WAYPOINTS[bot.index % WAYPOINTS.length];
      const point = route[bot.waypoint % route.length];
      if (time < bot.holdUntil) continue;
      const arrived = moveToward(bot, point[0], point[1], dt, WALK_SPEED);
      if (arrived) {
        bot.waypoint += 1;
        bot.holdUntil = time + 2;
      }
    }
  }

  return {
    items,
    hitMeshes,
    step,
    damage,
    reset,
    fireTracer,
    aliveCount() {
      return items.filter((bot) => bot.alive).length;
    },
    place(index, x, z, yaw) {
      const bot = items[index];
      if (!bot) return;
      bot.group.position.set(x, 0, z);
      bot.yaw = yaw;
      bot.group.rotation.y = yaw;
    },
    setVisible(index, visible) {
      const bot = items[index];
      if (bot) bot.group.visible = visible;
    },
  };
}
