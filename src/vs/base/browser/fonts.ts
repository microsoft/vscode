/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from './window.js';
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
