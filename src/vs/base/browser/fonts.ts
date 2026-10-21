/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from './window.js';
import { Emitter, Event } from '../common/event.js';
import type { IJSONSchemaSnippet } from '../common/jsonSchema.js';
import { isElectron, isMacintosh, isWindows } from '../common/platform.js';

/**
 * The best font-family to be used in CSS based on the platform:
 * - Windows: Segoe preferred, fallback to sans-serif
 * - macOS: standard system font, fallback to sans-serif
 * - Linux: standard system font preferred, fallback to Ubuntu fonts
 *
 * Note: this currently does not adjust for different locales.
 */
export const DEFAULT_FONT_FAMILY = isWindows ? '"Segoe WPC", "Segoe UI", sans-serif' : isMacintosh ? '-apple-system, BlinkMacSystemFont, sans-serif' : 'system-ui, "Ubuntu", "Droid Sans", sans-serif';

interface FontData {
	readonly family: string;
}

export const getFonts = async (): Promise<string[]> => {
	try {
		// @ts-ignore
		const fonts = await mainWindow.queryLocalFonts() as FontData[];
		const fontsArray = [...fonts];
		const families = fontsArray.map(font => font.family);
		return families;
	} catch (error) {
		console.error(`Failed to query fonts: ${error}`);
		return [];
	}
};


export const getFontSnippets = async (): Promise<IJSONSchemaSnippet[]> => {
	if (!isElectron) {
		return [];
	}
	const fonts = await getFonts();
	const snippets: IJSONSchemaSnippet[] = fonts.map(font => {
		return {
			body: `${font}`
		};
	});
	return snippets;
};

/**
 * The default font size (px) of the workbench UI.
 */
export const DEFAULT_UI_FONT_SIZE = 13;

/**
 * The font of the workbench UI. Editors and other content with their own font
 * settings are not affected by it.
 */
export interface IUITypography {
	/** The font size in px. */
	readonly fontSize: number;
	/** The font family, or `undefined` for the platform default. */
	readonly fontFamily: string | undefined;
}

export const DEFAULT_UI_TYPOGRAPHY: IUITypography = { fontSize: DEFAULT_UI_FONT_SIZE, fontFamily: undefined };

export function isEqualUITypography(a: IUITypography, b: IUITypography): boolean {
	return a.fontSize === b.fontSize && a.fontFamily === b.fontFamily;
}

let uiTypography = DEFAULT_UI_TYPOGRAPHY;
const onDidChangeUITypographyEmitter = new Emitter<IUITypography>();

/**
 * Fires after the UI typography changed. The corresponding CSS has already been
 * applied at that point, so listeners can measure the new typography.
 */
export const onDidChangeUITypography: Event<IUITypography> = onDidChangeUITypographyEmitter.event;

export function getUITypography(): IUITypography {
	return uiTypography;
}

/**
 * Updates the UI typography. Callers must apply the corresponding CSS before.
 */
export function setUITypography(typography: IUITypography): void {
	if (!isEqualUITypography(typography, uiTypography)) {
		uiTypography = { fontSize: typography.fontSize, fontFamily: typography.fontFamily };
		onDidChangeUITypographyEmitter.fire(uiTypography);
	}
}

/**
 * Scales a fixed UI metric in px, such as a row or header height designed for
 * {@link DEFAULT_UI_FONT_SIZE}, to the UI font size. Never returns less than
 * the given metric.
 */
export function scaleUIMetric(px: number, typography: IUITypography = uiTypography): number {
	const { fontSize } = typography;
	return fontSize <= DEFAULT_UI_FONT_SIZE ? px : Math.ceil(px * fontSize / DEFAULT_UI_FONT_SIZE);
}
