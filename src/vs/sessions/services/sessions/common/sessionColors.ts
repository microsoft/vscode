/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { localize } from '../../../../nls.js';
import { asCssVariable, ColorIdentifier, registerColor } from '../../../../platform/theme/common/colorUtils.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';

/**
 * Named colors that session groups, workspace sections and collections can use
 * in the sessions list. Each id maps to a registered theme color so that themes
 * can retune the palette.
 */
export const enum SessionPaletteColor {
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

/** Palette colors in display order. */
export const SESSION_PALETTE_COLORS: readonly SessionPaletteColor[] = [
	SessionPaletteColor.Grey,
	SessionPaletteColor.Blue,
	SessionPaletteColor.Red,
	SessionPaletteColor.Yellow,
	SessionPaletteColor.Green,
	SessionPaletteColor.Pink,
	SessionPaletteColor.Purple,
	SessionPaletteColor.Cyan,
	SessionPaletteColor.Orange,
];

/** A palette color id, or a custom color as a lowercase `#rrggbb` string. */
export type SessionColor = SessionPaletteColor | `#${string}`;

/** How the label on a colored header picks its text color. */
export const enum SessionTextColorMode {
	/** Light or dark text, whichever has the higher contrast against the fill. */
	Auto = 'auto',
	Light = 'light',
	Dark = 'dark',
}

//#region Theme colors

const paletteDefaults: Record<SessionPaletteColor, { readonly dark: string; readonly light: string; readonly description: string }> = {
	[SessionPaletteColor.Grey]: { dark: '#8e939b', light: '#646a73', description: localize('agentsSessionGroup.grey', "Grey color used for session groups, workspaces and collections in the Agents window sessions list.") },
	[SessionPaletteColor.Blue]: { dark: '#78a4f5', light: '#2f6fdb', description: localize('agentsSessionGroup.blue', "Blue color used for session groups, workspaces and collections in the Agents window sessions list.") },
	[SessionPaletteColor.Red]: { dark: '#ee8479', light: '#cc4136', description: localize('agentsSessionGroup.red', "Red color used for session groups, workspaces and collections in the Agents window sessions list.") },
	[SessionPaletteColor.Yellow]: { dark: '#d6bd62', light: '#d4a72c', description: localize('agentsSessionGroup.yellow', "Yellow color used for session groups, workspaces and collections in the Agents window sessions list.") },
	[SessionPaletteColor.Green]: { dark: '#74c48f', light: '#23864c', description: localize('agentsSessionGroup.green', "Green color used for session groups, workspaces and collections in the Agents window sessions list.") },
	[SessionPaletteColor.Pink]: { dark: '#e07cc2', light: '#c0368e', description: localize('agentsSessionGroup.pink', "Pink color used for session groups, workspaces and collections in the Agents window sessions list.") },
	[SessionPaletteColor.Purple]: { dark: '#b99cf6', light: '#7a52d4', description: localize('agentsSessionGroup.purple', "Purple color used for session groups, workspaces and collections in the Agents window sessions list.") },
	[SessionPaletteColor.Cyan]: { dark: '#62bec3', light: '#127f86', description: localize('agentsSessionGroup.cyan', "Cyan color used for session groups, workspaces and collections in the Agents window sessions list.") },
	[SessionPaletteColor.Orange]: { dark: '#eda468', light: '#e2873a', description: localize('agentsSessionGroup.orange', "Orange color used for session groups, workspaces and collections in the Agents window sessions list.") },
};

/** Theme color ids of the palette, e.g. `agentsSessionGroup.blue`. */
export const sessionPaletteColorIds: Readonly<Record<SessionPaletteColor, ColorIdentifier>> = Object.fromEntries(SESSION_PALETTE_COLORS.map(id => {
	const { dark, light, description } = paletteDefaults[id];
	return [id, registerColor(`agentsSessionGroup.${id}`, { dark, light, hcDark: dark, hcLight: light }, description)];
})) as Record<SessionPaletteColor, ColorIdentifier>;

export const sessionGroupLightForeground = registerColor(
	'agentsSessionGroup.lightForeground',
	{ dark: '#ffffff', light: '#ffffff', hcDark: '#ffffff', hcLight: '#ffffff' },
	localize('agentsSessionGroup.lightForeground', "Light text color used on colored session group and workspace headers in the Agents window sessions list."),
);

export const sessionGroupDarkForeground = registerColor(
	'agentsSessionGroup.darkForeground',
	{ dark: '#161616', light: '#161616', hcDark: '#000000', hcLight: '#000000' },
	localize('agentsSessionGroup.darkForeground', "Dark text color used on colored session group and workspace headers in the Agents window sessions list."),
);

//#endregion

//#region Values

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isSessionPaletteColor(value: unknown): value is SessionPaletteColor {
	return typeof value === 'string' && (SESSION_PALETTE_COLORS as readonly string[]).includes(value);
}

/** Whether the value is `#rgb`, `#rrggbb`, `rgb` or `rrggbb`. */
export function isValidHexColor(value: string): boolean {
	return HEX_COLOR.test(value.trim());
}

/** Normalizes a valid hex color to lowercase `#rrggbb`, or returns `undefined`. */
export function normalizeHexColor(value: string): `#${string}` | undefined {
	const trimmed = value.trim().toLowerCase();
	if (!HEX_COLOR.test(trimmed)) {
		return undefined;
	}
	const digits = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
	return digits.length === 3
		? `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
		: `#${digits}`;
}

/** Validates a persisted or user-provided color, normalizing custom hex colors. */
export function toSessionColor(value: unknown): SessionColor | undefined {
	if (isSessionPaletteColor(value)) {
		return value;
	}
	return typeof value === 'string' ? normalizeHexColor(value) : undefined;
}

export function toSessionTextColorMode(value: unknown): SessionTextColorMode {
	return value === SessionTextColorMode.Light || value === SessionTextColorMode.Dark ? value : SessionTextColorMode.Auto;
}

/**
 * The first palette color, in display order after `start`, that is not in use.
 * When every color is in use the palette repeats, continuing from the least
 * used color so that neighbouring groups rarely share a color.
 */
export function getNextSessionColor(used: Iterable<SessionColor | undefined>, start: SessionPaletteColor = SessionPaletteColor.Blue): SessionPaletteColor {
	const counts = new Map<SessionPaletteColor, number>(SESSION_PALETTE_COLORS.map(color => [color, 0]));
	for (const color of used) {
		if (color && isSessionPaletteColor(color)) {
			counts.set(color, counts.get(color)! + 1);
		}
	}
	const startIndex = Math.max(0, SESSION_PALETTE_COLORS.indexOf(start));
	const ordered = [...SESSION_PALETTE_COLORS.slice(startIndex), ...SESSION_PALETTE_COLORS.slice(0, startIndex)];
	let best = ordered[0];
	for (const color of ordered) {
		if (counts.get(color)! < counts.get(best)!) {
			best = color;
		}
	}
	return best;
}

export function getSessionPaletteColorLabel(color: SessionPaletteColor): string {
	switch (color) {
		case SessionPaletteColor.Grey: return localize('sessionColor.grey', "Grey");
		case SessionPaletteColor.Blue: return localize('sessionColor.blue', "Blue");
		case SessionPaletteColor.Red: return localize('sessionColor.red', "Red");
		case SessionPaletteColor.Yellow: return localize('sessionColor.yellow', "Yellow");
		case SessionPaletteColor.Green: return localize('sessionColor.green', "Green");
		case SessionPaletteColor.Pink: return localize('sessionColor.pink', "Pink");
		case SessionPaletteColor.Purple: return localize('sessionColor.purple', "Purple");
		case SessionPaletteColor.Cyan: return localize('sessionColor.cyan', "Cyan");
		case SessionPaletteColor.Orange: return localize('sessionColor.orange', "Orange");
	}
}

/** A user-facing name for a color: the palette name, or the uppercase hex value. */
export function describeSessionColor(color: SessionColor): string {
	return isSessionPaletteColor(color) ? getSessionPaletteColorLabel(color) : color.toUpperCase();
}

//#endregion

//#region Contrast

export interface ISessionTextColorChoice {
	/** Whether the light text color is used. */
	readonly light: boolean;
	/** WCAG contrast ratio of the chosen text color against the fill. */
	readonly contrast: number;
}

/**
 * Picks the label text color for a fill. In {@link SessionTextColorMode.Auto}
 * mode the text color with the higher WCAG contrast wins; a tie picks dark text.
 */
export function chooseSessionTextColor(fill: Color, lightText: Color, darkText: Color, mode: SessionTextColorMode): ISessionTextColorChoice {
	const lightContrast = fill.getContrastRatio(lightText);
	const darkContrast = fill.getContrastRatio(darkText);
	const light = mode === SessionTextColorMode.Auto ? lightContrast > darkContrast : mode === SessionTextColorMode.Light;
	return { light, contrast: light ? lightContrast : darkContrast };
}

/** Formats a contrast ratio with one decimal, e.g. `4.5:1`. */
export function formatContrastRatio(ratio: number): string {
	return `${(Math.round(ratio * 10) / 10).toFixed(1)}:1`;
}

export interface IResolvedSessionColor {
	/** CSS value for the fill: a theme variable for palette colors, the hex value otherwise. */
	readonly fillCss: string;
	/** CSS value for the label text: a theme variable. */
	readonly textCss: string;
	/** The fill in the given theme. */
	readonly fill: Color;
	readonly textIsLight: boolean;
	readonly contrast: number;
}

const FALLBACK_LIGHT = Color.fromHex('#ffffff');
const FALLBACK_DARK = Color.fromHex('#161616');

/** Resolves a color and text mode against a theme. */
export function resolveSessionColor(color: SessionColor, mode: SessionTextColorMode, theme: IColorTheme): IResolvedSessionColor {
	let fill: Color;
	let fillCss: string;
	if (isSessionPaletteColor(color)) {
		const id = sessionPaletteColorIds[color];
		fill = theme.getColor(id) ?? Color.fromHex(paletteDefaults[color].dark);
		fillCss = asCssVariable(id);
	} else {
		fill = Color.fromHex(color);
		fillCss = color;
	}
	const choice = chooseSessionTextColor(
		fill,
		theme.getColor(sessionGroupLightForeground) ?? FALLBACK_LIGHT,
		theme.getColor(sessionGroupDarkForeground) ?? FALLBACK_DARK,
		mode,
	);
	return {
		fill,
		fillCss,
		textCss: asCssVariable(choice.light ? sessionGroupLightForeground : sessionGroupDarkForeground),
		textIsLight: choice.light,
		contrast: choice.contrast,
	};
}

//#endregion
