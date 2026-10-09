export const IPA_HARBOR_BG_GRADIENT_TOP = '#58BEF5';
export const IPA_HARBOR_BG_GRADIENT_BOTTOM = '#196EFA';

/** With projection white (feDropShadow dy=3 stdDeviation=3.5), avoid viewBox crop */
export const IPA_HARBOR_VIEW_BOX = '-8 -8 116 116';
export const BOX_MARK_SCALE = 4.5;
export const BOX_MARK_CENTER = { x: 50, y: 53 } as const;
export const BOX_MARK_TRANSFORM = `translate(${BOX_MARK_CENTER.x}, ${BOX_MARK_CENTER.y}) scale(${BOX_MARK_SCALE}) translate(-8, -8)`;

/** No rounded blue background / no -8 padding, same coordinates as App icon rounded bottom plate */
export const BOX_MARK_ONLY_VIEW_BOX = '6 6 88 88';

export const IPA_HARBOR_BADGE = { x: 6, y: 6, w: 88, h: 88 } as const;
export const IPA_HARBOR_APP_BADGE_RX = 22;
/** Apple Touch Icon: square, rounded by system mask */
export const IPA_HARBOR_APPLE_TOUCH_BADGE_RX = 0;

/** Preview Mark scale: outer reference line width 88, inner circle diameter 76 (r=38), take middle 82 / 88 */
export const MARK_PREVIEW_GUIDE_FIT_SCALE = 82 / 88;
export const MARK_PREVIEW_GUIDE_FIT_TRANSFORM = `translate(50, 50) scale(${MARK_PREVIEW_GUIDE_FIT_SCALE}) translate(-50, -50)`;

export const BOX_FACE_CORNER_RADIUS = 0.42;
export const BOX_TOP_FACE_CORNER_RADIUS = 0.36;

function dist(a: [number, number], b: [number, number]) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function roundedPolygonPath(points: [number, number][], radius: number): string {
  const n = points.length;
  if (n < 3) return '';

  const parts: string[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;

    const toPrev = dist(curr, prev);
    const toNext = dist(curr, next);
    const r = Math.min(radius, toPrev * 0.48, toNext * 0.48);
    if (r <= 0.001) continue;

    const v1x = (prev[0] - curr[0]) / toPrev;
    const v1y = (prev[1] - curr[1]) / toPrev;
    const v2x = (next[0] - curr[0]) / toNext;
    const v2y = (next[1] - curr[1]) / toNext;

    const p1x = curr[0] + v1x * r;
    const p1y = curr[1] + v1y * r;
    const p2x = curr[0] + v2x * r;
    const p2y = curr[1] + v2y * r;

    if (i === 0) {
      parts.push(`M ${p1x.toFixed(3)} ${p1y.toFixed(3)}`);
    } else {
      parts.push(`L ${p1x.toFixed(3)} ${p1y.toFixed(3)}`);
    }
    parts.push(`Q ${curr[0].toFixed(3)} ${curr[1].toFixed(3)} ${p2x.toFixed(3)} ${p2y.toFixed(3)}`);
  }

  parts.push('Z');
  return parts.join(' ');
}

const boxTopFacePoints: [number, number][] = [
  [8.186, 1.113],
  [1.846, 3.5],
  [8, 5.961],
  [14.154, 3.5],
];

const boxRightFacePoints: [number, number][] = [
  [15, 4.239],
  [8.5, 6.839],
  [8.5, 14.761],
  [15, 12.161],
];

const boxFrontFacePoints: [number, number][] = [
  [7.5, 14.762],
  [7.5, 6.838],
  [1, 4.239],
  [1, 12.162],
];

export const boxTopFacePath = roundedPolygonPath(boxTopFacePoints, BOX_TOP_FACE_CORNER_RADIUS);
export const boxRightFacePath = roundedPolygonPath(boxRightFacePoints, BOX_FACE_CORNER_RADIUS);
export const boxFrontFacePath = roundedPolygonPath(boxFrontFacePoints, BOX_FACE_CORNER_RADIUS);

export const tablerArrowBigDownPath =
  'M10 2l-.15 .005a2 2 0 0 0 -1.85 1.995v6.999l-2.586 .001a2 2 0 0 0 -1.414 3.414l6.586 6.586a2 2 0 0 0 2.828 0l6.586 -6.586a2 2 0 0 0 .434 -2.18l-.068 -.145a2 2 0 0 0 -1.78 -1.089l-2.586 -.001v-6.999a2 2 0 0 0 -2 -2h-4z';

export const BOX_ARROW_NUDGE_EXPORT_PX_X = 6;
export const BOX_ARROW_NUDGE_EXPORT_PX_Y = 12;

const exportPxToBoxLocal = (px: number) => (px / 1024) * (100 / BOX_MARK_SCALE);
const boxArrowNudgeLocalX = -exportPxToBoxLocal(BOX_ARROW_NUDGE_EXPORT_PX_X);
const boxArrowNudgeLocalY = exportPxToBoxLocal(BOX_ARROW_NUDGE_EXPORT_PX_Y);

export const boxFrontFaceArrowTransform = `translate(${boxArrowNudgeLocalX.toFixed(4)}, ${boxArrowNudgeLocalY.toFixed(4)}) matrix(0.270833,0.108292,0,0.330125,1,4.239) translate(12,12) scale(0.52) translate(-12,-12)`;
