import type { ColorPalette, DepthMode, IconPreviewVariant, MarkSurfaceTheme } from '../types/icon';
import {
  boxArrowLightingDefsSvg,
  boxArrowOnlySvg,
  boxFaceLightingDefsSvg,
  boxFacesOnlySvg,
  boxMarkFacesSvg,
  boxMarkLightingDefsSvg,
  boxMarkStandaloneLightingDefsSvg,
  squircleBgLightingDefsSvg,
} from '../ipaHarborIcon';
import {
  BOX_MARK_ONLY_VIEW_BOX,
  BOX_MARK_TRANSFORM,
  IPA_HARBOR_APP_BADGE_RX,
  IPA_HARBOR_APPLE_TOUCH_BADGE_RX,
  IPA_HARBOR_BADGE,
  IPA_HARBOR_BG_GRADIENT_BOTTOM,
  IPA_HARBOR_VIEW_BOX,
  boxFrontFacePath,
} from './ipaHarborGeometry';

export const IPA_HARBOR_EXPORT_PX = 1024;

export { IPA_HARBOR_APP_BADGE_RX, IPA_HARBOR_APPLE_TOUCH_BADGE_RX } from './ipaHarborGeometry';

function ipaHarborGradientDefs() {
  return `
    ${squircleBgLightingDefsSvg()}
    ${boxMarkLightingDefsSvg()}
    <clipPath id="uuphy-box-front-clip">
      <path d="${boxFrontFacePath}"/>
    </clipPath>`;
}

function boxFacesLayerDefs() {
  return `${boxFaceLightingDefsSvg()}`;
}

function boxArrowLayerDefs() {
  return `
    ${boxArrowLightingDefsSvg()}
    <clipPath id="uuphy-box-front-clip">
      <path d="${boxFrontFacePath}"/>
    </clipPath>`;
}

function shadowFilter(depthMode: DepthMode) {
  if (depthMode !== 'tactile') return '';
  return `<filter id="uuphy-squircle-shadow" filterUnits="userSpaceOnUse" x="-8" y="-8" width="116" height="116">
  <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="${IPA_HARBOR_BG_GRADIENT_BOTTOM}" flood-opacity="0.55"/>
</filter>`;
}

function badgeRect(fill: string, badgeRx: number, extra = '') {
  const { x, y, w, h } = IPA_HARBOR_BADGE;
  const rxAttr = badgeRx > 0 ? ` rx="${badgeRx}"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rxAttr} fill="${fill}"${extra}/>`;
}

function boxMarkCombinedSvg(transform: string) {
  return `<g transform="${transform}">
  ${boxMarkFacesSvg()}
</g>`;
}

function boxFacesLayerSvg() {
  return `<g transform="${BOX_MARK_TRANSFORM}">
  ${boxFacesOnlySvg()}
</g>`;
}

function boxArrowLayerSvg() {
  return `<g transform="${BOX_MARK_TRANSFORM}">
  ${boxArrowOnlySvg()}
</g>`;
}

function svgDocument(body: string, defs = '', viewBox = IPA_HARBOR_VIEW_BOX, pixelSize = IPA_HARBOR_EXPORT_PX) {
  return `<svg width="${pixelSize}" height="${pixelSize}" viewBox="${viewBox}" fill="none" overflow="visible" xmlns="http://www.w3.org/2000/svg">
  ${defs ? `<defs>${defs}</defs>` : ''}
  ${body}
</svg>`;
}

function generateIpaHarborAppIconBody(depthMode: DepthMode, badgeRx: number) {
  const shadow = badgeRx > 0 ? shadowFilter(depthMode) : '';
  const shadowAttr = badgeRx > 0 && depthMode === 'tactile' ? ' filter="url(#uuphy-squircle-shadow)"' : '';
  const defs = ipaHarborGradientDefs() + shadow;
  const body = `
  ${badgeRect(IPA_HARBOR_BG_GRADIENT_BOTTOM, badgeRx, shadowAttr)}
  ${badgeRect('url(#uuphy-ipa-harbor-bg)', badgeRx)}
  ${badgeRect('url(#uuphy-ipa-harbor-gloss)', badgeRx)}
  ${boxMarkCombinedSvg(BOX_MARK_TRANSFORM)}`;
  return { defs, body };
}

/** Complete App icon (with -8 projection white viewBox) */
export function generateIpaHarborSvg(_palette: ColorPalette, depthMode: DepthMode = 'tactile'): string {
  const { defs, body } = generateIpaHarborAppIconBody(depthMode, IPA_HARBOR_APP_BADGE_RX);
  return svgDocument(body, defs);
}

/** Docs hero: align with rounded bottom plate viewBox, avoid transparent edges in VPHero looking too small */
export function generateIpaHarborAppIconHeroSvg(_palette: ColorPalette): string {
  const { defs, body } = generateIpaHarborAppIconBody('flat', IPA_HARBOR_APP_BADGE_RX);
  return svgDocument(body, defs, BOX_MARK_ONLY_VIEW_BOX);
}

/** Client apple-touch-icon (for A2HS): square, rounded by iOS; when rasterizing, pixelSize should match PNG output width */
export function generateIpaHarborAppleTouchIconSvg(
  _palette: ColorPalette,
  pixelSize: number = IPA_HARBOR_EXPORT_PX,
): string {
  const { defs, body } = generateIpaHarborAppIconBody('flat', IPA_HARBOR_APPLE_TOUCH_BADGE_RX);
  return svgDocument(body, defs, BOX_MARK_ONLY_VIEW_BOX, pixelSize);
}

function ipaHarborMarkGradientDefs(surfaceTheme: MarkSurfaceTheme) {
  return `
    ${boxMarkStandaloneLightingDefsSvg(surfaceTheme)}
    <clipPath id="uuphy-box-front-clip">
      <path d="${boxFrontFacePath}"/>
    </clipPath>`;
}

/** No blue background Mark (surfaceTheme adapts light/dark UI background) */
export function generateIpaHarborMarkPreviewSvg(
  _palette: ColorPalette,
  surfaceTheme: MarkSurfaceTheme = 'light',
): string {
  const defs = ipaHarborMarkGradientDefs(surfaceTheme);
  const body = boxMarkCombinedSvg(BOX_MARK_TRANSFORM);
  return svgDocument(body, defs, BOX_MARK_ONLY_VIEW_BOX);
}

export type IpaHarborAppleLayerId = 'background' | 'gradient' | 'box-faces' | 'download-arrow';

export interface IpaHarborAppleLayerSpec {
  id: IpaHarborAppleLayerId;
  fileName: string;
  title: string;
  hint: string;
}

export const IPA_HARBOR_APPLE_LAYER_SPECS: IpaHarborAppleLayerSpec[] = [
  { id: 'background', fileName: '01-background.svg', title: 'Solid', hint: '' },
  { id: 'gradient', fileName: '02-gradient.svg', title: 'Gradient', hint: '' },
  { id: 'box-faces', fileName: '03-ipa-harbor-box-faces.svg', title: 'Box', hint: '' },
  { id: 'download-arrow', fileName: '04-ipa-harbor-download-arrow.svg', title: 'Arrow', hint: '' },
];

export type IpaHarborAppleLayerExportOptions = {
  badgeRx: number;
  viewBox: string;
};

/** Layer export options: Touch is square, App is rounded + projection white viewBox */
export function ipaHarborAppleLayerExportOptions(
  previewVariant: IconPreviewVariant,
): IpaHarborAppleLayerExportOptions {
  if (previewVariant === 'apple-touch-icon') {
    return {
      badgeRx: IPA_HARBOR_APPLE_TOUCH_BADGE_RX,
      viewBox: BOX_MARK_ONLY_VIEW_BOX,
    };
  }
  return {
    badgeRx: IPA_HARBOR_APP_BADGE_RX,
    viewBox: IPA_HARBOR_VIEW_BOX,
  };
}

export function generateIpaHarborAppleLayerSvg(
  layerId: IpaHarborAppleLayerId,
  _palette: ColorPalette,
  depthMode: DepthMode = 'tactile',
  layerExport: IpaHarborAppleLayerExportOptions = ipaHarborAppleLayerExportOptions('app-icon'),
): string {
  const { badgeRx, viewBox } = layerExport;

  switch (layerId) {
    case 'background': {
      const defs = badgeRx > 0 ? shadowFilter(depthMode) : '';
      const shadowAttr =
        badgeRx > 0 && depthMode === 'tactile' ? ' filter="url(#uuphy-squircle-shadow)"' : '';
      return svgDocument(
        badgeRect(IPA_HARBOR_BG_GRADIENT_BOTTOM, badgeRx, shadowAttr),
        defs,
        viewBox,
      );
    }
    case 'gradient': {
      const defs = squircleBgLightingDefsSvg();
      return svgDocument(
        `${badgeRect('url(#uuphy-ipa-harbor-bg)', badgeRx)}${badgeRect('url(#uuphy-ipa-harbor-gloss)', badgeRx)}`,
        defs,
        viewBox,
      );
    }
    case 'box-faces': {
      const defs = boxFacesLayerDefs();
      return svgDocument(boxFacesLayerSvg(), defs, viewBox);
    }
    case 'download-arrow': {
      const defs = boxArrowLayerDefs();
      return svgDocument(boxArrowLayerSvg(), defs, viewBox);
    }
    default: {
      const _exhaustive: never = layerId;
      return _exhaustive;
    }
  }
}

export function generateAllIpaHarborAppleLayers(
  palette: ColorPalette,
  depthMode: DepthMode = 'tactile',
  previewVariant: IconPreviewVariant = 'app-icon',
): { spec: IpaHarborAppleLayerSpec; svg: string }[] {
  const layerExport = ipaHarborAppleLayerExportOptions(previewVariant);
  return IPA_HARBOR_APPLE_LAYER_SPECS.map((spec) => ({
    spec,
    svg: generateIpaHarborAppleLayerSvg(spec.id, palette, depthMode, layerExport),
  }));
}

export function ipaHarborLayerDownloadName(fileName: string): string {
  return `ipa-harbor-${fileName}`;
}
