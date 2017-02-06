/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./inspectTMScopes';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { escape } from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { ICommonCodeEditor, IEditorContribution, IModel } from 'vs/editor/common/editorCommon';
import { editorAction, EditorAction, ServicesAccessor } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor, ContentWidgetPositionPreference, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { TPromise } from 'vs/base/common/winjs.base';
import { IGrammar, StackElement, IToken } from 'vscode-textmate';
import { ITextMateService } from 'vs/editor/node/textMate/textMateService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { TokenMetadata } from 'vs/editor/common/model/tokensBinaryEncoding';
import { TokenizationRegistry, LanguageIdentifier, FontStyle, StandardTokenType } from 'vs/editor/common/modes';
import { CharCode } from 'vs/base/common/charCode';
import { findMatchingThemeRule } from 'vs/editor/electron-browser/textMate/TMHelper';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';

@editorContribution
class InspectTMScopesController extends Disposable implements IEditorContribution {

	private static ID = 'editor.contrib.inspectTMScopes';

	public static get(editor: ICommonCodeEditor): InspectTMScopesController {
		return editor.getContribution<InspectTMScopesController>(InspectTMScopesController.ID);
	}

	private _editor: ICodeEditor;
	private _textMateService: ITextMateService;
	private _themeService: IThemeService;
	private _modeService: IModeService;
	private _widget: InspectTMScopesWidget;

	constructor(
		editor: ICodeEditor,
		@ITextMateService textMateService: ITextMateService,
		@IModeService modeService: IModeService,
		@IThemeService themeService: IThemeService
	) {
		super();
		this._editor = editor;
		this._textMateService = textMateService;
		this._themeService = themeService;
		this._modeService = modeService;
		this._widget = null;

		this._register(this._editor.onDidChangeModel((e) => this.stop()));
		this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
	}

	public getId(): string {
		return InspectTMScopesController.ID;
	}

	public dispose(): void {
		this.stop();
		super.dispose();
	}

	public launch(): void {
		if (this._widget) {
			return;
		}
		if (!this._editor.getModel()) {
			return;
		}
		this._widget = new InspectTMScopesWidget(this._editor, this._textMateService, this._modeService, this._themeService);
	}

	public stop(): void {
		if (this._widget) {
			this._widget.dispose();
			this._widget = null;
		}
	}
}

@editorAction
class InspectTMScopes extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.inspectTMScopes',
			label: nls.localize('inspectTMScopes', "Developer: Inspect TM Scopes"),
			alias: 'Developer: Inspect TM Scopes',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		let controller = InspectTMScopesController.get(editor);
		if (controller) {
			controller.launch();
		}
	}
}

interface ICompleteLineTokenization {
	startState: StackElement;
	tokens1: IToken[];
	tokens2: Uint32Array;
	endState: StackElement;
}

interface IDecodedMetadata {
	languageIdentifier: LanguageIdentifier;
	tokenType: StandardTokenType;
	fontStyle: FontStyle;
	foreground: string;
	background: string;
}

function renderTokenText(tokenText: string): string {
	let result: string = '';
	for (let charIndex = 0, len = tokenText.length; charIndex < len; charIndex++) {
		let charCode = tokenText.charCodeAt(charIndex);
		switch (charCode) {
			case CharCode.Tab:
				result += '&rarr;';
				break;

			case CharCode.Space:
				result += '&middot;';
				break;

			case CharCode.LessThan:
				result += '&lt;';
				break;

			case CharCode.GreaterThan:
				result += '&gt;';
				break;

			case CharCode.Ampersand:
				result += '&amp;';
				break;

			default:
				result += String.fromCharCode(charCode);
		}
	}
	return result;
}

class InspectTMScopesWidget extends Disposable implements IContentWidget {

	private static _ID = 'editor.contrib.inspectTMScopesWidget';

	public allowEditorOverflow = true;

	private _isDisposed: boolean;
	private _editor: ICodeEditor;
	private _modeService: IModeService;
	private _themeService: IThemeService;
	private _model: IModel;
	private _domNode: HTMLElement;
	private _grammar: TPromise<IGrammar>;

	constructor(
		editor: ICodeEditor,
		textMateService: ITextMateService,
		modeService: IModeService,
		themeService: IThemeService
	) {
		super();
		this._isDisposed = false;
		this._editor = editor;
		this._modeService = modeService;
		this._themeService = themeService;
		this._model = this._editor.getModel();
		this._domNode = document.createElement('div');
		this._domNode.className = 'tm-inspect-widget';
		this._grammar = textMateService.createGrammar(this._model.getLanguageIdentifier().language);
		this._beginCompute(this._editor.getPosition());
		this._register(this._editor.onDidChangeCursorPosition((e) => this._beginCompute(this._editor.getPosition())));
		this._editor.addContentWidget(this);
	}

	public dispose(): void {
		this._isDisposed = true;
		this._editor.removeContentWidget(this);
		super.dispose();
	}

	public getId(): string {
		return InspectTMScopesWidget._ID;
	}

	private _beginCompute(position: Position): void {
		dom.clearNode(this._domNode);
		this._domNode.appendChild(document.createTextNode(nls.localize('inspectTMScopesWidget.loading', "Loading...")));
		this._grammar.then((grammar) => this._compute(grammar, position));
	}

	private _compute(grammar: IGrammar, position: Position): void {
		if (this._isDisposed) {
			return;
		}
		let data = this._getTokensAtLine(grammar, position.lineNumber);

		let token1Index = 0;
		for (let i = data.tokens1.length - 1; i >= 0; i--) {
			let t = data.tokens1[i];
			if (position.column - 1 >= t.startIndex) {
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

		let result = '';

		let tokenStartIndex = data.tokens1[token1Index].startIndex;
		let tokenEndIndex = data.tokens1[token1Index].endIndex;
		let tokenText = this._model.getLineContent(position.lineNumber).substring(tokenStartIndex, tokenEndIndex);
		result += `<h2 class="tm-token">${renderTokenText(tokenText)}<span class="tm-token-length">(${tokenText.length} ${tokenText.length === 1 ? 'char' : 'chars'})</span></h2>`;

		result += `<hr style="clear:both"/>`;

		let metadata = this._decodeMetadata(data.tokens2[(token2Index << 1) + 1]);
		result += `<table class="tm-metadata-table"><tbody>`;
		result += `<tr><td class="tm-metadata-key">language</td><td class="tm-metadata-value">${escape(metadata.languageIdentifier.language)}</td>`;
		result += `<tr><td class="tm-metadata-key">token type</td><td class="tm-metadata-value">${this._tokenTypeToString(metadata.tokenType)}</td>`;
		result += `<tr><td class="tm-metadata-key">font style</td><td class="tm-metadata-value">${this._fontStyleToString(metadata.fontStyle)}</td>`;
		result += `<tr><td class="tm-metadata-key">foreground</td><td class="tm-metadata-value">${metadata.foreground}</td>`;
		result += `<tr><td class="tm-metadata-key">background</td><td class="tm-metadata-value">${metadata.background}</td>`;
		result += `</tbody></table>`;

		let theme = this._themeService.getColorTheme();
		result += `<hr/>`;
		let matchingRule = findMatchingThemeRule(theme, data.tokens1[token1Index].scopes);
		if (matchingRule) {
			result += `<code class="tm-theme-selector">${matchingRule.rawSelector}\n${JSON.stringify(matchingRule.settings, null, '\t')}</code>`;
		} else {
			result += `<span class="tm-theme-selector">No theme selector.</span>`;
		}

		result += `<hr/>`;

		result += `<ul>`;
		for (let i = data.tokens1[token1Index].scopes.length - 1; i >= 0; i--) {
			result += `<li>${escape(data.tokens1[token1Index].scopes[i])}</li>`;
		}
		result += `</ul>`;


		this._domNode.innerHTML = result;
		this._editor.layoutContentWidget(this);
	}

	private _decodeMetadata(metadata: number): IDecodedMetadata {
		let colorMap = TokenizationRegistry.getColorMap();
		let languageId = TokenMetadata.getLanguageId(metadata);
		let tokenType = TokenMetadata.getTokenType(metadata);
		let fontStyle = TokenMetadata.getFontStyle(metadata);
		let foreground = TokenMetadata.getForeground(metadata);
		let background = TokenMetadata.getBackground(metadata);
		return {
			languageIdentifier: this._modeService.getLanguageIdentifier(languageId),
			tokenType: tokenType,
			fontStyle: fontStyle,
			foreground: colorMap[foreground],
			background: colorMap[background]
		};
	}

	private _tokenTypeToString(tokenType: StandardTokenType): string {
		switch (tokenType) {
			case StandardTokenType.Other: return 'Other';
			case StandardTokenType.Comment: return 'Comment';
			case StandardTokenType.String: return 'String';
			case StandardTokenType.RegEx: return 'RegEx';
		}
		return '??';
	}

	private _fontStyleToString(fontStyle: FontStyle): string {
		let r = '';
		if (fontStyle & FontStyle.Italic) {
			r += 'italic ';
		}
		if (fontStyle & FontStyle.Bold) {
			r += 'bold ';
		}
		if (fontStyle & FontStyle.Underline) {
			r += 'underline ';
		}
		if (r.length === 0) {
			r = '---';
		}
		return r;
	}

	private _getTokensAtLine(grammar: IGrammar, lineNumber: number): ICompleteLineTokenization {
		let stateBeforeLine = this._getStateBeforeLine(grammar, lineNumber);

		let tokenizationResult1 = grammar.tokenizeLine(this._model.getLineContent(lineNumber), stateBeforeLine);
		let tokenizationResult2 = grammar.tokenizeLine2(this._model.getLineContent(lineNumber), stateBeforeLine);

		return {
			startState: stateBeforeLine,
			tokens1: tokenizationResult1.tokens,
			tokens2: tokenizationResult2.tokens,
			endState: tokenizationResult1.ruleStack
		};
	}

	private _getStateBeforeLine(grammar: IGrammar, lineNumber: number): StackElement {
		let state: StackElement = null;

		for (let i = 1; i < lineNumber; i++) {
			let tokenizationResult = grammar.tokenizeLine(this._model.getLineContent(i), state);
			state = tokenizationResult.ruleStack;
		}

		return state;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IContentWidgetPosition {
		return {
			position: this._editor.getPosition(),
			preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
		};
	}
}
