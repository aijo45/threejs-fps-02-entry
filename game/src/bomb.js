// The bomb: planted by the player at a site, ticking down, defused by a bot that stands
// on it. One small mesh, one timer, one beep that quickens as the end nears. The game
// owns the round outcome; this module owns the device.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_TIME = 3;
const DEFUSE_TIME = 5;
const BOMB_TIME = 35;
const BLAST_RADIUS = 12;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.22, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.5, metalness: 0.5 }),
  );
  body.position.y = 0.11;
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.06, 0.1),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 2 }),
  );
  light.position.set(0.12, 0.24, 0);
  const wire = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.04, 0.04),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.6 }),
  );
  wire.position.set(0, 0.24, 0.08);
  group.add(body, light, wire);
  group.visible = false;
  scene.add(group);

  const beepLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 8, 1.8);
  scene.add(beepLight);

  const state = {
    planted: false,
    site: null,
    position: new THREE.Vector3(),
    timer: 0,
    defuse: 0,
    plantProgress: 0,
    exploded: false,
    defused: false,
    beepTimer: 0,
  };

  function plantAt(site) {
    state.planted = true;
    state.site = site.id;
    state.position.copy(site.center);
    state.timer = BOMB_TIME;
    state.defuse = 0;
    state.plantProgress = 0;
    state.exploded = false;
    state.defused = false;
    state.beepTimer = 0;
    group.position.copy(site.center);
    group.visible = true;
    beepLight.position.set(site.center.x, 1.2, site.center.z);
  }

  function reset() {
    state.planted = false;
    state.site = null;
    state.timer = 0;
    state.defuse = 0;
    state.plantProgress = 0;
    state.exploded = false;
    state.defused = false;
    group.visible = false;
    beepLight.intensity = 0;
  }

  return {
    state,
    plantAt,
    reset,
    plantTime() {
      return PLANT_TIME;
    },
    defuseTime() {
      return DEFUSE_TIME;
    },
    blastRadius() {
      return BLAST_RADIUS;
    },
    // dt: step; onBeep: called when the device beeps; onExplode/onDefused: round ends.
    step(dt, onBeep, onExplode, onDefused) {
      if (!state.planted || state.exploded || state.defused) return;
      state.timer -= dt;
      const interval = Math.max(0.25, state.timer / BOMB_TIME) * 1.1;
      state.beepTimer -= dt;
      if (state.beepTimer <= 0) {
        state.beepTimer = interval;
        beepLight.intensity = 20;
        onBeep();
      }
      beepLight.intensity = Math.max(0, beepLight.intensity - dt * 60);
      if (state.defuse >= DEFUSE_TIME) {
        state.defused = true;
        group.visible = false;
        beepLight.intensity = 0;
        onDefused();
        return;
      }
      if (state.timer <= 0) {
        state.exploded = true;
        group.visible = false;
        beepLight.intensity = 0;
        onExplode();
      }
    },
  };
}
