/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import pfs = require('vs/base/node/pfs');
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService, IColorTheme } from 'vs/workbench/services/themes/common/themeService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { ITextMateService } from 'vs/editor/node/textMate/textMateService';
import { IGrammar, StackElement } from 'vscode-textmate';
import { TokenizationRegistry } from 'vs/editor/common/modes';
import { TokenMetadata } from 'vs/editor/common/model/tokensBinaryEncoding';
import { ThemeRule, findMatchingThemeRule } from 'vs/editor/electron-browser/textMate/TMHelper';

interface IToken {
	c: string;
	t: string;
	r: { [themeName: string]: string; };
}

interface IThemedToken {
	text: string;
	color: string;
}

interface IThemesResult {
	[themeName: string]: {
		document: ThemeDocument;
		tokens: IThemedToken[];
	};
}

class ThemeDocument {
	private readonly _theme: IColorTheme;
	private readonly _cache: { [scopes: string]: ThemeRule; };
	private readonly _defaultColor: string;

	constructor(theme: IColorTheme) {
		this._theme = theme;
		this._cache = Object.create(null);
		this._defaultColor = '#000000';
		for (let i = 0, len = this._theme.settings.length; i < len; i++) {
			let rule = this._theme.settings[i];
			if (!rule.scope) {
				this._defaultColor = rule.settings.foreground;
			}
		}
	}

	private _generateExplanation(selector: string, color: string): string {
		return `${selector}: ${color}`;
	}

	public explainTokenColor(scopes: string, color: string): string {

		let matchingRule = this._findMatchingThemeRule(scopes);
		if (!matchingRule) {
			let actual = color.toUpperCase();
			let expected = this._defaultColor.toUpperCase();
			// No matching rule
			if (actual !== expected) {
				throw new Error(`[${this._theme.label}]: Unexpected color ${actual} for ${scopes}. Expected default ${expected}`);
			}
			return this._generateExplanation('default', color);
		}

		let actual = color.toUpperCase();
		let expected = matchingRule.settings.foreground.toUpperCase();
		if (actual !== expected) {
			throw new Error(`[${this._theme.label}]: Unexpected color ${actual} for ${scopes}. Expected ${expected} coming in from ${matchingRule.rawSelector}`);
		}
		return this._generateExplanation(matchingRule.rawSelector, color);
	}

	private _findMatchingThemeRule(scopes: string): ThemeRule {
		if (!this._cache[scopes]) {
			this._cache[scopes] = findMatchingThemeRule(this._theme, scopes.split(' '));
		}
		return this._cache[scopes];
	}
}

class Snapper {

	constructor(
		@IModeService private modeService: IModeService,
		@IThemeService private themeService: IThemeService,
		@ITextMateService private textMateService: ITextMateService
	) {
	}

	private _themedTokenize(grammar: IGrammar, lines: string[]): IThemedToken[] {
		let colorMap = TokenizationRegistry.getColorMap();
		let state: StackElement = null;
		let result: IThemedToken[] = [], resultLen = 0;
		for (let i = 0, len = lines.length; i < len; i++) {
			let line = lines[i];

			let tokenizationResult = grammar.tokenizeLine2(line, state);

			for (let j = 0, lenJ = tokenizationResult.tokens.length >>> 1; j < lenJ; j++) {
				let startOffset = tokenizationResult.tokens[(j << 1)];
				let metadata = tokenizationResult.tokens[(j << 1) + 1];
				let endOffset = j + 1 < lenJ ? tokenizationResult.tokens[((j + 1) << 1)] : line.length;
				let tokenText = line.substring(startOffset, endOffset);

				let color = TokenMetadata.getForeground(metadata);
				let colorStr = colorMap[color];

				result[resultLen++] = {
					text: tokenText,
					color: colorStr
				};
			}

			state = tokenizationResult.ruleStack;
		}

		return result;
	}

	private _tokenize(grammar: IGrammar, lines: string[]): IToken[] {
		let state: StackElement = null;
		let result: IToken[] = [], resultLen = 0;
		for (let i = 0, len = lines.length; i < len; i++) {
			let line = lines[i];

			let tokenizationResult = grammar.tokenizeLine(line, state);
			let lastScopes: string = null;

			for (let j = 0, lenJ = tokenizationResult.tokens.length; j < lenJ; j++) {
				let token = tokenizationResult.tokens[j];
				let tokenText = line.substring(token.startIndex, token.endIndex);
				let tokenScopes = token.scopes.join(' ');

				if (lastScopes === tokenScopes) {
					result[resultLen - 1].c += tokenText;
				} else {
					lastScopes = tokenScopes;
					result[resultLen++] = {
						c: tokenText,
						t: tokenScopes,
						r: {
							dark_plus: null,
							light_plus: null,
							dark_vs: null,
							light_vs: null,
							hc_black: null,
						}
					};
				}
			}

			state = tokenizationResult.ruleStack;
		}
		return result;
	}

	private _getThemesResult(grammar: IGrammar, lines: string[]): TPromise<IThemesResult> {
		let currentTheme = this.themeService.getColorTheme();

		let getThemeName = (id: string) => {
			let part = 'vscode-theme-defaults-themes-';
			let startIdx = id.indexOf(part);
			if (startIdx !== -1) {
				return id.substring(startIdx + part.length, id.length - 5);
			}
			return void 0;
		};

		let result: IThemesResult = {};

		return this.themeService.getColorThemes().then(themeDatas => {
			let defaultThemes = themeDatas.filter(themeData => !!getThemeName(themeData.id));
			return TPromise.join(defaultThemes.map(defaultTheme => {
				let themeId = defaultTheme.id;
				return this.themeService.setColorTheme(themeId, false).then(success => {
					if (success) {
						let themeName = getThemeName(themeId);
						result[themeName] = {
							document: new ThemeDocument(this.themeService.getColorTheme()),
							tokens: this._themedTokenize(grammar, lines)
						};
					}
				});
			}));
		}).then(_ => {
			return this.themeService.setColorTheme(currentTheme.id, false).then(_ => {
				return result;
			});
		});
	}

	private _enrichResult(result: IToken[], themesResult: IThemesResult): void {
		let index: { [themeName: string]: number; } = {};
		let themeNames = Object.keys(themesResult);
		for (let t = 0; t < themeNames.length; t++) {
			let themeName = themeNames[t];
			index[themeName] = 0;
		}

		for (let i = 0, len = result.length; i < len; i++) {
			let token = result[i];

			for (let t = 0; t < themeNames.length; t++) {
				let themeName = themeNames[t];
				let themedToken = themesResult[themeName].tokens[index[themeName]];

				themedToken.text = themedToken.text.substr(token.c.length);
				token.r[themeName] = themesResult[themeName].document.explainTokenColor(token.t, themedToken.color);
				if (themedToken.text.length === 0) {
					index[themeName]++;
				}
			}
		}
	}

	public captureSyntaxTokens(fileName: string, content: string): TPromise<IToken[]> {
		return this.modeService.getOrCreateModeByFilenameOrFirstLine(fileName).then(mode => {
			return this.textMateService.createGrammar(mode.getId()).then((grammar) => {
				let lines = content.split(/\r\n|\r|\n/);

				let result = this._tokenize(grammar, lines);
				return this._getThemesResult(grammar, lines).then((themesResult) => {
					this._enrichResult(result, themesResult);
					return result.filter(t => t.c.length > 0);
				});
			});
		});
	}
}

CommandsRegistry.registerCommand('_workbench.captureSyntaxTokens', function (accessor: ServicesAccessor, resource: URI) {

	let process = (resource: URI) => {
		let filePath = resource.fsPath;
		let fileName = paths.basename(filePath);
		let snapper = accessor.get(IInstantiationService).createInstance(Snapper);

		return pfs.readFile(filePath).then(content => {
			return snapper.captureSyntaxTokens(fileName, content.toString());
		});
	};

	if (!resource) {
		let editorService = accessor.get(IWorkbenchEditorService);
		let file = toResource(editorService.getActiveEditorInput(), { filter: 'file' });
		if (file) {
			process(file).then(result => {
				console.log(result);
			});
		} else {
			console.log('No file editor active');
		}
	} else {
		return process(resource);
	}
	return undefined;
});

