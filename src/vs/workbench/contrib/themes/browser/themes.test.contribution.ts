/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import type * as Parser from '@vscode/tree-sitter-wasm';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchThemeService, IWorkbenchColorTheme } from '../../../services/themes/common/workbenchThemeService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { ITextMateTokenizationService } from '../../../services/textMate/browser/textMateTokenizationFeature.js';
import type { IGrammar, StateStack } from 'vscode-textmate';
import { TokenizationRegistry, TreeSitterTokenizationRegistry } from '../../../../editor/common/languages.js';
import { TokenMetadata } from '../../../../editor/common/encodedTokenAttributes.js';
import { ThemeRule, findMatchingThemeRule } from '../../../services/textMate/common/TMHelper.js';
import { Color } from '../../../../base/common/color.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { basename } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { splitLines } from '../../../../base/common/strings.js';
import { ITextModelTreeSitter, ITreeSitterParserService } from '../../../../editor/common/services/treeSitterParserService.js';
import { ColorThemeData, findMetadata } from '../../../services/themes/common/colorThemeData.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { Event } from '../../../../base/common/event.js';
import { Range } from '../../../../editor/common/core/range.js';

interface IToken {
	c: string; // token
	t: string; // space separated scopes, most general to most specific
	r: { [themeName: string]: string | undefined }; // token type: color
}

interface IThemedToken {
	text: string;
	color: Color | null;
}

interface IThemesResult {
	[themeName: string]: {
		document: ThemeDocument;
		tokens: IThemedToken[];
	};
}

class ThemeDocument {
	private readonly _theme: IWorkbenchColorTheme;
	private readonly _cache: { [scopes: string]: ThemeRule };
	private readonly _defaultColor: string;

	constructor(theme: IWorkbenchColorTheme) {
		this._theme = theme;
		this._cache = Object.create(null);
		this._defaultColor = '#000000';
		for (let i = 0, len = this._theme.tokenColors.length; i < len; i++) {
			const rule = this._theme.tokenColors[i];
			if (!rule.scope) {
				this._defaultColor = rule.settings.foreground!;
			}
		}
	}

	private _generateExplanation(selector: string, color: Color): string {
		return `${selector}: ${Color.Format.CSS.formatHexA(color, true).toUpperCase()}`;
	}

	public explainTokenColor(scopes: string, color: Color): string {

		const matchingRule = this._findMatchingThemeRule(scopes);
		if (!matchingRule) {
			const expected = Color.fromHex(this._defaultColor);
			// No matching rule
			if (!color.equals(expected)) {
				throw new Error(`[${this._theme.label}]: Unexpected color ${Color.Format.CSS.formatHexA(color)} for ${scopes}. Expected default ${Color.Format.CSS.formatHexA(expected)}`);
			}
			return this._generateExplanation('default', color);
		}

		const expected = Color.fromHex(matchingRule.settings.foreground!);
		if (!color.equals(expected)) {
			throw new Error(`[${this._theme.label}]: Unexpected color ${Color.Format.CSS.formatHexA(color)} for ${scopes}. Expected ${Color.Format.CSS.formatHexA(expected)} coming in from ${matchingRule.rawSelector}`);
		}
		return this._generateExplanation(matchingRule.rawSelector, color);
	}

	private _findMatchingThemeRule(scopes: string): ThemeRule {
		if (!this._cache[scopes]) {
			this._cache[scopes] = findMatchingThemeRule(this._theme, scopes.split(' '))!;
		}
		return this._cache[scopes];
	}
}

class Snapper {

	constructor(
		@ILanguageService private readonly languageService: ILanguageService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@ITextMateTokenizationService private readonly textMateService: ITextMateTokenizationService,
		@ITreeSitterParserService private readonly treeSitterParserService: ITreeSitterParserService,
		@IModelService private readonly modelService: IModelService,
	) {
	}

	private _themedTokenize(grammar: IGrammar, lines: string[]): IThemedToken[] {
		const colorMap = TokenizationRegistry.getColorMap();
		let state: StateStack | null = null;
		const result: IThemedToken[] = [];
		let resultLen = 0;
		for (let i = 0, len = lines.length; i < len; i++) {
			const line = lines[i];

			const tokenizationResult = grammar.tokenizeLine2(line, state);

			for (let j = 0, lenJ = tokenizationResult.tokens.length >>> 1; j < lenJ; j++) {
				const startOffset = tokenizationResult.tokens[(j << 1)];
				const metadata = tokenizationResult.tokens[(j << 1) + 1];
				const endOffset = j + 1 < lenJ ? tokenizationResult.tokens[((j + 1) << 1)] : line.length;
				const tokenText = line.substring(startOffset, endOffset);

				const color = TokenMetadata.getForeground(metadata);

				result[resultLen++] = {
					text: tokenText,
					color: colorMap![color]
				};
			}

			state = tokenizationResult.ruleStack;
		}

		return result;
	}

	private _themedTokenizeTreeSitter(tokens: IToken[], languageId: string): IThemedToken[] {
		const colorMap = TokenizationRegistry.getColorMap();
		const result: IThemedToken[] = Array(tokens.length);
		const colorThemeData = this.themeService.getColorTheme() as ColorThemeData;
		for (let i = 0, len = tokens.length; i < len; i++) {
			const token = tokens[i];
			const scopes = token.t.split(' ');
			const metadata = findMetadata(colorThemeData, scopes, this.languageService.languageIdCodec.encodeLanguageId(languageId), false);
			const color = TokenMetadata.getForeground(metadata);

			result[i] = {
				text: token.c,
				color: colorMap![color]
			};
		}

		return result;
	}

	private _tokenize(grammar: IGrammar, lines: string[]): IToken[] {
		let state: StateStack | null = null;
		const result: IToken[] = [];
		let resultLen = 0;
		for (let i = 0, len = lines.length; i < len; i++) {
			const line = lines[i];

			const tokenizationResult = grammar.tokenizeLine(line, state);
			let lastScopes: string | null = null;

			for (let j = 0, lenJ = tokenizationResult.tokens.length; j < lenJ; j++) {
				const token = tokenizationResult.tokens[j];
				const tokenText = line.substring(token.startIndex, token.endIndex);
				const tokenScopes = token.scopes.join(' ');

				if (lastScopes === tokenScopes) {
					result[resultLen - 1].c += tokenText;
				} else {
					lastScopes = tokenScopes;
					result[resultLen++] = {
						c: tokenText,
						t: tokenScopes,
						r: {
							dark_plus: undefined,
							light_plus: undefined,
							dark_vs: undefined,
							light_vs: undefined,
							hc_black: undefined,
						}
					};
				}
			}

			state = tokenizationResult.ruleStack;
		}
		return result;
	}

	private async _getThemesResult(grammar: IGrammar, lines: string[]): Promise<IThemesResult> {
		const currentTheme = this.themeService.getColorTheme();

		const getThemeName = (id: string) => {
			const part = 'vscode-theme-defaults-themes-';
			const startIdx = id.indexOf(part);
			if (startIdx !== -1) {
				return id.substring(startIdx + part.length, id.length - 5);
			}
			return undefined;
		};

		const result: IThemesResult = {};

		const themeDatas = await this.themeService.getColorThemes();
		const defaultThemes = themeDatas.filter(themeData => !!getThemeName(themeData.id));
		for (const defaultTheme of defaultThemes) {
			const themeId = defaultTheme.id;
			const success = await this.themeService.setColorTheme(themeId, undefined);
			if (success) {
				const themeName = getThemeName(themeId);
				result[themeName!] = {
					document: new ThemeDocument(this.themeService.getColorTheme()),
					tokens: this._themedTokenize(grammar, lines)
				};
			}
		}
		await this.themeService.setColorTheme(currentTheme.id, undefined);
		return result;
	}

	private async _getTreeSitterThemesResult(tokens: IToken[], languageId: string): Promise<IThemesResult> {
		const currentTheme = this.themeService.getColorTheme();

		const getThemeName = (id: string) => {
			const part = 'vscode-theme-defaults-themes-';
			const startIdx = id.indexOf(part);
			if (startIdx !== -1) {
				return id.substring(startIdx + part.length, id.length - 5);
			}
			return undefined;
		};

		const result: IThemesResult = {};

		const themeDatas = await this.themeService.getColorThemes();
		const defaultThemes = themeDatas.filter(themeData => !!getThemeName(themeData.id));
		for (const defaultTheme of defaultThemes) {
			const themeId = defaultTheme.id;
			const success = await this.themeService.setColorTheme(themeId, undefined);
			if (success) {
				const themeName = getThemeName(themeId);
				result[themeName!] = {
					document: new ThemeDocument(this.themeService.getColorTheme()),
					tokens: this._themedTokenizeTreeSitter(tokens, languageId)
				};
			}
		}
		await this.themeService.setColorTheme(currentTheme.id, undefined);
		return result;
	}


	private _enrichResult(result: IToken[], themesResult: IThemesResult): void {
		const index: { [themeName: string]: number } = {};
		const themeNames = Object.keys(themesResult);
		for (const themeName of themeNames) {
			index[themeName] = 0;
		}

		for (let i = 0, len = result.length; i < len; i++) {
			const token = result[i];

			for (const themeName of themeNames) {
				const themedToken = themesResult[themeName].tokens[index[themeName]];

				themedToken.text = themedToken.text.substr(token.c.length);
				if (themedToken.color) {
					token.r[themeName] = themesResult[themeName].document.explainTokenColor(token.t, themedToken.color);
				}
				if (themedToken.text.length === 0) {
					index[themeName]++;
				}
			}
		}
	}

	private _moveInjectionCursorToRange(cursor: Parser.TreeCursor, injectionRange: { startIndex: number; endIndex: number }): void {
		let continueCursor = cursor.gotoFirstChild();
		// Get into the first "real" child node, as the root nodes can extend outside the range.
		while (((cursor.startIndex < injectionRange.startIndex) || (cursor.endIndex > injectionRange.endIndex)) && continueCursor) {
			if (cursor.endIndex < injectionRange.startIndex) {
				continueCursor = cursor.gotoNextSibling();
			} else {
				continueCursor = cursor.gotoFirstChild();
			}
		}
	}

	private _treeSitterTokenize(textModelTreeSitter: ITextModelTreeSitter, tree: Parser.Tree, languageId: string): IToken[] {
		const cursor = tree.walk();
		cursor.gotoFirstChild();
		let cursorResult: boolean = true;
		const tokens: IToken[] = [];
		const tokenizationSupport = TreeSitterTokenizationRegistry.get(languageId);

		const cursors: { cursor: Parser.TreeCursor; languageId: string; startOffset: number; endOffset: number }[] = [{ cursor, languageId, startOffset: 0, endOffset: textModelTreeSitter.textModel.getValueLength() }];
		do {
			const current = cursors[cursors.length - 1];
			const currentCursor = current.cursor;
			const currentLanguageId = current.languageId;
			const isOutsideRange: boolean = (currentCursor.currentNode.endIndex > current.endOffset);

			if (!isOutsideRange && (currentCursor.currentNode.childCount === 0)) {
				const range = new Range(currentCursor.currentNode.startPosition.row + 1, currentCursor.currentNode.startPosition.column + 1, currentCursor.currentNode.endPosition.row + 1, currentCursor.currentNode.endPosition.column + 1);
				const injection = textModelTreeSitter.getInjection(currentCursor.currentNode.startIndex, currentLanguageId);
				const treeSitterRange = injection?.ranges!.find(r => r.startIndex <= currentCursor.currentNode.startIndex && r.endIndex >= currentCursor.currentNode.endIndex);
				if (injection?.tree && treeSitterRange && (treeSitterRange.startIndex === currentCursor.currentNode.startIndex)) {
					const injectionLanguageId = injection.languageId;
					const injectionTree = injection.tree;
					const injectionCursor = injectionTree.walk();
					this._moveInjectionCursorToRange(injectionCursor, treeSitterRange);
					cursors.push({ cursor: injectionCursor, languageId: injectionLanguageId, startOffset: treeSitterRange.startIndex, endOffset: treeSitterRange.endIndex });
					while ((currentCursor.endIndex <= treeSitterRange.endIndex) && (currentCursor.gotoNextSibling() || currentCursor.gotoParent())) { }
				} else {
					const capture = tokenizationSupport?.captureAtRangeTree(range, tree, textModelTreeSitter);
					tokens.push({
						c: currentCursor.currentNode.text.replace(/\r/g, ''),
						t: capture?.map(cap => cap.name).join(' ') ?? '',
						r: {
							dark_plus: undefined,
							light_plus: undefined,
							dark_vs: undefined,
							light_vs: undefined,
							hc_black: undefined,
						}
					});
					while (!(cursorResult = currentCursor.gotoNextSibling())) {
						if (!(cursorResult = currentCursor.gotoParent())) {
							break;
						}
					}
				}

			} else {
				cursorResult = currentCursor.gotoFirstChild();
			}
			if (cursors.length > 1 && ((!cursorResult && currentCursor === cursors[cursors.length - 1].cursor) || isOutsideRange)) {
				cursors.pop();
				cursorResult = true;
			}
		} while (cursorResult);
		return tokens;
	}

	public captureSyntaxTokens(fileName: string, content: string): Promise<IToken[]> {
		const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(fileName));
		return this.textMateService.createTokenizer(languageId!).then((grammar) => {
			if (!grammar) {
				return [];
			}
			const lines = splitLines(content);

			const result = this._tokenize(grammar, lines);
			return this._getThemesResult(grammar, lines).then((themesResult) => {
				this._enrichResult(result, themesResult);
				return result.filter(t => t.c.length > 0);
			});
		});
	}

	public async captureTreeSitterSyntaxTokens(resource: URI, content: string): Promise<IToken[]> {
		const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
		if (languageId) {
			const hasLanguage = TreeSitterTokenizationRegistry.get(languageId);
			if (!hasLanguage) {
				return [];
			}
			const model = this.modelService.getModel(resource) ?? this.modelService.createModel(content, { languageId, onDidChange: Event.None }, resource);
			let textModelTreeSitter = this.treeSitterParserService.getParseResult(model);
			let tree = textModelTreeSitter?.parseResult?.tree;
			if (!textModelTreeSitter) {
				return [];
			}
			if (!tree) {
				let e = await Event.toPromise(this.treeSitterParserService.onDidUpdateTree);
				// Once more for injections
				if (e.hasInjections) {
					e = await Event.toPromise(this.treeSitterParserService.onDidUpdateTree);
				}
				textModelTreeSitter = e.tree;
				tree = textModelTreeSitter.parseResult?.tree;
			}
			if (!tree) {
				return [];
			}
			const result = (await this._treeSitterTokenize(textModelTreeSitter, tree, languageId)).filter(t => t.c.length > 0);
			const themeTokens = await this._getTreeSitterThemesResult(result, languageId);
			this._enrichResult(result, themeTokens);
			return result;
		}
		return [];
	}
}

async function captureTokens(accessor: ServicesAccessor, resource: URI | undefined, treeSitter: boolean = false) {
	const process = (resource: URI) => {
		const fileService = accessor.get(IFileService);
		const fileName = basename(resource);
		const snapper = accessor.get(IInstantiationService).createInstance(Snapper);

		return fileService.readFile(resource).then(content => {
			if (treeSitter) {
				return snapper.captureTreeSitterSyntaxTokens(resource, content.value.toString());
			} else {
				return snapper.captureSyntaxTokens(fileName, content.value.toString());
			}
		});
	};

	if (!resource) {
		const editorService = accessor.get(IEditorService);
		const file = editorService.activeEditor ? EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { filterByScheme: Schemas.file }) : null;
		if (file) {
			process(file).then(result => {
				console.log(result);
			});
		} else {
			console.log('No file editor active');
		}
	} else {
		const processResult = await process(resource);
		return processResult;
	}
	return undefined;

}

CommandsRegistry.registerCommand('_workbench.captureSyntaxTokens', function (accessor: ServicesAccessor, resource: URI) {
	return captureTokens(accessor, resource);
});

CommandsRegistry.registerCommand('_workbench.captureTreeSitterSyntaxTokens', function (accessor: ServicesAccessor, resource?: URI) {
	// If no resource is provided, use the active editor's resource
	// This is useful for testing the command
	if (!resource) {
		const editorService = accessor.get(IEditorService);
		resource = editorService.activeEditor?.resource;
	}
	return captureTokens(accessor, resource, true);
});
