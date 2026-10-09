import { type FC, useId, useMemo } from 'react';
import type { IconRenderOptions, MarkSurfaceTheme } from './types/icon';
import {
  markGradientStopsSvg,
  markStandalonePalettes,
} from './utils/markSurfacePalette.js';
import {
  BOX_MARK_ONLY_VIEW_BOX,
  BOX_MARK_TRANSFORM,
  MARK_PREVIEW_GUIDE_FIT_TRANSFORM,
  IPA_HARBOR_APP_BADGE_RX,
  IPA_HARBOR_APPLE_TOUCH_BADGE_RX,
  IPA_HARBOR_BADGE,
  IPA_HARBOR_BG_GRADIENT_BOTTOM,
  IPA_HARBOR_BG_GRADIENT_TOP,
  boxFrontFaceArrowTransform,
  boxFrontFacePath,
  boxRightFacePath,
  boxTopFacePath,
  tablerArrowBigDownPath,
} from './utils/ipaHarborGeometry';

//  SVG strings (for export) 

export function squircleBgLightingDefsSvg(): string {
  return `
    <linearGradient id="uuphy-ipa-harbor-bg" x1="36" y1="6" x2="64" y2="94" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${IPA_HARBOR_BG_GRADIENT_TOP}"/>
      <stop offset="42%" stop-color="${IPA_HARBOR_BG_GRADIENT_TOP}" stop-opacity="0.97"/>
      <stop offset="100%" stop-color="${IPA_HARBOR_BG_GRADIENT_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="uuphy-ipa-harbor-gloss" x1="50" y1="6" x2="50" y2="46" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.2"/>
      <stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>`;
}

export function boxFaceLightingDefsSvg(): string {
  return `
    <linearGradient id="uuphy-box-top-fill" x1="1.1" y1="0.85" x2="14.2" y2="6.1" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="1"/>
      <stop offset="38%" stop-color="#FFFFFF" stop-opacity="0.93"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.74"/>
    </linearGradient>
    <linearGradient id="uuphy-box-front-fill" x1="1.2" y1="4.8" x2="7.8" y2="14.5" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.94"/>
      <stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.58"/>
    </linearGradient>
    <linearGradient id="uuphy-box-right-fill" x1="14.8" y1="4.5" x2="9" y2="14.5" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.42"/>
    </linearGradient>`;
}

export function boxArrowLightingDefsSvg(): string {
  return `
    <linearGradient id="uuphy-box-arrow-fill" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${IPA_HARBOR_BG_GRADIENT_TOP}" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="${IPA_HARBOR_BG_GRADIENT_BOTTOM}" stop-opacity="0.96"/>
    </linearGradient>`;
}

export function boxMarkLightingDefsSvg(): string {
  return boxFaceLightingDefsSvg() + boxArrowLightingDefsSvg();
}

/** No bottom layer Mark: each has a pair of light/dark UI background gradients */
export function boxFaceStandaloneLightingDefsSvg(surfaceTheme: MarkSurfaceTheme = 'light'): string {
  const palette = markStandalonePalettes[surfaceTheme];
  return `
    <linearGradient id="uuphy-box-top-fill" x1="1.1" y1="0.85" x2="14.2" y2="6.1" gradientUnits="userSpaceOnUse">
      ${markGradientStopsSvg(palette.top)}
    </linearGradient>
    <linearGradient id="uuphy-box-front-fill" x1="1.2" y1="4.8" x2="7.8" y2="14.5" gradientUnits="userSpaceOnUse">
      ${markGradientStopsSvg(palette.front)}
    </linearGradient>
    <linearGradient id="uuphy-box-right-fill" x1="14.8" y1="4.5" x2="9" y2="14.5" gradientUnits="userSpaceOnUse">
      ${markGradientStopsSvg(palette.right)}
    </linearGradient>`;
}

export function boxArrowStandaloneLightingDefsSvg(surfaceTheme: MarkSurfaceTheme = 'light'): string {
  const palette = markStandalonePalettes[surfaceTheme];
  return `
    <linearGradient id="uuphy-box-arrow-fill" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
      ${markGradientStopsSvg(palette.arrow)}
    </linearGradient>`;
}

export function boxMarkStandaloneLightingDefsSvg(surfaceTheme: MarkSurfaceTheme = 'light'): string {
  return boxFaceStandaloneLightingDefsSvg(surfaceTheme) + boxArrowStandaloneLightingDefsSvg(surfaceTheme);
}

export function boxFacesOnlySvg(): string {
  return `
  <path d="${boxRightFacePath}" fill="url(#uuphy-box-right-fill)"/>
  <path d="${boxFrontFacePath}" fill="url(#uuphy-box-front-fill)"/>
  <path d="${boxTopFacePath}" fill="url(#uuphy-box-top-fill)"/>`;
}

export function boxArrowOnlySvg(): string {
  return `
  <g clip-path="url(#uuphy-box-front-clip)">
    <g transform="${boxFrontFaceArrowTransform}">
      <path d="${tablerArrowBigDownPath}" fill="url(#uuphy-box-arrow-fill)"/>
    </g>
  </g>`;
}

export function boxMarkFacesSvg(): string {
  return `
  <path d="${boxRightFacePath}" fill="url(#uuphy-box-right-fill)"/>
  <path d="${boxFrontFacePath}" fill="url(#uuphy-box-front-fill)"/>
  ${boxArrowOnlySvg()}
  <path d="${boxTopFacePath}" fill="url(#uuphy-box-top-fill)"/>`;
}

/* Preview React SVG (each instance has a unique id,
   avoid App icon and Mark gradient conflicts in header) */

type PreviewSvgIds = {
  ipaHarborBg: string;
  ipaHarborGloss: string;
  boxTopFill: string;
  boxFrontFill: string;
  boxRightFill: string;
  boxArrowFill: string;
  boxFrontClip: string;
  squircleShadow: string;
};

function createPreviewSvgIds(instanceId: string): PreviewSvgIds {
  const prefix = `uuphy-${instanceId}`;
  return {
    ipaHarborBg: `${prefix}-ipa-harbor-bg`,
    ipaHarborGloss: `${prefix}-ipa-harbor-gloss`,
    boxTopFill: `${prefix}-box-top-fill`,
    boxFrontFill: `${prefix}-box-front-fill`,
    boxRightFill: `${prefix}-box-right-fill`,
    boxArrowFill: `${prefix}-box-arrow-fill`,
    boxFrontClip: `${prefix}-box-front-clip`,
    squircleShadow: `${prefix}-squircle-shadow`,
  };
}

function SquircleBgLightingDefs({ ids }: { ids: PreviewSvgIds }) {
  return (
    <>
      <linearGradient id={ids.ipaHarborBg} x1="36" y1="6" x2="64" y2="94" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={IPA_HARBOR_BG_GRADIENT_TOP} />
        <stop offset="42%" stopColor={IPA_HARBOR_BG_GRADIENT_TOP} stopOpacity={0.97} />
        <stop offset="100%" stopColor={IPA_HARBOR_BG_GRADIENT_BOTTOM} />
      </linearGradient>
      <linearGradient id={ids.ipaHarborGloss} x1="50" y1="6" x2="50" y2="46" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.2} />
        <stop offset="55%" stopColor="#FFFFFF" stopOpacity={0.06} />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
      </linearGradient>
    </>
  );
}

function BoxFaceLightingDefs({ ids }: { ids: PreviewSvgIds }) {
  return (
    <>
      <linearGradient id={ids.boxTopFill} x1="1.1" y1="0.85" x2="14.2" y2="6.1" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
        <stop offset="38%" stopColor="#FFFFFF" stopOpacity={0.93} />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.74} />
      </linearGradient>
      <linearGradient id={ids.boxFrontFill} x1="1.2" y1="4.8" x2="7.8" y2="14.5" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.94} />
        <stop offset="45%" stopColor="#FFFFFF" stopOpacity={0.8} />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.58} />
      </linearGradient>
      <linearGradient id={ids.boxRightFill} x1="14.8" y1="4.5" x2="9" y2="14.5" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.72} />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.42} />
      </linearGradient>
    </>
  );
}

function BoxArrowLightingDefs({ ids }: { ids: PreviewSvgIds }) {
  return (
    <linearGradient id={ids.boxArrowFill} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stopColor={IPA_HARBOR_BG_GRADIENT_TOP} stopOpacity={0.88} />
      <stop offset="100%" stopColor={IPA_HARBOR_BG_GRADIENT_BOTTOM} stopOpacity={0.96} />
    </linearGradient>
  );
}

function MarkGradientStops({ stops }: { stops: typeof markStandalonePalettes.light.top }) {
  return (
    <>
      {stops.map((s) => (
        <stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity ?? 1} />
      ))}
    </>
  );
}

function BoxFaceStandaloneLightingDefs({
  ids,
  surfaceTheme,
}: {
  ids: PreviewSvgIds;
  surfaceTheme: MarkSurfaceTheme;
}) {
  const palette = markStandalonePalettes[surfaceTheme];
  return (
    <>
      <linearGradient id={ids.boxTopFill} x1="1.1" y1="0.85" x2="14.2" y2="6.1" gradientUnits="userSpaceOnUse">
        <MarkGradientStops stops={palette.top} />
      </linearGradient>
      <linearGradient id={ids.boxFrontFill} x1="1.2" y1="4.8" x2="7.8" y2="14.5" gradientUnits="userSpaceOnUse">
        <MarkGradientStops stops={palette.front} />
      </linearGradient>
      <linearGradient id={ids.boxRightFill} x1="14.8" y1="4.5" x2="9" y2="14.5" gradientUnits="userSpaceOnUse">
        <MarkGradientStops stops={palette.right} />
      </linearGradient>
    </>
  );
}

function BoxArrowStandaloneLightingDefs({
  ids,
  surfaceTheme,
}: {
  ids: PreviewSvgIds;
  surfaceTheme: MarkSurfaceTheme;
}) {
  const palette = markStandalonePalettes[surfaceTheme];
  return (
    <linearGradient id={ids.boxArrowFill} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
      <MarkGradientStops stops={palette.arrow} />
    </linearGradient>
  );
}

function BoxFacesBase({ ids }: { ids: PreviewSvgIds }) {
  return (
    <>
      <path d={boxRightFacePath} fill={`url(#${ids.boxRightFill})`} />
      <path d={boxFrontFacePath} fill={`url(#${ids.boxFrontFill})`} />
    </>
  );
}

function BoxTopFace({ ids }: { ids: PreviewSvgIds }) {
  return <path d={boxTopFacePath} fill={`url(#${ids.boxTopFill})`} />;
}

function BlueprintGuides({ badgeRx }: { badgeRx: number }) {
  return (
    <>
      <rect
        x={IPA_HARBOR_BADGE.x}
        y={IPA_HARBOR_BADGE.y}
        width={IPA_HARBOR_BADGE.w}
        height={IPA_HARBOR_BADGE.h}
        rx={badgeRx > 0 ? badgeRx : undefined}
        stroke="#38BDF8"
        strokeWidth="0.8"
        strokeDasharray="3 3"
        fill="none"
      />
      <circle cx="50" cy="50" r="38" stroke="#F59E0B" strokeWidth="0.5" strokeDasharray="2 2" fill="none" />
    </>
  );
}

function BoxArrowMark({ ids }: { ids: PreviewSvgIds }) {
  return (
    <g clipPath={`url(#${ids.boxFrontClip})`}>
      <g transform={boxFrontFaceArrowTransform}>
        <path d={tablerArrowBigDownPath} fill={`url(#${ids.boxArrowFill})`} />
      </g>
    </g>
  );
}

export const IpaHarborBadge: FC<IconRenderOptions> = ({
  size = 64,
  className = '',
  depthMode = 'tactile',
  showBlueprint = false,
  previewVariant = 'app-icon',
  markSurfaceTheme = 'light',
}) => {
  const isMarkPreview = previewVariant === 'mark-only';
  const isAppleTouchPreview = previewVariant === 'apple-touch-icon';
  const badgeRx = isAppleTouchPreview ? IPA_HARBOR_APPLE_TOUCH_BADGE_RX : IPA_HARBOR_APP_BADGE_RX;
  const viewBox = BOX_MARK_ONLY_VIEW_BOX;
  const showBadgeShadow = !isMarkPreview && !isAppleTouchPreview && depthMode === 'tactile';
  const reactId = useId().replace(/:/g, '');
  const ids = useMemo(() => createPreviewSvgIds(reactId), [reactId]);

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      overflow="visible"
      xmlns="http://www.w3.org/2000/svg"
      className="select-none block"
      aria-label={
        isMarkPreview
          ? 'IPA Harbor box mark preview'
          : isAppleTouchPreview
            ? 'IPA Harbor apple touch icon preview'
            : 'IPA Harbor app icon'
      }
      role="img"
    >
      <defs>
        {!isMarkPreview && <SquircleBgLightingDefs ids={ids} />}
        {isMarkPreview ? (
          <>
            <BoxFaceStandaloneLightingDefs ids={ids} surfaceTheme={markSurfaceTheme} />
            <BoxArrowStandaloneLightingDefs ids={ids} surfaceTheme={markSurfaceTheme} />
          </>
        ) : (
          <>
            <BoxFaceLightingDefs ids={ids} />
            <BoxArrowLightingDefs ids={ids} />
          </>
        )}
        <clipPath id={ids.boxFrontClip}>
          <path d={boxFrontFacePath} />
        </clipPath>
        {showBadgeShadow ? (
          <filter
            id={ids.squircleShadow}
            filterUnits="userSpaceOnUse"
            x="-8"
            y="-8"
            width="116"
            height="116"
          >
            <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor={IPA_HARBOR_BG_GRADIENT_BOTTOM} floodOpacity="0.55" />
          </filter>
        ) : null}
      </defs>

      {!isMarkPreview && (
        <>
          <rect
            x={IPA_HARBOR_BADGE.x}
            y={IPA_HARBOR_BADGE.y}
            width={IPA_HARBOR_BADGE.w}
            height={IPA_HARBOR_BADGE.h}
            rx={badgeRx > 0 ? badgeRx : undefined}
            fill={IPA_HARBOR_BG_GRADIENT_BOTTOM}
            filter={showBadgeShadow ? `url(#${ids.squircleShadow})` : undefined}
          />
          <rect
            x={IPA_HARBOR_BADGE.x}
            y={IPA_HARBOR_BADGE.y}
            width={IPA_HARBOR_BADGE.w}
            height={IPA_HARBOR_BADGE.h}
            rx={badgeRx > 0 ? badgeRx : undefined}
            fill={`url(#${ids.ipaHarborBg})`}
          />
          <rect
            x={IPA_HARBOR_BADGE.x}
            y={IPA_HARBOR_BADGE.y}
            width={IPA_HARBOR_BADGE.w}
            height={IPA_HARBOR_BADGE.h}
            rx={badgeRx > 0 ? badgeRx : undefined}
            fill={`url(#${ids.ipaHarborGloss})`}
          />
        </>
      )}

      {isMarkPreview ? (
        <g transform={MARK_PREVIEW_GUIDE_FIT_TRANSFORM}>
          <g transform={BOX_MARK_TRANSFORM}>
            <BoxFacesBase ids={ids} />
            <BoxArrowMark ids={ids} />
            <BoxTopFace ids={ids} />
          </g>
        </g>
      ) : (
        <g transform={BOX_MARK_TRANSFORM}>
          <BoxFacesBase ids={ids} />
          <BoxArrowMark ids={ids} />
          <BoxTopFace ids={ids} />
        </g>
      )}

      {showBlueprint ? (
        <g opacity="0.85" className="pointer-events-none">
          {isMarkPreview ? (
            <g transform={MARK_PREVIEW_GUIDE_FIT_TRANSFORM}>
              <BlueprintGuides badgeRx={badgeRx} />
            </g>
          ) : (
            <BlueprintGuides badgeRx={badgeRx} />
          )}
        </g>
      ) : null}
    </svg>
    </div>
  );
};
