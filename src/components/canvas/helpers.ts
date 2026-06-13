export const playerColors: Record<number, string> = {
  1: "#ff3b30", // Red
  2: "#007aff", // Blue
  3: "#ffcc00", // Yellow
  4: "#34c759", // Green
  5: "#ff9500", // Orange
  6: "#af52de", // Purple
  7: "#5ac8fa", // Teal
  8: "#ff2d55"  // Pink
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface CanvasPoint {
  x: number;
  y: number;
}

/** Zone half-size (42) plus line clearance, in viewBox units. */
const OBSTACLE_RADIUS = 56;
/** Control-point offset of a detour arc (max deviation from the chord = half of this). */
const BEND_OFFSET = 150;

/**
 * Decides whether a connection between two zone centres must bend around an
 * obstacle. Returns the signed control-point offset of a quadratic arc, or 0
 * when the straight segment passes no other zone. Endpoints must be given in
 * a stable (sorted-id) order so the bend side never flips between renders.
 */
export function pairBend(
  pa: CanvasPoint,
  pb: CanvasPoint,
  obstacles: CanvasPoint[]
): number {
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -dy / len;
  const py = dx / len;

  let blocked = false;
  let sideSum = 0;
  for (const o of obstacles) {
    const ox = o.x - pa.x;
    const oy = o.y - pa.y;
    const t = (ox * ux + oy * uy) / len;
    // Ignore zones sitting at the endpoints' vicinity
    if (t < 0.08 || t > 0.92) continue;
    const dPerp = ox * px + oy * py;
    if (Math.abs(dPerp) < OBSTACLE_RADIUS) {
      blocked = true;
      sideSum += dPerp;
    }
  }
  if (!blocked) return 0;
  // Bend away from the average obstacle side; exactly collinear obstacles
  // (the common case) get a deterministic positive side.
  return sideSum > 0.5 ? -BEND_OFFSET : BEND_OFFSET;
}

/**
 * Builds the SVG path of a connection line: a straight segment, or a
 * quadratic arc when `bend` is non-zero. `lateral` shifts the whole line
 * sideways (used to keep a bundle and a spring apart). Also returns the
 * point where the guard capsule should sit (the visual middle of the line).
 */
export function connectionPath(
  pa: CanvasPoint,
  pb: CanvasPoint,
  lateral: number,
  bend: number
): { d: string; mid: CanvasPoint } {
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;

  const ax = pa.x + px * lateral;
  const ay = pa.y + py * lateral;
  const bx = pb.x + px * lateral;
  const by = pb.y + py * lateral;

  if (!bend) {
    return {
      d: `M ${ax} ${ay} L ${bx} ${by}`,
      mid: { x: (ax + bx) / 2, y: (ay + by) / 2 }
    };
  }

  const cx = (ax + bx) / 2 + px * bend;
  const cy = (ay + by) / 2 + py * bend;
  return {
    d: `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`,
    // Quadratic bezier point at t = 0.5
    mid: {
      x: 0.25 * ax + 0.5 * cx + 0.25 * bx,
      y: 0.25 * ay + 0.5 * cy + 0.25 * by
    }
  };
}

export function formatGuardValue(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return '';
  const numericValue = typeof value === 'number' ? value : parseInt(value, 10);
  if (Number.isNaN(numericValue)) return String(value);
  if (numericValue >= 1000) {
    if (numericValue % 1000 === 0) {
      return `${numericValue / 1000}K`;
    }
    return `${(numericValue / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(numericValue);
}
