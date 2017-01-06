/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
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

@editorContribution
class InspectTMScopesController extends Disposable implements IEditorContribution {

	private static ID = 'editor.contrib.inspectTMScopes';

	public static get(editor: ICommonCodeEditor): InspectTMScopesController {
		return editor.getContribution<InspectTMScopesController>(InspectTMScopesController.ID);
	}

	private _editor: ICodeEditor;
	private _textMateService: ITextMateService;
	private _modeService: IModeService;
	private _widget: InspectTMScopesWidget;

	constructor(
		editor: ICodeEditor,
		@ITextMateService textMateService: ITextMateService,
		@IModeService modeService: IModeService
	) {
		super();
		this._editor = editor;
		this._textMateService = textMateService;
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
		this._widget = new InspectTMScopesWidget(this._editor, this._textMateService, this._modeService);
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

class InspectTMScopesWidget extends Disposable implements IContentWidget {

	private static _ID = 'editor.contrib.inspectTMScopesWidget';

	public allowEditorOverflow = true;

	private _editor: ICodeEditor;
	private _modeService: IModeService;
	private _model: IModel;
	private _domNode: HTMLElement;
	private _grammar: TPromise<IGrammar>;

	constructor(
		editor: ICodeEditor,
		textMateService: ITextMateService,
		modeService: IModeService
	) {
		super();
		this._editor = editor;
		this._modeService = modeService;
		this._model = this._editor.getModel();
		this._domNode = document.createElement('div');
		this._grammar = textMateService.createGrammar(this._model.getLanguageIdentifier().language);
		this._beginCompute(this._editor.getPosition());
		this._register(this._editor.onDidChangeCursorPosition((e) => this._beginCompute(this._editor.getPosition())));
		this._editor.addContentWidget(this);
	}

	public dispose(): void {
		this._editor.removeContentWidget(this);
	}

	public getId(): string {
		return InspectTMScopesWidget._ID;
	}

	private _beginCompute(position: Position): void {
		dom.clearNode(this._domNode);
		this._domNode.appendChild(document.createTextNode(nls.localize('inspectTMScopesWidget.loading', "Loading...")));
		this._grammar.then((grammar) => this._compute(grammar, position));
		this._editor.layoutContentWidget(this);
	}

	private _compute(grammar: IGrammar, position: Position): void {
		let data = this._getTokensAtLine(grammar, position.lineNumber);
		console.log(data);
		// let state: StackElement = null;
		// for (let i = 0; i < position.lineNumber - 1; i++) {
		// 	let lineContent
		// }
		// this._model.getValueInRange
		// grammar.tokenizeLine
		// console.log('I HAVE THE GRAMMAR!');
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

		result += `<table><tbody>`;
		result += `<tr><td style="vertical-align:top">`;
		// result += `${token1Index}`;
		// result += `${token2Index}`;

		let tokenStartIndex = data.tokens1[token1Index].startIndex;
		let tokenEndIndex = data.tokens1[token1Index].endIndex;
		let tokenText = this._model.getLineContent(position.lineNumber).substring(tokenStartIndex, tokenEndIndex);

		result += `<h2>&lt;&lt;&lt;${tokenText}&gt;&gt;&gt;</h2>`;

		let metadata = this._decodeMetadata(data.tokens2[(token2Index << 1) + 1]);

		result += `Metadata:`;
		result += `<ul>`;
		result += `<li>language: ${metadata.languageIdentifier.language}</li>`;
		result += `<li>token type: ${this._tokenTypeToString(metadata.tokenType)}</li>`;
		result += `<li>font style: ${this._fontStyleToString(metadata.fontStyle)}</li>`;
		result += `<li>foreground: ${metadata.foreground}</li>`;
		result += `<li>background: ${metadata.background}</li>`;
		result += `</ul>`;

		result += `Scopes:`;
		result += `<ul>`;
		for (let i = data.tokens1[token1Index].scopes.length - 1; i >= 0; i--) {
			result += `<li>${data.tokens1[token1Index].scopes[i]}</li>`;
		}
		result += `</ul>`;

		result += `</td><td>`;
		result += `<h2>State before line:</h2><br/>`;
		result += this._renderState(data.startState);
		result += `<h2>State after line:</h2><br/>`;
		result += this._renderState(data.endState);
		result += `</td></tr>`;
		result += `</tbody></table>`;

		// result += `<table><tbody>`;
		// result += `<tr><td>`;
		// result += this._renderState(data.startState)
		// result += `</td><td>`;
		// result += this._renderState(data.endState)
		// result += `</td></tr>`;
		// result += `</tbody></table>`;

		this._domNode.innerHTML = result;//this._renderState(data.startState);
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
		return r;
	}

	private _renderState(_state: StackElement): string {
		let state = <StackElementImpl><any>_state;
		interface ScopeListElement {
			metadata: number;
			scope: string;
			parent: ScopeListElement;
			equals(other: ScopeListElement): boolean;
		}
		interface StackElementImpl {
			contentNameScopesList: ScopeListElement;
			nameScopesList: ScopeListElement;
			parent: StackElementImpl;
			ruleId: number;
		}
		let result = '';
		result += `<table><tbody>`;

		let renderScopeListElement = (el: ScopeListElement): string => {
			let result = '';
			result += `<td class="tm-scopeName">${el.scope}</td>`;
			let metadata = this._decodeMetadata(el.metadata);

			result += `<td>${metadata.languageIdentifier.language}</td>`;
			result += `<td>${this._tokenTypeToString(metadata.tokenType)}</td>`;
			result += `<td>${this._fontStyleToString(metadata.fontStyle)}</td>`;
			result += `<td>${metadata.foreground}</td>`;
			result += `<td>${metadata.background}</td>`;
			return result;
		};

		result += `<tr>`;
		result += `<th>Rule Id</th>`;
		result += `<th>Scope(s)</th>`;
		result += `<th>Language</th>`;
		result += `<th>TokenType</th>`;
		result += `<th>FontStyle</th>`;
		result += `<th>Foreground</th>`;
		result += `<th>Background</th>`;
		result += `</tr>`;
		while (state) {
			let hasContentName = !state.contentNameScopesList.equals(state.nameScopesList);
			let hasName = !state.parent ? true : !state.parent.contentNameScopesList.equals(state.nameScopesList);

			result += `<tr>`;
			result += `<td class="tm-ruleId" rowspan="${hasContentName && hasName ? 2 : 1}">${state.ruleId}</td>`;
			if (hasContentName) {
				result += renderScopeListElement(state.contentNameScopesList);
			}
			if (hasName) {
				if (hasContentName) {
					result += `</tr><tr>`;
				}
				result += renderScopeListElement(state.nameScopesList);
			}
			if (!hasName && !hasContentName) {
				result += `<td></td><td></td><td></td><td></td><td></td>`;
			}
			result += `</tr>`;

			state = state.parent;
		}

		result += `</tbody></table>`;

		return result;
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
