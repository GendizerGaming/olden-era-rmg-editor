import type { Zone, Edge } from '../types/editor';
import { safeFilenameBase } from './jsonDocument';

/**
 * Renders a parchment-style zone-graph preview matching the look of the game's
 * official template PNGs (next to each .rmg.json in map_templates/). The game
 * shows these in the template-selection screen, so a matching image makes an
 * exported template look native there.
 *
 * Palette and ~700px square size are taken from the official previews.
 */

const SIZE = 700;
const PAD = 96; // distance from the frame to the outermost node centers

const PARCHMENT_LIGHT = '#e7d8ad';
const PARCHMENT_MID = '#cdb78c';
const PARCHMENT_EDGE = '#a88f62';
const FRAME_STROKE = '#5a4527';
const FRAME_INNER = '#7c6a44';
const LINE_COLOR = '#46341d';
const SPAWN_FILL = '#3d1819';
const SPAWN_RIM = '#e3d4a6';
const SPAWN_TEXT = '#f5ecd2';
const CITY_NEUTRAL = '#a9812f'; // gold — random-faction city/outpost
const CITY_MATCH = '#5d7488'; // slate blue — faction-matched city/outpost
const CITY_ICON = '#f4e9c6';
const CITY_RIM = '#e3d4a6';
const ARENA_FILL = '#8a7d6c'; // muted steel — neutral, no faction
const ARENA_ICON = '#f4e9c6';
const EMPTY_FILL = '#cbb78d';
const EMPTY_RIM = '#5a4632';

type NodeShape = 'spawn' | 'city' | 'outpost' | 'arena' | 'empty';

interface NodeInfo {
  shape: NodeShape;
  /** City/outpost whose faction matches a player's starting castle (blue),
   *  as opposed to a random/independent faction (gold). */
  matchFaction: boolean;
}

/** The most significant main object decides the node's look, the way the game's
 *  previews do: a player start, then the arena (its own glyph), then a city,
 *  then an outpost, otherwise a plain neutral. */
function zoneNode(zone: Zone): NodeInfo {
  const mainObjects = zone.mainObjects || [];
  if (mainObjects.some((mo) => mo.type === 'Spawn')) return { shape: 'spawn', matchFaction: false };
  if (mainObjects.some((mo) => mo.type === 'GladiatorArena')) return { shape: 'arena', matchFaction: false };
  const city = mainObjects.find((mo) => mo.type === 'City');
  if (city) return { shape: 'city', matchFaction: city.factionMode === 'spawn' };
  const outpost = mainObjects.find((mo) => mo.type === 'AbandonedOutpost');
  if (outpost) return { shape: 'outpost', matchFaction: outpost.factionMode === 'spawn' };
  return { shape: 'empty', matchFaction: false };
}

function spawnNumber(zone: Zone): number {
  const spawn = (zone.mainObjects || []).find((mo) => mo.type === 'Spawn');
  return spawn?.player ?? 1;
}

/** Maps the zones' normalized (0..1) positions into the padded canvas area,
 *  fitting their bounding box uniformly and centering it. */
function makeProjector(zones: Zone[]): (x: number, y: number) => { x: number; y: number } {
  const xs = zones.map((z) => z.x);
  const ys = zones.map((z) => z.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const inner = SIZE - PAD * 2;
  const scale = Math.min(inner / spanX, inner / spanY);
  // Center the scaled bounding box inside the whole canvas.
  const offX = (SIZE - spanX * scale) / 2;
  const offY = (SIZE - spanY * scale) / 2;
  return (x, y) => ({ x: offX + (x - minX) * scale, y: offY + (y - minY) * scale });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHouse(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  // A simple house/pentagon glyph, like the game's neutral-zone icon.
  const s = r * 0.62;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);               // roof peak
  ctx.lineTo(cx + s, cy - s * 0.15);
  ctx.lineTo(cx + s, cy + s);           // bottom-right
  ctx.lineTo(cx - s, cy + s);           // bottom-left
  ctx.lineTo(cx - s, cy - s * 0.15);
  ctx.closePath();
  ctx.fill();
  // door notch
  ctx.fillStyle = 'rgba(40, 24, 16, 0.45)';
  ctx.fillRect(cx - s * 0.28, cy + s * 0.1, s * 0.56, s * 0.9);
}

function drawTent(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  // An abandoned outpost — a triangular tent with a door, like the canvas badge.
  const s = r * 0.64;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s, cy + s * 0.8);
  ctx.lineTo(cx - s, cy + s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(40, 24, 16, 0.5)';
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.1);
  ctx.lineTo(cx + s * 0.3, cy + s * 0.8);
  ctx.lineTo(cx - s * 0.3, cy + s * 0.8);
  ctx.closePath();
  ctx.fill();
}

function drawSwords(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  // The gladiator arena — crossed swords, matching the game's distinct icon.
  const s = r * 0.6;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2.5, r * 0.17);
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
  ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
  ctx.stroke();
  // crossguards
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.beginPath();
  ctx.moveTo(cx - s * 1.15, cy - s * 0.55); ctx.lineTo(cx - s * 0.55, cy - s * 1.15);
  ctx.moveTo(cx + s * 0.55, cy - s * 1.15); ctx.lineTo(cx + s * 1.15, cy - s * 0.55);
  ctx.stroke();
}

/** Draws the parchment background and rounded frame. */
function drawBackground(ctx: CanvasRenderingContext2D): void {
  const grad = ctx.createRadialGradient(SIZE / 2, SIZE * 0.42, SIZE * 0.1, SIZE / 2, SIZE / 2, SIZE * 0.72);
  grad.addColorStop(0, PARCHMENT_LIGHT);
  grad.addColorStop(0.7, PARCHMENT_MID);
  grad.addColorStop(1, PARCHMENT_EDGE);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Rounded double frame.
  ctx.lineJoin = 'round';
  roundedRect(ctx, 16, 16, SIZE - 32, SIZE - 32, 26);
  ctx.strokeStyle = FRAME_STROKE;
  ctx.lineWidth = 4;
  ctx.stroke();
  roundedRect(ctx, 24, 24, SIZE - 48, SIZE - 48, 20);
  ctx.strokeStyle = FRAME_INNER;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export function renderTemplatePreviewCanvas(zones: Zone[], edges: Edge[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  drawBackground(ctx);
  if (!zones.length) return canvas;

  const project = makeProjector(zones);
  const pos = new Map(zones.map((zone) => [zone.id, project(zone.x, zone.y)]));
  const radius = Math.max(15, Math.min(30, 30 - zones.length * 0.45));

  // Passage lines first (Proximity springs are connectivity helpers the game
  // previews don't draw).
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = Math.max(2.5, radius * 0.16);
  ctx.lineCap = 'round';
  for (const edge of edges) {
    if (edge.connectionType === 'Proximity') continue;
    const a = pos.get(edge.from);
    const b = pos.get(edge.to);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Nodes on top.
  for (const zone of zones) {
    const p = pos.get(zone.id)!;
    const node = zoneNode(zone);

    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);

    if (node.shape === 'empty') {
      ctx.fillStyle = EMPTY_FILL;
      ctx.fill();
      ctx.lineWidth = Math.max(2, radius * 0.14);
      ctx.strokeStyle = EMPTY_RIM;
      ctx.stroke();
      continue;
    }

    const fill =
      node.shape === 'spawn' ? SPAWN_FILL :
      node.shape === 'arena' ? ARENA_FILL :
      node.matchFaction ? CITY_MATCH : CITY_NEUTRAL;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(2, radius * 0.13);
    ctx.strokeStyle = node.shape === 'spawn' ? SPAWN_RIM : CITY_RIM;
    ctx.stroke();

    switch (node.shape) {
      case 'spawn':
        ctx.fillStyle = SPAWN_TEXT;
        ctx.font = `700 ${Math.round(radius * 1.1)}px 'Outfit', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(spawnNumber(zone)), p.x, p.y + radius * 0.04);
        break;
      case 'arena':
        drawSwords(ctx, p.x, p.y, radius, ARENA_ICON);
        break;
      case 'outpost':
        drawTent(ctx, p.x, p.y, radius, CITY_ICON);
        break;
      default:
        drawHouse(ctx, p.x, p.y, radius, CITY_ICON);
    }
  }

  return canvas;
}

/** Renders the preview and resolves a PNG Blob. */
export function renderTemplatePreview(zones: Zone[], edges: Edge[]): Promise<Blob> {
  const canvas = renderTemplatePreviewCanvas(zones, edges);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode PNG'))),
      'image/png'
    );
  });
}

/** `<template-name>.png`, matching the .rmg.json base name so the game pairs them. */
export function previewFilename(templateName: string): string {
  return `${safeFilenameBase(templateName, 'template')}.png`;
}
