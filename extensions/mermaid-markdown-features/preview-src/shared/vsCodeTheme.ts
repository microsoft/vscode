/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MermaidConfig } from 'mermaid';
import { MermaidExtensionConfig } from './config';
import { IDisposable } from './disposable';

/**
 * Identifier for the custom Mermaid theme that is derived from the current VS Code color theme.
 */
export const vsCodeMermaidTheme = 'vscode';

/**
 * Returns `true` when the active VS Code theme is a dark (or non-light high contrast) theme.
 */
function isDarkVsCodeTheme(): boolean {
	return document.body.classList.contains('vscode-dark')
		|| (document.body.classList.contains('vscode-high-contrast') && !document.body.classList.contains('vscode-high-contrast-light'));
}

/**
 * Resolves a CSS color value (such as `var(--vscode-editor-background)`) to a hex color string
 * by letting the browser compute it on a temporary element.
 */
function resolveCssColor(cssValue: string): string | undefined {
	const probe = document.createElement('span');
	probe.style.display = 'none';
	probe.style.color = cssValue;
	document.body.appendChild(probe);
	try {
		return rgbStringToHex(getComputedStyle(probe).color);
	} finally {
		probe.remove();
	}
}

function rgbStringToHex(value: string): string | undefined {
	const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
	if (!match) {
		return undefined;
	}
	const r = parseInt(match[1], 10);
	const g = parseInt(match[2], 10);
	const b = parseInt(match[3], 10);
	const a = match[4] !== undefined ? Math.round(parseFloat(match[4]) * 255) : 255;
	const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
	return a < 255
		? `#${hex(r)}${hex(g)}${hex(b)}${hex(a)}`
		: `#${hex(r)}${hex(g)}${hex(b)}`;
}

function pickColor(...varNames: string[]): string | undefined {
	for (const name of varNames) {
		// Peek at the raw custom property first: setting `style.color = 'var(--missing)'`
		// silently drops the declaration and the probe falls back to the inherited
		// `color` (typically the webview foreground), which would otherwise mask later
		// fallbacks in `varNames`.
		if (!readCssVar(name)) {
			continue;
		}

		const hex = resolveCssColor(`var(${name})`);
		if (hex) {
			return hex;
		}
	}
	return undefined;
}

function readCssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * The Mermaid `themeVariables` derived from the active VS Code color theme, plus a string
 * fingerprint that changes whenever any of the resolved colors change.
 */
export interface VsCodeMermaidThemeVariables {
	readonly variables: Record<string, string | boolean>;
	readonly fingerprint: string;
}

/**
 * Resolves and caches Mermaid `themeVariables` derived from the active VS Code color theme.
 *
 * Each consumer should construct one tracker, read {@link value} when initializing mermaid, and
 * subscribe to {@link onDidChange} (or call {@link refresh} after a theme-change signal) to keep
 * its rendered diagrams in sync with theme switches.
 */
export class VsCodeMermaidThemeTracker {

	private _value: VsCodeMermaidThemeVariables | undefined;
	private readonly _listeners = new Set<() => void>();

	/**
	 * The Mermaid theme variables derived from the active VS Code theme. Computed lazily on
	 * first access and memoized until {@link refresh} or {@link invalidate} is called.
	 */
	get value(): VsCodeMermaidThemeVariables {
		return this._value ??= computeVsCodeMermaidThemeVariables();
	}

	/**
	 * Recomputes the theme variables from the live CSS variables and fires {@link onDidChange}
	 * listeners when the resolved colors actually changed. Returns `true` when listeners fired.
	 */
	refresh(): boolean {
		const next = computeVsCodeMermaidThemeVariables();
		if (next.fingerprint === this._value?.fingerprint) {
			return false;
		}

		this._value = next;
		for (const listener of this._listeners) {
			listener();
		}
		return true;
	}

	/**
	 * Drops the cached value without firing listeners. The next read of {@link value} will
	 * recompute from the live CSS variables.
	 */
	invalidate(): void {
		this._value = undefined;
	}

	/**
	 * Subscribes to changes. The listener fires when {@link refresh} detects that the resolved
	 * theme variables have changed; read {@link value} to get the new variables.
	 */
	onDidChange(listener: () => void): IDisposable {
		this._listeners.add(listener);
		return { dispose: () => this._listeners.delete(listener) };
	}

	/**
	 * Resolves the Mermaid `theme` / `themeVariables` pair for the given extension config,
	 * picking the dark or light slot based on the active VS Code theme and translating the
	 * `'vscode'` sentinel into mermaid's `base` theme plus VS Code-derived variables.
	 */
	resolveMermaidTheme(extensionConfig: MermaidExtensionConfig): Pick<MermaidConfig, 'theme' | 'themeVariables'> {
		const themeName = isDarkVsCodeTheme()
			? extensionConfig.darkModeTheme
			: extensionConfig.lightModeTheme;

		if (themeName === vsCodeMermaidTheme) {
			return {
				theme: 'base',
				themeVariables: this.value.variables,
			};
		}

		return {
			theme: themeName as MermaidConfig['theme'],
			// Reset theme variables in case mermaid.initialize was previously called with the
			// vscode theme: mermaid merges configs and stale variables would otherwise leak through.
			themeVariables: {},
		};
	}

	/**
	 * Starts a {@link MutationObserver} on the body and document element so that theme switches
	 * (class/data-attribute changes on `body`, CSS variable updates on `documentElement.style`)
	 * trigger a {@link refresh}. Returns a disposable that stops observing.
	 */
	observeDomChanges(): IDisposable {
		const observer = new MutationObserver(() => this.refresh());
		observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-vscode-theme-id', 'data-vscode-theme-kind'] });
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
		return { dispose: () => observer.disconnect() };
	}
}

function computeVsCodeMermaidThemeVariables(): VsCodeMermaidThemeVariables {
	const variables: Record<string, string | boolean> = {
		darkMode: isDarkVsCodeTheme(),
	};

	const set = (key: string, ...varNames: string[]) => {
		const color = pickColor(...varNames);
		if (color) {
			variables[key] = color;
		}
	};

	// Canvas / text
	set('background', '--vscode-editor-background');
	set('textColor', '--vscode-charts-foreground', '--vscode-editor-foreground', '--vscode-foreground');
	set('lineColor', '--vscode-chart-line', '--vscode-charts-lines', '--vscode-editor-foreground', '--vscode-foreground');

	// Primary (default node) colors
	set('primaryColor', '--vscode-editorWidget-background');
	set('primaryTextColor', '--vscode-charts-foreground', '--vscode-editor-foreground', '--vscode-foreground');
	set('primaryBorderColor', '--vscode-chart-line', '--vscode-editorWidget-border', '--vscode-focusBorder');
	set('mainBkg', '--vscode-editorWidget-background');
	set('nodeBorder', '--vscode-chart-line', '--vscode-editorWidget-border', '--vscode-focusBorder');

	// Secondary colors
	set('secondaryColor', '--vscode-input-background', '--vscode-editorWidget-background');
	set('secondaryTextColor', '--vscode-input-foreground', '--vscode-foreground');
	set('secondaryBorderColor', '--vscode-input-border', '--vscode-editorWidget-border');

	// Tertiary / subgraph (cluster) colors
	set('tertiaryColor', '--vscode-textBlockQuote-background', '--vscode-input-background');
	set('tertiaryTextColor', '--vscode-foreground');
	set('tertiaryBorderColor', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border');
	set('clusterBkg', '--vscode-textBlockQuote-background', '--vscode-input-background');
	set('clusterBorder', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border');

	// Notes
	set('noteBkgColor', '--vscode-textBlockQuote-background', '--vscode-editorWidget-background');
	set('noteTextColor', '--vscode-foreground');
	set('noteBorderColor', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border');

	// Errors
	set('errorBkgColor', '--vscode-inputValidation-errorBackground', '--vscode-editorError-background');
	set('errorTextColor', '--vscode-editorError-foreground', '--vscode-foreground');

	// Misc
	set('titleColor', '--vscode-charts-foreground', '--vscode-editor-foreground', '--vscode-foreground');
	set('edgeLabelBackground', '--vscode-editor-background');

	// Pie / palette slots — mermaid uses pie1..pie12 for pie chart slices and cScale0..cScale11
	// as the accent palette for various diagram types. Map to the VS Code chart accent colors.
	const chartPalette = [
		'--vscode-charts-blue',
		'--vscode-charts-green',
		'--vscode-charts-orange',
		'--vscode-charts-red',
		'--vscode-charts-purple',
		'--vscode-charts-yellow',
	];
	for (let i = 0; i < chartPalette.length; i++) {
		set(`pie${i + 1}`, chartPalette[i]);
		set(`cScale${i}`, chartPalette[i]);
	}

	const fontFamily = readCssVar('--vscode-font-family');
	if (fontFamily) {
		variables.fontFamily = fontFamily;
	}

	const fontSize = readCssVar('--vscode-font-size');
	if (fontSize) {
		variables.fontSize = fontSize;
	}

	return {
		variables,
		fingerprint: JSON.stringify(variables),
	};
}
