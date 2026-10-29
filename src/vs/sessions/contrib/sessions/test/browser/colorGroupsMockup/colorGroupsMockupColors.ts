/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../../../base/common/color.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';

/** Named colors offered for groups, workspaces, and collections (mirrors browser tab-group palettes). */
export const enum MockPaletteColor {
	Grey = 'grey',
	Blue = 'blue',
	Red = 'red',
	Yellow = 'yellow',
	Green = 'green',
	Pink = 'pink',
	Purple = 'purple',
	Cyan = 'cyan',
	Orange = 'orange',
}

export const MOCK_PALETTE_ORDER: readonly MockPaletteColor[] = [
	MockPaletteColor.Grey,
	MockPaletteColor.Blue,
	MockPaletteColor.Red,
	MockPaletteColor.Yellow,
	MockPaletteColor.Green,
	MockPaletteColor.Pink,
	MockPaletteColor.Purple,
	MockPaletteColor.Cyan,
	MockPaletteColor.Orange,
];

export const MOCK_PALETTE_LABELS: Readonly<Record<MockPaletteColor, string>> = {
	[MockPaletteColor.Grey]: 'Grey',
	[MockPaletteColor.Blue]: 'Blue',
	[MockPaletteColor.Red]: 'Red',
	[MockPaletteColor.Yellow]: 'Yellow',
	[MockPaletteColor.Green]: 'Green',
	[MockPaletteColor.Pink]: 'Pink',
	[MockPaletteColor.Purple]: 'Purple',
	[MockPaletteColor.Cyan]: 'Cyan',
	[MockPaletteColor.Orange]: 'Orange',
};

/**
 * Per-theme values for the named palette. In a product implementation these
 * would be registered theme colors (like `charts.*`) so themes can retune them;
 * dark themes use softer tints and light themes use deeper tones.
 */
const PALETTE_VALUES: Readonly<Record<'dark' | 'light', Readonly<Record<MockPaletteColor, string>>>> = {
	dark: {
		[MockPaletteColor.Grey]: '#8e939b',
		[MockPaletteColor.Blue]: '#78a4f5',
		[MockPaletteColor.Red]: '#ee8479',
		[MockPaletteColor.Yellow]: '#d6bd62',
		[MockPaletteColor.Green]: '#74c48f',
		[MockPaletteColor.Pink]: '#e07cc2',
		[MockPaletteColor.Purple]: '#b99cf6',
		[MockPaletteColor.Cyan]: '#62bec3',
		[MockPaletteColor.Orange]: '#eda468',
	},
	light: {
		[MockPaletteColor.Grey]: '#646a73',
		[MockPaletteColor.Blue]: '#2f6fdb',
		[MockPaletteColor.Red]: '#cc4136',
		[MockPaletteColor.Yellow]: '#d4a72c',
		[MockPaletteColor.Green]: '#23864c',
		[MockPaletteColor.Pink]: '#c0368e',
		[MockPaletteColor.Purple]: '#7a52d4',
		[MockPaletteColor.Cyan]: '#127f86',
		[MockPaletteColor.Orange]: '#e2873a',
	},
};

export type MockColor =
	| { readonly kind: 'palette'; readonly id: MockPaletteColor }
	| { readonly kind: 'custom'; readonly hex: string };

export const enum MockTextColorMode {
	Auto = 'auto',
	Light = 'light',
	Dark = 'dark',
}

const DARK_TEXT = Color.fromHex('#161616');
const LIGHT_TEXT = Color.fromHex('#ffffff');

/** A color resolved against the active theme, with the text color that reads on top of it. */
export interface IResolvedMockColor {
	/** The fill color as `#rrggbb`. */
	readonly fill: string;
	/** The text color to render on {@link fill}. */
	readonly text: string;
	/** Whether {@link text} is the light variant. */
	readonly textIsLight: boolean;
	/** WCAG contrast ratio between {@link text} and {@link fill}. */
	readonly contrast: number;
	/** Whether the text color was chosen automatically. */
	readonly automatic: boolean;
}

export function paletteValue(id: MockPaletteColor, scheme: ColorScheme): string {
	return PALETTE_VALUES[isLightScheme(scheme) ? 'light' : 'dark'][id];
}

export function isLightScheme(scheme: ColorScheme): boolean {
	return scheme === ColorScheme.LIGHT || scheme === ColorScheme.HIGH_CONTRAST_LIGHT;
}

export function mockColorEquals(a: MockColor | undefined, b: MockColor | undefined): boolean {
	if (!a || !b) {
		return a === b;
	}
	if (a.kind === 'palette' && b.kind === 'palette') {
		return a.id === b.id;
	}
	if (a.kind === 'custom' && b.kind === 'custom') {
		return a.hex.toLowerCase() === b.hex.toLowerCase();
	}
	return false;
}

export function describeMockColor(color: MockColor): string {
	return color.kind === 'palette' ? MOCK_PALETTE_LABELS[color.id] : color.hex.toUpperCase();
}

/**
 * Resolves a color for the active theme and picks readable text for it.
 * `Auto` picks whichever of the dark/light text colors has the higher WCAG
 * contrast ratio against the fill, which keeps pastel fills on dark text and
 * saturated or deep fills on white text.
 */
export function resolveMockColor(color: MockColor, scheme: ColorScheme, mode: MockTextColorMode = MockTextColorMode.Auto): IResolvedMockColor {
	const fillHex = color.kind === 'palette' ? paletteValue(color.id, scheme) : normalizeHex(color.hex);
	const fill = Color.fromHex(fillHex);
	const darkContrast = fill.getContrastRatio(DARK_TEXT);
	const lightContrast = fill.getContrastRatio(LIGHT_TEXT);
	const useLight = mode === MockTextColorMode.Auto ? lightContrast > darkContrast : mode === MockTextColorMode.Light;
	return {
		fill: fillHex,
		text: Color.Format.CSS.formatHex(useLight ? LIGHT_TEXT : DARK_TEXT),
		textIsLight: useLight,
		contrast: useLight ? lightContrast : darkContrast,
		automatic: mode === MockTextColorMode.Auto,
	};
}

export function normalizeHex(value: string): string {
	const trimmed = value.trim().replace(/^#?/, '#').toLowerCase();
	if (/^#[0-9a-f]{3}$/.test(trimmed)) {
		return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
	}
	return trimmed;
}

export function isValidHex(value: string): boolean {
	return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** Formats a contrast ratio the way accessibility tools do, e.g. `7.2:1`. */
export function formatContrast(ratio: number): string {
	return `${(Math.round(ratio * 10) / 10).toFixed(1)}:1`;
}
