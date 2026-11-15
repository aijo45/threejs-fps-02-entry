// Weapons: one def per gun, and the view model that carries the one in hand. A def owns
// the numbers; main.js owns the ray and the damage. Spread grows with movement and with
// every shot fired, and decays when the trigger is released, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 SIDEARM', price: 0, auto: false,
    magSize: 12, reserve: 48, damage: 26, headDamage: 78,
    fireGap: 0.22, reloadTime: 1.4,
    spreadStill: 0.004, spreadMoving: 0.03, spreadBloom: 0.011,
    kick: 0.011, range: 60,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 RIFLE', price: 2700, auto: true,
    magSize: 30, reserve: 90, damage: 34, headDamage: 100,
    fireGap: 0.1, reloadTime: 2.0,
    spreadStill: 0.003, spreadMoving: 0.032, spreadBloom: 0.007,
    kick: 0.014, range: 90,
  },
  smg: {
    id: 'smg', name: 'KX-9 SMG', price: 1500, auto: true,
    magSize: 32, reserve: 96, damage: 22, headDamage: 66,
    fireGap: 0.07, reloadTime: 1.8,
    spreadStill: 0.006, spreadMoving: 0.02, spreadBloom: 0.005,
    kick: 0.008, range: 55,
  },
};

const GRENADE_PRICE = 300;
const GRENADE_MAX = 2;

export function createWeapons(camera) {
  // Gunmetal view models with one amber accent part, so the gun reads as a gun
  // against the dusk scene instead of a white plank.
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22242a'), roughness: 0.7, metalness: 0.3 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3d44'), roughness: 0.45, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d1f24'), roughness: 0.6, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.25 });

  function buildModel(def) {
    const model = new THREE.Group();
    if (def.id === 'pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), body);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), grip);
      handle.position.set(0, -0.07, 0.07);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.012, 0.1), accent);
      stripe.position.set(0, 0.028, -0.04);
      model.add(slide, handle, stripe);
      model.position.set(0.2, -0.19, -0.36);
    } else if (def.id === 'rifle') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
      barrel.position.set(0, 0.025, -0.38);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
      stock.position.set(0, -0.02, 0.3);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.1), dark);
      sight.position.set(0, 0.08, -0.05);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.012, 0.2), accent);
      stripe.position.set(0, 0.052, -0.08);
      model.add(receiver, barrel, stock, sight, stripe);
      model.position.set(0.24, -0.2, -0.42);
    } else {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.34), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), grip);
      barrel.position.set(0, 0.02, -0.3);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), dark);
      mag.position.set(0, -0.11, -0.05);
      mag.rotation.x = 0.15;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), grip);
      stock.position.set(0, -0.01, 0.24);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.012, 0.16), accent);
      stripe.position.set(0, 0.057, -0.06);
      model.add(receiver, barrel, mag, stock, stripe);
      model.position.set(0.22, -0.2, -0.4);
    }
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = {};
  for (const def of Object.values(WEAPONS)) models[def.id] = buildModel(def);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    owned: { pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve } },
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bloom: 0,
    grenades: 0,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function ammo() {
    return state.owned[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.06);
    const model = models[state.current];
    model.position.z = (state.current === 'pistol' ? -0.36 : -0.4) + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      const d = def();
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (d.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo();
        const need = d.magSize - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    ammo,
    step,
    ready() {
      const a = ammo();
      return a.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.05, state.bloom + d.spreadBloom);
    },
    takeRound() {
      const a = ammo();
      if (a.mag <= 0) return false;
      a.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      const a = ammo();
      if (state.reloadLeft > 0 || a.mag === d.magSize || a.reserve === 0) return;
      state.reloadLeft = d.reloadTime;
    },
    spread(speed) {
      const d = def();
      const moving = Math.min(1, speed / 5.2);
      return d.spreadStill + moving * d.spreadMoving + state.bloom;
    },
    select(id) {
      if (!state.owned[id] || state.current === id) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.reloadLeft = 0;
      state.cooldown = 0.15;
      return true;
    },
    buy(id, money) {
      const d = WEAPONS[id];
      if (!d || state.owned[id] || money < d.price) return -1;
      state.owned[id] = { mag: d.magSize, reserve: d.reserve };
      this.select(id);
      return d.price;
    },
    buyGrenade(money) {
      if (state.grenades >= GRENADE_MAX || money < GRENADE_PRICE) return -1;
      state.grenades += 1;
      return GRENADE_PRICE;
    },
    grenadePrice() {
      return GRENADE_PRICE;
    },
    refillAmmo() {
      for (const id of Object.keys(state.owned)) {
        const d = WEAPONS[id];
        state.owned[id].mag = d.magSize;
        state.owned[id].reserve = d.reserve;
      }
      state.grenades = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    resetToPistol() {
      state.owned = { pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve } };
      models[state.current].visible = false;
      state.current = 'pistol';
      models.pistol.visible = true;
      state.grenades = 0;
      state.reloadLeft = 0;
      state.cooldown = 0;
    },
  };
}
