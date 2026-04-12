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
var InspectTokensController_1;
import './inspectTokens.css';
import { $, append, reset } from '../../../../base/browser/dom.js';
import { Color } from '../../../../base/common/color.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { EditorAction, registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { TokenizationRegistry } from '../../../common/languages.js';
import { TokenMetadata } from '../../../common/encodedTokenAttributes.js';
import { NullState, nullTokenize, nullTokenizeEncoded } from '../../../common/languages/nullTokenize.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { IStandaloneThemeService } from '../../common/standaloneTheme.js';
import { InspectTokensNLS } from '../../../common/standaloneStrings.js';
let InspectTokensController = class InspectTokensController extends Disposable {
    static { InspectTokensController_1 = this; }
    static { this.ID = 'editor.contrib.inspectTokens'; }
    static get(editor) {
        return editor.getContribution(InspectTokensController_1.ID);
    }
    constructor(editor, standaloneColorService, languageService) {
        super();
        this._editor = editor;
        this._languageService = languageService;
        this._widget = null;
        this._register(this._editor.onDidChangeModel((e) => this.stop()));
        this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
        this._register(TokenizationRegistry.onDidChange((e) => this.stop()));
        this._register(this._editor.onKeyUp((e) => e.keyCode === 9 /* KeyCode.Escape */ && this.stop()));
    }
    dispose() {
        this.stop();
        super.dispose();
    }
    launch() {
        if (this._widget) {
            return;
        }
        if (!this._editor.hasModel()) {
            return;
        }
        this._widget = new InspectTokensWidget(this._editor, this._languageService);
    }
    stop() {
        if (this._widget) {
            this._widget.dispose();
            this._widget = null;
        }
    }
};
InspectTokensController = InspectTokensController_1 = __decorate([
    __param(1, IStandaloneThemeService),
    __param(2, ILanguageService)
], InspectTokensController);
class InspectTokens extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.inspectTokens',
            label: InspectTokensNLS.inspectTokensAction,
            alias: 'Developer: Inspect Tokens',
            precondition: undefined
        });
    }
    run(accessor, editor) {
        const controller = InspectTokensController.get(editor);
        controller?.launch();
    }
}
function renderTokenText(tokenText) {
    let result = '';
    for (let charIndex = 0, len = tokenText.length; charIndex < len; charIndex++) {
        const charCode = tokenText.charCodeAt(charIndex);
        switch (charCode) {
            case 9 /* CharCode.Tab */:
                result += '\u2192'; // &rarr;
                break;
            case 32 /* CharCode.Space */:
                result += '\u00B7'; // &middot;
                break;
            default:
                result += String.fromCharCode(charCode);
        }
    }
    return result;
}
function getSafeTokenizationSupport(languageIdCodec, languageId) {
    const tokenizationSupport = TokenizationRegistry.get(languageId);
    if (tokenizationSupport) {
        return tokenizationSupport;
    }
    const encodedLanguageId = languageIdCodec.encodeLanguageId(languageId);
    return {
        getInitialState: () => NullState,
        tokenize: (line, hasEOL, state) => nullTokenize(languageId, state),
        tokenizeEncoded: (line, hasEOL, state) => nullTokenizeEncoded(encodedLanguageId, state)
    };
}
class InspectTokensWidget extends Disposable {
    static { this._ID = 'editor.contrib.inspectTokensWidget'; }
    constructor(editor, languageService) {
        super();
        // Editor.IContentWidget.allowEditorOverflow
        this.allowEditorOverflow = true;
        this._editor = editor;
        this._languageService = languageService;
        this._model = this._editor.getModel();
        this._domNode = document.createElement('div');
        this._domNode.className = 'tokens-inspect-widget';
        this._tokenizationSupport = getSafeTokenizationSupport(this._languageService.languageIdCodec, this._model.getLanguageId());
        this._compute(this._editor.getPosition());
        this._register(this._editor.onDidChangeCursorPosition((e) => this._compute(this._editor.getPosition())));
        this._editor.addContentWidget(this);
    }
    dispose() {
        this._editor.removeContentWidget(this);
        super.dispose();
    }
    getId() {
        return InspectTokensWidget._ID;
    }
    _compute(position) {
        const data = this._getTokensAtLine(position.lineNumber);
        let token1Index = 0;
        for (let i = data.tokens1.length - 1; i >= 0; i--) {
            const t = data.tokens1[i];
            if (position.column - 1 >= t.offset) {
                token1Index = i;
                break;
            }
        }
        let token2Index = 0;
        for (let i = (data.tokens2.length >>> 1); i >= 0; i--) {
            if (position.column - 1 >= data.tokens2[(i << 1)]) {
                token2Index = i;
                break;
            }
        }
        const lineContent = this._model.getLineContent(position.lineNumber);
        let tokenText = '';
        if (token1Index < data.tokens1.length) {
            const tokenStartIndex = data.tokens1[token1Index].offset;
            const tokenEndIndex = token1Index + 1 < data.tokens1.length ? data.tokens1[token1Index + 1].offset : lineContent.length;
            tokenText = lineContent.substring(tokenStartIndex, tokenEndIndex);
        }
        reset(this._domNode, $('h2.tm-token', undefined, renderTokenText(tokenText), $('span.tm-token-length', undefined, `${tokenText.length} ${tokenText.length === 1 ? 'char' : 'chars'}`)));
        append(this._domNode, $('hr.tokens-inspect-separator', { 'style': 'clear:both' }));
        const metadata = (token2Index << 1) + 1 < data.tokens2.length ? this._decodeMetadata(data.tokens2[(token2Index << 1) + 1]) : null;
        append(this._domNode, $('table.tm-metadata-table', undefined, $('tbody', undefined, $('tr', undefined, $('td.tm-metadata-key', undefined, 'language'), $('td.tm-metadata-value', undefined, `${metadata ? metadata.languageId : '-?-'}`)), $('tr', undefined, $('td.tm-metadata-key', undefined, 'token type'), $('td.tm-metadata-value', undefined, `${metadata ? this._tokenTypeToString(metadata.tokenType) : '-?-'}`)), $('tr', undefined, $('td.tm-metadata-key', undefined, 'font style'), $('td.tm-metadata-value', undefined, `${metadata ? this._fontStyleToString(metadata.fontStyle) : '-?-'}`)), $('tr', undefined, $('td.tm-metadata-key', undefined, 'foreground'), $('td.tm-metadata-value', undefined, `${metadata ? Color.Format.CSS.formatHex(metadata.foreground) : '-?-'}`)), $('tr', undefined, $('td.tm-metadata-key', undefined, 'background'), $('td.tm-metadata-value', undefined, `${metadata ? Color.Format.CSS.formatHex(metadata.background) : '-?-'}`)))));
        append(this._domNode, $('hr.tokens-inspect-separator'));
        if (token1Index < data.tokens1.length) {
            append(this._domNode, $('span.tm-token-type', undefined, data.tokens1[token1Index].type));
        }
        this._editor.layoutContentWidget(this);
    }
    _decodeMetadata(metadata) {
        const colorMap = TokenizationRegistry.getColorMap();
        const languageId = TokenMetadata.getLanguageId(metadata);
        const tokenType = TokenMetadata.getTokenType(metadata);
        const fontStyle = TokenMetadata.getFontStyle(metadata);
        const foreground = TokenMetadata.getForeground(metadata);
        const background = TokenMetadata.getBackground(metadata);
        return {
            languageId: this._languageService.languageIdCodec.decodeLanguageId(languageId),
            tokenType: tokenType,
            fontStyle: fontStyle,
            foreground: colorMap[foreground],
            background: colorMap[background]
        };
    }
    _tokenTypeToString(tokenType) {
        switch (tokenType) {
            case 0 /* StandardTokenType.Other */: return 'Other';
            case 1 /* StandardTokenType.Comment */: return 'Comment';
            case 2 /* StandardTokenType.String */: return 'String';
            case 3 /* StandardTokenType.RegEx */: return 'RegEx';
            default: return '??';
        }
    }
    _fontStyleToString(fontStyle) {
        let r = '';
        if (fontStyle & 1 /* FontStyle.Italic */) {
            r += 'italic ';
        }
        if (fontStyle & 2 /* FontStyle.Bold */) {
            r += 'bold ';
        }
        if (fontStyle & 4 /* FontStyle.Underline */) {
            r += 'underline ';
        }
        if (fontStyle & 8 /* FontStyle.Strikethrough */) {
            r += 'strikethrough ';
        }
        if (r.length === 0) {
            r = '---';
        }
        return r;
    }
    _getTokensAtLine(lineNumber) {
        const stateBeforeLine = this._getStateBeforeLine(lineNumber);
        const tokenizationResult1 = this._tokenizationSupport.tokenize(this._model.getLineContent(lineNumber), true, stateBeforeLine);
        const tokenizationResult2 = this._tokenizationSupport.tokenizeEncoded(this._model.getLineContent(lineNumber), true, stateBeforeLine);
        return {
            startState: stateBeforeLine,
            tokens1: tokenizationResult1.tokens,
            tokens2: tokenizationResult2.tokens,
            endState: tokenizationResult1.endState
        };
    }
    _getStateBeforeLine(lineNumber) {
        let state = this._tokenizationSupport.getInitialState();
        for (let i = 1; i < lineNumber; i++) {
            const tokenizationResult = this._tokenizationSupport.tokenize(this._model.getLineContent(i), true, state);
            state = tokenizationResult.endState;
        }
        return state;
    }
    getDomNode() {
        return this._domNode;
    }
    getPosition() {
        return {
            position: this._editor.getPosition(),
            preference: [2 /* ContentWidgetPositionPreference.BELOW */, 1 /* ContentWidgetPositionPreference.ABOVE */]
        };
    }
}
registerEditorContribution(InspectTokensController.ID, InspectTokensController, 4 /* EditorContributionInstantiation.Lazy */);
registerEditorAction(InspectTokens);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zcGVjdFRva2Vucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvaW5zcGVjdFRva2Vucy9pbnNwZWN0VG9rZW5zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHFCQUFxQixDQUFDO0FBQzdCLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUV6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUFFLFlBQVksRUFBb0Isb0JBQW9CLEVBQUUsMEJBQTBCLEVBQW1DLE1BQU0sc0NBQXNDLENBQUM7QUFJekssT0FBTyxFQUFnQyxvQkFBb0IsRUFBMkIsTUFBTSw4QkFBOEIsQ0FBQztBQUMzSCxPQUFPLEVBQWdDLGFBQWEsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDekcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDekUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHeEUsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSxVQUFVOzthQUV4QixPQUFFLEdBQUcsOEJBQThCLEFBQWpDLENBQWtDO0lBRXBELE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBbUI7UUFDcEMsT0FBTyxNQUFNLENBQUMsZUFBZSxDQUEwQix5QkFBdUIs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