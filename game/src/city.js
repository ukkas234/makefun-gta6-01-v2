// Solmara city generation: a 10x10 block grid with roads, canvas-textured
// buildings, streetlights, trees, a south beach and water, and hills beyond.
// createCity(scene, rng) builds the whole static city and returns the data
// the gameplay modules need: colliders, the road graph, spawn points and
// the road/collision helpers.
//
// Coordinates: ground plane y=0, x east, z south. Heading 0 faces north
// (-z); forward = (sin(heading), -cos(heading)) in (x, z).

import * as THREE from '../vendor/three.module.js';
import { BUILDINGS, CITY, FACADE_VARIANTS, NEON_SIGNS, PALETTE } from './config.js';
import { chance, pick, range, rangeInt } from './random.js';
import {
  asphaltTexture,
  facadeTexture,
  grassTexture,
  neonTexture,
  sandTexture,
  sidewalkTexture,
  waterTexture,
} from './textures.js';

/** Road line coordinates, -260..260 in steps of 52 (11 lines per axis). */
export function roadLines() {
  const lines = [];
  for (let i = 0; i <= CITY.blocks; i += 1) lines.push(-CITY.half + i * CITY.step);
  return lines;
}

/** Block centre coordinates, -234..234 in steps of 52 (10 per axis). */
export function blockCenters() {
  const centers = [];
  for (let i = 0; i < CITY.blocks; i += 1) centers.push(-CITY.half + CITY.step / 2 + i * CITY.step);
  return centers;
}

function addCollider(colliders, x, z, hx, hz) {
  colliders.push({ x, z, hx, hz });
}

export function createCity(scene, rng) {
  const colliders = [];
  const buildings = [];
  const streetlights = [];
  const trees = [];
  const neonSigns = [];

  const lines = roadLines();
  const centers = blockCenters();
  const roadHalf = CITY.roadWidth / 2;

  // ---- Ground: one big grass plane under everything. ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshLambertMaterial({ map: grassTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  ground.receiveShadow = false;
  scene.add(ground);

  // ---- Roads: asphalt strips along every grid line. ----
  // Dashes are painted along the canvas vertical; the east-west roads get a
  // texture rotated 90 degrees so their dashes run along the road too.
  const asphaltX = asphaltTexture();
  asphaltX.repeat.set(10, 1);
  asphaltX.center.set(0.5, 0.5);
  asphaltX.rotation = Math.PI / 2;
  const asphaltZ = asphaltTexture();
  asphaltZ.repeat.set(10, 1);
  const roadMatX = new THREE.MeshLambertMaterial({ map: asphaltX });
  const roadMatZ = new THREE.MeshLambertMaterial({ map: asphaltZ });
  const roadGeoX = new THREE.PlaneGeometry(CITY.half * 2 + CITY.roadWidth, CITY.roadWidth);
  const roadGeoZ = new THREE.PlaneGeometry(CITY.roadWidth, CITY.half * 2 + CITY.roadWidth);
  for (const line of lines) {
    const roadX = new THREE.Mesh(roadGeoX, roadMatX);
    roadX.rotation.x = -Math.PI / 2;
    roadX.position.set(0, 0.01, line);
    scene.add(roadX);
    const roadZ = new THREE.Mesh(roadGeoZ, roadMatZ);
    roadZ.rotation.x = -Math.PI / 2;
    roadZ.position.set(line, 0.01, 0);
    scene.add(roadZ);
  }

  // ---- Sidewalk slabs: one per block, buildings sit on top. ----
  const sidewalkTex = sidewalkTexture();
  sidewalkTex.repeat.set(2, 2);
  const sidewalkMat = new THREE.MeshLambertMaterial({ map: sidewalkTex });
  const sidewalkGeo = new THREE.PlaneGeometry(CITY.blockSize, CITY.blockSize);

  // ---- Facade materials: 6 variants, each lit and unlit (shared). ----
  const roofMat = new THREE.MeshLambertMaterial({ color: '#3a3f46' });
  const facadeMats = FACADE_VARIANTS.map((v, i) => {
    const tex = facadeTexture(i, false);
    const litTex = facadeTexture(i, true);
    const unlit = new THREE.MeshLambertMaterial({ map: tex });
    // Lit facades glow at night via their emissive map; render.js raises
    // emissiveIntensity after dark. By day it stays 0.
    const lit = new THREE.MeshLambertMaterial({
      map: litTex,
      emissive: 0xffffff,
      emissiveMap: litTex,
      emissiveIntensity: 0,
    });
    return { unlit, lit };
  });

  // ---- Buildings: 1-4 per block, placed on a 2x2 quadrant grid. ----
  const quadOffsets = [
    [-10, -10], [10, -10], [-10, 10], [10, 10],
  ];
  for (const bx of centers) {
    for (const bz of centers) {
      const slab = new THREE.Mesh(sidewalkGeo, sidewalkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(bx, 0.02, bz);
      scene.add(slab);

      const count = rangeInt(rng, BUILDINGS.minPerBlock, BUILDINGS.maxPerBlock);
      // Shuffle quadrants so the 1-4 buildings land in varied corners.
      const quads = quadOffsets.slice();
      for (let i = quads.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [quads[i], quads[j]] = [quads[j], quads[i]];
      }
      for (let q = 0; q < count; q += 1) {
        const [ox, oz] = quads[q];
        const w = range(rng, CITY.blockSize * BUILDINGS.minFootprint, CITY.blockSize * BUILDINGS.maxFootprint);
        const d = range(rng, CITY.blockSize * BUILDINGS.minFootprint, CITY.blockSize * BUILDINGS.maxFootprint);
        const h = range(rng, BUILDINGS.minHeight, BUILDINGS.maxHeight);
        const x = bx + ox;
        const z = bz + oz;
        const variant = rangeInt(rng, 0, FACADE_VARIANTS.length - 1);
        const lit = chance(rng, 0.45);
        const mat = lit ? facadeMats[variant].lit : facadeMats[variant].unlit;
        // Box material order: +x, -x, +y (roof), -y, +z, -z.
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          [mat, mat, roofMat, roofMat, mat, mat],
        );
        mesh.position.set(x, h / 2 + 0.02, z);
        scene.add(mesh);
        buildings.push({ x, z, w, d, h, mesh, variant, lit });
        addCollider(colliders, x, z, w / 2, d / 2);

        // Tall lit buildings sometimes get a neon sign on their south face.
        if (lit && h > 28 && chance(rng, 0.4)) {
          const sign = pick(rng, NEON_SIGNS);
          const tex = neonTexture(sign.text, sign.color);
          const signMat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            color: 0x888888, // dimmed by day; render.js brightens it at night
          });
          const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), signMat);
          signMesh.position.set(x, h * 0.72, z + d / 2 + 0.06);
          scene.add(signMesh);
          neonSigns.push({ x, z, mesh: signMesh, material: signMat, color: sign.color });
        }
      }
    }
  }

  // ---- Streetlights at every other intersection. ----
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.5, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: '#2c3138' });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x554422 });
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (let ix = 0; ix < lines.length; ix += 1) {
    for (let iz = 0; iz < lines.length; iz += 1) {
      if ((ix + iz) % 2 !== 0) continue;
      const x = lines[ix] + roadHalf + 1.2;
      const z = lines[iz] + roadHalf + 1.2;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 2.75, z);
      scene.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(x, 5.6, z);
      scene.add(lamp);
      streetlights.push({ x, z, lamp });
      addCollider(colliders, x, z, 0.25, 0.25);
    }
  }

  // ---- Trees: a few per block corner, away from the roads. ----
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4a2a' });
  const leafGeo = new THREE.ConeGeometry(1.4, 3.2, 8);
  const leafMat = new THREE.MeshLambertMaterial({ color: '#3e7d32' });
  for (const bx of centers) {
    for (const bz of centers) {
      if (!chance(rng, 0.35)) continue;
      const x = bx + (chance(rng, 0.5) ? -17 : 17);
      const z = bz + (chance(rng, 0.5) ? -17 : 17);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 0.8, z);
      scene.add(trunk);
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.set(x, 3.0, z);
      scene.add(leaves);
      trees.push({ x, z });
      addCollider(colliders, x, z, 0.4, 0.4);
    }
  }

  // ---- South coast: sand strip, then water. ----
  const sandTex = sandTexture();
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 120, CITY.beachDepth),
    new THREE.MeshLambertMaterial({ map: sandTex }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, CITY.beachStart + CITY.beachDepth / 2);
  scene.add(sand);

  const waterTex = waterTexture();
  const waterMat = new THREE.MeshLambertMaterial({ map: waterTex, color: '#9fd0e8' });
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 500),
    waterMat,
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.02, CITY.waterStart + 250);
  scene.add(water);

  // ---- Hills: low-poly cones ringing the city beyond the roads. ----
  const hillMat = new THREE.MeshLambertMaterial({ color: '#4a6b3f' });
  const hillMat2 = new THREE.MeshLambertMaterial({ color: '#5d7a4a' });
  for (let i = 0; i < 26; i += 1) {
    const angle = (i / 26) * Math.PI * 2 + range(rng, -0.08, 0.08);
    const radius = range(rng, 350, 470);
    const hx = Math.cos(angle) * radius;
    const hz = Math.sin(angle) * radius + 20;
    // Skip the sea sector to the south so the coast stays open water.
    if (hz > 300 && Math.abs(hx) < 320) continue;
    const h = range(rng, 35, 90);
    const r = range(rng, 45, 95);
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 7),
      chance(rng, 0.5) ? hillMat : hillMat2,
    );
    hill.position.set(hx, h / 2 - 2, hz);
    scene.add(hill);
  }

  // ---- Invisible boundary walls: keep play inside the city + beach. ----
  const B = CITY.half + 14;
  addCollider(colliders, 0, -B - 2, B + 20, 2); // north
  addCollider(colliders, -B - 2, 0, 2, B + 20); // west
  addCollider(colliders, B + 2, 0, 2, B + 20); // east
  addCollider(colliders, 0, CITY.waterStart + 2, B + 20, 2); // waterline (south)

  // ---- Road graph: nodes at intersections, edges along roads. ----
  const nodes = [];
  const nodeIndex = new Map();
  for (const z of lines) {
    for (const x of lines) {
      nodeIndex.set(`${x},${z}`, nodes.length);
      nodes.push({ x, z });
    }
  }
  const adjacency = nodes.map(() => []);
  const perRow = lines.length;
  for (let iz = 0; iz < perRow; iz += 1) {
    for (let ix = 0; ix < perRow; ix += 1) {
      const id = iz * perRow + ix;
      if (ix + 1 < perRow) {
        const right = id + 1;
        adjacency[id].push(right);
        adjacency[right].push(id);
      }
      if (iz + 1 < perRow) {
        const down = id + perRow;
        adjacency[id].push(down);
        adjacency[down].push(id);
      }
    }
  }
  const roadGraph = {
    nodes,
    adjacency,
    /** Index of the intersection nearest to (x, z). */
    nearestNode(x, z) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        const dx = nodes[i].x - x;
        const dz = nodes[i].z - z;
        const d = dx * dx + dz * dz;
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    },
  };

  // ---- Spawn points. ----
  // Player starts on the southern road, facing north into the city, with
  // parked cars a few metres away so stealing is possible immediately.
  const spawnPoints = {
    player: { x: 8, z: 252, heading: 0 },
    garage: { x: -52, z: 208 },
    policeStation: { x: 52, z: 52 },
    hospital: { x: -52, z: -52 },
    safehouse: { x: 208, z: 156 },
    bank: { x: -104, z: -104 },
    parkedCars: [
      { x: -18, z: 260, heading: Math.PI / 2, type: 'sedan' },
      { x: 30, z: 260, heading: -Math.PI / 2, type: 'taxi' },
      { x: -52, z: 244, heading: 0, type: 'van' },
      { x: 78, z: 260, heading: Math.PI / 2, type: 'muscle' },
      { x: -104, z: 260, heading: -Math.PI / 2, type: 'sedan' },
    ],
  };

  // ---- Road / collision helpers. ----
  function distToNearestLine(v) {
    const rel = (((v + CITY.half) % CITY.step) + CITY.step) % CITY.step;
    return Math.min(rel, CITY.step - rel);
  }

  function isOnRoad(x, z) {
    if (Math.abs(x) > CITY.half + roadHalf || Math.abs(z) > CITY.half + roadHalf) return false;
    return distToNearestLine(x) <= roadHalf || distToNearestLine(z) <= roadHalf;
  }

  function nearestLine(v) {
    const n = Math.round((v + CITY.half) / CITY.step);
    return -CITY.half + Math.max(0, Math.min(CITY.blocks, n)) * CITY.step;
  }

  function nearestRoadPoint(x, z) {
    const cx = Math.max(-CITY.half, Math.min(CITY.half, x));
    const cz = Math.max(-CITY.half, Math.min(CITY.half, z));
    // Candidate 1: stay on the x-road (snap z to a road line).
    // Candidate 2: stay on the z-road (snap x to a road line).
    const snapZ = { x: cx, z: nearestLine(cz) };
    const snapX = { x: nearestLine(cx), z: cz };
    const dZ = (snapZ.x - x) ** 2 + (snapZ.z - z) ** 2;
    const dX = (snapX.x - x) ** 2 + (snapX.z - z) ** 2;
    return dZ <= dX ? snapZ : snapX;
  }

  function collideCircle(x, z, radius) {
    for (const c of colliders) {
      const qx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
      const qz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
      const dx = x - qx;
      const dz = z - qz;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  return {
    colliders,
    roadGraph,
    spawnPoints,
    buildings,
    streetlights,
    trees,
    neonSigns,
    isOnRoad,
    nearestRoadPoint,
    collideCircle,
    // Extras for render.js: materials it should brighten at night, and the
    // water texture it may scroll for a gentle current.
    litFacadeMaterials: facadeMats.map((m) => m.lit),
    lampMaterial: lampMat,
    waterTexture: waterTex,
  };
}
