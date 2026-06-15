/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { getIconsStyleSheet } from '../../../../platform/theme/browser/iconsStyleSheet.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IThemingRegistry, Extensions as ThemingExtensions } from '../../../../platform/theme/common/themeService.js';
import { generateColorThemeCSS } from '../../../services/themes/browser/colorThemeCss.js';
import { ColorThemeData } from '../../../services/themes/common/colorThemeData.js';

const themingRegistry = Registry.as<IThemingRegistry>(ThemingExtensions.ThemingContribution);
const mockEnvironmentService: IEnvironmentService = Object.create(null);

let globalStyleSheetPromise: Promise<CSSStyleSheet> | undefined;
let iconsStyleSheetCache: CSSStyleSheet | undefined;
let darkThemeStyleSheet: CSSStyleSheet | undefined;
let lightThemeStyleSheet: CSSStyleSheet | undefined;

/**
 * Controls how the bundled stylesheet documents are reordered.
 * - `false`: keep the original (product) order.
 * - `true`: reverse the order of all documents.
 * - `{ fromIndex, toIndex }`: reverse only the documents in the half-open
 *   index range `[fromIndex, toIndex)`. This is what the order-dependency
 *   bisection uses to narrow down which documents conflict.
 */
export type ReverseStylesheetsOption = boolean | { readonly fromIndex: number; readonly toIndex: number };

/**
 * Matches a VS Code source-file copyright banner, which the build preserves in
 * the bundled CSS and which therefore delimits the per-source-file "documents"
 * concatenated into a single stylesheet.
 */
const COPYRIGHT_BANNER_REGEX = /\/\*-+[\s\S]*?Copyright \(c\) Microsoft Corporation[\s\S]*?\*\//g;

/**
 * Reverses the order of whole documents (delimited by the copyright banner)
 * within a stylesheet, while preserving rule order inside each document. Any
 * text before the first banner is kept in place as a preamble. When `option`
 * is a range, only the documents in `[fromIndex, toIndex)` are reversed and the
 * rest stay in place.
 */
function reverseDocumentsByBanner(cssText: string, option: Exclude<ReverseStylesheetsOption, false>): string {
	const banners = Array.from(cssText.matchAll(COPYRIGHT_BANNER_REGEX));
	if (banners.length < 2) {
		return cssText;
	}
	const preamble = cssText.slice(0, banners[0].index);
	const documents = banners.map((banner, i) => {
		const start = banner.index;
		const end = i + 1 < banners.length ? banners[i + 1].index : cssText.length;
		return cssText.slice(start, end);
	});

	const from = option === true ? 0 : Math.max(0, Math.min(documents.length, option.fromIndex));
	const to = option === true ? documents.length : Math.max(from, Math.min(documents.length, option.toIndex));

	const reordered = [
		...documents.slice(0, from),
		...documents.slice(from, to).reverse(),
		...documents.slice(to),
	];
	return preamble + reordered.join('');
}

/**
 * Reads the raw source text of a stylesheet (which, unlike `cssRules`, retains
 * comments such as the copyright banner). Falls back to serialized rules when
 * the source cannot be read.
 */
async function readStyleSheetSource(sheet: CSSStyleSheet): Promise<string> {
	const owner = sheet.ownerNode;
	if (owner instanceof HTMLStyleElement) {
		return owner.textContent ?? '';
	}
	if (sheet.href) {
		try {
			return await (await fetch(sheet.href)).text();
		} catch {
			// Fall back to serialized rules below.
		}
	}
	try {
		return Array.from(sheet.cssRules, rule => rule.cssText).join('\n');
	} catch {
		// Cross-origin stylesheets can't be read
		return '';
	}
}

async function buildGlobalStyleSheet(reverse: ReverseStylesheetsOption): Promise<CSSStyleSheet> {
	const sheet = new CSSStyleSheet();

	// Reversing the whole-document order of the bundled CSS makes cascade ties
	// that are decided purely by source order resolve the opposite way. Because
	// adopted stylesheets are applied after the document's `<link>`/`<style>`
	// sheets in the cascade, this reversed copy wins those ties and surfaces
	// order-dependent conflicts. The reverse mode is driven by the render
	// `input` (e.g. `--input '{"reverseStylesheets":true}'`) so it stays scoped
	// to a single render run and never mutates persistent global state.
	if (reverse) {
		const sources = await Promise.all(Array.from(document.styleSheets, readStyleSheetSource));
		sheet.replaceSync(reverseDocumentsByBanner(sources.join('\n'), reverse));
		return sheet;
	}

	const globalRules: string[] = [];
	for (const styleSheet of Array.from(document.styleSheets)) {
		try {
			for (const rule of Array.from(styleSheet.cssRules)) {
				globalRules.push(rule.cssText);
			}
		} catch {
			// Cross-origin stylesheets can't be read
		}
	}
	sheet.replaceSync(globalRules.join('\n'));
	return sheet;
}

function getGlobalStyleSheet(reverse: ReverseStylesheetsOption): Promise<CSSStyleSheet> {
	if (!globalStyleSheetPromise) {
		globalStyleSheetPromise = buildGlobalStyleSheet(reverse);
	}
	return globalStyleSheetPromise;
}

function getIconsStyleSheetCached(): CSSStyleSheet {
	if (!iconsStyleSheetCache) {
		iconsStyleSheetCache = new CSSStyleSheet();
		const iconsSheet = getIconsStyleSheet(undefined);
		iconsStyleSheetCache.replaceSync(iconsSheet.getCSS() as string);
		iconsSheet.dispose();
	}
	return iconsStyleSheetCache;
}

function getThemeStyleSheet(theme: ColorThemeData): CSSStyleSheet {
	const isDark = theme.type === ColorScheme.DARK;
	if (isDark && darkThemeStyleSheet) {
		return darkThemeStyleSheet;
	}
	if (!isDark && lightThemeStyleSheet) {
		return lightThemeStyleSheet;
	}

	const scopeSelector = '.' + theme.classNames[0];
	const sheet = new CSSStyleSheet();
	const css = generateColorThemeCSS(
		theme,
		scopeSelector,
		themingRegistry.getThemingParticipants(),
		mockEnvironmentService
	);
	sheet.replaceSync(css.code);

	if (isDark) {
		darkThemeStyleSheet = sheet;
	} else {
		lightThemeStyleSheet = sheet;
	}
	return sheet;
}

let globalStylesPromise: Promise<void> | undefined;

export interface InstallGlobalStylesOptions {
	/** See {@link ReverseStylesheetsOption}. Defaults to no reversal. */
	readonly reverseStylesheets?: ReverseStylesheetsOption;
}

/**
 * Installs the bundled global styles, the icon font styles, and a scoped
 * stylesheet for each of the given themes as `document.adoptedStyleSheets`.
 * Idempotent: the work runs at most once regardless of how often it is called.
 * The reverse-order behaviour (used to detect cascade-order dependencies) is
 * controlled per render run via {@link InstallGlobalStylesOptions.reverseStylesheets}.
 */
export function installGlobalStyles(themes: readonly ColorThemeData[], options?: InstallGlobalStylesOptions): Promise<void> {
	if (!globalStylesPromise) {
		const reverse = options?.reverseStylesheets ?? false;
		globalStylesPromise = (async () => {
			const globalSheet = await getGlobalStyleSheet(reverse);
			document.adoptedStyleSheets = [
				...document.adoptedStyleSheets,
				globalSheet,
				getIconsStyleSheetCached(),
				...themes.map(getThemeStyleSheet),
			];
		})();
	}
	return globalStylesPromise;
}
