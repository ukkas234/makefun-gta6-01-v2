// Canvas texture factories: every texture in Solmara is painted at runtime,
// so the game ships no image assets and makes no network requests.
// Each factory returns a THREE.CanvasTexture ready to use as a map.

import * as THREE from '../vendor/three.module.js';
import { FACADE_VARIANTS, PALETTE } from './config.js';

function makeTexture(canvas, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function canvas2d(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

/** Dark asphalt with a centre dashed line and speckle noise. Tile is one road segment. */
export function asphaltTexture() {
  const [canvas, ctx] = canvas2d(256, 256);
  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(0, 0, 256, 256);
  // Speckle.
  for (let i = 0; i < 900; i += 1) {
    const v = 40 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // Edge lines.
  ctx.fillStyle = '#c8c8c0';
  ctx.fillRect(6, 0, 3, 256);
  ctx.fillRect(247, 0, 3, 256);
  // Centre dashes (run along the tile's vertical axis; rotated per road mesh).
  ctx.fillStyle = PALETTE.asphaltLine;
  for (let y = 0; y < 256; y += 64) ctx.fillRect(126, y + 8, 4, 34);
  return makeTexture(canvas);
}

/** Light concrete sidewalk slabs with expansion joints. */
export function sidewalkTexture() {
  const [canvas, ctx] = canvas2d(256, 256);
  ctx.fillStyle = PALETTE.sidewalk;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i += 1) {
    const v = 140 + Math.floor(Math.random() * 25);
    ctx.fillStyle = `rgb(${v},${v},${v - 6})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = '#7a7a72';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  return makeTexture(canvas);
}

/**
 * Building facade. `variant` is an index into FACADE_VARIANTS (or a variant
 * object with base/trim). `lit` paints some windows warm yellow, as at night.
 * The texture maps one building face; repeat it per face by geometry UVs.
 */
export function facadeTexture(variant = 0, lit = false) {
  const v = typeof variant === 'number'
    ? FACADE_VARIANTS[variant % FACADE_VARIANTS.length]
    : variant;
  const [canvas, ctx] = canvas2d(256, 512);
  ctx.fillStyle = v.base;
  ctx.fillRect(0, 0, 256, 512);
  // Subtle vertical grime streaks.
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let x = 0; x < 256; x += 32) {
    if ((x / 32) % 2 === 0) ctx.fillRect(x, 0, 10, 512);
  }
  // Ground-floor shopfront band.
  ctx.fillStyle = v.trim;
  ctx.fillRect(0, 452, 256, 60);
  ctx.fillStyle = 'rgba(20,24,32,0.85)';
  ctx.fillRect(16, 468, 224, 32);
  // Window grid: 4 columns x 7 floors above the shopfront.
  const cols = 4;
  const rows = 7;
  const ww = 44;
  const wh = 40;
  const gapX = (256 - cols * ww) / (cols + 1);
  const gapY = 18;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = gapX + c * (ww + gapX);
      const y = 16 + r * (wh + gapY);
      const isLit = lit && ((r * cols + c + (typeof variant === 'number' ? variant : 0)) % 3 !== 0);
      ctx.fillStyle = isLit ? '#ffd98a' : '#1d2733';
      ctx.fillRect(x, y, ww, wh);
      ctx.strokeStyle = v.trim;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, ww, wh);
      if (isLit) {
        ctx.fillStyle = 'rgba(255, 217, 138, 0.25)';
        ctx.fillRect(x - 3, y - 3, ww + 6, wh + 6);
      }
    }
  }
  return makeTexture(canvas);
}

/** Patchy green grass with blades of noise. */
export function grassTexture() {
  const [canvas, ctx] = canvas2d(256, 256);
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i += 1) {
    const g = 120 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgb(${Math.floor(g * 0.55)},${g},${Math.floor(g * 0.5)})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  // A few bare dirt patches.
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = 'rgba(122, 96, 58, 0.35)';
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 18, 0, Math.PI * 2);
    ctx.fill();
  }
  return makeTexture(canvas, 8, 8);
}

/** Warm beach sand with ripples and speckles. */
export function sandTexture() {
  const [canvas, ctx] = canvas2d(256, 256);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i += 1) {
    const v = 200 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.9)},${Math.floor(v * 0.62)})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = 'rgba(160, 130, 80, 0.4)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i += 1) {
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + 8, 170, y - 8, 256, y + 4);
    ctx.stroke();
  }
  return makeTexture(canvas, 6, 2);
}

/** Blue water with soft moving-looking wave bands (static tile, animated by offset). */
export function waterTexture() {
  const [canvas, ctx] = canvas2d(256, 256);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 14; i += 1) {
    ctx.beginPath();
    const y = i * 20 + 6;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(60, y - 6, 120, y + 6, 180, y - 4);
    ctx.bezierCurveTo(210, y - 8, 235, y + 2, 256, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 40; i += 1) {
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 6, 2);
  }
  return makeTexture(canvas, 10, 4);
}

/**
 * Glowing neon sign: bold text on a dark plate, with a soft halo.
 * Used as an emissive map / map on a thin plane stuck to a building face.
 */
export function neonTexture(text, color = PALETTE.neonPink) {
  const [canvas, ctx] = canvas2d(512, 128);
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, 512, 128);
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Halo passes, then the crisp core.
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 66);
  ctx.shadowBlur = 12;
  ctx.fillText(text, 256, 66);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 66);
  const texture = makeTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
