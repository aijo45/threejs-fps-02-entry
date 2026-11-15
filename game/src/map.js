// DUSTLINE, an original map: a 44 x 32 m dusk compound. Two bomb sites, A west and B
// east, a mid lane with a doorway, west and east connector lanes, and crates for cover.
// Every box is a collider for players and bots and a surface a bullet stops on.
// Plain geometry and one canvas-drawn sign per site; no models, no textures from files.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = { minX: -22, maxX: 22, minZ: -16, maxZ: 16 };
export const PLAYER_SPAWN = { x: 0, z: 13.5, yaw: 0 };
export const BOT_SPAWNS = [
  { x: -4.5, z: -13.5 },
  { x: -1.5, z: -13.5 },
  { x: 1.5, z: -13.5 },
  { x: 4.5, z: -13.5 },
];
// Patrol routes, one per bot: two site holders, one mid holder, one lane rotator.
export const WAYPOINTS = [
  [[-17, -11], [-15, -7], [-19, -7]],
  [[17, -11], [15, -7], [19, -7]],
  [[0, -8], [0, 2], [-2, 6], [2, 6]],
  [[-12, -4], [-12, 6], [12, 6], [12, -4]],
];

function siteSign(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#151824';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = color;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'siteB' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const plateA = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35 });
  const plateB = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.siteB), roughness: 0.6, emissive: new THREE.Color(PALETTE.siteB), emissiveIntensity: 0.35 });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collider = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collider) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and outer walls, 4.6 m high.
  box(44.8, 0.4, 32.8, 0, -0.2, 0, 'ground');
  box(0.4, 4.6, 32.8, -22.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 32.8, 22.2, 2.3, 0, 'surface');
  box(44.8, 4.6, 0.4, 0, 2.3, -16.2, 'surface');
  box(44.8, 4.6, 0.4, 0, 2.3, 16.2, 'surface');
  // Wall-top trim so the skyline reads at a glance.
  box(0.6, 0.25, 32.8, -22.2, 4.7, 0, 'wallTop', false);
  box(0.6, 0.25, 32.8, 22.2, 4.7, 0, 'wallTop', false);
  box(44.8, 0.25, 0.6, 0, 4.7, -16.2, 'wallTop', false);
  box(44.8, 0.25, 0.6, 0, 4.7, 16.2, 'wallTop', false);

  // Mid wall at z = 0, 3.4 m high, with three crossings: west connector, mid door, east connector.
  box(6, 3.4, 0.4, -17, 1.7, 0, 'surface');
  box(8, 3.4, 0.4, -7, 1.7, 0, 'surface');
  box(8, 3.4, 0.4, 7, 1.7, 0, 'surface');
  box(6, 3.4, 0.4, 17, 1.7, 0, 'surface');
  // Door frame over the mid crossing.
  box(6.4, 0.5, 0.6, 0, 3.55, 0, 'hairline', false);

  // Site pocket walls: A opens to the west lane, B to the east lane.
  box(0.4, 3.4, 8, -14, 1.7, -12, 'surface');
  box(0.4, 3.4, 8, 14, 1.7, -12, 'surface');
  // Short spur walls that make corners worth checking.
  box(4, 2.6, 0.4, -10, 1.3, -8, 'hairline');
  box(4, 2.6, 0.4, 10, 1.3, -8, 'hairline');
  box(0.4, 2.6, 6, -6, 1.3, 9, 'hairline');
  box(0.4, 2.6, 6, 6, 1.3, 9, 'hairline');

  // Crates: low ones to crouch behind, tall ones to block sightlines.
  const crates = [
    // mid
    [1.6, 1.1, 1.6, -2.5, 0.55, 3.5], [1.6, 1.1, 1.6, 3, 0.55, 6],
    [1.2, 2.3, 1.2, 0, 1.15, -4], [1.6, 1.1, 1.6, -1, 0.55, -10],
    // west lane
    [1.6, 1.1, 1.6, -12, 0.55, 4], [1.6, 1.1, 1.6, -12, 0.55, -4],
    [1.2, 2.3, 1.2, -16, 1.15, 2], [1.6, 0.7, 1.6, -8, 0.35, -13],
    // east lane
    [1.6, 1.1, 1.6, 12, 0.55, 4], [1.6, 1.1, 1.6, 12, 0.55, -4],
    [1.2, 2.3, 1.2, 16, 1.15, 2], [1.6, 0.7, 1.6, 8, 0.35, -13],
    // site A
    [1.6, 1.1, 1.6, -19, 0.55, -12], [1.6, 1.1, 1.6, -15, 0.55, -12],
    [1.2, 2.3, 1.2, -19, 1.15, -6],
    // site B
    [1.6, 1.1, 1.6, 19, 0.55, -12], [1.6, 1.1, 1.6, 15, 0.55, -12],
    [1.2, 2.3, 1.2, 19, 1.15, -6],
    // spawn cover
    [2.4, 0.9, 1.2, -3, 0.45, 11], [2.4, 0.9, 1.2, 3, 0.45, 11],
  ];
  for (const [w, h, d, x, y, z] of crates) box(w, h, d, x, y, z, Math.random() < 0.5 ? 'crate' : 'crateDark');

  // Bomb sites: glowing floor plates and a sign board on the north wall.
  const sites = [];
  function site(id, x, z, plateMaterial, color, letter) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 5), plateMaterial);
    plate.position.set(x, 0.05, z);
    plate.receiveShadow = true;
    group.add(plate);
    shootables.push(plate);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: siteSign(letter, color) }),
    );
    sign.position.set(x, 2.6, -15.9);
    group.add(sign);
    const light = new THREE.PointLight(new THREE.Color(color), 14, 14, 1.8);
    light.position.set(x, 3.4, z);
    scene.add(light);
    sites.push({ id, center: new THREE.Vector3(x, 0, z), radius: 3.4, plate, light });
  }
  site('A', -17, -9, plateA, PALETTE.accent, 'A');
  site('B', 17, -9, plateB, PALETTE.siteB, 'B');

  // Light: cold moon key from the north-west, warm dusk fill from the south, sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6a94'), new THREE.Color(PALETTE.ground), 1.7);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color('#cdd8ff'), 2.4);
  key.position.set(-12, 18, -14);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#ff9a3c'), 0.9);
  fill.position.set(6, 10, 16);
  scene.add(fill);

  return { colliders, shootables, sites, group };
}
