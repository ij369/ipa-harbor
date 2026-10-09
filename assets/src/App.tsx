import { useEffect, useRef, useState } from 'react';
import {
  X,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Grid,
  Sparkles,
} from 'lucide-react';
import { IpaHarborBadge } from './ipaHarborIcon';
import {
  DEFAULT_PALETTE,
  type ColorPalette,
  type DepthMode,
  type IconPreviewVariant,
  type MarkSurfaceTheme,
} from './types/icon';
import {
  generateAllIpaHarborAppleLayers,
  generateIpaHarborAppleTouchIconSvg,
  generateIpaHarborMarkPreviewSvg,
  generateIpaHarborSvg,
  ipaHarborLayerDownloadName,
} from './utils/ipaHarborSvg';
const BRAND = '#196efa';
const PNG_EXPORT_SOLID_BG = '#ffffff';
const PNG_EXPORT_SIZES = [32, 64, 128, 180, 512, 1024] as const;
const PNG_PREVIEW_MAX_DPR = 3;

function pngPreviewHiDpiRasterPx(exportPx: number): number {
  if (typeof window === 'undefined') return exportPx;
  const dpr = Math.min(window.devicePixelRatio || 1, PNG_PREVIEW_MAX_DPR);
  return Math.max(exportPx, Math.round(exportPx * dpr));
}

const PREVIEW_ICON_BASE_PX = 64;
const DEFAULT_PREVIEW_PX = 256;
const TOUCH_ICON_PREVIEW_PX = 180;

function defaultPngExportSize(previewVariant: IconPreviewVariant): number {
  switch (previewVariant) {
    case 'apple-touch-icon':
      return TOUCH_ICON_PREVIEW_PX;
    case 'mark-only':
      return 64;
    case 'app-icon':
      return 1024;
  }
}
const MAX_PREVIEW_PX = 512;
const DEFAULT_ZOOM = DEFAULT_PREVIEW_PX / PREVIEW_ICON_BASE_PX;
const TOUCH_ICON_DEFAULT_ZOOM = TOUCH_ICON_PREVIEW_PX / PREVIEW_ICON_BASE_PX;
const MAX_ZOOM = MAX_PREVIEW_PX / PREVIEW_ICON_BASE_PX;
const ZOOM_STEP = 0.5;

const MARK_PREVIEW_SIZES = [16, 32, 48, 64, 128, 256] as const;

const PREVIEW_VARIANT_DEFAULT_ZOOM: Record<IconPreviewVariant, number> = {
  'app-icon': DEFAULT_ZOOM,
  'apple-touch-icon': TOUCH_ICON_DEFAULT_ZOOM,
  'mark-only': DEFAULT_ZOOM,
};

function previewZoomForPixelSize(pixelSize: number): number {
  return pixelSize / PREVIEW_ICON_BASE_PX;
}

function markPreviewSizeIndex(pixelSize: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < MARK_PREVIEW_SIZES.length; i++) {
    const dist = Math.abs(MARK_PREVIEW_SIZES[i] - pixelSize);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function stepMarkPreviewPixelSize(pixelSize: number, direction: -1 | 1): number {
  const idx = markPreviewSizeIndex(pixelSize);
  const nextIdx = Math.min(MARK_PREVIEW_SIZES.length - 1, Math.max(0, idx + direction));
  return MARK_PREVIEW_SIZES[nextIdx];
}

function generatePreviewExportSvg(
  previewVariant: IconPreviewVariant,
  palette: ColorPalette,
  depthMode: DepthMode,
  markSurfaceTheme: MarkSurfaceTheme,
): string {
  switch (previewVariant) {
    case 'mark-only':
      return generateIpaHarborMarkPreviewSvg(palette, markSurfaceTheme);
    case 'apple-touch-icon':
      return generateIpaHarborAppleTouchIconSvg(palette);
    case 'app-icon':
      return generateIpaHarborSvg(palette, depthMode);
  }
}

function previewExportFileBaseName(
  previewVariant: IconPreviewVariant,
  markSurfaceTheme: MarkSurfaceTheme,
): string {
  switch (previewVariant) {
    case 'mark-only':
      return `ipa-harbor-${markSurfaceTheme}`;
    case 'apple-touch-icon':
      return 'ipa-harbor-apple-touch-icon';
    case 'app-icon':
      return 'ipa-harbor';
  }
}

type PreviewBg = 'navy' | 'light' | 'carbon' | 'grid';

const previewCanvasClass: Record<PreviewBg, string> = {
  light: 'bg-[#F6F6F7]',
  grid: 'bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] bg-[#090d16]',
  navy: 'bg-[#081226]',
  carbon: 'bg-[#030712]',
};

function downloadSvgFile(svg: string, fileName: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function rasterizeSvgToPngDataUrl(
  svg: string,
  exportSize: number,
  bg: 'transparent' | 'solid',
  options?: { renderPixelSize?: number },
): Promise<string | null> {
  return new Promise((resolve) => {
    const renderPx = Math.max(1, Math.round(options?.renderPixelSize ?? exportSize));
    const canvas = document.createElement('canvas');
    canvas.width = renderPx;
    canvas.height = renderPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (bg === 'solid') {
      ctx.fillStyle = PNG_EXPORT_SOLID_BG;
      ctx.fillRect(0, 0, renderPx, renderPx);
    }

    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, renderPx, renderPx);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

function ExportModal({
  onClose,
  palette,
  depthMode,
  previewVariant,
  markSurfaceTheme,
}: {
  onClose: () => void;
  palette: ColorPalette;
  depthMode: DepthMode;
  previewVariant: IconPreviewVariant;
  markSurfaceTheme: MarkSurfaceTheme;
}) {
  const [activeTab, setActiveTab] = useState<'svg' | 'apple' | 'png'>('svg');
  const [appleLayerPreview, setAppleLayerPreview] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pngSize, setPngSize] = useState(() => defaultPngExportSize(previewVariant));
  const [pngBg, setPngBg] = useState<'transparent' | 'solid'>('transparent');
  /** Bottom layer 1:1, right-click/open in new tab */
  const [pngPreviewExactUrl, setPngPreviewExactUrl] = useState<string | null>(null);
  /** Top layer Retina supersampling, pointer-events: none */
  const [pngPreviewSharpUrl, setPngPreviewSharpUrl] = useState<string | null>(null);
  const [pngPreviewBusy, setPngPreviewBusy] = useState(false);

  useEffect(() => {
    setPngSize(defaultPngExportSize(previewVariant));
  }, [previewVariant]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'png') {
      setPngPreviewExactUrl(null);
      setPngPreviewSharpUrl(null);
      setPngPreviewBusy(false);
      return;
    }

    let cancelled = false;
    setPngPreviewBusy(true);
    setPngPreviewExactUrl(null);
    setPngPreviewSharpUrl(null);

    const svg = generatePreviewExportSvg(previewVariant, palette, depthMode, markSurfaceTheme);
    const hiDpiPx = pngPreviewHiDpiRasterPx(pngSize);
    const needSharpLayer = hiDpiPx > pngSize;

    void Promise.all([
      rasterizeSvgToPngDataUrl(svg, pngSize, pngBg),
      needSharpLayer
        ? rasterizeSvgToPngDataUrl(svg, pngSize, pngBg, { renderPixelSize: hiDpiPx })
        : Promise.resolve(null),
    ]).then(([exactUrl, sharpUrl]) => {
      if (cancelled) return;
      setPngPreviewExactUrl(exactUrl);
      setPngPreviewSharpUrl(sharpUrl);
      setPngPreviewBusy(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, previewVariant, palette, depthMode, markSurfaceTheme, pngSize, pngBg]);

  const rawSvgCode = generatePreviewExportSvg(previewVariant, palette, depthMode, markSurfaceTheme);
  const exportFileBase = previewExportFileBaseName(previewVariant, markSurfaceTheme);
  const appleLayers = generateAllIpaHarborAppleLayers(palette, depthMode, previewVariant);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    if (copyResetTimerRef.current !== null) {
      clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = setTimeout(() => {
      setCopied(null);
      copyResetTimerRef.current = null;
    }, 2000);
  };

  const handleDownloadPng = () => {
    const fileName = `${exportFileBase}-${pngSize}.png`;
    const downloadFromUrl = (dataUrl: string) => {
      const a = document.createElement('a');
      a.download = fileName;
      a.href = dataUrl;
      a.click();
    };
    if (pngPreviewExactUrl) {
      downloadFromUrl(pngPreviewExactUrl);
      return;
    }
    void rasterizeSvgToPngDataUrl(rawSvgCode, pngSize, pngBg).then((dataUrl) => {
      if (dataUrl) downloadFromUrl(dataUrl);
    });
  };

  const tabClass = (tab: typeof activeTab) =>
    `pb-2 border-b-2 text-xs font-medium cursor-pointer ${
      activeTab === tab ? 'text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40">
      <div
        className="relative w-full max-w-2xl ui-frame-lg-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-panel-lg flex flex-col max-h-[90vh] min-h-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 shrink-0">
            <h3 className="text-sm font-semibold text-zinc-900">Export · IPA Harbor</h3>
            <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-4 px-5 pt-2 border-b border-zinc-100">
          {(['svg', 'apple', 'png'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={tabClass(tab)}
              style={activeTab === tab ? { borderColor: BRAND } : undefined}
            >
              {tab === 'svg' ? 'SVG' : tab === 'apple' ? 'Layers' : 'PNG'}
            </button>
          ))}
          </div>

          <div className="p-5 overflow-y-auto flex-1 text-sm text-zinc-700">
          {activeTab === 'svg' && (
            <div className="space-y-3">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(rawSvgCode, 'svg')}
                  className="flex items-center gap-1 px-2.5 py-1 ui-r-md border border-zinc-200 bg-zinc-50 text-xs cursor-pointer hover:bg-zinc-100"
                >
                  {copied === 'svg' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => downloadSvgFile(rawSvgCode, `${exportFileBase}.svg`)}
                  className="flex items-center gap-1 px-2.5 py-1 ui-r-md text-xs text-white cursor-pointer"
                  style={{ backgroundColor: BRAND }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
              <pre className="p-3 ui-r-md bg-zinc-50 border border-zinc-200 text-[10px] text-zinc-600 overflow-x-auto max-h-64">
                {rawSvgCode}
              </pre>
            </div>
          )}

          {activeTab === 'apple' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {appleLayers.map(({ spec }, index) => (
                  <button
                    key={spec.id}
                    type="button"
                    onClick={() => setAppleLayerPreview(index)}
                    className={`px-2 py-1 ui-r-sm text-[11px] border cursor-pointer ${
                      appleLayerPreview === index
                        ? 'border-[#196efa] text-[#196efa] bg-[#196efa]/5'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {spec.title}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <div className="w-24 h-24 ui-r-md preview-bg-checker border border-zinc-200 p-2 shrink-0">
                  <img
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(appleLayers[appleLayerPreview]?.svg ?? '')}`}
                    alt=""
                    className="w-full h-full"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 items-start content-start">
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(appleLayers[appleLayerPreview]?.svg ?? '', `apple-${appleLayerPreview}`)
                    }
                    className="px-2 py-1 ui-r-md border border-zinc-200 bg-zinc-50 text-[11px] cursor-pointer hover:bg-zinc-100"
                  >
                    Copy layer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const layer = appleLayers[appleLayerPreview];
                      if (layer) downloadSvgFile(layer.svg, ipaHarborLayerDownloadName(layer.spec.fileName));
                    }}
                    className="px-2 py-1 ui-r-md text-[11px] text-white cursor-pointer"
                    style={{ backgroundColor: BRAND }}
                  >
                    Download layer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      for (const { spec, svg } of appleLayers) {
                        downloadSvgFile(svg, ipaHarborLayerDownloadName(spec.fileName));
                      }
                    }}
                    className="px-2 py-1 ui-r-md border border-zinc-200 text-[11px] cursor-pointer hover:bg-zinc-50"
                  >
                    Download all
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'png' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PNG_EXPORT_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPngSize(size)}
                    className={`px-3 py-1.5 ui-r-md border text-xs cursor-pointer ${
                      pngSize === size
                        ? 'border-[#196efa] text-[#196efa] bg-[#196efa]/5'
                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {size}px
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {(
                  [
                    ['transparent', 'Transparent'],
                    ['solid', 'Solid'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPngBg(value)}
                    className={`flex-1 py-2 ui-r-md border text-xs cursor-pointer ${
                      pngBg === value ? 'border-[#196efa] bg-[#196efa]/5 text-[#196efa]' : 'border-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col items-center gap-2 w-full">
                <div
                  className={`ui-r-md border border-zinc-200 w-full h-64 overflow-auto overscroll-contain ${
                    pngBg === 'transparent' ? 'preview-bg-checker' : 'bg-white'
                  }`}
                >
                  {/* w-max / h-max: large image expands scrollable area; min-*: small image centered in 256px viewport */}
                  <div className="box-border p-4 min-h-full min-w-full w-max h-max mx-auto grid place-items-center">
                    {pngPreviewBusy ? (
                      <span className="text-xs text-zinc-400">Rendering…</span>
                    ) : pngPreviewExactUrl ? (
                      <div
                        className="relative inline-block shrink-0 leading-none"
                        style={{ width: pngSize, height: pngSize }}
                      >
                        <img
                          src={pngPreviewExactUrl}
                          alt=""
                          width={pngSize}
                          height={pngSize}
                          className="relative z-0 block max-w-none max-h-none"
                          style={{ imageRendering: 'auto' }}
                        />
                        {pngPreviewSharpUrl ? (
                          <img
                            src={pngPreviewSharpUrl}
                            alt=""
                            width={pngSize}
                            height={pngSize}
                            aria-hidden
                            className="absolute left-0 top-0 z-10 block max-w-none max-h-none pointer-events-none"
                            style={{ imageRendering: 'auto' }}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">Cannot preview</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={pngPreviewBusy || !pngPreviewExactUrl}
                className="w-full flex items-center justify-center gap-2 py-2 ui-r-md text-white text-xs cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                style={{ backgroundColor: BRAND }}
              >
                <ImageIcon className="w-4 h-4" />
                Download PNG ({pngSize}×{pngSize}px)
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

const previewCardOrder: { variant: IconPreviewVariant; title: string }[] = [
  { variant: 'app-icon', title: 'App icon' },
  { variant: 'apple-touch-icon', title: 'Touch icon' },
  { variant: 'mark-only', title: 'Mark' },
];

const canvasBgOptions: { key: PreviewBg; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'grid', label: 'Grid' },
  { key: 'navy', label: 'Navy' },
  { key: 'carbon', label: 'Dark' },
];

function PreviewCard({
  title,
  previewVariant,
  depthMode,
  onToggleDepthMode,
  markSurfaceTheme,
  onMarkSurfaceTheme,
  zoomLevel,
  onZoomChange,
  showBlueprint,
  onToggleBlueprint,
  canvasBg,
  onCanvasBgChange,
  copied,
  onCopySvg,
  onExport,
}: {
  title: string;
  previewVariant: IconPreviewVariant;
  depthMode: DepthMode;
  onToggleDepthMode: () => void;
  markSurfaceTheme: MarkSurfaceTheme;
  onMarkSurfaceTheme: (theme: MarkSurfaceTheme) => void;
  zoomLevel: number;
  onZoomChange: (next: number) => void;
  showBlueprint: boolean;
  onToggleBlueprint: () => void;
  canvasBg: PreviewBg;
  onCanvasBgChange: (bg: PreviewBg) => void;
  copied: boolean;
  onCopySvg: () => void;
  onExport: () => void;
}) {
  const renderedPixelSize = Math.round(PREVIEW_ICON_BASE_PX * zoomLevel);
  const isMark = previewVariant === 'mark-only';
  const isApp = previewVariant === 'app-icon';
  const defaultZoom = PREVIEW_VARIANT_DEFAULT_ZOOM[previewVariant];
  const previewPixelSize = isMark
    ? MARK_PREVIEW_SIZES[markPreviewSizeIndex(renderedPixelSize)]
    : renderedPixelSize;

  const handleZoomOut = () => {
    if (isMark) {
      onZoomChange(previewZoomForPixelSize(stepMarkPreviewPixelSize(previewPixelSize, -1)));
      return;
    }
    onZoomChange(Math.max(1, zoomLevel - ZOOM_STEP));
  };

  const handleZoomIn = () => {
    if (isMark) {
      onZoomChange(previewZoomForPixelSize(stepMarkPreviewPixelSize(previewPixelSize, 1)));
      return;
    }
    onZoomChange(Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP));
  };

  const handleZoomReset = () => {
    onZoomChange(defaultZoom);
  };

  return (
    <div className="ui-frame-lg w-full min-w-0 flex flex-col">
      <div className="ui-panel-lg w-full flex flex-col flex-1 min-h-0">
        <div className="px-3 py-2.5 border-b border-zinc-100 bg-zinc-50/80">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-zinc-100 bg-zinc-50/50 text-xs text-zinc-600 w-full">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleBlueprint}
              className={`flex items-center gap-1 px-2 py-1 ui-btn-sm transition-colors cursor-pointer ${
                showBlueprint ? 'bg-[#196efa]/10 text-[#196efa]' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Guides</span>
            </button>
            {isApp ? (
              <button
                type="button"
                onClick={onToggleDepthMode}
                className={`flex items-center gap-1 px-2 py-1 ui-btn-sm transition-colors cursor-pointer ${
                  depthMode === 'tactile'
                    ? 'bg-[#196efa]/10 text-[#196efa]'
                    : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Shadow</span>
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {isMark ? (
              <div className="flex items-center gap-0.5 p-0.5 bg-zinc-100 ui-r-md">
                {(
                  [
                    ['light', 'Light UI'],
                    ['dark', 'Dark UI'],
                  ] as const
                ).map(([theme, label]) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => onMarkSurfaceTheme(theme)}
                    className={`px-2 py-0.5 ui-r-sm text-[10px] cursor-pointer transition-colors ${
                      markSurfaceTheme === theme
                        ? 'text-zinc-900 ui-surface-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-0.5 p-0.5 bg-zinc-100 ui-r-md">
              {canvasBgOptions.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onCanvasBgChange(key)}
                  className={`px-2 py-0.5 ui-r-sm text-[10px] cursor-pointer transition-colors ${
                    canvasBg === key ? 'text-zinc-900 ui-surface-sm' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`min-h-[220px] sm:min-h-[260px] flex items-center justify-center p-6 relative flex-1 ${previewCanvasClass[canvasBg]}`}
        >
          <IpaHarborBadge
            size={previewPixelSize}
            depthMode={depthMode}
            showBlueprint={showBlueprint}
            previewVariant={previewVariant}
            markSurfaceTheme={markSurfaceTheme}
          />
          <div className="absolute top-2 right-2 flex items-center gap-0.5 p-0.5 ui-surface-md">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={isMark && previewPixelSize <= MARK_PREVIEW_SIZES[0]}
              className="p-1 text-zinc-500 hover:text-zinc-900 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleZoomReset}
              className="px-1.5 text-[10px] font-mono text-zinc-600 cursor-pointer"
            >
              {previewPixelSize}px
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={isMark && previewPixelSize >= MARK_PREVIEW_SIZES[MARK_PREVIEW_SIZES.length - 1]}
              className="p-1 text-zinc-500 hover:text-zinc-900 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2.5 border-t border-zinc-100 bg-zinc-50/50 text-xs">
          <button
            type="button"
            onClick={onCopySvg}
            className="flex items-center gap-1 px-2.5 py-1.5 ui-r-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy SVG'}</span>
          </button>
          <button
            type="button"
            onClick={onExport}
            className="px-2.5 py-1.5 ui-r-md text-white font-medium cursor-pointer"
            style={{ backgroundColor: BRAND }}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

function initialZoomByVariant(): Record<IconPreviewVariant, number> {
  return { ...PREVIEW_VARIANT_DEFAULT_ZOOM };
}

function initialBlueprintByVariant(): Record<IconPreviewVariant, boolean> {
  return { 'app-icon': false, 'apple-touch-icon': false, 'mark-only': false };
}

export default function App() {
  const [depthMode, setDepthMode] = useState<DepthMode>('tactile');
  const [exportVariant, setExportVariant] = useState<IconPreviewVariant>('app-icon');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [zoomByVariant, setZoomByVariant] = useState(initialZoomByVariant);
  const [blueprintByVariant, setBlueprintByVariant] = useState(initialBlueprintByVariant);
  const [canvasBgApp, setCanvasBgApp] = useState<PreviewBg>('light');
  const [canvasBgTouch, setCanvasBgTouch] = useState<PreviewBg>('light');
  const [canvasBgMark, setCanvasBgMark] = useState<PreviewBg>('light');
  const [markSurfaceTheme, setMarkSurfaceTheme] = useState<MarkSurfaceTheme>('light');
  const [copiedVariant, setCopiedVariant] = useState<IconPreviewVariant | null>(null);

  const openExport = (variant: IconPreviewVariant) => {
    setExportVariant(variant);
    setIsExportOpen(true);
  };

  const selectMarkSurfaceTheme = (theme: MarkSurfaceTheme) => {
    setMarkSurfaceTheme(theme);
  };

  const handleCopySvg = (variant: IconPreviewVariant) => {
    const svg = generatePreviewExportSvg(variant, DEFAULT_PALETTE, depthMode, markSurfaceTheme);
    navigator.clipboard.writeText(svg);
    setCopiedVariant(variant);
    setTimeout(() => setCopiedVariant(null), 2000);
  };

  const canvasBgFor = (variant: IconPreviewVariant): PreviewBg => {
    if (variant === 'mark-only') return canvasBgMark;
    if (variant === 'apple-touch-icon') return canvasBgTouch;
    return canvasBgApp;
  };

  const setCanvasBgFor = (variant: IconPreviewVariant, bg: PreviewBg) => {
    if (variant === 'mark-only') setCanvasBgMark(bg);
    else if (variant === 'apple-touch-icon') setCanvasBgTouch(bg);
    else if (variant === 'app-icon') setCanvasBgApp(bg);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col selection:bg-[#196efa]/20 selection:text-zinc-900">
      <main className="flex-1">
        <section id="studio" className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-12">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-2">IPA Harbor</h1>
          <p className="text-sm text-zinc-500 mb-6">Icon previews</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            {previewCardOrder.map(({ variant, title }) => (
              <PreviewCard
                key={variant}
                title={title}
                previewVariant={variant}
                depthMode={depthMode}
                onToggleDepthMode={() => setDepthMode((m) => (m === 'tactile' ? 'flat' : 'tactile'))}
                markSurfaceTheme={markSurfaceTheme}
                onMarkSurfaceTheme={selectMarkSurfaceTheme}
                zoomLevel={zoomByVariant[variant]}
                onZoomChange={(next) => setZoomByVariant((z) => ({ ...z, [variant]: next }))}
                showBlueprint={blueprintByVariant[variant]}
                onToggleBlueprint={() =>
                  setBlueprintByVariant((b) => ({ ...b, [variant]: !b[variant] }))
                }
                canvasBg={canvasBgFor(variant)}
                onCanvasBgChange={(bg) => setCanvasBgFor(variant, bg)}
                copied={copiedVariant === variant}
                onCopySvg={() => handleCopySvg(variant)}
                onExport={() => openExport(variant)}
              />
            ))}
          </div>
        </section>
      </main>

      {isExportOpen ? (
        <ExportModal
          onClose={() => setIsExportOpen(false)}
          palette={DEFAULT_PALETTE}
          depthMode={depthMode}
          previewVariant={exportVariant}
          markSurfaceTheme={markSurfaceTheme}
        />
      ) : null}
    </div>
  );
}
