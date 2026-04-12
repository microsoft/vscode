/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { ITextMateTokenizationService } from '../../../services/textMate/browser/textMateTokenizationFeature.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { TokenMetadata } from '../../../../editor/common/encodedTokenAttributes.js';
import { findMatchingThemeRule } from '../../../services/textMate/common/TMHelper.js';
import { Color } from '../../../../base/common/color.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { basename } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { splitLines } from '../../../../base/common/strings.js';
import { findMetadata } from '../../../services/themes/common/colorThemeData.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { Event } from '../../../../base/common/event.js';
import { Range } from '../../../../editor/common/core/range.js';
import { TreeSitterSyntaxTokenBackend } from '../../../../editor/common/model/tokens/treeSitter/treeSitterSyntaxTokenBackend.js';
import { waitForState } from '../../../../base/common/observable.js';
class ThemeDocument {
    constructor(theme) {
        this._theme = theme;
        this._cache = Object.create(null);
        this._defaultColor = '#000000';
        for (let i = 0, len = this._theme.tokenColors.length; i < len; i++) {
            const rule = this._theme.tokenColors[i];
            if (!rule.scope) {
                this._defaultColor = rule.settings.foreground;
            }
        }
    }
    _generateExplanation(selector, color) {
        return `${selector}: ${Color.Format.CSS.formatHexA(color, true).toUpperCase()}`;
    }
    explainTokenColor(scopes, color) {
        const matchingRule = this._findMatchingThemeRule(scopes);
        if (!matchingRule) {
            const expected = Color.fromHex(this._defaultColor);
            // No matching rule
            if (!color.equals(expected)) {
                throw new Error(`[${this._theme.label}]: Unexpected color ${Color.Format.CSS.formatHexA(color)} for ${scopes}. Expected default ${Color.Format.CSS.formatHexA(expected)}`);
            }
            return this._generateExplanation('default', color);
        }
        const expected = Color.fromHex(matchingRule.settings.foreground);
        if (!color.equals(expected)) {
            throw new Error(`[${this._theme.label}]: Unexpected color ${Color.Format.CSS.formatHexA(color)} for ${scopes}. Expected ${Color.Format.CSS.formatHexA(expected)} coming in from ${matchingRule.rawSelector}`);
        }
        return this._generateExplanation(matchingRule.rawSelector, color);
    }
    _findMatchingThemeRule(scopes) {
        if (!this._cache[scopes]) {
            this._cache[scopes] = findMatchingThemeRule(this._theme, scopes.split(' '));
        }
        return this._cache[scopes];
    }
}
let Snapper = class Snapper {
    constructor(languageService, themeService, textMateService, modelService) {
        this.languageService = languageService;
        this.themeService = themeService;
        this.textMateService = textMateService;
        this.modelService = modelService;
    }
    _themedTokenize(grammar, lines) {
        const colorMap = TokenizationRegistry.getColorMap();
        let state = null;
        const result = [];
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
                    color: colorMap[color]
                };
            }
            state = tokenizationResult.ruleStack;
        }
        return result;
    }
    _themedTokenizeTreeSitter(tokens, languageId) {
        const colorMap = TokenizationRegistry.getColorMap();
        const result = Array(tokens.length);
        const colorThemeData = this.themeService.getColorTheme();
        for (let i = 0, len = tokens.length; i < len; i++) {
            const token = tokens[i];
            const scopes = token.t.split(' ');
            const metadata = findMetadata(colorThemeData, scopes, this.languageService.languageIdCodec.encodeLanguageId(languageId), false);
            const color = TokenMetadata.getForeground(metadata);
            result[i] = {
                text: token.c,
                color: colorMap[color]
            };
        }
        return result;
    }
    _tokenize(grammar, lines) {
        let state = null;
        const result = [];
        let resultLen = 0;
        for (let i = 0, len = lines.length; i < len; i++) {
            const line = lines[i];
            const tokenizationResult = grammar.tokenizeLine(line, state);
            let lastScopes = null;
            for (let j = 0, lenJ = tokenizationResult.tokens.length; j < lenJ; j++) {
                const token = tokenizationResult.tokens[j];
                const tokenText = line.substring(token.startIndex, token.endIndex);
                const tokenScopes = token.scopes.join(' ');
                if (lastScopes === tokenScopes) {
                    result[resultLen - 1].c += tokenText;
                }
                else {
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
    async _getThemesResult(grammar, lines) {
        const currentTheme = this.themeService.getColorTheme();
        const getThemeName = (id) => {
            const part = 'vscode-theme-defaults-themes-';
            const startIdx = id.indexOf(part);
            if (startIdx !== -1) {
                return id.substring(startIdx + part.length, id.length - 5);
            }
            return undefined;
        };
        const result = {};
        const themeDatas = await this.themeService.getColorThemes();
        const defaultThemes = themeDatas.filter(themeData => !!getThemeName(themeData.id));
        for (const defaultTheme of defaultThemes) {
            const themeId = defaultTheme.id;
            const success = await this.themeService.setColorTheme(themeId, undefined);
            if (success) {
                const themeName = getThemeName(themeId);
                result[themeName] = {
                    document: new ThemeDocument(this.themeService.getColorTheme()),
                    tokens: this._themedTokenize(grammar, lines)
                };
            }
        }
        await this.themeService.setColorTheme(currentTheme.id, undefined);
        return result;
    }
    async _getTreeSitterThemesResult(tokens, languageId) {
        const currentTheme = this.themeService.getColorTheme();
        const getThemeName = (id) => {
            const part = 'vscode-theme-defaults-themes-';
            const startIdx = id.indexOf(part);
            if (startIdx !== -1) {
                return id.substring(startIdx + part.length, id.length - 5);
            }
            return undefined;
        };
        const result = {};
        const themeDatas = await this.themeService.getColorThemes();
        const defaultThemes = themeDatas.filter(themeData => !!getThemeName(themeData.id));
        for (const defaultTheme of defaultThemes) {
            const themeId = defaultTheme.id;
            const success = await this.themeService.setColorTheme(themeId, undefined);
            if (success) {
                const themeName = getThemeName(themeId);
                result[themeName] = {
                    document: new ThemeDocument(this.themeService.getColorTheme()),
                    tokens: this._themedTokenizeTreeSitter(tokens, languageId)
                };
            }
        }
        await this.themeService.setColorTheme(currentTheme.id, undefined);
        return result;
    }
    _enrichResult(result, themesResult) {
        const index = {};
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
    _moveInjectionCursorToRange(cursor, injectionRange) {
        let continueCursor = cursor.gotoFirstChild();
        // Get into the first "real" child node, as the root nodes can extend outside the range.
        while (((cursor.startIndex < injectionRange.startIndex) || (cursor.endIndex > injectionRange.endIndex)) && continueCursor) {
            if (cursor.endIndex < injectionRange.startIndex) {
                continueCursor = cursor.gotoNextSibling();
            }
            else {
                continueCursor = cursor.gotoFirstChild();
            }
        }
    }
    async _treeSitterTokenize(treeSitterTree, tokenizationModel, languageId) {
        const tree = await waitForState(treeSitterTree.tree);
        if (!tree) {
            return [];
        }
        const cursor = tree.walk();
        cursor.gotoFirstChild();
        let cursorResult = true;
        const tokens = [];
        const cursors = [{ cursor, languageId, startOffset: 0, endOffset: treeSitterTree.textModel.getValueLength() }];
        do {
            const current = cursors[cursors.length - 1];
            const currentCursor = current.cursor;
            const currentLanguageId = current.languageId;
            const isOutsideRange = (currentCursor.currentNode.endIndex > current.endOffset);
            if (!isOutsideRange && (currentCursor.currentNode.childCount === 0)) {
                const range = new Range(currentCursor.currentNode.startPosition.row + 1, currentCursor.currentNode.startPosition.column + 1, currentCursor.currentNode.endPosition.row + 1, currentCursor.currentNode.endPosition.column + 1);
                const injection = treeSitterTree.getInjectionTrees(currentCursor.currentNode.startIndex, currentLanguageId);
                const treeSitterRange = injection?.ranges.find(r => r.startIndex <= currentCursor.currentNode.startIndex && r.endIndex >= currentCursor.currentNode.endIndex);
                const injectionTree = injection?.tree.get();
                const injectionLanguageId = injection?.languageId;
                if (injectionTree && injectionLanguageId && treeSitterRange && (treeSitterRange.startIndex === currentCursor.currentNode.startIndex)) {
                    const injectionCursor = injectionTree.walk();
                    this._moveInjectionCursorToRange(injectionCursor, treeSitterRange);
                    cursors.push({ cursor: injectionCursor, languageId: injectionLanguageId, startOffset: treeSitterRange.startIndex, endOffset: treeSitterRange.endIndex });
                    while ((currentCursor.endIndex <= treeSitterRange.endIndex) && (currentCursor.gotoNextSibling() || currentCursor.gotoParent())) { }
                }
                else {
                    const capture = tokenizationModel.captureAtRangeTree(range);
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
            }
            else {
                cursorResult = currentCursor.gotoFirstChild();
            }
            if (cursors.length > 1 && ((!cursorResult && currentCursor === cursors[cursors.length - 1].cursor) || isOutsideRange)) {
                current.cursor.delete();
                cursors.pop();
                cursorResult = true;
            }
        } while (cursorResult);
        cursor.delete();
        return tokens;
    }
    captureSyntaxTokens(fileName, content) {
        const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(fileName));
        return this.textMateService.createTokenizer(languageId).then((grammar) => {
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
    async captureTreeSitterSyntaxTokens(resource, content) {
        const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
        if (!languageId) {
            return [];
        }
        const model = this.modelService.getModel(resource) ?? this.modelService.createModel(content, { languageId, onDidChange: Event.None }, resource);
        const tokenizationPart = model.tokenization.tokens.get();
        if (!(tokenizationPart instanceof TreeSitterSyntaxTokenBackend)) {
            return [];
        }
        const treeObs = tokenizationPart.tree;
        const tokenizationImplObs = tokenizationPart.tokenizationImpl;
        const treeSitterTree = treeObs.get() ?? await waitForState(treeObs);
        const tokenizationImpl = tokenizationImplObs.get() ?? await waitForState(tokenizationImplObs);
        // TODO: injections
        if (!treeSitterTree) {
            return [];
        }
        const result = (await this._treeSitterTokenize(treeSitterTree, tokenizationImpl, languageId)).filter(t => t.c.length > 0);
        const themeTokens = await this._getTreeSitterThemesResult(result, languageId);
        this._enrichResult(result, themeTokens);
        return result;
    }
};
Snapper = __decorate([
    __param(0, ILanguageService),
    __param(1, IWorkbenchThemeService),
    __param(2, ITextMateTokenizationService),
    __param(3, IModelService)
], Snapper);
async function captureTokens(accessor, resource, treeSitter = false) {
    const process = (resource) => {
        const fileService = accessor.get(IFileService);
        const fileName = basename(resource);
        const snapper = accessor.get(IInstantiationService).createInstance(Snapper);
        return fileService.readFile(resource).then(content => {
            if (treeSitter) {
                return snapper.captureTreeSitterSyntaxTokens(resource, content.value.toString());
            }
            else {
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
        }
        else {
            console.log('No file editor active');
        }
    }
    else {
        const processResult = await process(resource);
        return processResult;
    }
    return undefined;
}
CommandsRegistry.registerCommand('_workbench.captureSyntaxTokens', function (accessor, resource) {
    return captureTokens(accessor, resource);
});
CommandsRegistry.registerCommand('_workbench.captureTreeSitterSyntaxTokens', function (accessor, resource) {
    // If no resource is provided, use the active editor's resource
    // This is useful for testing the command
    if (!resource) {
        const editorService = accessor.get(IEditorService);
        resource = editorService.activeEditor?.resource;
    }
    return captureTokens(accessor, resource, true);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWVzLnRlc3QuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGhlbWVzL2Jyb3dzZXIvdGhlbWVzLnRlc3QuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVyRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLHNCQUFzQixFQUF3QixNQUFNLDBEQUEwRCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUVqSCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDcEYsT0FBTyxFQUFhLHFCQUFxQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDakcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9B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