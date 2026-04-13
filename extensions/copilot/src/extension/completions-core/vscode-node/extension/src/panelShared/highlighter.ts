/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSingletonHighlighterCore, HighlighterCore, ThemeRegistration, ThemeRegistrationAny } from 'shiki/core';
import * as langs from 'shiki/langs';
import { BundledLanguage } from 'shiki/langs';
import getWasmInlined from 'shiki/wasm';
import { ColorThemeKind, window, workspace } from 'vscode';
import * as languages from './languages';
import * as themes from './themes';

export class Highlighter {
	private constructor(
		private languageId: string | undefined,
		private highlighter: HighlighterCore | undefined
	) { }

	static async create(languageId = window.activeTextEditor?.document.languageId): Promise<Highlighter> {
		if (!languageId) {
			return new Highlighter(undefined, undefined);
		}

		const highlighter = await getSingletonHighlighterCore({
			langs: Object.values(langs.bundledLanguages),
			loadWasm: getWasmInlined,
		});

		// Load additional language if not out of the box for shiki
		if (!langs.bundledLanguages[languageId as BundledLanguage]) {
			const additionalLang = vscLanguageMap[languageId as keyof typeof vscLanguageMap];
			if (additionalLang) {
				await highlighter.loadLanguage(additionalLang);
			}
		}

		return new Highlighter(languageId, highlighter);
	}

	createSnippet(text: string): string {
		if (!this.highlighter || !this.languageId || !this.languageSupported()) {
			return `<pre>${text}</pre>`;
		}

		return this.highlighter.codeToHtml(text, { lang: this.languageId, theme: getCurrentTheme() });
	}

	private languageSupported() {
		if (!this.languageId) { return false; }

		if (this.highlighter?.getLoadedLanguages().includes(this.languageId)) {
			return true;
		}

		return false;
	}
}

function getCurrentTheme(): ThemeRegistration {
	const workbenchConfig = workspace.getConfiguration('workbench');
	if (workbenchConfig) {
		const vsCodeTheme = workbenchConfig.get<string>('colorTheme');
		if (vsCodeTheme && isSupportedTheme(vsCodeTheme)) {
			return vscThemeMap[vsCodeTheme];
		}
		const themeType = window.activeColorTheme;
		const defaultTheme = vscDefaultMap[themeType.kind]; // fall back to default themes if we don't have a match

		return defaultTheme;
	} else {
		return vscThemeMap['Default Dark Modern'];
	}
}

const vscDefaultMap: { [key in ColorThemeKind]: ThemeRegistrationAny } = {
	[ColorThemeKind.Dark]: themes.darkModern,
	[ColorThemeKind.Light]: themes.lightModern,
	[ColorThemeKind.HighContrast]: themes.darkHC,
	[ColorThemeKind.HighContrastLight]: themes.lightHC,
};

// These are vs code themes that aren't out of the box in shiki but come standard with vs code
const vscThemeMap: { [key: string]: ThemeRegistrationAny } = {
	Abyss: themes.abyss,
	'Dark High Contrast': themes.darkHC,
	'Light High Constrast': themes.lightHC,
	'Default Dark Modern': themes.darkModern,
	'Kimbie Dark': themes.kimbieDark,
	'Default Light Modern': themes.lightModern,
	'Monokai Dimmed': themes.monokaiDim,
	'Quiet Light': themes.quietLight,
	Red: themes.red,
	'Tomorrow Night Blue': themes.tomorrowNightBlue,
	'Visual Studio Dark': themes.vsDark,
	'Visual Studio Light': themes.vsLight,
	'Default Dark+': themes.darkPlus,
	'Default Light+': themes.lightPlus,
	Monokai: themes.monokai,
	'Solarized Dark': themes.solarizedDark,
	'Solarized Light': themes.solarizedLight,
} as const;

function isSupportedTheme(theme: keyof typeof vscThemeMap): theme is keyof typeof vscThemeMap {
	return theme in vscThemeMap;
}

// These are vs code themes that aren't out of the box in shiki but come standard with vs code
const vscLanguageMap = {
	'cuda-cpp': languages.cudaCpp,
	javascriptreact: languages.javascriptreact,
	markdown_latex_combined: languages.markdownLatexCombined,
	'markdown-math': languages.markdownMath,
	restructuredtext: languages.restructuredtext,
	'search-result': languages.searchResult,
	typescriptreact: languages.typescriptreact,
} as const;
