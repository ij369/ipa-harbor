import type { MarkSurfaceTheme } from '../utils/markSurfacePalette.js';

export type DepthMode = 'tactile' | 'flat';

export type IconPreviewVariant = 'app-icon' | 'apple-touch-icon' | 'mark-only';

export type { MarkSurfaceTheme };

export interface ColorPalette {
  id: string;
  name: string;
  primaryDeep: string;
  secondaryDeep: string;
  accentMuted: string;
  accentHighlight: string;
  badgeGradientTop: string;
  badgeGradientBottom: string;
  borderTop: string;
  borderMid: string;
  borderBottom: string;
  highlightEdge: string;
  subtleShadow: string;
  badgeBg: string;
  previewBg: string;
  shadowColor: string;
  wcagSource: string;
  wcagAnchorRatio: number;
  wcagHighlightRatio: number;
  wcagUiLabel: string;
}

export interface IconRenderOptions {
  size?: number;
  className?: string;
  depthMode?: DepthMode;
  palette?: ColorPalette;
  showBlueprint?: boolean;
  previewVariant?: IconPreviewVariant;
  markSurfaceTheme?: MarkSurfaceTheme;
}

export const DEFAULT_PALETTE: ColorPalette = {
  id: 'ipa-harbor',
  name: 'IPA Harbor',
  primaryDeep: '#196EFA',
  secondaryDeep: '#58BEF5',
  accentMuted: '#196EFA',
  accentHighlight: '#FFFFFF',
  badgeGradientTop: '#58BEF5',
  badgeGradientBottom: '#196EFA',
  borderTop: '#FFFFFF',
  borderMid: '#FFFFFF',
  borderBottom: '#FFFFFF',
  highlightEdge: 'rgba(255,255,255,0.5)',
  subtleShadow: 'rgba(25,110,250,0.4)',
  badgeBg: '#196EFA',
  previewBg: '#58BEF5',
  shadowColor: '#196EFA',
  wcagSource: '',
  wcagAnchorRatio: 0,
  wcagHighlightRatio: 0,
  wcagUiLabel: '',
};
