/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Vendored (adapted) from border-beam by Jakub Antalik (MIT). See LICENSE.txt in
// this folder. The React component and its prop types were dropped; only the
// framework-agnostic type declarations consumed by styles.ts / pulseDriver.ts
// are kept. Applied to the DOM by borderBeamElement.ts.


/**
 * Size/type preset for the border beam effect
 *
 * Rotate family (traveling/spinning beam):
 * - 'sm': Small button-sized with compact glow
 * - 'md': Medium card-sized with full border glow
 * - 'line': Bottom-only traveling glow with breathe and spike animations
 *
 * Pulse family (breathing glow, no rotation):
 * - 'pulse-outside': Glow blooms OUTWARD beyond the element (uncropped halo)
 * - 'pulse-inner': Glow breathes contained within the element's border
 */
export type BorderBeamSize = 'sm' | 'md' | 'line' | 'pulse-outside' | 'pulse-inner';

/**
 * Theme mode for adapting beam colors to background
 */
export type BorderBeamTheme = 'dark' | 'light' | 'auto';

/**
 * Color variant for the beam effect
 * - 'colorful': Full rainbow spectrum (default)
 * - 'mono': Monochromatic grayscale
 * - 'ocean': Blue and purple tones
 * - 'sunset': Warm orange, yellow, and red tones
 */
export type BorderBeamColorVariant = 'colorful' | 'mono' | 'ocean' | 'sunset';

/**
 * Configuration for a size preset
 */
export interface SizeConfig {
  borderRadius: number;
  borderWidth: number;
  width?: number;
  height?: number;
}

/**
 * Theme color configuration
 */
export interface ThemeColors {
  strokeOpacity: number;
  innerOpacity: number;
  bloomOpacity: number;
  innerShadow: string;
  saturation: number;
  /** Optional per-type default brightness (used by pulse types). Falls back to 1.3. */
  brightness?: number;
  /**
   * Optional opacity of the 1px hairline border that frames the element.
   * Used by 'pulse-outside' so the colored stroke rides a subtle outline,
   * matching the v5 prototype. Falls back to 0 (no hairline).
   */
  hairlineOpacity?: number;
}
