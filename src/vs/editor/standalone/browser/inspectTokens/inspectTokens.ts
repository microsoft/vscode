/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./inspectTokens';
import { CharCode } from 'vs/base/common/charCode';
import { Color } from 'vs/base/common/color';
import { Disposable } from 'vs/base/common/lifecycle';
import { escape } from 'vs/base/common/strings';
import { ContentWidgetPositionPreference, IActiveCodeEditor, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { Token } from 'vs/editor/common/core/token';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { FontStyle, IState, ITokenizationSupport, LanguageIdentifier, StandardTokenType, TokenMetadata, TokenizationRegistry } from 'vs/editor/common/modes';
import { NULL_STATE, nullTokenize, nullTokenize2 } from 'vs/editor/common/modes/nullMode';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IStandaloneThemeService } from 'vs/editor/standalone/common/standaloneThemeService';
import { editorHoverBackground, editorHoverBorder } from 'vs/platform/theme/common/colorRegistry';
import { HIGH_CONTRAST, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { InspectTokensNLS } from 'vs/editor/common/standaloneStrings';


class InspectTokensController extends Disposable implements IEditorContribution {

	private static readonly ID = 'editor.contrib.inspectTokens';

	public static get(editor: ICodeEditor): InspectTokensController {
		return editor.getContribution<InspectTokensController>(InspectTokensController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _modeService: IModeService;
	private _widget: InspectTokensWidget | null;

	constructor(
		editor: ICodeEditor,
		@IStandaloneThemeService standaloneColorService: IStandaloneThemeService,
		@IModeService modeService: IModeService
	) {
		super();
		this._editor = editor;
		this._modeService = modeService;
		this._widget = null;

		this._register(this._editor.onDidChangeModel((e) => this.stop()));
		this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
		this._register(TokenizationRegistry.onDidChange((e) => this.stop()));
	}

	public getId(): string {
		return InspectTokensController.ID;
	}

	public dispose(): void {
		this.stop();
		super.dispose();
	}

	public launch(): void {
		if (this._widget) {
			return;
		}
		if (!this._editor.hasModel()) {
			return;
		}
		this._widget = new InspectTokensWidget(this._editor, this._modeService);
	}

	public stop(): void {
		if (this._widget) {
			this._widget.dispose();
			this._widget = null;
		}
	}
}

class InspectTokens extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.inspectTokens',
			label: InspectTokensNLS.inspectTokensAction,
			alias: 'Developer: Inspect Tokens',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let controller = InspectTokensController.get(editor);
		if (controller) {
			controller.launch();
		}
	}
}

interface ICompleteLineTokenization {
	startState: IState;
	tokens1: Token[];
	tokens2: Uint32Array;
	endState: IState;
}

interface IDecodedMetadata {
	languageIdentifier: LanguageIdentifier;
	tokenType: StandardTokenType;
	fontStyle: FontStyle;
	foreground: Color;
	background: Color;
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

function getSafeTokenizationSupport(languageIdentifier: LanguageIdentifier): ITokenizationSupport {
	let tokenizationSupport = TokenizationRegistry.get(languageIdentifier.language);
	if (tokenizationSupport) {
		return tokenizationSupport;
	}
	return {
		getInitialState: () => NULL_STATE,
		tokenize: (line: string, state: IState, deltaOffset: number) => nullTokenize(languageIdentifier.language, line, state, deltaOffset),
		tokenize2: (line: string, state: IState, deltaOffset: number) => nullTokenize2(languageIdentifier.id, line, state, deltaOffset)
	};
}

class InspectTokensWidget extends Disposable implements IContentWidget {

	private static readonly _ID = 'editor.contrib.inspectTokensWidget';

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	private readonly _editor: IActiveCodeEditor;
	private readonly _modeService: IModeService;
	private readonly _tokenizationSupport: ITokenizationSupport;
	private readonly _model: ITextModel;
	private readonly _domNode: HTMLElement;

	constructor(
		editor: IActiveCodeEditor,
		modeService: IModeService
	) {
		super();
		this._editor = editor;
		this._modeService = modeService;
		this._model = this._editor.getModel();
		this._domNode = document.createElement('div');
		this._domNode.className = 'tokens-inspect-widget';
		this._tokenizationSupport = getSafeTokenizationSupport(this._model.getLanguageIdentifier());
		this._compute(this._editor.getPosition());
		this._register(this._editor.onDidChangeCursorPosition((e) => this._compute(this._editor.getPosition())));
		this._editor.addContentWidget(this);
	}

	public dispose(): void {
		this._editor.removeContentWidget(this);
		super.dispose();
	}

	public getId(): string {
		return InspectTokensWidget._ID;
	}

	private _compute(position: Position): void {
		let data = this._getTokensAtLine(position.lineNumber);

		let token1Index = 0;
		for (let i = data.tokens1.length - 1; i >= 0; i--) {
			let t = data.tokens1[i];
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

		let result = '';

		let lineContent = this._model.getLineContent(position.lineNumber);
		let tokenText = '';
		if (token1Index < data.tokens1.length) {
			let tokenStartIndex = data.tokens1[token1Index].offset;
			let tokenEndIndex = token1Index + 1 < data.tokens1.length ? data.tokens1[token1Index + 1].offset : lineContent.length;
			tokenText = lineContent.substring(tokenStartIndex, tokenEndIndex);
		}
		result += `<h2 class="tm-token">${renderTokenText(tokenText)}<span class="tm-token-length">(${tokenText.length} ${tokenText.length === 1 ? 'char' : 'chars'})</span></h2>`;

		result += `<hr class="tokens-inspect-separator" style="clear:both"/>`;

		let metadata = this._decodeMetadata(data.tokens2[(token2Index << 1) + 1]);
		result += `<table class="tm-metadata-table"><tbody>`;
		result += `<tr><td class="tm-metadata-key">language</td><td class="tm-metadata-value">${escape(metadata.languageIdentifier.language)}</td>`;
		result += `<tr><td class="tm-metadata-key">token type</td><td class="tm-metadata-value">${this._tokenTypeToString(metadata.tokenType)}</td>`;
		result += `<tr><td class="tm-metadata-key">font style</td><td class="tm-metadata-value">${this._fontStyleToString(metadata.fontStyle)}</td>`;
		result += `<tr><td class="tm-metadata-key">foreground</td><td class="tm-metadata-value">${Color.Format.CSS.formatHex(metadata.foreground)}</td>`;
		result += `<tr><td class="tm-metadata-key">background</td><td class="tm-metadata-value">${Color.Format.CSS.formatHex(metadata.background)}</td>`;
		result += `</tbody></table>`;

		result += `<hr class="tokens-inspect-separator"/>`;

		if (token1Index < data.tokens1.length) {
			result += `<span class="tm-token-type">${escape(data.tokens1[token1Index].type)}</span>`;
		}

		this._domNode.innerHTML = result;
		this._editor.layoutContentWidget(this);
	}

	private _decodeMetadata(metadata: number): IDecodedMetadata {
		let colorMap = TokenizationRegistry.getColorMap()!;
		let languageId = TokenMetadata.getLanguageId(metadata);
		let tokenType = TokenMetadata.getTokenType(metadata);
		let fontStyle = TokenMetadata.getFontStyle(metadata);
		let foreground = TokenMetadata.getForeground(metadata);
		let background = TokenMetadata.getBackground(metadata);
		return {
			languageIdentifier: this._modeService.getLanguageIdentifier(languageId)!,
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

	private _getTokensAtLine(lineNumber: number): ICompleteLineTokenization {
		let stateBeforeLine = this._getStateBeforeLine(lineNumber);

		let tokenizationResult1 = this._tokenizationSupport.tokenize(this._model.getLineContent(lineNumber), stateBeforeLine, 0);
		let tokenizationResult2 = this._tokenizationSupport.tokenize2(this._model.getLineContent(lineNumber), stateBeforeLine, 0);

		return {
			startState: stateBeforeLine,
			tokens1: tokenizationResult1.tokens,
			tokens2: tokenizationResult2.tokens,
			endState: tokenizationResult1.endState
		};
	}

	private _getStateBeforeLine(lineNumber: number): IState {
		let state: IState = this._tokenizationSupport.getInitialState();

		for (let i = 1; i < lineNumber; i++) {
			let tokenizationResult = this._tokenizationSupport.tokenize(this._model.getLineContent(i), state, 0);
			state = tokenizationResult.endState;
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

registerEditorContribution(InspectTokensController);
registerEditorAction(InspectTokens);

registerThemingParticipant((theme, collector) => {
	const border = theme.getColor(editorHoverBorder);
	if (border) {
		let borderWidth = theme.type === HIGH_CONTRAST ? 2 : 1;
		collector.addRule(`.monaco-editor .tokens-inspect-widget { border: ${borderWidth}px solid ${border}; }`);
		collector.addRule(`.monaco-editor .tokens-inspect-widget .tokens-inspect-separator { background-color: ${border}; }`);
	}
	const background = theme.getColor(editorHoverBackground);
	if (background) {
		collector.addRule(`.monaco-editor .tokens-inspect-widget { background-color: ${background}; }`);
	}
});
