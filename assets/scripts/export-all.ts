import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Resvg, type ResvgRenderOptions } from '@resvg/resvg-js';
import toIco from 'to-ico';
import { DEFAULT_PALETTE } from '../src/types/icon.js';
import {
  generateIpaHarborAppIconHeroSvg,
  generateIpaHarborAppleTouchIconSvg,
  generateIpaHarborMarkPreviewSvg,
} from '../src/utils/ipaHarborSvg.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const docsPublic = resolve(repoRoot, 'docs/src/public');
const docsDesign = resolve(repoRoot, 'docs/design');
const clientPublic = resolve(repoRoot, 'client/public');

const designAppIconPngWidth = 800;

const faviconSizes = [16, 32, 48, 64, 128, 256] as const;
const appleTouchIconSize = 180;
/** Resvg supersampling factor; if >1, use ffmpeg area to downscale to appleTouchIconSize */
const appleTouchSupersample = 8;

/** Log export summary (relative to repo root) */
function logExportSummary(): void {
  const faviconSizesLabel = faviconSizes.join(', ');
  const lines = [
    '',
    'Assets exported successfully',
    '',
    `client/public/  `,
    `  logo-light.svg         App bar / <link rel="icon"> (Light Mode)`,
    `  logo-dark.svg          App bar / <link rel="icon"> (Dark Mode)`,
    `  favicon.ico            favicon icon (embedded ${faviconSizesLabel}px)`,
    `  apple-touch-icon.png   ${appleTouchIconSize}×${appleTouchIconSize} (manifest / iOS A2HS)`,
    '',
    `docs/src/public/  `,
    `  logo-app-icon.svg      Document homepage hero / App icon`,
    `  logo-light.svg         App bar / <link rel="icon"> (Light Mode)`,
    `  logo-dark.svg          App bar / <link rel="icon"> (Dark Mode)`,
    `  favicon.ico            favicon icon (embedded ${faviconSizesLabel}px)`,
    '',
    `docs/design/  `,
    `  logo-app-icon.png      ${designAppIconPngWidth}×${designAppIconPngWidth}, for og-en.pen to reference ./logo-app-icon.png`,
    '',
    'docs/design/og-en.pen',
    '  OG image needs to be manually exported >>> docs/src/public/og-en.png (1200×630)',
    '',
  ];
  console.log(lines.join('\n'));
}

/** SVG→PNG: fitTo to target width, same as SVG width/height; avoid large image first then scale */
const resvgCrispOptions: Pick<
  ResvgRenderOptions,
  'shapeRendering' | 'textRendering' | 'imageRendering' | 'font'
> = {
  shapeRendering: 2,
  textRendering: 2,
  imageRendering: 0,
  font: { loadSystemFonts: false },
};

function svgToPng(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, {
    ...resvgCrispOptions,
    fitTo: { mode: 'width', value: width },
  });
  return resvg.render().asPng();
}

/** Downscale by integer factor: area is less blurry around icon edges than lanczos */
function downscalePngArea(inputPng: Buffer, outputSize: number): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'ipa-harbor-touch-'));
  const inputPath = join(dir, 'in.png');
  const outputPath = join(dir, 'out.png');
  try {
    writeFileSync(inputPath, inputPng);
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-vf',
        `scale=${outputSize}:${outputSize}:flags=area`,
        '-pix_fmt',
        'rgba',
        '-compression_level',
        '9',
        '-update',
        '1',
        '-frames:v',
        '1',
        outputPath,
      ],
      { stdio: 'pipe' },
    );
    return readFileSync(outputPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function encodeAppleTouchIconPng(svgAtRenderSize: string, renderSize: number, outputSize: number): Buffer {
  const hiPng = svgToPng(svgAtRenderSize, renderSize);
  if (renderSize === outputSize) {
    return hiPng;
  }
  return downscalePngArea(hiPng, outputSize);
}

async function writeFaviconIco(markLightSvg: string): Promise<void> {
  const pngBuffers = faviconSizes.map((size) => svgToPng(markLightSvg, size));
  const ico = await toIco(pngBuffers);
  writeFileSync(resolve(docsPublic, 'favicon.ico'), ico);
  writeFileSync(resolve(clientPublic, 'favicon.ico'), ico);
}

const appIconSvg = generateIpaHarborAppIconHeroSvg(DEFAULT_PALETTE);
const appleTouchRenderSize = appleTouchIconSize * appleTouchSupersample;
const appleTouchIconSvg = generateIpaHarborAppleTouchIconSvg(DEFAULT_PALETTE, appleTouchRenderSize);
const markLightSvg = generateIpaHarborMarkPreviewSvg(DEFAULT_PALETTE, 'light');
const markDarkSvg = generateIpaHarborMarkPreviewSvg(DEFAULT_PALETTE, 'dark');

mkdirSync(docsDesign, { recursive: true });
writeFileSync(resolve(docsPublic, 'logo-app-icon.svg'), appIconSvg);
writeFileSync(
  resolve(docsDesign, 'logo-app-icon.png'),
  svgToPng(appIconSvg, designAppIconPngWidth),
);
writeFileSync(resolve(docsPublic, 'logo-light.svg'), markLightSvg);
writeFileSync(resolve(docsPublic, 'logo-dark.svg'), markDarkSvg);
writeFileSync(resolve(clientPublic, 'logo-light.svg'), markLightSvg);
writeFileSync(resolve(clientPublic, 'logo-dark.svg'), markDarkSvg);

await writeFaviconIco(markLightSvg);

writeFileSync(
  resolve(clientPublic, 'apple-touch-icon.png'),
  encodeAppleTouchIconPng(appleTouchIconSvg, appleTouchRenderSize, appleTouchIconSize),
);

logExportSummary();
