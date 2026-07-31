/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { getIconsStyleSheet } from '../../../../platform/theme/browser/iconsStyleSheet.js';
import { IThemingParticipant, IThemingRegistry, Extensions as ThemingExtensions } from '../../../../platform/theme/common/themeService.js';
import { generateColorThemeCSS } from '../../../services/themes/browser/colorThemeCss.js';
import { ColorThemeData } from '../../../services/themes/common/colorThemeData.js';

const themingRegistry = Registry.as<IThemingRegistry>(ThemingExtensions.ThemingContribution);
const mockEnvironmentService: IEnvironmentService = Object.create(null);

let overlaySheet: CSSStyleSheet | undefined;
let baseStylesInstalledPromise: Promise<void> | undefined;
let bundlePromise: Promise<Bundle> | undefined;
let bundle: Bundle | undefined;
let activeOverride: object | undefined;
let iconsStyleSheetCache: CSSStyleSheet | undefined;
const themeStyleSheetCache = new WeakMap<ColorThemeData, CSSStyleSheet>();
const installedThemes = new WeakSet<ColorThemeData>();

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
 * Matches the `@css-source: <path>` marker that `cssSourceMarkerLoader` injects
 * before each source file's CSS in the concatenated bundle. These markers are
 * the canonical per-source-file delimiters: every CSS module processed by the
 * build gets exactly one, and it carries the module's repo-relative path.
 */
const CSS_SOURCE_MARKER_REGEX = /\/\*\s*@css-source:\s*(\S+)\s*\*\//g;

interface StylesheetDocument {
	/** Repo-relative source path from the `@css-source` marker. */
	readonly file: string;
	/** The marker plus the file's CSS, up to the next marker. */
	readonly text: string;
}

/**
 * Splits the concatenated bundle into per-source-file documents at the
 * `@css-source` markers. Any text before the first marker is returned as the
 * `preamble` and kept in place. This single definition of a "document" is used
 * for both reversal and the index→file reporting, so the bisection driver never
 * needs to understand the bundle format.
 */
function parseStylesheetDocuments(cssText: string): { readonly preamble: string; readonly documents: readonly StylesheetDocument[] } {
	const markers = Array.from(cssText.matchAll(CSS_SOURCE_MARKER_REGEX));
	if (markers.length === 0) {
		return { preamble: cssText, documents: [] };
	}
	const preamble = cssText.slice(0, markers[0].index);
	const documents = markers.map((marker, i) => {
		const start = marker.index;
		const end = i + 1 < markers.length ? markers[i + 1].index : cssText.length;
		return { file: marker[1], text: cssText.slice(start, end) };
	});
	return { preamble, documents };
}

/**
 * Reverses the order of whole documents within `[fromIndex, toIndex)` (or all
 * documents when `option === true`), preserving rule order inside each document.
 * Because adopted stylesheets are applied after the document's `<link>`/`<style>`
 * sheets in the cascade, this reversed copy wins source-order ties and surfaces
 * order-dependent conflicts.
 */
function reverseDocuments(cssText: string, option: Exclude<ReverseStylesheetsOption, false>): string {
	const { preamble, documents } = parseStylesheetDocuments(cssText);
	if (documents.length < 2) {
		return cssText;
	}
	const from = option === true ? 0 : Math.max(0, Math.min(documents.length, option.fromIndex));
	const to = option === true ? documents.length : Math.max(from, Math.min(documents.length, option.toIndex));
	const reordered = [
		...documents.slice(0, from),
		...documents.slice(from, to).reverse(),
		...documents.slice(to),
	];
	return preamble + reordered.map(doc => doc.text).join('');
}

/**
 * Reads the raw source text of a stylesheet (which, unlike `cssRules`, retains
 * comments such as the `@css-source` markers). Falls back to serialized rules
 * when the source cannot be read.
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

interface Bundle {
	/**
	 * The document's own stylesheets that make up the concatenated product CSS
	 * (those carrying `@css-source` markers), snapshotted once. These are what the
	 * reversal overlay reproduces and what it disables while active; harness
	 * stylesheets (reset, explorer UI, HMR) are deliberately excluded.
	 */
	readonly sheets: readonly CSSStyleSheet[];
	/** Their concatenated raw source, retaining the `@css-source` markers. */
	readonly rawSources: string;
}

/**
 * Reads the bundled product stylesheets once and caches both the snapshot and
 * their concatenated raw source. Only sheets carrying `@css-source` markers are
 * included, so harness-owned stylesheets are never reordered or disabled. Unlike
 * serialized `cssRules`, the raw source retains the markers that delimit
 * per-source-file documents, so it can be reordered by {@link reverseDocuments}.
 */
function readBundle(): Promise<Bundle> {
	return bundlePromise ??= (async () => {
		const sheets = Array.from(document.styleSheets);
		const sources = await Promise.all(sheets.map(readStyleSheetSource));
		const bundled = sheets
			.map((sheet, i) => ({ sheet, source: sources[i] }))
			.filter(entry => /\/\*\s*@css-source:/.test(entry.source));
		return bundle = {
			sheets: bundled.map(entry => entry.sheet),
			rawSources: bundled.map(entry => entry.source).join('\n'),
		};
	})();
}

/**
 * The repo-relative source files of the bundled stylesheet documents, in product
 * order. Index `i` is the document that a `reverseStylesheets` window refers to,
 * so the bisection driver uses this to name a conflicting document — keeping all
 * knowledge of the bundle format inside the runtime.
 */
export async function getStylesheetDocumentFiles(): Promise<string[]> {
	const { rawSources } = await readBundle();
	return parseStylesheetDocuments(rawSources).documents.map(doc => doc.file);
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

function createScopedThemingParticipant(scopeSelector: string, scopeRootSelector: string, participants: readonly IThemingParticipant[]): IThemingParticipant {
	return (theme, collector, environment) => {
		const rules = new Set<string>();
		const scopedCollector = { addRule: (rule: string) => rules.add(rule) };
		participants.forEach(participant => participant(theme, scopedCollector, environment));
		const scopedRules = [...rules].map(rule => rule
			.replace(/^(\s*):root(?=\s*\{)/, '$1:scope')
			.replaceAll(scopeRootSelector, ':scope'));
		collector.addRule(`@scope (${scopeSelector}) {\n${scopedRules.join('\n')}\n}`);
	};
}

function getThemeStyleSheet(theme: ColorThemeData, scopeThemingParticipants: boolean): CSSStyleSheet {
	const cachedStyleSheet = themeStyleSheetCache.get(theme);
	if (cachedStyleSheet) {
		return cachedStyleSheet;
	}

	const scopeSelector = '.' + theme.classNames[0];
	const themingParticipants = themingRegistry.getThemingParticipants();
	const sheet = new CSSStyleSheet();
	const css = generateColorThemeCSS(
		theme,
		scopeSelector,
		scopeThemingParticipants ? [createScopedThemingParticipant(scopeSelector, '.monaco-workbench', themingParticipants)] : themingParticipants,
		mockEnvironmentService
	);
	sheet.replaceSync(css.code);

	themeStyleSheetCache.set(theme, sheet);
	return sheet;
}

/**
 * Installs shared global styles once and appends a scoped stylesheet for each newly requested theme.
 * The reversal overlay keeps a stable identity and position for {@link overrideStylesheetOrder}.
 */
export async function ensureGlobalStylesInstalled(theme: ColorThemeData, scopeThemingParticipants: boolean): Promise<void> {
	baseStylesInstalledPromise ??= (async () => {
		await readBundle();
		const overlay = overlaySheet = new CSSStyleSheet();
		document.adoptedStyleSheets = [
			...document.adoptedStyleSheets,
			overlay,
			getIconsStyleSheetCached(),
		];
	})();
	await baseStylesInstalledPromise;

	if (installedThemes.has(theme)) {
		return;
	}
	document.adoptedStyleSheets = [
		...document.adoptedStyleSheets,
		getThemeStyleSheet(theme, scopeThemingParticipants),
	];
	installedThemes.add(theme);
}

/**
 * Temporarily reorders the bundled stylesheet documents for the lifetime of the
 * returned disposable, so the order-dependency fuzzer can flip cascade ties that
 * are decided purely by source order. While active, the bundled product sheets
 * are disabled and replaced wholesale by the reordered copy in the overlay, so
 * the originals cannot contribute competing declarations.
 *
 * Exclusive and stack-like: throws if another override is already active (two
 * fixtures must not render against the shared page concurrently), and the
 * returned disposable throws if disposed out of order.
 * {@link ensureGlobalStylesInstalled} must have resolved first.
 */
export function overrideStylesheetOrder(option: Exclude<ReverseStylesheetsOption, false>): IDisposable {
	if (!overlaySheet || !bundle) {
		throw new Error('ensureGlobalStylesInstalled() must resolve before overriding the stylesheet order.');
	}
	if (activeOverride) {
		throw new Error('A stylesheet-order override is already active; fixtures must render sequentially.');
	}
	const overlay = overlaySheet;
	const sheets = bundle.sheets;
	const token = activeOverride = {};

	// Disable the bundled product sheets and reproduce them, reordered, in the
	// overlay. The overlay alone then defines the product cascade, so the disabled
	// originals can't win (or tie) against it.
	const wasDisabled = sheets.map(sheet => sheet.disabled);
	for (const sheet of sheets) {
		sheet.disabled = true;
	}
	overlay.replaceSync(reverseDocuments(bundle.rawSources, option));

	return toDisposable(() => {
		if (activeOverride !== token) {
			throw new Error('Stylesheet-order override disposed out of order.');
		}
		overlay.replaceSync('');
		sheets.forEach((sheet, i) => { sheet.disabled = wasDisabled[i]; });
		activeOverride = undefined;
	});
}
