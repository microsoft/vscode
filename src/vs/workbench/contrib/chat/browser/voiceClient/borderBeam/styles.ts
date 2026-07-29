/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Vendored from border-beam by Jakub Antalik (MIT). See LICENSE.txt in this
// folder. Kept close to source so the effect stays faithful; applied to the DOM
// by borderBeamElement.ts (replacing the original React component).

// @ts-nocheck -- vendored from border-beam (MIT); kept close to source, not restyled to strict types.
import type { SizeConfig, ThemeColors, BorderBeamColorVariant, BorderBeamSize } from './types.js';

/**
 * Size presets for border radius and dimensions
 */
export const sizePresets: Record<BorderBeamSize, SizeConfig> = {
  sm: {
    borderRadius: 32,
    borderWidth: 1,
    width: 70,
    height: 36,
  },
  md: {
    borderRadius: 16,
    borderWidth: 1,
  },
  line: {
    borderRadius: 16,
    borderWidth: 1,
  },
  'pulse-outside': {
    borderRadius: 16,
    borderWidth: 1,
  },
  'pulse-inner': {
    borderRadius: 16,
    borderWidth: 1,
  },
};

/**
 * Per-size theme presets matching the tuned v5 control panel defaults
 */
export const sizeThemePresets: Record<BorderBeamSize, Record<'dark' | 'light', ThemeColors>> = {
  sm: {
    dark: {
      strokeOpacity: 0.46,
      innerOpacity: 0.24,
      bloomOpacity: 0.38,
      innerShadow: 'rgba(255, 255, 255, 0.3)',
      saturation: 1.2,
    },
    light: {
      strokeOpacity: 0.12,
      innerOpacity: 0.3,
      bloomOpacity: 0.16,
      innerShadow: 'rgba(0, 0, 0, 0.14)',
      saturation: 1.8,
    },
  },
  md: {
    dark: {
      strokeOpacity: 0.26,
      innerOpacity: 0.42,
      bloomOpacity: 0.24,
      innerShadow: 'rgba(255, 255, 255, 0.27)',
      saturation: 1.2,
    },
    light: {
      strokeOpacity: 0.12,
      innerOpacity: 0.26,
      bloomOpacity: 0.34,
      innerShadow: 'rgba(0, 0, 0, 0.14)',
      saturation: 1.5,
    },
  },
  line: {
    dark: {
      strokeOpacity: 1.14,
      innerOpacity: 0.7,
      bloomOpacity: 0.8,
      innerShadow: 'rgba(255, 255, 255, 0.1)',
      saturation: 1.2,
    },
    light: {
      strokeOpacity: 0.16,
      innerOpacity: 0.32,
      bloomOpacity: 0.3,
      innerShadow: 'rgba(0, 0, 0, 0.14)',
      saturation: 1.95,
    },
  },
  // Pulse Outside — outward-blooming breathe (ported from v5 "Breathe Outside Uncropped" / c6)
  'pulse-outside': {
    dark: {
      strokeOpacity: 0.94,
      innerOpacity: 0.34,
      bloomOpacity: 0.3,
      innerShadow: 'transparent',
      saturation: 1.2,
      brightness: 1.9,
      // v5 Card 5 frames the card with a single 1px hairline (its box-shadow at
      // 0.3). Wrapped components here already supply their own ~equivalent 1px
      // border, so the beam must NOT add a second hairline on top or the edge
      // reads brighter than v5. Kept at 0 to match v5's single-hairline look.
      hairlineOpacity: 0,
    },
    light: {
      strokeOpacity: 1.96,
      innerOpacity: 1.04,
      bloomOpacity: 0.42,
      innerShadow: 'transparent',
      saturation: 0.6,
      brightness: 1.7,
      hairlineOpacity: 0,
    },
  },
  // Pulse Inner — contained breathe (ported from v5 "Breathe" / c4)
  'pulse-inner': {
    dark: {
      strokeOpacity: 1.54,
      innerOpacity: 0.44,
      bloomOpacity: 0.66,
      innerShadow: 'transparent',
      saturation: 1.2,
      brightness: 0.75,
    },
    light: {
      strokeOpacity: 0.32,
      innerOpacity: 0.4,
      bloomOpacity: 0.8,
      innerShadow: 'transparent',
      saturation: 0.75,
      brightness: 1.3,
    },
  },
};

/**
 * @deprecated Use `sizeThemePresets` for per-size theme values.
 * Retained for backward compatibility — maps to `md` size presets.
 */
export const themeColors: Record<'dark' | 'light', ThemeColors> = {
  dark: { ...sizeThemePresets.md.dark },
  light: { ...sizeThemePresets.md.light },
};

/**
 * Color palettes for each color variant
 */
export const colorPalettes = {
  colorful: {
    border: [
      { color: 'rgb(255, 50, 100)', pos: '33% -7.4%', size: '70px 40px' },
      { color: 'rgb(40, 140, 255)', pos: '12% -5%', size: '60px 35px' },
      { color: 'rgb(50, 200, 80)', pos: '2.1% 68.3%', size: '40px 70px' },
      { color: 'rgb(30, 185, 170)', pos: '2.1% 68.3%', size: '20px 35px' },
      { color: 'rgb(100, 70, 255)', pos: '74.4% 100%', size: '180px 32px' },
      { color: 'rgb(40, 140, 255)', pos: '55% 100%', size: '85px 26px' },
      { color: 'rgb(255, 120, 40)', pos: '93.9% 0%', size: '74px 32px' },
      { color: 'rgb(240, 50, 180)', pos: '100% 27.1%', size: '26px 42px' },
      { color: 'rgb(180, 40, 240)', pos: '100% 27.1%', size: '52px 48px' },
    ],
    spike: { primary: 'rgb(255, 60, 80)', secondary: 'rgba(40, 190, 180, 0.98)' },
    spikeLt: { primary: 'rgb(200, 30, 60)', secondary: 'rgb(20, 150, 140)' },
  },
  mono: {
    border: [
      { color: 'rgb(180, 180, 180)', pos: '33% -7.4%', size: '70px 40px' },
      { color: 'rgb(140, 140, 140)', pos: '12% -5%', size: '60px 35px' },
      { color: 'rgb(160, 160, 160)', pos: '2.1% 68.3%', size: '40px 70px' },
      { color: 'rgb(130, 130, 130)', pos: '2.1% 68.3%', size: '20px 35px' },
      { color: 'rgb(170, 170, 170)', pos: '74.4% 100%', size: '180px 32px' },
      { color: 'rgb(150, 150, 150)', pos: '55% 100%', size: '85px 26px' },
      { color: 'rgb(190, 190, 190)', pos: '93.9% 0%', size: '74px 32px' },
      { color: 'rgb(145, 145, 145)', pos: '100% 27.1%', size: '26px 42px' },
      { color: 'rgb(165, 165, 165)', pos: '100% 27.1%', size: '52px 48px' },
    ],
    spike: { primary: 'rgb(200, 200, 200)', secondary: 'rgb(170, 170, 170)' },
    spikeLt: { primary: 'rgb(80, 80, 80)', secondary: 'rgb(120, 120, 120)' },
  },
  ocean: {
    border: [
      { color: 'rgb(100, 80, 220)', pos: '33% -7.4%', size: '70px 40px' },
      { color: 'rgb(60, 120, 255)', pos: '12% -5%', size: '60px 35px' },
      { color: 'rgb(80, 100, 200)', pos: '2.1% 68.3%', size: '40px 70px' },
      { color: 'rgb(50, 140, 220)', pos: '2.1% 68.3%', size: '20px 35px' },
      { color: 'rgb(120, 80, 255)', pos: '74.4% 100%', size: '180px 32px' },
      { color: 'rgb(70, 130, 255)', pos: '55% 100%', size: '85px 26px' },
      { color: 'rgb(140, 100, 240)', pos: '93.9% 0%', size: '74px 32px' },
      { color: 'rgb(90, 110, 230)', pos: '100% 27.1%', size: '26px 42px' },
      { color: 'rgb(130, 70, 255)', pos: '100% 27.1%', size: '52px 48px' },
    ],
    spike: { primary: 'rgb(100, 120, 255)', secondary: 'rgba(130, 100, 220, 0.98)' },
    spikeLt: { primary: 'rgb(60, 60, 180)', secondary: 'rgb(80, 100, 200)' },
  },
  sunset: {
    border: [
      { color: 'rgb(255, 80, 50)', pos: '33% -7.4%', size: '70px 40px' },
      { color: 'rgb(255, 160, 40)', pos: '12% -5%', size: '60px 35px' },
      { color: 'rgb(255, 120, 60)', pos: '2.1% 68.3%', size: '40px 70px' },
      { color: 'rgb(255, 200, 50)', pos: '2.1% 68.3%', size: '20px 35px' },
      { color: 'rgb(255, 100, 80)', pos: '74.4% 100%', size: '180px 32px' },
      { color: 'rgb(255, 180, 60)', pos: '55% 100%', size: '85px 26px' },
      { color: 'rgb(255, 60, 60)', pos: '93.9% 0%', size: '74px 32px' },
      { color: 'rgb(255, 140, 50)', pos: '100% 27.1%', size: '26px 42px' },
      { color: 'rgb(255, 90, 70)', pos: '100% 27.1%', size: '52px 48px' },
    ],
    spike: { primary: 'rgb(255, 140, 80)', secondary: 'rgba(255, 100, 60, 0.98)' },
    spikeLt: { primary: 'rgb(200, 80, 40)', secondary: 'rgb(220, 120, 30)' },
  },
};

/**
 * Small size color palettes (compact gradients for button-sized elements)
 */
export const smallColorPalettes = {
  colorful: {
    border: [
      { color: 'rgb(50, 200, 80)', pos: '2% 68%', size: '9px 18px' },
      { color: 'rgb(30, 185, 170)', pos: '2% 68%', size: '4px 8px' },
      { color: 'rgb(255, 120, 40)', pos: '72% -3%', size: '59px 9px' },
      { color: 'rgb(100, 70, 255)', pos: '74% 100%', size: '42px 7px' },
      { color: 'rgb(240, 50, 180)', pos: '100% 27%', size: '10px 17px' },
      { color: 'rgb(180, 40, 240)', pos: '100% 27%', size: '10px 18px' },
      { color: 'rgb(40, 140, 255)', pos: '100% 27%', size: '5px 10px' },
      { color: 'rgb(255, 50, 100)', pos: '100% 27%', size: '11px 12px' },
    ],
    inner: [
      { color: 'rgba(50, 200, 80, 0.5)', pos: '2% 68%', size: '9px 18px' },
      { color: 'rgba(30, 185, 170, 0.45)', pos: '2% 68%', size: '4px 8px' },
      { color: 'rgba(255, 120, 40, 0.35)', pos: '72% -3%', size: '59px 9px' },
      { color: 'rgba(100, 70, 255, 0.35)', pos: '74% 100%', size: '42px 7px' },
      { color: 'rgba(240, 50, 180, 0.3)', pos: '100% 27%', size: '10px 17px' },
      { color: 'rgba(180, 40, 240, 0.4)', pos: '100% 27%', size: '10px 18px' },
      { color: 'rgba(40, 140, 255, 0.3)', pos: '100% 27%', size: '5px 10px' },
      { color: 'rgba(255, 50, 100, 0.3)', pos: '100% 27%', size: '11px 12px' },
    ],
  },
  mono: {
    border: [
      { color: 'rgb(160, 160, 160)', pos: '2% 68%', size: '9px 18px' },
      { color: 'rgb(140, 140, 140)', pos: '2% 68%', size: '4px 8px' },
      { color: 'rgb(180, 180, 180)', pos: '72% -3%', size: '59px 9px' },
      { color: 'rgb(150, 150, 150)', pos: '74% 100%', size: '42px 7px' },
      { color: 'rgb(170, 170, 170)', pos: '100% 27%', size: '10px 17px' },
      { color: 'rgb(155, 155, 155)', pos: '100% 27%', size: '10px 18px' },
      { color: 'rgb(145, 145, 145)', pos: '100% 27%', size: '5px 10px' },
      { color: 'rgb(165, 165, 165)', pos: '100% 27%', size: '11px 12px' },
    ],
    inner: [
      { color: 'rgba(160, 160, 160, 0.25)', pos: '2% 68%', size: '9px 18px' },
      { color: 'rgba(140, 140, 140, 0.22)', pos: '2% 68%', size: '4px 8px' },
      { color: 'rgba(180, 180, 180, 0.17)', pos: '72% -3%', size: '59px 9px' },
      { color: 'rgba(150, 150, 150, 0.17)', pos: '74% 100%', size: '42px 7px' },
      { color: 'rgba(170, 170, 170, 0.15)', pos: '100% 27%', size: '10px 17px' },
      { color: 'rgba(155, 155, 155, 0.20)', pos: '100% 27%', size: '10px 18px' },
      { color: 'rgba(145, 145, 145, 0.15)', pos: '100% 27%', size: '5px 10px' },
      { color: 'rgba(165, 165, 165, 0.15)', pos: '100% 27%', size: '11px 12px' },
    ],
  },
  ocean: {
    border: [
      { color: 'rgb(60, 140, 200)', pos: '2% 68%', size: '9px 18px' },
      { color: 'rgb(50, 120, 180)', pos: '2% 68%', size: '4px 8px' },
      { color: 'rgb(100, 80, 220)', pos: '72% -3%', size: '59px 9px' },
      { color: 'rgb(80, 100, 255)', pos: '74% 100%', size: '42px 7px' },
      { color: 'rgb(120, 70, 240)', pos: '100% 27%', size: '10px 17px' },
      { color: 'rgb(90, 80, 220)', pos: '100% 27%', size: '10px 18px' },
      { color: 'rgb(70, 110, 255)', pos: '100% 27%', size: '5px 10px' },
      { color: 'rgb(110, 90, 230)', pos: '100% 27%', size: '11px 12px' },
    ],
    inner: [
      { color: 'rgba(60, 140, 200, 0.5)', pos: '2% 68%', size: '9px 18px' },
      { color: 'rgba(50, 120, 180, 0.45)', pos: '2% 68%', size: '4px 8px' },
      { color: 'rgba(100, 80, 220, 0.35)', pos: '72% -3%', size: '59px 9px' },
      { color: 'rgba(80, 100, 255, 0.35)', pos: '74% 100%', size: '42px 7px' },
      { color: 'rgba(120, 70, 240, 0.3)', pos: '100% 27%', size: '10px 17px' },
      { color: 'rgba(90, 80, 220, 0.4)', pos: '100% 27%', size: '10px 18px' },
      { color: 'rgba(70, 110, 255, 0.3)', pos: '100% 27%', size: '5px 10px' },
      { color: 'rgba(110, 90, 230, 0.3)', pos: '100% 27%', size: '11px 12px' },
    ],
  },
  sunset: {
    border: [
      { color: 'rgb(255, 180, 50)', pos: '2% 68%', size: '9px 18px' },
      { color: 'rgb(255, 150, 40)', pos: '2% 68%', size: '4px 8px' },
      { color: 'rgb(255, 80, 60)', pos: '72% -3%', size: '59px 9px' },
      { color: 'rgb(255, 100, 80)', pos: '74% 100%', size: '42px 7px' },
      { color: 'rgb(255, 60, 80)', pos: '100% 27%', size: '10px 17px' },
      { color: 'rgb(255, 120, 60)', pos: '100% 27%', size: '10px 18px' },
      { color: 'rgb(255, 200, 50)', pos: '100% 27%', size: '5px 10px' },
      { color: 'rgb(255, 90, 70)', pos: '100% 27%', size: '11px 12px' },
    ],
    inner: [
      { color: 'rgba(255, 180, 50, 0.5)', pos: '2% 68%', size: '9px 18px' },
      { color: 'rgba(255, 150, 40, 0.45)', pos: '2% 68%', size: '4px 8px' },
      { color: 'rgba(255, 80, 60, 0.35)', pos: '72% -3%', size: '59px 9px' },
      { color: 'rgba(255, 100, 80, 0.35)', pos: '74% 100%', size: '42px 7px' },
      { color: 'rgba(255, 60, 80, 0.3)', pos: '100% 27%', size: '10px 17px' },
      { color: 'rgba(255, 120, 60, 0.4)', pos: '100% 27%', size: '10px 18px' },
      { color: 'rgba(255, 200, 50, 0.3)', pos: '100% 27%', size: '5px 10px' },
      { color: 'rgba(255, 90, 70, 0.3)', pos: '100% 27%', size: '11px 12px' },
    ],
  },
};

function getSmallColorGradients(colorVariant: BorderBeamColorVariant): string {
  const palette = smallColorPalettes[colorVariant];
  return palette.border
    .map(c => `radial-gradient(ellipse ${c.size} at ${c.pos}, ${c.color}, transparent)`)
    .join(',\n    ');
}

function getSmallInnerGradients(colorVariant: BorderBeamColorVariant): string {
  const palette = smallColorPalettes[colorVariant];
  return palette.inner
    .map(c => `radial-gradient(ellipse ${c.size} at ${c.pos}, ${c.color}, transparent)`)
    .join(',\n    ');
}

function getColorGradients(colorVariant: BorderBeamColorVariant): string {
  const palette = colorPalettes[colorVariant];
  return palette.border
    .map(c => `radial-gradient(ellipse ${c.size} at ${c.pos}, ${c.color}, transparent)`)
    .join(',\n    ');
}

function getInnerGradients(colorVariant: BorderBeamColorVariant): string {
  const palette = colorPalettes[colorVariant];
  // Mono variant gets 50% lower opacity
  const baseOpacity = colorVariant === 'mono' ? 0.225 : 0.45;
  return palette.border
    .map(c => {
      const rgba = c.color.replace('rgb(', 'rgba(').replace(')', `, ${baseOpacity})`);
      const smallerSize = c.size.split(' ').map(s => {
        const val = parseInt(s);
        return `${Math.round(val * 0.9)}px`;
      }).join(' ');
      return `radial-gradient(ellipse ${smallerSize} at ${c.pos}, ${rgba}, transparent)`;
    })
    .join(',\n    ');
}

function getSpikeColors(colorVariant: BorderBeamColorVariant, isDark: boolean) {
  const palette = colorPalettes[colorVariant];
  return isDark ? palette.spike : palette.spikeLt;
}

export const lineColorPalettes = {
  colorful: {
    dark: [
      { color: 'rgb(255, 50, 100)', sizeW: 36, sizeH: 36, offsetX: 0, offsetY: 2 },
      { color: 'rgb(40, 180, 220)', sizeW: 30, sizeH: 32, offsetX: 39, offsetY: 0 },
      { color: 'rgb(50, 200, 80)', sizeW: 33, sizeH: 28, offsetX: -36, offsetY: 2 },
      { color: 'rgb(180, 40, 240)', sizeW: 29, sizeH: 34, offsetX: -54, offsetY: 0 },
      { color: 'rgb(255, 160, 30)', sizeW: 27, sizeH: 30, offsetX: 51, offsetY: -1 },
      { color: 'rgb(100, 70, 255)', sizeW: 36, sizeH: 24, offsetX: 21, offsetY: 1 },
      { color: 'rgb(40, 140, 255)', sizeW: 30, sizeH: 22, offsetX: -21, offsetY: 0 },
      { color: 'rgb(240, 50, 180)', sizeW: 25, sizeH: 28, offsetX: 66, offsetY: 1 },
      { color: 'rgb(30, 185, 170)', sizeW: 23, sizeH: 30, offsetX: -66, offsetY: -1 },
    ],
    light: [
      { color: 'rgb(255, 50, 100)', sizeW: 45, sizeH: 36, offsetX: 0, offsetY: 2 },
      { color: 'rgb(40, 140, 255)', sizeW: 35, sizeH: 32, offsetX: 65, offsetY: 0 },
      { color: 'rgb(50, 200, 80)', sizeW: 40, sizeH: 28, offsetX: -60, offsetY: 2 },
      { color: 'rgb(180, 40, 240)', sizeW: 35, sizeH: 34, offsetX: -90, offsetY: 0 },
      { color: 'rgb(30, 185, 170)', sizeW: 38, sizeH: 30, offsetX: 85, offsetY: -1 },
      { color: 'rgb(100, 70, 255)', sizeW: 50, sizeH: 24, offsetX: 35, offsetY: 1 },
      { color: 'rgb(40, 140, 255)', sizeW: 40, sizeH: 22, offsetX: -35, offsetY: 0 },
      { color: 'rgb(255, 120, 40)', sizeW: 35, sizeH: 28, offsetX: 110, offsetY: 1 },
      { color: 'rgb(240, 50, 180)', sizeW: 30, sizeH: 30, offsetX: -110, offsetY: -1 },
    ],
  },
  mono: {
    dark: [
      { color: 'rgb(200, 200, 200)', sizeW: 36, sizeH: 36, offsetX: 0, offsetY: 2 },
      { color: 'rgb(170, 170, 170)', sizeW: 30, sizeH: 32, offsetX: 39, offsetY: 0 },
      { color: 'rgb(155, 155, 155)', sizeW: 33, sizeH: 28, offsetX: -36, offsetY: 2 },
      { color: 'rgb(185, 185, 185)', sizeW: 29, sizeH: 34, offsetX: -54, offsetY: 0 },
      { color: 'rgb(165, 165, 165)', sizeW: 27, sizeH: 30, offsetX: 51, offsetY: -1 },
      { color: 'rgb(180, 180, 180)', sizeW: 36, sizeH: 24, offsetX: 21, offsetY: 1 },
      { color: 'rgb(160, 160, 160)', sizeW: 30, sizeH: 22, offsetX: -21, offsetY: 0 },
      { color: 'rgb(175, 175, 175)', sizeW: 25, sizeH: 28, offsetX: 66, offsetY: 1 },
      { color: 'rgb(190, 190, 190)', sizeW: 23, sizeH: 30, offsetX: -66, offsetY: -1 },
    ],
    light: [
      { color: 'rgb(100, 100, 100)', sizeW: 45, sizeH: 36, offsetX: 0, offsetY: 2 },
      { color: 'rgb(80, 80, 80)', sizeW: 35, sizeH: 32, offsetX: 65, offsetY: 0 },
      { color: 'rgb(90, 90, 90)', sizeW: 40, sizeH: 28, offsetX: -60, offsetY: 2 },
      { color: 'rgb(70, 70, 70)', sizeW: 35, sizeH: 34, offsetX: -90, offsetY: 0 },
      { color: 'rgb(85, 85, 85)', sizeW: 38, sizeH: 30, offsetX: 85, offsetY: -1 },
      { color: 'rgb(95, 95, 95)', sizeW: 50, sizeH: 24, offsetX: 35, offsetY: 1 },
      { color: 'rgb(75, 75, 75)', sizeW: 40, sizeH: 22, offsetX: -35, offsetY: 0 },
      { color: 'rgb(105, 105, 105)', sizeW: 35, sizeH: 28, offsetX: 110, offsetY: 1 },
      { color: 'rgb(65, 65, 65)', sizeW: 30, sizeH: 30, offsetX: -110, offsetY: -1 },
    ],
  },
  ocean: {
    dark: [
      { color: 'rgb(100, 80, 220)', sizeW: 36, sizeH: 36, offsetX: 0, offsetY: 2 },
      { color: 'rgb(60, 120, 255)', sizeW: 30, sizeH: 32, offsetX: 39, offsetY: 0 },
      { color: 'rgb(80, 100, 200)', sizeW: 33, sizeH: 28, offsetX: -36, offsetY: 2 },
      { color: 'rgb(130, 70, 255)', sizeW: 29, sizeH: 34, offsetX: -54, offsetY: 0 },
      { color: 'rgb(70, 130, 255)', sizeW: 27, sizeH: 30, offsetX: 51, offsetY: -1 },
      { color: 'rgb(120, 80, 255)', sizeW: 36, sizeH: 24, offsetX: 21, offsetY: 1 },
      { color: 'rgb(90, 110, 230)', sizeW: 30, sizeH: 22, offsetX: -21, offsetY: 0 },
      { color: 'rgb(110, 90, 240)', sizeW: 25, sizeH: 28, offsetX: 66, offsetY: 1 },
      { color: 'rgb(140, 100, 255)', sizeW: 23, sizeH: 30, offsetX: -66, offsetY: -1 },
    ],
    light: [
      { color: 'rgb(80, 60, 200)', sizeW: 45, sizeH: 36, offsetX: 0, offsetY: 2 },
      { color: 'rgb(50, 100, 220)', sizeW: 35, sizeH: 32, offsetX: 65, offsetY: 0 },
      { color: 'rgb(70, 90, 190)', sizeW: 40, sizeH: 28, offsetX: -60, offsetY: 2 },
      { color: 'rgb(110, 60, 220)', sizeW: 35, sizeH: 34, offsetX: -90, offsetY: 0 },
      { color: 'rgb(60, 110, 230)', sizeW: 38, sizeH: 30, offsetX: 85, offsetY: -1 },
      { color: 'rgb(100, 70, 240)', sizeW: 50, sizeH: 24, offsetX: 35, offsetY: 1 },
      { color: 'rgb(80, 100, 210)', sizeW: 40, sizeH: 22, offsetX: -35, offsetY: 0 },
      { color: 'rgb(90, 80, 225)', sizeW: 35, sizeH: 28, offsetX: 110, offsetY: 1 },
      { color: 'rgb(120, 90, 245)', sizeW: 30, sizeH: 30, offsetX: -110, offsetY: -1 },
    ],
  },
  sunset: {
    dark: [
      { color: 'rgb(255, 100, 60)', sizeW: 36, sizeH: 36, offsetX: 0, offsetY: 2 },
      { color: 'rgb(255, 180, 50)', sizeW: 30, sizeH: 32, offsetX: 39, offsetY: 0 },
      { color: 'rgb(255, 140, 70)', sizeW: 33, sizeH: 28, offsetX: -36, offsetY: 2 },
      { color: 'rgb(255, 80, 80)', sizeW: 29, sizeH: 34, offsetX: -54, offsetY: 0 },
      { color: 'rgb(255, 200, 60)', sizeW: 27, sizeH: 30, offsetX: 51, offsetY: -1 },
      { color: 'rgb(255, 120, 50)', sizeW: 36, sizeH: 24, offsetX: 21, offsetY: 1 },
      { color: 'rgb(255, 160, 80)', sizeW: 30, sizeH: 22, offsetX: -21, offsetY: 0 },
      { color: 'rgb(255, 90, 60)', sizeW: 25, sizeH: 28, offsetX: 66, offsetY: 1 },
      { color: 'rgb(255, 70, 70)', sizeW: 23, sizeH: 30, offsetX: -66, offsetY: -1 },
    ],
    light: [
      { color: 'rgb(220, 80, 40)', sizeW: 45, sizeH: 36, offsetX: 0, offsetY: 2 },
      { color: 'rgb(230, 150, 30)', sizeW: 35, sizeH: 32, offsetX: 65, offsetY: 0 },
      { color: 'rgb(210, 110, 50)', sizeW: 40, sizeH: 28, offsetX: -60, offsetY: 2 },
      { color: 'rgb(200, 60, 60)', sizeW: 35, sizeH: 34, offsetX: -90, offsetY: 0 },
      { color: 'rgb(220, 170, 40)', sizeW: 38, sizeH: 30, offsetX: 85, offsetY: -1 },
      { color: 'rgb(210, 100, 30)', sizeW: 50, sizeH: 24, offsetX: 35, offsetY: 1 },
      { color: 'rgb(230, 130, 60)', sizeW: 40, sizeH: 22, offsetX: -35, offsetY: 0 },
      { color: 'rgb(190, 70, 50)', sizeW: 35, sizeH: 28, offsetX: 110, offsetY: 1 },
      { color: 'rgb(180, 50, 50)', sizeW: 30, sizeH: 30, offsetX: -110, offsetY: -1 },
    ],
  },
};

function getLineColorGradients(colorVariant: BorderBeamColorVariant, isDark: boolean, id: string): string {
  const palette = lineColorPalettes[colorVariant][isDark ? 'dark' : 'light'];
  return palette
    .map(c => {
      const offsetXStr = c.offsetX === 0 ? '' : (c.offsetX > 0 ? ` + ${c.offsetX}px` : ` - ${Math.abs(c.offsetX)}px`);
      const offsetYStr = c.offsetY === 0 ? '' : (c.offsetY > 0 ? ` + ${c.offsetY}px` : ` - ${Math.abs(c.offsetY)}px`);
      return `radial-gradient(ellipse calc(${c.sizeW}px * var(--beam-w-${id})) calc(${c.sizeH}px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%${offsetXStr}) calc(100%${offsetYStr}), ${c.color}, transparent)`;
    })
    .join(',\n       ');
}

// Inner gradient data matching v5.css exactly
export const lineInnerGradientData = {
  colorful: [
    { color: 'rgba(255, 50, 100, 0.48)', sizeW: 33, sizeH: 30, offsetX: 0, offsetY: 0 },
    { color: 'rgba(40, 180, 220, 0.42)', sizeW: 24, sizeH: 26, offsetX: 39, offsetY: -3 },
    { color: 'rgba(50, 200, 80, 0.48)', sizeW: 27, sizeH: 24, offsetX: -36, offsetY: 0 },
    { color: 'rgba(180, 40, 240, 0.42)', sizeW: 23, sizeH: 28, offsetX: -54, offsetY: -2 },
    { color: 'rgba(255, 160, 30, 0.50)', sizeW: 24, sizeH: 24, offsetX: 51, offsetY: -1 },
    { color: 'rgba(100, 70, 255, 0.45)', sizeW: 30, sizeH: 20, offsetX: 21, offsetY: 0 },
    { color: 'rgba(40, 140, 255, 0.40)', sizeW: 25, sizeH: 18, offsetX: -21, offsetY: -2 },
    { color: 'rgba(240, 50, 180, 0.45)', sizeW: 21, sizeH: 24, offsetX: 66, offsetY: 0 },
    { color: 'rgba(30, 185, 170, 0.52)', sizeW: 18, sizeH: 26, offsetX: -66, offsetY: -1 },
  ],
  mono: [
    { color: 'rgba(200, 200, 200, 0.48)', sizeW: 33, sizeH: 30, offsetX: 0, offsetY: 0 },
    { color: 'rgba(170, 170, 170, 0.42)', sizeW: 24, sizeH: 26, offsetX: 39, offsetY: -3 },
    { color: 'rgba(155, 155, 155, 0.48)', sizeW: 27, sizeH: 24, offsetX: -36, offsetY: 0 },
    { color: 'rgba(185, 185, 185, 0.42)', sizeW: 23, sizeH: 28, offsetX: -54, offsetY: -2 },
    { color: 'rgba(165, 165, 165, 0.50)', sizeW: 24, sizeH: 24, offsetX: 51, offsetY: -1 },
    { color: 'rgba(180, 180, 180, 0.45)', sizeW: 30, sizeH: 20, offsetX: 21, offsetY: 0 },
    { color: 'rgba(160, 160, 160, 0.40)', sizeW: 25, sizeH: 18, offsetX: -21, offsetY: -2 },
    { color: 'rgba(175, 175, 175, 0.45)', sizeW: 21, sizeH: 24, offsetX: 66, offsetY: 0 },
    { color: 'rgba(190, 190, 190, 0.52)', sizeW: 18, sizeH: 26, offsetX: -66, offsetY: -1 },
  ],
  ocean: [
    { color: 'rgba(100, 80, 220, 0.48)', sizeW: 33, sizeH: 30, offsetX: 0, offsetY: 0 },
    { color: 'rgba(60, 120, 255, 0.42)', sizeW: 24, sizeH: 26, offsetX: 39, offsetY: -3 },
    { color: 'rgba(80, 100, 200, 0.48)', sizeW: 27, sizeH: 24, offsetX: -36, offsetY: 0 },
    { color: 'rgba(130, 70, 255, 0.42)', sizeW: 23, sizeH: 28, offsetX: -54, offsetY: -2 },
    { color: 'rgba(70, 130, 255, 0.50)', sizeW: 24, sizeH: 24, offsetX: 51, offsetY: -1 },
    { color: 'rgba(120, 80, 255, 0.45)', sizeW: 30, sizeH: 20, offsetX: 21, offsetY: 0 },
    { color: 'rgba(90, 110, 230, 0.40)', sizeW: 25, sizeH: 18, offsetX: -21, offsetY: -2 },
    { color: 'rgba(110, 90, 240, 0.45)', sizeW: 21, sizeH: 24, offsetX: 66, offsetY: 0 },
    { color: 'rgba(140, 100, 255, 0.52)', sizeW: 18, sizeH: 26, offsetX: -66, offsetY: -1 },
  ],
  sunset: [
    { color: 'rgba(255, 100, 60, 0.48)', sizeW: 33, sizeH: 30, offsetX: 0, offsetY: 0 },
    { color: 'rgba(255, 180, 50, 0.42)', sizeW: 24, sizeH: 26, offsetX: 39, offsetY: -3 },
    { color: 'rgba(255, 140, 70, 0.48)', sizeW: 27, sizeH: 24, offsetX: -36, offsetY: 0 },
    { color: 'rgba(255, 80, 80, 0.42)', sizeW: 23, sizeH: 28, offsetX: -54, offsetY: -2 },
    { color: 'rgba(255, 200, 60, 0.50)', sizeW: 24, sizeH: 24, offsetX: 51, offsetY: -1 },
    { color: 'rgba(255, 120, 50, 0.45)', sizeW: 30, sizeH: 20, offsetX: 21, offsetY: 0 },
    { color: 'rgba(255, 160, 80, 0.40)', sizeW: 25, sizeH: 18, offsetX: -21, offsetY: -2 },
    { color: 'rgba(255, 90, 60, 0.45)', sizeW: 21, sizeH: 24, offsetX: 66, offsetY: 0 },
    { color: 'rgba(255, 70, 70, 0.52)', sizeW: 18, sizeH: 26, offsetX: -66, offsetY: -1 },
  ],
};

function getLineInnerGradients(colorVariant: BorderBeamColorVariant, id: string): string {
  const data = lineInnerGradientData[colorVariant];
  return data
    .map(c => {
      const offsetXStr = c.offsetX === 0 ? '' : (c.offsetX > 0 ? ` + ${c.offsetX}px` : ` - ${Math.abs(c.offsetX)}px`);
      const offsetYStr = c.offsetY === 0 ? '' : ` - ${Math.abs(c.offsetY)}px`;
      return `radial-gradient(ellipse calc(${c.sizeW}px * var(--beam-w-${id})) calc(${c.sizeH}px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%${offsetXStr}) calc(100%${offsetYStr}), ${c.color}, transparent)`;
    })
    .join(',\n    ');
}

export const lineBloomColors = {
  colorful: {
    dark: {
      spikes: [
        { color1: 'rgb(100, 70, 255)', color2: 'rgba(100, 70, 255, 1)' },              // 36%
        { color1: 'rgba(255, 170, 40, 0.59)', color2: 'rgba(255, 170, 40, 0.29)' },    // 50%
        { color1: 'rgb(50, 200, 100)', color2: 'rgba(50, 200, 100, 1)' },              // 64%
        { color1: 'rgba(200, 50, 240, 0.91)', color2: 'rgba(200, 50, 240, 0.45)' },    // 78%
        { color1: 'rgb(40, 140, 255)', color2: 'rgba(40, 140, 255, 1)' },              // 92%
      ],
    },
    light: {
      spikes: [
        { color1: 'rgb(80, 50, 200)', color2: 'rgba(80, 50, 200, 0.8)' },      // 36%
        { color1: 'rgba(210, 130, 0, 0.7)', color2: 'rgba(210, 130, 0, 0.46)' }, // 50%
        { color1: 'rgb(30, 160, 70)', color2: 'rgba(30, 160, 70, 0.82)' },     // 64%
        { color1: 'rgb(160, 30, 190)', color2: 'rgba(160, 30, 190, 0.7)' },    // 78%
        { color1: 'rgb(30, 100, 200)', color2: 'rgba(30, 100, 200, 0.78)' },   // 92%
      ],
    },
  },
  mono: {
    dark: {
      spikes: [
        { color1: 'rgb(200, 200, 200)', color2: 'rgba(200, 200, 200, 1)' },
        { color1: 'rgba(180, 180, 180, 0.59)', color2: 'rgba(180, 180, 180, 0.29)' },
        { color1: 'rgb(190, 190, 190)', color2: 'rgba(190, 190, 190, 1)' },
        { color1: 'rgba(170, 170, 170, 0.91)', color2: 'rgba(170, 170, 170, 0.45)' },
        { color1: 'rgb(185, 185, 185)', color2: 'rgba(185, 185, 185, 1)' },
      ],
    },
    light: {
      spikes: [
        { color1: 'rgb(80, 80, 80)', color2: 'rgba(80, 80, 80, 0.8)' },
        { color1: 'rgba(100, 100, 100, 0.7)', color2: 'rgba(100, 100, 100, 0.46)' },
        { color1: 'rgb(70, 70, 70)', color2: 'rgba(70, 70, 70, 0.82)' },
        { color1: 'rgb(90, 90, 90)', color2: 'rgba(90, 90, 90, 0.7)' },
        { color1: 'rgb(85, 85, 85)', color2: 'rgba(85, 85, 85, 0.78)' },
      ],
    },
  },
  ocean: {
    dark: {
      spikes: [
        { color1: 'rgb(100, 80, 255)', color2: 'rgb(100, 80, 255)' },
        { color1: 'rgba(80, 130, 220, 0.59)', color2: 'rgba(80, 130, 220, 0.29)' },
        { color1: 'rgb(60, 100, 255)', color2: 'rgb(60, 100, 255)' },
        { color1: 'rgba(90, 120, 200, 0.91)', color2: 'rgba(90, 120, 200, 0.45)' },
        { color1: 'rgb(120, 90, 255)', color2: 'rgb(120, 90, 255)' },
      ],
    },
    light: {
      spikes: [
        { color1: 'rgb(50, 40, 180)', color2: 'rgba(50, 40, 180, 0.8)' },
        { color1: 'rgba(40, 80, 200, 0.7)', color2: 'rgba(40, 80, 200, 0.46)' },
        { color1: 'rgb(30, 50, 190)', color2: 'rgba(30, 50, 190, 0.82)' },
        { color1: 'rgb(60, 90, 180)', color2: 'rgba(60, 90, 180, 0.7)' },
        { color1: 'rgb(70, 60, 200)', color2: 'rgba(70, 60, 200, 0.78)' },
      ],
    },
  },
  sunset: {
    dark: {
      spikes: [
        { color1: 'rgb(255, 100, 80)', color2: 'rgb(255, 100, 80)' },
        { color1: 'rgba(255, 150, 80, 0.59)', color2: 'rgba(255, 150, 80, 0.29)' },
        { color1: 'rgb(255, 80, 60)', color2: 'rgb(255, 80, 60)' },
        { color1: 'rgba(255, 120, 50, 0.91)', color2: 'rgba(255, 120, 50, 0.45)' },
        { color1: 'rgb(255, 140, 70)', color2: 'rgb(255, 140, 70)' },
      ],
    },
    light: {
      spikes: [
        { color1: 'rgb(200, 60, 30)', color2: 'rgba(200, 60, 30, 0.8)' },
        { color1: 'rgba(220, 100, 20, 0.7)', color2: 'rgba(220, 100, 20, 0.46)' },
        { color1: 'rgb(180, 40, 20)', color2: 'rgba(180, 40, 20, 0.82)' },
        { color1: 'rgb(210, 80, 10)', color2: 'rgba(210, 80, 10, 0.7)' },
        { color1: 'rgb(190, 70, 30)', color2: 'rgba(190, 70, 30, 0.78)' },
      ],
    },
  },
};

function withAlpha(color: string, alpha: number): string {
  const rgbaMatch = color.match(/^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*[\d.]+\s*\)$/);
  if (rgbaMatch) return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${alpha})`;
  const rgbMatch = color.match(/^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgbMatch) return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  return color;
}

function attenuateSpike(color: string, factor: number): string {
  const rgbaMatch = color.match(/^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgbaMatch) return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${(parseFloat(rgbaMatch[4]) * factor).toFixed(2)})`;
  const rgbMatch = color.match(/^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgbMatch) return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${factor.toFixed(2)})`;
  return color;
}

function getLineBloomGradients(colorVariant: BorderBeamColorVariant, isDark: boolean, id: string): string {
  const spikeColors = getSpikeColors(colorVariant, isDark);
  const bloomData = lineBloomColors[colorVariant][isDark ? 'dark' : 'light'];
  const isMono = colorVariant === 'mono';

  // Mono uses uniform gray so thin spikes at full opacity look like harsh bars.
  // Attenuate opacity and widen the thin gradients so they appear as soft glows.
  const att = isMono ? 0.14 : 1;
  const sc1     = isMono ? attenuateSpike(spikeColors.primary, 0.14) : spikeColors.primary;
  const sc1_mid = isMono ? attenuateSpike(spikeColors.primary, 0.09) : spikeColors.primary;
  const sc2     = isMono ? attenuateSpike(spikeColors.secondary, 0.12) : spikeColors.secondary;
  const sc2_mid = isMono ? withAlpha(spikeColors.secondary, 0.06) : withAlpha(spikeColors.secondary, 0.49);

  const spikes = bloomData.spikes.map(s => isMono
    ? { color1: attenuateSpike(s.color1, att), color2: attenuateSpike(s.color2, att * 0.7) }
    : s
  );

  // Mono: wide, blurred soft spikes; shortened heights
  const thinW1 = isMono ? '12px'  : '0.8px';
  const thinW2 = isMono ? '14px'  : '2px';
  const thinW3 = isMono ? '12px'  : '1.2px';
  const thinW4 = isMono ? '10px'  : '0.6px';
  const thinH1 = isMono ? '42px'  : '92px';
  const thinH2 = isMono ? '38px'  : '72px';
  const thinH3 = isMono ? '40px'  : '85px';
  const thinH4 = isMono ? '32px'  : '60px';
  const thinLW = isMono ? '12px'  : '1px';

  // Main glow: center dot + ambient — mono gets 50% lower opacity
  const glowDotC   = isMono ? 'rgba(255, 255, 255, 0.5)'  : 'rgba(255, 255, 255, 1)';
  const glowDot20  = isMono ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.9)';
  const glowDot50  = isMono ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.5)';
  const glowAmbC   = isMono ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.3)';
  const glowAmb25  = isMono ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.12)';
  const glowAmb55  = isMono ? 'rgba(255, 255, 255, 0.015)': 'rgba(255, 255, 255, 0.03)';

  if (isDark) {
    return `radial-gradient(ellipse calc(${thinW1} * var(--beam-spike-${id})) calc(${thinH1} * var(--beam-h-${id})) at 8% calc(100% - 2px), ${sc1}, ${sc1_mid} 30%, transparent 88%),
       radial-gradient(ellipse calc(10px * var(--beam-spike2-${id})) calc(35px * var(--beam-h-${id})) at 22% calc(100% - 4px), ${sc2}, ${sc2_mid} 50%, transparent 95%),
       radial-gradient(ellipse calc(${thinW2} * (2 - var(--beam-spike-${id}))) calc(${thinH2} * var(--beam-h-${id})) at 36% calc(100% - 3px), ${spikes[0].color1}, ${spikes[0].color2} 40%, transparent 90%),
       radial-gradient(ellipse calc(14px * var(--beam-spike2-${id})) calc(28px * var(--beam-h-${id})) at 50% calc(100% - 2px), ${spikes[1].color1}, ${spikes[1].color2} 55%, transparent 96%),
       radial-gradient(ellipse calc(${thinW3} * (2 - var(--beam-spike2-${id}))) calc(${thinH3} * var(--beam-h-${id})) at 64% calc(100% - 4px), ${spikes[2].color1}, ${spikes[2].color2} 35%, transparent 89%),
       radial-gradient(ellipse calc(7px * var(--beam-spike-${id})) calc(45px * var(--beam-h-${id})) at 78% calc(100% - 2px), ${spikes[3].color1}, ${spikes[3].color2} 48%, transparent 94%),
       radial-gradient(ellipse calc(${thinW4} * (2 - var(--beam-spike-${id}))) calc(${thinH4} * var(--beam-h-${id})) at 92% calc(100% - 3px), ${spikes[4].color1}, ${spikes[4].color2} 42%, transparent 91%),
       radial-gradient(ellipse calc(21px * var(--beam-spike-${id})) calc(15px * var(--beam-spike2-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 1px), ${glowDotC} 0%, ${glowDot20} 20%, ${glowDot50} 50%, transparent 100%),
       radial-gradient(ellipse calc(42px * var(--beam-w-${id})) calc(40px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) 100%, ${glowAmbC} 0%, ${glowAmb25} 25%, ${glowAmb55} 55%, transparent 80%)`;
  } else {
    const sc1_lt = isMono ? attenuateSpike(spikeColors.primary, 0.11) : withAlpha(spikeColors.primary, 0.85);
    const sc2_lt = isMono ? attenuateSpike(spikeColors.secondary, 0.09) : withAlpha(spikeColors.secondary, 0.7);
    return `radial-gradient(ellipse calc(${thinW1} * var(--beam-spike-${id})) calc(${thinH1} * var(--beam-h-${id})) at 8% calc(100% - 2px), ${sc1}, ${sc1_lt} 30%, transparent 88%),
       radial-gradient(ellipse calc(10px * var(--beam-spike2-${id})) calc(35px * var(--beam-h-${id})) at 22% calc(100% - 4px), ${sc2}, ${sc2_lt} 50%, transparent 95%),
       radial-gradient(ellipse calc(${thinW2} * (2 - var(--beam-spike-${id}))) calc(${thinH2} * var(--beam-h-${id})) at 36% calc(100% - 3px), ${spikes[0].color1}, ${spikes[0].color2} 40%, transparent 90%),
       radial-gradient(ellipse calc(14px * var(--beam-spike2-${id})) calc(28px * var(--beam-h-${id})) at 50% calc(100% - 2px), ${spikes[1].color1}, ${spikes[1].color2} 55%, transparent 96%),
       radial-gradient(ellipse calc(${thinW3} * (2 - var(--beam-spike2-${id}))) calc(${thinH3} * var(--beam-h-${id})) at 64% calc(100% - 4px), ${spikes[2].color1}, ${spikes[2].color2} 35%, transparent 89%),
       radial-gradient(ellipse calc(7px * var(--beam-spike-${id})) calc(45px * var(--beam-h-${id})) at 78% calc(100% - 2px), ${spikes[3].color1}, ${spikes[3].color2} 48%, transparent 94%),
       radial-gradient(ellipse calc(${thinLW} * (2 - var(--beam-spike-${id}))) calc(${thinH4} * var(--beam-h-${id})) at 92% calc(100% - 3px), ${spikes[4].color1}, ${spikes[4].color2} 42%, transparent 91%),
       radial-gradient(ellipse calc(50px * var(--beam-w-${id})) calc(32px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100%), rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.18) 30%, rgba(0, 0, 0, 0.03) 60%, transparent 85%)`;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Pulse family (breathing glow, no rotation) — ported from the v5 prototype
 * Card 4 ("pulse-inner", contained) and Card 5 ("pulse-outside", outward bloom).
 *
 * Both effects animate three independent size/drift regions (g1/g2/g3) and four
 * per-quadrant opacity oscillators (tl/tr/bl/br) on desynced periods, plus a
 * global height oscillator (gh) and a hue-shift filter. The gradient COLORS come
 * from the shared `colorPalettes` (so every color variant + strength works), while
 * the geometry below (sizes/positions/region/quadrant) is identical across colors.
 * ──────────────────────────────────────────────────────────────────────────*/

type PulseRegion = 1 | 2 | 3;
type PulseQuad = 'tl' | 'tr' | 'bl' | 'br';

// Which size-region (g1/g2/g3) and opacity-quadrant each of the 9 palette
// gradients belongs to (taken from the v5 Card 4 ::after ordering).
export const PULSE_RING_MAP: { region: PulseRegion; quad: PulseQuad }[] = [
  { region: 1, quad: 'tl' },
  { region: 2, quad: 'tl' },
  { region: 3, quad: 'bl' },
  { region: 1, quad: 'bl' },
  { region: 2, quad: 'br' },
  { region: 3, quad: 'br' },
  { region: 1, quad: 'tr' },
  { region: 2, quad: 'tr' },
  { region: 3, quad: 'tr' },
];

// Card 4 inner-perimeter (::before) gradient sizes — slightly smaller than the ring.
export const PULSE_INNER_SIZES: [number, number][] = [
  [65, 35], [55, 30], [35, 65], [15, 30], [173, 28], [80, 22], [69, 28], [22, 38], [47, 44],
];

export interface PulseGradientDef {
  ci: number; // index into colorPalettes[variant].border
  region: PulseRegion;
  quad: PulseQuad;
  w: number;
  h: number;
  x?: string; // explicit position (outer effect); falls back to palette pos
  y?: string;
}

// Card 4 bloom — 7 of the 9 colors, expanded sizes (positions come from palette).
export const PULSE_INNER_BLOOM: PulseGradientDef[] = [
  { ci: 0, region: 1, quad: 'tl', w: 84, h: 48 },
  { ci: 1, region: 2, quad: 'tl', w: 72, h: 42 },
  { ci: 2, region: 3, quad: 'bl', w: 48, h: 84 },
  { ci: 4, region: 2, quad: 'br', w: 216, h: 38 },
  { ci: 5, region: 3, quad: 'br', w: 102, h: 31 },
  { ci: 6, region: 1, quad: 'tr', w: 89, h: 38 },
  { ci: 8, region: 3, quad: 'tr', w: 62, h: 58 },
];

// Card 5 outward core (::after hairline + ::before glow share this edge-positioned set).
export const PULSE_OUTER_CORE: PulseGradientDef[] = [
  { ci: 0, region: 1, quad: 'tl', w: 80, h: 19, x: '27%', y: '0%' },
  { ci: 6, region: 2, quad: 'tr', w: 74, h: 11, x: '73%', y: '-1%' },
  { ci: 7, region: 3, quad: 'tr', w: 15, h: 44, x: '100%', y: '33%' },
  { ci: 8, region: 1, quad: 'br', w: 19, h: 38, x: '101%', y: '72%' },
  { ci: 4, region: 2, quad: 'br', w: 84, h: 13, x: '67%', y: '100%' },
  { ci: 1, region: 3, quad: 'bl', w: 60, h: 21, x: '24%', y: '101%' },
  { ci: 2, region: 1, quad: 'bl', w: 17, h: 40, x: '0%', y: '60%' },
  { ci: 3, region: 2, quad: 'tl', w: 13, h: 32, x: '-1%', y: '28%' },
];

// Card 5 outward bloom — wider/blurred halo (7 gradients).
export const PULSE_OUTER_BLOOM: PulseGradientDef[] = [
  { ci: 0, region: 1, quad: 'tl', w: 110, h: 30, x: '27%', y: '3%' },
  { ci: 6, region: 2, quad: 'tr', w: 100, h: 20, x: '73%', y: '1%' },
  { ci: 7, region: 3, quad: 'tr', w: 26, h: 62, x: '100%', y: '33%' },
  { ci: 8, region: 1, quad: 'br', w: 30, h: 56, x: '101%', y: '72%' },
  { ci: 4, region: 2, quad: 'br', w: 120, h: 22, x: '67%', y: '99%' },
  { ci: 1, region: 3, quad: 'bl', w: 88, h: 32, x: '24%', y: '99%' },
  { ci: 2, region: 1, quad: 'bl', w: 28, h: 58, x: '0%', y: '60%' },
];

function fmtNum(v: number): string {
  return (+v.toFixed(3)).toString();
}

// Convert an `rgb()` palette color into `rgba()` whose alpha is the live quadrant
// opacity custom property, so the gradient breathes per-quadrant.
function withAlphaVar(color: string, quad: PulseQuad, id: string): string {
  const m = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  const rgb = m ? `${m[1]}, ${m[2]}, ${m[3]}` : '255, 255, 255';
  return `rgba(${rgb}, var(--bop-${quad}-${id}))`;
}

function pulseGrad(
  color: string,
  w: number,
  h: number,
  region: PulseRegion,
  quad: PulseQuad,
  x: string,
  y: string,
  id: string
): string {
  // `--pulse-glow-sx/sy` (set inline by the component for pulse-outside) scale the
  // blob WIDTH/HEIGHT to the measured element size, so the glow fits any component.
  // Positions stay percentage-based, so blobs keep hugging the element's edges.
  // Defaults to 1 (e.g. pulse-inner never sets them), leaving geometry unchanged.
  // `--pulse-glow-boost` is a consumer hook: a relative multiplier on top of the
  // measured scale, so the glow can be intensified proportionally on any element.
  return `radial-gradient(ellipse calc(${w}px * var(--bw${region}-${id}) * var(--pulse-glow-sx, 1) * var(--pulse-glow-boost, 1)) calc(${h}px * var(--bh${region}-${id}) * var(--bgh-${id}) * var(--pulse-glow-sy, 1) * var(--pulse-glow-boost, 1)) at calc(${x} + var(--bx${region}-${id})) calc(${y} + var(--by${region}-${id})), ${withAlphaVar(color, quad, id)}, transparent)`;
}

// The 9-gradient perimeter ring (Card 4 ::after / Card 5 stroke share this) —
// positions + sizes come straight from the palette, region/quad from PULSE_RING_MAP.
function pulseRingGradients(variant: BorderBeamColorVariant, id: string): string {
  return colorPalettes[variant].border
    .map((c, i) => {
      const { region, quad } = PULSE_RING_MAP[i];
      const [x, y] = c.pos.split(' ');
      const [w, h] = c.size.split(' ').map(parseFloat);
      return pulseGrad(c.color, w, h, region, quad, x, y, id);
    })
    .join(',\n    ');
}

// Card 4 inner-perimeter gradients (smaller sizes) plus the bright corner accents.
function pulseInnerGradients(variant: BorderBeamColorVariant, id: string, isDark: boolean): string {
  const palette = colorPalettes[variant].border;
  const grads = palette.map((c, i) => {
    const { region, quad } = PULSE_RING_MAP[i];
    const [x, y] = c.pos.split(' ');
    const [w, h] = PULSE_INNER_SIZES[i];
    return pulseGrad(c.color, w, h, region, quad, x, y, id);
  });
  const cornerRGB = isDark ? '255, 255, 255' : '0, 0, 0';
  const cornerAlpha = isDark ? 0.18 : 0.08;
  const corners: [string, string, PulseQuad][] = [
    ['0%', '0%', 'tl'],
    ['100%', '0%', 'tr'],
    ['0%', '100%', 'bl'],
    ['100%', '100%', 'br'],
  ];
  const cornerGrads = corners.map(
    ([x, y, q]) =>
      `radial-gradient(ellipse 60px 60px at ${x} ${y}, rgba(${cornerRGB}, calc(${cornerAlpha} * var(--bop-${q}-${id}))), transparent 70%)`
  );
  return [...grads, ...cornerGrads].join(',\n    ');
}

// Emit a fixed gradient table (used by inner bloom + both outer layers).
function pulseTableGradients(
  table: PulseGradientDef[],
  variant: BorderBeamColorVariant,
  id: string
): string {
  const palette = colorPalettes[variant].border;
  return table
    .map(e => {
      const c = palette[e.ci];
      const [px, py] = c.pos.split(' ');
      return pulseGrad(c.color, e.w, e.h, e.region, e.quad, e.x ?? px, e.y ?? py, id);
    })
    .join(',\n    ');
}

// Frozen variant of the bloom gradients: emits literal sizes/positions with a
// fixed per-blob alpha (the time-average of the breathing range) instead of the
// live `var(--bw…/--bop…)` custom properties. Because the bloom's background no
// longer changes per frame, its heavily-blurred bitmap is painted ONCE and cached
// by the compositor rather than re-rasterized 60–120×/sec — the single biggest
// per-frame cost in the pulse effect.
function pulseTableGradientsStatic(
  table: PulseGradientDef[],
  variant: BorderBeamColorVariant,
  frozenAlpha: number
): string {
  const palette = colorPalettes[variant].border;
  const a = +frozenAlpha.toFixed(3);
  return table
    .map(e => {
      const c = palette[e.ci];
      const [px, py] = c.pos.split(' ');
      const x = e.x ?? px;
      const y = e.y ?? py;
      const m = c.color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
      const rgb = m ? `${m[1]}, ${m[2]}, ${m[3]}` : '255, 255, 255';
      // Scale the blob to the measured element via `--pulse-glow-sx/sy` (same as
      // the live stroke/core layers). The var only changes on resize, so the
      // blurred bloom bitmap is still painted once and cached between resizes.
      // Defaults to 1 (pulse-inner never sets it), leaving inner geometry as-is.
      return `radial-gradient(ellipse calc(${e.w}px * var(--pulse-glow-sx, 1) * var(--pulse-glow-boost, 1)) calc(${e.h}px * var(--pulse-glow-sy, 1) * var(--pulse-glow-boost, 1)) at ${x} ${y}, rgba(${rgb}, ${a}), transparent)`;
    })
    .join(',\n    ');
}

// Pauses every animation on an instance (wrapper + pseudo layers + bloom) when it
// carries the `data-paused` attribute. Driven by an IntersectionObserver so beams
// that are scrolled offscreen stop doing per-frame paint work entirely.
function pausedAnimationsRule(id: string): string {
  return `
[data-beam="${id}"][data-paused],
[data-beam="${id}"][data-paused]::after,
[data-beam="${id}"][data-paused]::before,
[data-beam="${id}"][data-paused] [data-beam-bloom] {
  animation-play-state: paused !important;
}`;
}

// @property registrations for all per-instance pulse custom properties.
function pulsePropertyRegs(id: string): string {
  const numbers = ['bw1', 'bh1', 'bw2', 'bh2', 'bw3', 'bh3', 'bgh', 'bop-tl', 'bop-tr', 'bop-bl', 'bop-br'];
  const lengths = ['bx1', 'by1', 'bx2', 'by2', 'bx3', 'by3'];
  const numReg = numbers
    .map(
      n => `@property --${n}-${id} {\n  syntax: "<number>";\n  initial-value: 1;\n  inherits: true;\n}`
    )
    .join('\n\n');
  const lenReg = lengths
    .map(
      n => `@property --${n}-${id} {\n  syntax: "<length>";\n  initial-value: 0px;\n  inherits: true;\n}`
    )
    .join('\n\n');
  return `${numReg}\n\n${lenReg}\n\n@property --beam-opacity-${id} {\n  syntax: "<number>";\n  initial-value: 0;\n  inherits: true;\n}\n\n@property --beam-hue-${id} {\n  syntax: "<angle>";\n  initial-value: 0deg;\n  inherits: true;\n}`;
}

// ── Pulse breathing driver ───────────────────────────────────────────────────
// The breathing motion (size/drift/quadrant-opacity/height) and the slow hue
// drift used to run as ~15 per-instance CSS `@property` keyframe animations at
// the display refresh rate (60–120 Hz). Because each value feeds the painted
// gradients/filters, that meant repainting the breathing layers 60–120×/sec.
// The motion is very slow (1.6–6.4 s periods), so we instead drive the same CSS
// vars from a single shared requestAnimationFrame loop throttled to ~30 fps
// (see pulseDriver.ts). This halves the paint frequency on 60 Hz displays and
// quarters it on 120 Hz, with no perceptible change to the breathing.

/** A single sinusoidal oscillator that ping-pongs a CSS var between `a` and `b`. */
export interface PulseOscillatorDef {
  prop: string;
  a: number;
  b: number;
  /** Full period in seconds. */
  period: number;
  /** Phase offset in seconds (desyncs otherwise-identical oscillators). */
  delay: number;
  /** '' for unitless <number> vars, 'px' for <length> drift vars. */
  unit: '' | 'px';
}

export interface PulseDriverConfig {
  oscillators: PulseOscillatorDef[];
  /**
   * Hue motion driven into `--beam-hue-<id>`; null when colors are static.
   * `continuous` rotates a full 360° loop over `period` (so every palette color
   * cycles through every edge for a lively, ever-changing wash); otherwise it
   * ping-pongs between -range and +range.
   */
  hue: { prop: string; range: number; period: number; continuous?: boolean } | null;
}

/** Theme/size/duration-tuned breathing parameters (shared by CSS + JS driver). */
export function pulseParams(size: BorderBeamSize, theme: 'dark' | 'light', duration: number) {
  const isDark = theme === 'dark';
  const durScale = duration / 2.3;
  if (size === 'pulse-inner') {
    return {
      sp: 0.28,
      dr: isDark ? 33 : 40,
      op: isDark ? 0.48 : 0.45,
      gh: isDark ? 0.34 : 0.22,
      bs: (isDark ? 1.9 : 2.6) * durScale,
      ss: (isDark ? 2.6 : 4.6) * durScale,
      ghs: (isDark ? 2.4 : 5.5) * durScale,
      // Full hue revolution period (seconds) — colors continuously cycle.
      huePeriod: 16,
    };
  }
  return {
    sp: isDark ? 0.28 : 0.36,
    dr: isDark ? 14 : 19,
    op: isDark ? 0.46 : 0,
    gh: isDark ? 0.16 : 0.58,
    bs: (isDark ? 2.3 : 3.7) * durScale,
    ss: (isDark ? 6.4 : 4.6) * durScale,
    ghs: (isDark ? 2.4 : 3.8) * durScale,
    // Full hue revolution period (seconds) — colors continuously cycle.
    huePeriod: 14,
  };
}

/** Build the oscillator table for an instance (matches the former keyframes). */
export function pulseOscillatorDefs(id: string, p: ReturnType<typeof pulseParams>): PulseOscillatorDef[] {
  const { sp, dr, op, gh, bs, ss, ghs } = p;
  return [
    { prop: `--bw1-${id}`, a: 1 - sp, b: 1 + sp * 1.1, period: ss * 0.9, delay: 0, unit: '' },
    { prop: `--bh1-${id}`, a: 1 + sp * 0.9, b: 1 - sp * 0.85, period: ss * 1.26, delay: 0, unit: '' },
    { prop: `--bx1-${id}`, a: -dr, b: dr * 0.9, period: bs * 1.6, delay: 0, unit: 'px' },
    { prop: `--by1-${id}`, a: dr * 0.55, b: -dr * 0.7, period: bs * 1.6, delay: 0, unit: 'px' },
    { prop: `--bw2-${id}`, a: 1 + sp, b: 1 - sp * 0.85, period: ss * 1.1, delay: 0, unit: '' },
    { prop: `--bh2-${id}`, a: 1 - sp * 0.8, b: 1 + sp * 1.05, period: ss * 0.81, delay: 0, unit: '' },
    { prop: `--bx2-${id}`, a: dr * 0.8, b: -dr * 0.9, period: bs * 1.88, delay: 0, unit: 'px' },
    { prop: `--by2-${id}`, a: -dr, b: dr * 0.65, period: bs * 1.88, delay: 0, unit: 'px' },
    { prop: `--bw3-${id}`, a: 1 - sp * 0.6, b: 1 + sp * 1.15, period: ss * 0.98, delay: 0, unit: '' },
    { prop: `--bh3-${id}`, a: 1 + sp * 0.75, b: 1 - sp, period: ss * 1.4, delay: 0, unit: '' },
    { prop: `--bx3-${id}`, a: -dr * 0.6, b: dr, period: bs * 1.45, delay: 0, unit: 'px' },
    { prop: `--by3-${id}`, a: -dr * 0.85, b: dr * 0.45, period: bs * 1.45, delay: 0, unit: 'px' },
    { prop: `--bgh-${id}`, a: 1 - gh, b: 1 + gh, period: ghs, delay: 0, unit: '' },
    { prop: `--bop-tl-${id}`, a: 1 - op, b: 1, period: bs, delay: 0, unit: '' },
    { prop: `--bop-tr-${id}`, a: 1 - op, b: 1, period: bs * 1.32, delay: bs * 0.28, unit: '' },
    { prop: `--bop-bl-${id}`, a: 1 - op, b: 1, period: bs * 0.84, delay: bs * 0.55, unit: '' },
    { prop: `--bop-br-${id}`, a: 1 - op, b: 1, period: bs * 1.58, delay: bs * 0.83, unit: '' },
  ];
}

/**
 * Returns the runtime config the JS driver needs to animate a pulse instance,
 * or null for non-pulse sizes. Kept in sync with the CSS by sharing pulseParams.
 */
export function getPulseDriverConfig(
  size: BorderBeamSize,
  theme: 'dark' | 'light',
  duration: number,
  hueRange: number,
  staticColors: boolean,
  id: string
): PulseDriverConfig | null {
  if (size !== 'pulse-inner' && size !== 'pulse-outside') return null;
  const p = pulseParams(size, theme, duration);
  return {
    oscillators: pulseOscillatorDefs(id, p),
    // Pulse colors continuously rotate a full hue circle so the palette is never
    // pinned to fixed edges (no more "always red top-right / green left").
    // `hueRange: 0` opts out, pinning the palette to its base hue for callers
    // where colour carries meaning (e.g. per-state voice glow).
    hue: staticColors || hueRange === 0
      ? null
      : { prop: `--beam-hue-${id}`, range: 360, period: p.huePeriod, continuous: true },
  };
}

// Only the (short, one-shot) fade is still a CSS animation; the breathing is
// driven from JS so it can be frame-rate capped and paused offscreen.
function pulseWrapperAnimation(id: string, fadeName: string, fadeDur: number): string {
  return `  animation: ${fadeName}-${id} ${fadeDur}s ease forwards;`;
}

interface GenerateStylesOptions {
  id: string;
  borderRadius: number;
  borderWidth: number;
  duration: number;
  strokeOpacity: number;
  innerOpacity: number;
  bloomOpacity: number;
  innerShadow: string;
  size: BorderBeamSize;
  colorVariant: BorderBeamColorVariant;
  staticColors: boolean;
  brightness: number;
  saturation: number;
  hueRange: number;
  theme: 'dark' | 'light';
  /** Opacity of the 1px hairline outline (pulse-outside only). Falls back to 0. */
  hairlineOpacity?: number;
}

/**
 * Generate complete CSS for a BorderBeam instance
 */
export function generateBeamCSS(options: GenerateStylesOptions): string {
  const { size } = options;

  if (size === 'line') {
    return generateLineVariantCSS(options);
  }
  
  if (size === 'sm') {
    return generateSmallVariantCSS(options);
  }

  if (size === 'pulse-inner') {
    return generatePulseInnerVariantCSS(options);
  }

  if (size === 'pulse-outside') {
    return generatePulseOuterVariantCSS(options);
  }

  return generateBorderVariantCSS(options);
}

function generateSmallVariantCSS(options: GenerateStylesOptions): string {
  const {
    id,
    borderRadius,
    borderWidth,
    duration,
    strokeOpacity,
    innerOpacity,
    bloomOpacity,
    innerShadow,
    colorVariant,
    staticColors,
    brightness,
    saturation,
    hueRange,
    theme,
  } = options;

  const innerRadius = Math.max(0, borderRadius - borderWidth);
  
  const monoOpacityMultiplier = colorVariant === 'mono' ? 0.5 : 1.0;
  const finalStrokeOpacity = strokeOpacity * monoOpacityMultiplier;
  const finalInnerOpacity = innerOpacity * monoOpacityMultiplier;
  const finalBloomOpacity = bloomOpacity * monoOpacityMultiplier;
  
  const hueShiftAnimation = staticColors 
    ? '' 
    : `animation: beam-hue-shift-${id} 12s ease-in-out infinite;`;
  
  const hueShiftKeyframes = staticColors ? '' : `
@keyframes beam-hue-shift-${id} {
  0% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - ${hueRange}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
  50% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) + ${hueRange}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
  100% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - ${hueRange}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
}`;

  const isDark = theme === 'dark';
  
  const whiteGradient = isDark
    ? `conic-gradient(
        from var(--beam-angle-${id}),
        transparent 0%, transparent 54%,
        rgba(255, 255, 255, 0.1) 57%,
        rgba(255, 255, 255, 0.3) 60%,
        rgba(255, 255, 255, 0.6) 63%,
        rgba(255, 255, 255, 0.75) 66%,
        rgba(255, 255, 255, 0.6) 69%,
        rgba(255, 255, 255, 0.3) 72%,
        rgba(255, 255, 255, 0.1) 75%,
        transparent 78%, transparent 100%
      )`
    : `conic-gradient(
        from var(--beam-angle-${id}),
        transparent 0%, transparent 54%,
        rgba(0, 0, 0, 0.08) 57%,
        rgba(0, 0, 0, 0.2) 60%,
        rgba(0, 0, 0, 0.4) 63%,
        rgba(0, 0, 0, 0.55) 66%,
        rgba(0, 0, 0, 0.4) 69%,
        rgba(0, 0, 0, 0.2) 72%,
        rgba(0, 0, 0, 0.08) 75%,
        transparent 78%, transparent 100%
      )`;

  const colorGradients = getSmallColorGradients(colorVariant);
  const innerGradients = getSmallInnerGradients(colorVariant);

  const bloomGradient = isDark
    ? `conic-gradient(
        from var(--beam-angle-${id}),
        transparent 0%, transparent 58%,
        rgba(255, 255, 255, 0.03) 62%,
        rgba(255, 255, 255, 0.08) 65%,
        rgba(255, 255, 255, 0.2) 67%,
        rgba(255, 255, 255, 0.45) 69%,
        rgba(255, 255, 255, 0.85) 70%,
        rgba(255, 255, 255, 0.85) 70.5%,
        rgba(255, 255, 255, 0.45) 71.5%,
        rgba(255, 255, 255, 0.2) 73%,
        rgba(255, 255, 255, 0.08) 75%,
        rgba(255, 255, 255, 0.03) 78%,
        transparent 82%
      )`
    : `conic-gradient(
        from var(--beam-angle-${id}),
        transparent 0%, transparent 58%,
        rgba(0, 0, 0, 0.02) 62%,
        rgba(0, 0, 0, 0.08) 65%,
        rgba(0, 0, 0, 0.2) 67%,
        rgba(0, 0, 0, 0.4) 69%,
        rgba(0, 0, 0, 0.6) 70%,
        rgba(0, 0, 0, 0.6) 70.5%,
        rgba(0, 0, 0, 0.4) 71.5%,
        rgba(0, 0, 0, 0.2) 73%,
        rgba(0, 0, 0, 0.08) 75%,
        rgba(0, 0, 0, 0.02) 78%,
        transparent 82%
      )`;

  // Small variant uses wider mask to show more of the beam around the smaller element
  const smallMask = `conic-gradient(
    from var(--beam-angle-${id}),
    transparent 0%, transparent 22%,
    rgba(255, 255, 255, 0.12) 28%, rgba(255, 255, 255, 0.4) 36%,
    white 46%, white 82%,
    rgba(255, 255, 255, 0.4) 88%, rgba(255, 255, 255, 0.12) 94%,
    transparent 97%, transparent 100%
  )`;

  return `
@property --beam-angle-${id} {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: true;
}

@property --beam-opacity-${id} {
  syntax: "<number>";
  initial-value: 0;
  inherits: true;
}

[data-beam="${id}"] {
  position: relative;
  border-radius: ${borderRadius}px;
  overflow: hidden;
}

[data-beam="${id}"][data-active] {
  animation:
    beam-spin-${id} ${duration}s linear infinite,
    beam-fade-in-${id} 0.6s ease forwards;
}

[data-beam="${id}"][data-fading] {
  animation:
    beam-spin-${id} ${duration}s linear infinite,
    beam-fade-out-${id} 0.5s ease forwards;
}

[data-beam="${id}"][data-active]::after,
[data-beam="${id}"][data-fading]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${innerRadius}px;
  padding: ${borderWidth}px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${whiteGradient},${colorGradients};
  -webkit-mask:
    conic-gradient(
      from var(--beam-angle-${id}),
      transparent 0%, transparent 30%,
      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,
      white 52%, white 80%,
      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,
      transparent 95%, transparent 100%
    ),
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: source-in, xor;
  mask:
    conic-gradient(
      from var(--beam-angle-${id}),
      transparent 0%, transparent 30%,
      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,
      white 52%, white 80%,
      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,
      transparent 95%, transparent 100%
    ),
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: intersect, exclude;
  pointer-events: none;
  z-index: 2;
  opacity: calc(var(--beam-opacity-${id}) * ${finalStrokeOpacity.toFixed(2)} * var(--beam-stroke-opacity, 1) * var(--beam-strength, 1));
  ${hueShiftAnimation}
}

[data-beam="${id}"][data-active]::before,
[data-beam="${id}"][data-fading]::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${borderRadius}px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${innerGradients};
  box-shadow: inset 0 0 5px 1px ${innerShadow};
  -webkit-mask-image: ${smallMask};
  -webkit-mask-composite: source-over;
  mask-image: ${smallMask};
  mask-composite: add;
  pointer-events: none;
  z-index: 1;
  opacity: calc(var(--beam-opacity-${id}) * ${finalInnerOpacity.toFixed(2)} * var(--beam-inner-opacity, 1) * var(--beam-strength, 1));
  ${hueShiftAnimation}
}

[data-beam="${id}"] [data-beam-bloom] {
  display: none;
  position: absolute;
  inset: 0;
  border-radius: ${innerRadius}px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${bloomGradient};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  padding: ${borderWidth}px;
  filter: blur(8px) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)});
  pointer-events: none;
  z-index: 3;
  opacity: 0;
}

[data-beam="${id}"][data-active] [data-beam-bloom],
[data-beam="${id}"][data-fading] [data-beam-bloom] {
  display: block;
  opacity: calc(var(--beam-opacity-${id}) * ${finalBloomOpacity.toFixed(2)} * var(--beam-bloom-opacity, 1) * var(--beam-strength, 1));
}

@keyframes beam-spin-${id} {
  to { --beam-angle-${id}: 360deg; }
}

@keyframes beam-fade-in-${id} {
  to { --beam-opacity-${id}: 1; }
}

@keyframes beam-fade-out-${id} {
  from { --beam-opacity-${id}: 1; }
  to { --beam-opacity-${id}: 0; }
}
${hueShiftKeyframes}
${pausedAnimationsRule(id)}
`;
}

function generateBorderVariantCSS(options: GenerateStylesOptions): string {
  const {
    id,
    borderRadius,
    borderWidth,
    duration,
    strokeOpacity,
    innerOpacity,
    bloomOpacity,
    innerShadow,
    colorVariant,
    staticColors,
    brightness,
    saturation,
    hueRange,
    theme,
  } = options;

  const innerRadius = Math.max(0, borderRadius - borderWidth);
  
  // Mono variant gets 50% lower opacity
  const monoOpacityMultiplier = colorVariant === 'mono' ? 0.5 : 1.0;
  const finalStrokeOpacity = strokeOpacity * monoOpacityMultiplier;
  const finalInnerOpacity = innerOpacity * monoOpacityMultiplier;
  const finalBloomOpacity = bloomOpacity * monoOpacityMultiplier;
  
  const hueShiftAnimation = staticColors 
    ? '' 
    : `animation: beam-hue-shift-${id} 12s ease-in-out infinite;`;
  
  const hueShiftKeyframes = staticColors ? '' : `
@keyframes beam-hue-shift-${id} {
  0% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - ${hueRange}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
  50% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) + ${hueRange}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
  100% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - ${hueRange}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
}`;

  const isDark = theme === 'dark';
  
  const whiteGradient = isDark
    ? `conic-gradient(
        from var(--beam-angle-${id}),
        transparent 0%, transparent 54%,
        rgba(255, 255, 255, 0.1) 57%,
        rgba(255, 255, 255, 0.3) 60%,
        rgba(255, 255, 255, 0.6) 63%,
        rgba(255, 255, 255, 0.75) 66%,
        rgba(255, 255, 255, 0.6) 69%,
        rgba(255, 255, 255, 0.3) 72%,
        rgba(255, 255, 255, 0.1) 75%,
        transparent 78%, transparent 100%
      )`
    : `conic-gradient(
        from var(--beam-angle-${id}),
        transparent 0%, transparent 54%,
        rgba(0, 0, 0, 0.08) 57%,
        rgba(0, 0, 0, 0.2) 60%,
        rgba(0, 0, 0, 0.4) 63%,
        rgba(0, 0, 0, 0.55) 66%,
        rgba(0, 0, 0, 0.4) 69%,
        rgba(0, 0, 0, 0.2) 72%,
        rgba(0, 0, 0, 0.08) 75%,
        transparent 78%, transparent 100%
      )`;

  const colorGradients = getColorGradients(colorVariant);
  const innerGradients = getInnerGradients(colorVariant);

  const bloomGradient = isDark
    ? `conic-gradient(
        from var(--beam-angle-${id}),
        transparent 0%, transparent 58%,
        rgba(255, 255, 255, 0.03) 62%,
        rgba(255, 255, 255, 0.08) 65%,
        rgba(255, 255, 255, 0.2) 67%,
        rgba(255, 255, 255, 0.45) 69%,
        rgba(255, 255, 255, 0.85) 70%,
        rgba(255, 255, 255, 0.85) 70.5%,
        rgba(255, 255, 255, 0.45) 71.5%,
        rgba(255, 255, 255, 0.2) 73%,
        rgba(255, 255, 255, 0.08) 75%,
        rgba(255, 255, 255, 0.03) 78%,
        transparent 82%
      )`
    : `conic-gradient(
        from var(--beam-angle-${id}),
        transparent 0%, transparent 58%,
        rgba(0, 0, 0, 0.02) 62%,
        rgba(0, 0, 0, 0.08) 65%,
        rgba(0, 0, 0, 0.2) 67%,
        rgba(0, 0, 0, 0.4) 69%,
        rgba(0, 0, 0, 0.6) 70%,
        rgba(0, 0, 0, 0.6) 70.5%,
        rgba(0, 0, 0, 0.4) 71.5%,
        rgba(0, 0, 0, 0.2) 73%,
        rgba(0, 0, 0, 0.08) 75%,
        rgba(0, 0, 0, 0.02) 78%,
        transparent 82%
      )`;

  return `
@property --beam-angle-${id} {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: true;
}

@property --beam-opacity-${id} {
  syntax: "<number>";
  initial-value: 0;
  inherits: true;
}

[data-beam="${id}"] {
  position: relative;
  border-radius: ${borderRadius}px;
  overflow: hidden;
}

[data-beam="${id}"][data-active] {
  animation:
    beam-spin-${id} ${duration}s linear infinite,
    beam-fade-in-${id} 0.6s ease forwards;
}

[data-beam="${id}"][data-fading] {
  animation:
    beam-spin-${id} ${duration}s linear infinite,
    beam-fade-out-${id} 0.5s ease forwards;
}

[data-beam="${id}"][data-active]::after,
[data-beam="${id}"][data-fading]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${innerRadius}px;
  padding: ${borderWidth}px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${whiteGradient},${colorGradients};
  -webkit-mask:
    conic-gradient(
      from var(--beam-angle-${id}),
      transparent 0%, transparent 30%,
      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,
      white 52%, white 80%,
      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,
      transparent 95%, transparent 100%
    ),
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: source-in, xor;
  mask:
    conic-gradient(
      from var(--beam-angle-${id}),
      transparent 0%, transparent 30%,
      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,
      white 52%, white 80%,
      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,
      transparent 95%, transparent 100%
    ),
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: intersect, exclude;
  pointer-events: none;
  z-index: 2;
  opacity: calc(var(--beam-opacity-${id}) * ${finalStrokeOpacity.toFixed(2)} * var(--beam-stroke-opacity, 1) * var(--beam-strength, 1));
  ${hueShiftAnimation}
}

[data-beam="${id}"][data-active]::before,
[data-beam="${id}"][data-fading]::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${borderRadius}px;
  background: ${innerGradients};
  box-shadow: inset 0 0 9px 1px ${innerShadow};
  -webkit-mask-image:
    conic-gradient(
      from var(--beam-angle-${id}),
      transparent 0%, transparent 30%,
      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,
      white 52%, white 80%,
      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,
      transparent 95%, transparent 100%
    ),
    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),
    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);
  -webkit-mask-composite: source-in, source-over;
  mask-image:
    conic-gradient(
      from var(--beam-angle-${id}),
      transparent 0%, transparent 30%,
      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,
      white 52%, white 80%,
      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,
      transparent 95%, transparent 100%
    ),
    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),
    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);
  mask-composite: intersect, add;
  pointer-events: none;
  z-index: 1;
  opacity: calc(var(--beam-opacity-${id}) * ${finalInnerOpacity.toFixed(2)} * var(--beam-inner-opacity, 1) * var(--beam-strength, 1));
  clip-path: inset(0 round ${borderRadius}px);
  ${hueShiftAnimation}
}

[data-beam="${id}"] [data-beam-bloom] {
  display: none;
  position: absolute;
  inset: 0;
  border-radius: ${innerRadius}px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${bloomGradient};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  padding: ${borderWidth}px;
  filter: blur(8px) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)});
  pointer-events: none;
  z-index: 3;
  opacity: 0;
}

[data-beam="${id}"][data-active] [data-beam-bloom],
[data-beam="${id}"][data-fading] [data-beam-bloom] {
  display: block;
  opacity: calc(var(--beam-opacity-${id}) * ${finalBloomOpacity.toFixed(2)} * var(--beam-bloom-opacity, 1) * var(--beam-strength, 1));
}

@keyframes beam-spin-${id} {
  to { --beam-angle-${id}: 360deg; }
}

@keyframes beam-fade-in-${id} {
  to { --beam-opacity-${id}: 1; }
}

@keyframes beam-fade-out-${id} {
  from { --beam-opacity-${id}: 1; }
  to { --beam-opacity-${id}: 0; }
}
${hueShiftKeyframes}
${pausedAnimationsRule(id)}
`;
}

/**
 * Pulse Inner — contained breathing glow (port of v5 Card 4).
 * A full colorful perimeter ring (::after), an inner perimeter glow with corner
 * accents (::before), and a soft blurred bloom, all clipped inside the element.
 */
function generatePulseInnerVariantCSS(options: GenerateStylesOptions): string {
  const {
    id, borderRadius, borderWidth, duration,
    strokeOpacity, innerOpacity, bloomOpacity,
    colorVariant, staticColors, brightness, saturation, hueRange, theme,
  } = options;

  const isDark = theme === 'dark';

  const monoMul = colorVariant === 'mono' ? 0.5 : 1.0;
  const sStroke = (strokeOpacity * monoMul).toFixed(2);
  const sInner = (innerOpacity * monoMul).toFixed(2);
  const sBloom = (bloomOpacity * monoMul).toFixed(2);

  // Breathing parameters (theme-tuned). The motion itself is now driven from JS
  // (see getPulseDriverConfig / pulseDriver.ts); only `op` is needed here to set
  // the frozen bloom's average alpha.
  const { op } = pulseParams('pulse-inner', theme, duration);
  const bloomBlur = 8;

  const b = brightness.toFixed(2);
  const s = saturation.toFixed(2);

  // Slow hue drift is driven into --beam-hue-<id> by the JS loop (capped fps),
  // so the breathing layers no longer repaint at the display refresh rate.
  const ringAnim = staticColors
    ? `filter: brightness(${b}) saturate(${s});`
    : `filter: hue-rotate(calc(var(--beam-hue-base, 0deg) + var(--beam-hue-${id}))) brightness(${b}) saturate(${s});`;
  // Bloom shares the SAME hue rotation as the ring so the wide glow and the tight
  // ring stay color-synced. Gradients keep frozen opacity; only hue-rotate varies.
  const bloomAnim = staticColors
    ? `filter: blur(${bloomBlur}px) brightness(${b}) saturate(${s});`
    : `filter: blur(${bloomBlur}px) hue-rotate(calc(var(--beam-hue-base, 0deg) + var(--beam-hue-${id}))) brightness(${b}) saturate(${s});`;

  const ringGradients = pulseRingGradients(colorVariant, id);
  const innerGradients = pulseInnerGradients(colorVariant, id, isDark);
  // Frozen at the breathing time-average (midpoint of the [1-op, 1] opacity range).
  const bloomGradients = pulseTableGradientsStatic(PULSE_INNER_BLOOM, colorVariant, 1 - op * 0.5);

  return `
${pulsePropertyRegs(id)}

[data-beam="${id}"] {
  position: relative;
  border-radius: ${borderRadius}px;
  overflow: hidden;
  isolation: isolate;
}

[data-beam="${id}"][data-active] {
${pulseWrapperAnimation(id, 'beam-fade-in', 0.6)}
}

[data-beam="${id}"][data-fading] {
${pulseWrapperAnimation(id, 'beam-fade-out', 0.5)}
}

[data-beam="${id}"][data-active]::after,
[data-beam="${id}"][data-fading]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${borderRadius}px;
  padding: ${borderWidth}px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${ringGradients};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  z-index: 2;
  will-change: opacity, filter;
  opacity: calc(var(--beam-opacity-${id}) * ${sStroke} * var(--beam-stroke-opacity, 1) * var(--beam-strength, 1));
  ${ringAnim}
}

[data-beam="${id}"][data-active]::before,
[data-beam="${id}"][data-fading]::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${borderRadius}px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${innerGradients};
  -webkit-mask-image:
    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),
    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);
  -webkit-mask-composite: source-over;
  mask-image:
    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),
    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);
  mask-composite: add;
  pointer-events: none;
  z-index: 1;
  will-change: opacity, filter;
  opacity: calc(var(--beam-opacity-${id}) * ${sInner} * var(--beam-inner-opacity, 1) * var(--beam-strength, 1));
  ${ringAnim}
}

[data-beam="${id}"] [data-beam-bloom] {
  display: none;
  position: absolute;
  inset: 0;
  border-radius: ${borderRadius}px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${bloomGradients};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  padding: ${borderWidth}px;
  pointer-events: none;
  z-index: 3;
  will-change: opacity;
  opacity: 0;
}

[data-beam="${id}"][data-active] [data-beam-bloom],
[data-beam="${id}"][data-fading] [data-beam-bloom] {
  display: block;
  opacity: calc(var(--beam-opacity-${id}) * ${sBloom} * var(--beam-bloom-opacity, 1) * var(--beam-strength, 1));
  ${bloomAnim}
}

@keyframes beam-fade-in-${id} { to { --beam-opacity-${id}: 1; } }
@keyframes beam-fade-out-${id} { from { --beam-opacity-${id}: 1; } to { --beam-opacity-${id}: 0; } }
${pausedAnimationsRule(id)}

@media (prefers-reduced-motion: reduce) {
  [data-beam="${id}"][data-active],
  [data-beam="${id}"][data-fading],
  [data-beam="${id}"][data-active]::after,
  [data-beam="${id}"][data-fading]::after,
  [data-beam="${id}"][data-active]::before,
  [data-beam="${id}"][data-fading]::before,
  [data-beam="${id}"][data-active] [data-beam-bloom],
  [data-beam="${id}"][data-fading] [data-beam-bloom] {
    animation: none !important;
  }
}
`;
}

/**
 * Pulse Outside — outward-blooming breathing glow (port of v5 Card 5).
 * A crisp 1px colored stroke hugs the outer edge (::after), while the colorful
 * core (::before) and soft halo (bloom) radiate OUTWARD behind the element
 * (z-index:-1), so the glow spills outside and is never cropped.
 *
 * Requires the wrapped child to be opaque so the inner part is covered and only
 * the outward halo shows.
 */
function generatePulseOuterVariantCSS(options: GenerateStylesOptions): string {
  const {
    id, borderRadius, duration,
    strokeOpacity, innerOpacity, bloomOpacity,
    colorVariant, staticColors, brightness, saturation, hueRange, theme,
    hairlineOpacity = 0,
  } = options;

  const isDark = theme === 'dark';

  const monoMul = colorVariant === 'mono' ? 0.5 : 1.0;
  const sStroke = (strokeOpacity * monoMul).toFixed(2);
  const sInner = (innerOpacity * monoMul).toFixed(2);
  const sBloom = (bloomOpacity * monoMul).toFixed(2);

  // A constant 1px hairline frames the element. It is painted on the inner 1px
  // ring of the border-box (same place a standard `inset 0 0 0 1px` component
  // border sits) so the beam hairline/stroke align with the wrapped element's
  // own hairline instead of floating 1px outside it.
  const hairRGB = isDark ? '70, 70, 70' : '0, 0, 0';
  const hairOp = hairlineOpacity.toFixed(2);
  const hairlineLine = `linear-gradient(rgba(${hairRGB}, ${hairOp}), rgba(${hairRGB}, ${hairOp}))`;

  // Breathing parameters (theme-tuned). The motion is driven from JS now
  // (getPulseDriverConfig / pulseDriver.ts); only `op` is needed here for the
  // frozen bloom's average alpha.
  const { op } = pulseParams('pulse-outside', theme, duration);

  // Theme-dependent outward-glow constants (ported from v5 c6 defaults).
  const sw = 0.95; // glow width size
  const sh = 0.9; // glow height size (same in both themes)
  const glowBlur = isDark ? 3 : 6;
  const bloomBlur = isDark ? 22.5 : 15;

  const b = brightness.toFixed(2);
  const s = saturation.toFixed(2);

  // Slow hue drift is driven into --beam-hue-<id> by the JS loop (capped fps).
  const strokeAnim = staticColors
    ? `filter: brightness(${b}) saturate(${s});`
    : `filter: hue-rotate(calc(var(--beam-hue-base, 0deg) + var(--beam-hue-${id}))) brightness(${b}) saturate(${s});`;
  // Consumer hooks (--beam-core-blur / --beam-bloom-blur / --beam-glow-brightness /
  // --beam-glow-saturate) let integrators tune the glow WITHOUT overriding the whole
  // `filter` — replacing it externally would drop the hue-rotate term and desync the
  // glow colors from the stroke ring.
  const glowBright = `brightness(var(--beam-glow-brightness, ${b})) saturate(var(--beam-glow-saturate, ${s}))`;
  const coreAnim = staticColors
    ? `filter: blur(var(--beam-core-blur, ${glowBlur}px)) ${glowBright};`
    : `filter: blur(var(--beam-core-blur, ${glowBlur}px)) hue-rotate(calc(var(--beam-hue-base, 0deg) + var(--beam-hue-${id}))) ${glowBright};`;
  // Bloom (large halo) shares the SAME hue rotation as the core/stroke so the
  // wide glow and the tight glow stay in color sync (most visible on blue/green).
  // Its gradients keep frozen opacity, so only the cheap hue-rotate varies.
  const bloomAnim = staticColors
    ? `filter: blur(var(--beam-bloom-blur, ${bloomBlur}px)) ${glowBright};`
    : `filter: blur(var(--beam-bloom-blur, ${bloomBlur}px)) hue-rotate(calc(var(--beam-hue-base, 0deg) + var(--beam-hue-${id}))) ${glowBright};`;

  const strokeGradients = pulseTableGradients(PULSE_OUTER_CORE, colorVariant, id);
  const coreGradients = pulseTableGradients(PULSE_OUTER_CORE, colorVariant, id);
  // Frozen at the breathing time-average (midpoint of the [1-op, 1] opacity range).
  const bloomGradients = pulseTableGradientsStatic(PULSE_OUTER_BLOOM, colorVariant, 1 - op * 0.5);
  // Paint a static hairline in the SAME masked ring as the stroke glow so their
  // position and anti-aliasing always match exactly.
  const strokeBackground = hairlineOpacity > 0
    ? `${strokeGradients},
    ${hairlineLine}`
    : strokeGradients;

  return `
${pulsePropertyRegs(id)}

[data-beam="${id}"] {
  position: relative;
  border-radius: ${borderRadius}px;
  overflow: visible;
  isolation: isolate;
}

[data-beam="${id}"][data-active] {
${pulseWrapperAnimation(id, 'beam-fade-in', 0.6)}
}

[data-beam="${id}"][data-fading] {
${pulseWrapperAnimation(id, 'beam-fade-out', 0.5)}
}
${hairlineOpacity > 0 ? `
/* Idle hairline — painted above the (opaque) child in the inner 1px edge ring so
   it overlaps a standard inset component border exactly. */
[data-beam="${id}"]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${borderRadius}px;
  padding: 1px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${hairlineLine};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  z-index: 2;
}
` : ''}
[data-beam="${id}"][data-active]::after,
[data-beam="${id}"][data-fading]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${borderRadius}px;
  padding: 1px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${strokeBackground};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  z-index: 2;
  will-change: opacity, filter;
  opacity: calc(var(--beam-opacity-${id}) * ${sStroke} * var(--beam-stroke-opacity, 1) * var(--beam-strength, 1));
  ${strokeAnim}
}

[data-beam="${id}"][data-active]::before,
[data-beam="${id}"][data-fading]::before {
  content: "";
  position: absolute;
  inset: -10px;
  z-index: -1;
  border-radius: ${borderRadius + 10}px;
  background: ${coreGradients};
  transform: scale(${sw}, ${sh});
  pointer-events: none;
  will-change: opacity, filter;
  opacity: calc(var(--beam-opacity-${id}) * ${sInner} * var(--beam-inner-opacity, 1) * var(--beam-strength, 1));
  ${coreAnim}
}

[data-beam="${id}"] [data-beam-bloom] {
  display: none;
  position: absolute;
  inset: -30px;
  z-index: -1;
  border-radius: ${borderRadius + 30}px;
  background: ${bloomGradients};
  transform: scale(${sw}, ${sh});
  pointer-events: none;
  will-change: transform;
  opacity: 0;
}

[data-beam="${id}"][data-active] [data-beam-bloom],
[data-beam="${id}"][data-fading] [data-beam-bloom] {
  display: block;
  opacity: calc(var(--beam-opacity-${id}) * ${sBloom} * var(--beam-bloom-opacity, 1) * var(--beam-strength, 1));
  ${bloomAnim}
}

@keyframes beam-fade-in-${id} { to { --beam-opacity-${id}: 1; } }
@keyframes beam-fade-out-${id} { from { --beam-opacity-${id}: 1; } to { --beam-opacity-${id}: 0; } }
${pausedAnimationsRule(id)}

@media (prefers-reduced-motion: reduce) {
  [data-beam="${id}"][data-active],
  [data-beam="${id}"][data-fading],
  [data-beam="${id}"][data-active]::after,
  [data-beam="${id}"][data-fading]::after,
  [data-beam="${id}"][data-active]::before,
  [data-beam="${id}"][data-fading]::before,
  [data-beam="${id}"][data-active] [data-beam-bloom],
  [data-beam="${id}"][data-fading] [data-beam-bloom] {
    animation: none !important;
  }
}
`;
}

function generateLineVariantCSS(options: GenerateStylesOptions): string {
  const {
    id,
    borderRadius,
    borderWidth,
    duration,
    strokeOpacity,
    innerOpacity,
    bloomOpacity,
    innerShadow,
    colorVariant,
    staticColors,
    brightness,
    saturation,
    hueRange,
    theme,
  } = options;

  const innerRadius = Math.max(0, borderRadius - borderWidth);
  const isDark = theme === 'dark';
  
  const finalStrokeOpacity = strokeOpacity;
  const finalInnerOpacity = innerOpacity;
  const finalBloomOpacity = bloomOpacity;
  
  const hueShiftAnimation = staticColors 
    ? '' 
    : `animation: beam-hue-shift-${id} 12s ease-in-out infinite;`;

  const hueShiftBloomAnimation = staticColors
    ? ''
    : `animation: beam-hue-shift-bloom-${id} 8s ease-in-out infinite;`;
  
  const hueShiftKeyframes = staticColors ? '' : `
@keyframes beam-hue-shift-${id} {
  0% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - ${hueRange}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
  50% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) + ${hueRange}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
  100% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - ${hueRange}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
}

@keyframes beam-hue-shift-bloom-${id} {
  0% { filter: blur(8px) hue-rotate(calc(var(--beam-hue-base, 0deg) - ${hueRange + 10}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
  50% { filter: blur(8px) hue-rotate(calc(var(--beam-hue-base, 0deg) + ${hueRange + 10}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
  100% { filter: blur(8px) hue-rotate(calc(var(--beam-hue-base, 0deg) - ${hueRange + 10}deg)) brightness(${brightness.toFixed(2)}) saturate(${saturation.toFixed(2)}); }
}`;

  const whiteHighlight = isDark
    ? `radial-gradient(
        ellipse calc(24px * var(--beam-w-${id})) calc(28px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 2px),
        rgba(255, 255, 255, 0.38) 0%,
        rgba(255, 255, 255, 0.12) 30%,
        transparent 65%
      )`
    : `radial-gradient(
        ellipse calc(35px * var(--beam-w-${id})) calc(28px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 2px),
        rgba(0, 0, 0, 0.6) 0%,
        rgba(0, 0, 0, 0.25) 35%,
        transparent 70%
      )`;

  const colorGradients = getLineColorGradients(colorVariant, isDark, id);
  const innerGradients = getLineInnerGradients(colorVariant, id);

  const bloomGradients = getLineBloomGradients(colorVariant, isDark, id);
  const monoBloomBlur = colorVariant === 'mono' ? 'filter: blur(6px);' : '';

  return `
@property --beam-x-${id} {
  syntax: "<number>";
  initial-value: 0;
  inherits: true;
}

@property --beam-w-${id} {
  syntax: "<number>";
  initial-value: 1;
  inherits: true;
}

@property --beam-h-${id} {
  syntax: "<number>";
  initial-value: 1;
  inherits: true;
}

@property --beam-spike-${id} {
  syntax: "<number>";
  initial-value: 1;
  inherits: true;
}

@property --beam-spike2-${id} {
  syntax: "<number>";
  initial-value: 1;
  inherits: true;
}

@property --beam-edge-${id} {
  syntax: "<number>";
  initial-value: 1;
  inherits: true;
}

@property --beam-opacity-${id} {
  syntax: "<number>";
  initial-value: 0;
  inherits: true;
}

[data-beam="${id}"] {
  position: relative;
  border-radius: ${borderRadius}px;
  overflow: hidden;
}

[data-beam="${id}"][data-active] {
  animation:
    beam-travel-${id} ${duration}s linear infinite,
    beam-edge-fade-${id} ${duration}s linear infinite,
    beam-breathe-${id} ${(duration * 1.3).toFixed(1)}s ease-in-out infinite,
    beam-spike-${id} ${(duration * 1.33).toFixed(1)}s ease-in-out infinite,
    beam-spike2-${id} ${(duration * 1.7).toFixed(1)}s ease-in-out infinite,
    beam-fade-in-${id} 0.6s ease forwards;
}

[data-beam="${id}"][data-fading] {
  animation:
    beam-travel-${id} ${duration}s linear infinite,
    beam-edge-fade-${id} ${duration}s linear infinite,
    beam-breathe-${id} ${(duration * 1.3).toFixed(1)}s ease-in-out infinite,
    beam-spike-${id} ${(duration * 1.33).toFixed(1)}s ease-in-out infinite,
    beam-spike2-${id} ${(duration * 1.7).toFixed(1)}s ease-in-out infinite,
    beam-fade-out-${id} 0.5s ease forwards;
}

[data-beam="${id}"][data-active]::after,
[data-beam="${id}"][data-fading]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${innerRadius}px;
  padding: ${borderWidth}px;
  clip-path: inset(0 round ${borderRadius}px);
  background: ${whiteHighlight}, ${colorGradients};
  -webkit-mask:
    radial-gradient(
      ellipse calc(78px * var(--beam-w-${id})) calc(60px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) 100%,
      white 0%, rgba(255, 255, 255, 0.5) 45%, transparent 100%
    ),
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: source-in, xor;
  mask:
    radial-gradient(
      ellipse calc(78px * var(--beam-w-${id})) calc(60px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) 100%,
      white 0%, rgba(255, 255, 255, 0.5) 45%, transparent 100%
    ),
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: intersect, exclude;
  pointer-events: none;
  z-index: 2;
  opacity: calc(var(--beam-opacity-${id}) * var(--beam-edge-${id}) * ${finalStrokeOpacity.toFixed(2)} * var(--beam-stroke-opacity, 1) * var(--beam-strength, 1));
  ${hueShiftAnimation}
}

[data-beam="${id}"][data-active]::before,
[data-beam="${id}"][data-fading]::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${borderRadius}px;
  background: ${innerGradients};
  box-shadow: inset 0 0 9px 1px ${innerShadow};
  -webkit-mask-image:
    radial-gradient(
      ellipse calc(78px * var(--beam-w-${id})) calc(60px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) 100%,
      white 0%, rgba(255, 255, 255, 0.5) 45%, transparent 100%
    ),
    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),
    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);
  -webkit-mask-composite: source-in, source-over;
  mask-image:
    radial-gradient(
      ellipse calc(78px * var(--beam-w-${id})) calc(60px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) 100%,
      white 0%, rgba(255, 255, 255, 0.5) 45%, transparent 100%
    ),
    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),
    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);
  mask-composite: intersect, add;
  pointer-events: none;
  z-index: 1;
  opacity: calc(var(--beam-opacity-${id}) * var(--beam-edge-${id}) * ${finalInnerOpacity.toFixed(2)} * var(--beam-inner-opacity, 1) * var(--beam-strength, 1));
  clip-path: inset(0 round ${borderRadius}px);
  ${hueShiftAnimation}
}

[data-beam="${id}"] [data-beam-bloom] {
  display: none;
  position: absolute;
  inset: 0;
  border-radius: ${innerRadius}px;
  clip-path: inset(0 round ${borderRadius}px);
  padding: 0;
  -webkit-mask: radial-gradient(
    ellipse calc(84px * var(--beam-w-${id})) calc(110px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) 100%,
    white 0%, rgba(255, 255, 255, 0.5) 35%, transparent 100%
  );
  -webkit-mask-composite: source-over;
  mask: radial-gradient(
    ellipse calc(84px * var(--beam-w-${id})) calc(110px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) 100%,
    white 0%, rgba(255, 255, 255, 0.5) 35%, transparent 100%
  );
  mask-composite: add;
  background: ${bloomGradients};
  ${monoBloomBlur}
  pointer-events: none;
  z-index: 3;
  opacity: 0;
}

[data-beam="${id}"][data-active] [data-beam-bloom],
[data-beam="${id}"][data-fading] [data-beam-bloom] {
  display: block;
  opacity: calc(var(--beam-opacity-${id}) * var(--beam-edge-${id}) * ${finalBloomOpacity.toFixed(2)} * var(--beam-bloom-opacity, 1) * var(--beam-strength, 1));
  ${hueShiftBloomAnimation}
}

@keyframes beam-travel-${id} {
  0%   { --beam-x-${id}: 0.06;  --beam-w-${id}: 0.5; }
  10%  { --beam-x-${id}: 0.15;  --beam-w-${id}: 0.8; }
  20%  { --beam-x-${id}: 0.25;  --beam-w-${id}: 1.1; }
  30%  { --beam-x-${id}: 0.35;  --beam-w-${id}: 1.3; }
  40%  { --beam-x-${id}: 0.44;  --beam-w-${id}: 1.45; }
  50%  { --beam-x-${id}: 0.5;   --beam-w-${id}: 1.5; }
  60%  { --beam-x-${id}: 0.56;  --beam-w-${id}: 1.45; }
  70%  { --beam-x-${id}: 0.65;  --beam-w-${id}: 1.3; }
  80%  { --beam-x-${id}: 0.75;  --beam-w-${id}: 1.1; }
  90%  { --beam-x-${id}: 0.85;  --beam-w-${id}: 0.8; }
  100% { --beam-x-${id}: 0.94;  --beam-w-${id}: 0.5; }
}

@keyframes beam-edge-fade-${id} {
  0%    { --beam-edge-${id}: 0; }
  12.5% { --beam-edge-${id}: 0; }
  32.5% { --beam-edge-${id}: 1; }
  67.5% { --beam-edge-${id}: 1; }
  87.5% { --beam-edge-${id}: 0; }
  100%  { --beam-edge-${id}: 0; }
}

@keyframes beam-breathe-${id} {
  0%, 100% { --beam-h-${id}: 0.8; }
  25%      { --beam-h-${id}: 1.25; }
  55%      { --beam-h-${id}: 0.85; }
  80%      { --beam-h-${id}: 1.3; }
}

@keyframes beam-spike-${id} {
  0%   { --beam-spike-${id}: 0.8; }
  25%  { --beam-spike-${id}: 1.3; }
  50%  { --beam-spike-${id}: 0.9; }
  75%  { --beam-spike-${id}: 1.4; }
  100% { --beam-spike-${id}: 0.8; }
}

@keyframes beam-spike2-${id} {
  0%   { --beam-spike2-${id}: 1.2; }
  25%  { --beam-spike2-${id}: 0.7; }
  50%  { --beam-spike2-${id}: 1.4; }
  75%  { --beam-spike2-${id}: 0.8; }
  100% { --beam-spike2-${id}: 1.2; }
}

@keyframes beam-fade-in-${id} {
  to { --beam-opacity-${id}: 1; }
}

@keyframes beam-fade-out-${id} {
  from { --beam-opacity-${id}: 1; }
  to { --beam-opacity-${id}: 0; }
}
${hueShiftKeyframes}
${pausedAnimationsRule(id)}
`;
}
