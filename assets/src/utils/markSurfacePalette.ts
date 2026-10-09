export type MarkSurfaceTheme = 'light' | 'dark';

export type MarkGradientStop = {
  offset: string;
  color: string;
  opacity?: number;
};

export type MarkStandalonePalette = {
  top: MarkGradientStop[];
  front: MarkGradientStop[];
  right: MarkGradientStop[];
  arrow: MarkGradientStop[];
};

export const markStandalonePalettes: Record<MarkSurfaceTheme, MarkStandalonePalette> = {
  light: {
    top: [
      { offset: '0%', color: '#CEE6FB' },
      { offset: '38%', color: '#A8D9F8' },
      { offset: '100%', color: '#8BBCF2' },
    ],
    front: [
      { offset: '0%', color: '#9FD4FA' },
      { offset: '45%', color: '#72C4F6' },
      { offset: '100%', color: '#58BEF5' },
    ],
    right: [
      { offset: '0%', color: '#58BEF5' },
      { offset: '100%', color: '#4F9EE8' },
    ],
    arrow: [
      { offset: '0%', color: '#FFFFFF', opacity: 1 },
      { offset: '100%', color: '#F0F7FF', opacity: 0.98 },
    ],
  },
  dark: {
    top: [
      { offset: '0%', color: '#E5F2FC' },
      { offset: '38%', color: '#C8E8FB' },
      { offset: '100%', color: '#A8D9F8' },
    ],
    front: [
      { offset: '0%', color: '#B8E2FC' },
      { offset: '45%', color: '#94D4FA' },
      { offset: '100%', color: '#72C4F6' },
    ],
    right: [
      { offset: '0%', color: '#72C4F6' },
      { offset: '100%', color: '#58BEF5' },
    ],
    arrow: [
      { offset: '0%', color: '#FFFFFF', opacity: 1 },
      { offset: '100%', color: '#F5FAFF', opacity: 0.96 },
    ],
  },
};

export function markGradientStopsSvg(stops: MarkGradientStop[]): string {
  return stops
    .map((s) => {
      const opacity =
        s.opacity != null ? ` stop-opacity="${s.opacity}"` : '';
      return `<stop offset="${s.offset}" stop-color="${s.color}"${opacity}/>`;
    })
    .join('\n      ');
}
