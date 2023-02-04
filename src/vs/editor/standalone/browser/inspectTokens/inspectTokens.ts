/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./inspectTokens';
import { $, append, reset } from 'vs/base/browser/dom';
import { CharCode } from 'vs/base/common/charCode';
import { Color } from 'vs/base/common/color';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, IActiveCodeEditor, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction, registerEditorContribution, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { IState, ITokenizationSupport, TokenizationRegistry, ILanguageIdCodec, Token } from 'vs/editor/common/languages';
import { FontStyle, StandardTokenType, TokenMetadata } from 'vs/editor/common/encodedTokenAttributes';
import { NullState, nullTokenize, nullTokenizeEncoded } from 'vs/editor/common/languages/nullTokenize';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IStandaloneThemeService } from 'vs/editor/standalone/common/standaloneTheme';
import { InspectTokensNLS } from 'vs/editor/common/standaloneStrings';


class InspectTokensController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.inspectTokens';

	public static get(editor: ICodeEditor): InspectTokensController | null {
		return editor.getContribution<InspectTokensController>(InspectTokensController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _languageService: ILanguageService;
	private _widget: InspectTokensWidget | null;

	constructor(
		editor: ICodeEditor,
		@IStandaloneThemeService standaloneColorService: IStandaloneThemeService,
		@ILanguageService languageService: ILanguageService
	) {
		super();
		this._editor = editor;
		this._languageService = languageService;
		this._widget = null;

		this._register(this._editor.onDidChangeModel((e) => this.stop()));
		this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
		this._register(TokenizationRegistry.onDidChange((e) => this.stop()));
		this._register(this._editor.onKeyUp((e) => e.keyCode === KeyCode.Escape && this.stop()));
	}

	public override dispose(): void {
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
		this._widget = new InspectTokensWidget(this._editor, this._languageService);
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
		const controller = InspectTokensController.get(editor);
		controller?.launch();
	}
}

interface ICompleteLineTokenization {
	startState: IState;
	tokens1: Token[];
	tokens2: Uint32Array;
	endState: IState;
}

interface IDecodedMetadata {
	languageId: string;
	tokenType: StandardTokenType;
	fontStyle: FontStyle;
	foreground: Color;
	background: Color;
}

function renderTokenText(tokenText: string): string {
	let result: string = '';
	for (let charIndex = 0, len = tokenText.length; charIndex < len; charIndex++) {
		const charCode = tokenText.charCodeAt(charIndex);
		switch (charCode) {
			case CharCode.Tab:
				result += '\u2192'; // &rarr;
				break;

			case CharCode.Space:
				result += '\u00B7'; // &middot;
				break;

			default:
				result += String.fromCharCode(charCode);
		}
	}
	return result;
}

function getSafeTokenizationSupport(languageIdCodec: ILanguageIdCodec, languageId: string): ITokenizationSupport {
	const tokenizationSupport = TokenizationRegistry.get(languageId);
	if (tokenizationSupport) {
		return tokenizationSupport;
	}
	const encodedLanguageId = languageIdCodec.encodeLanguageId(languageId);
	return {
		getInitialState: () => NullState,
		tokenize: (line: string, hasEOL: boolean, state: IState) => nullTokenize(languageId, state),
		tokenizeEncoded: (line: string, hasEOL: boolean, state: IState) => nullTokenizeEncoded(encodedLanguageId, state)
	};
}

class InspectTokensWidget extends Disposable implements IContentWidget {

	private static readonly _ID = 'editor.contrib.inspectTokensWidget';

	// Editor.IContentWidget.allowEditorOverflow
	public allowEditorOverflow = true;

	private readonly _editor: IActiveCodeEditor;
	private readonly _languageService: ILanguageService;
	private readonly _tokenizationSupport: ITokenizationSupport;
	private readonly _model: ITextModel;
	private readonly _domNode: HTMLElement;

	constructor(
		editor: IActiveCodeEditor,
		languageService: ILanguageService
	) {
		super();
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

	public override dispose(): void {
		this._editor.removeContentWidget(this);
		super.dispose();
	}

	public getId(): string {
		return InspectTokensWidget._ID;
	}

	private _compute(position: Position): void {
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
		reset(this._domNode,
			$('h2.tm-token', undefined, renderTokenText(tokenText),
				$('span.tm-token-length', undefined, `${tokenText.length} ${tokenText.length === 1 ? 'char' : 'chars'}`)));

		append(this._domNode, $('hr.tokens-inspect-separator', { 'style': 'clear:both' }));

		const metadata = (token2Index << 1) + 1 < data.tokens2.length ? this._decodeMetadata(data.tokens2[(token2Index << 1) + 1]) : null;
		append(this._domNode, $('table.tm-metadata-table', undefined,
			$('tbody', undefined,
				$('tr', undefined,
					$('td.tm-metadata-key', undefined, 'language'),
					$('td.tm-metadata-value', undefined, `${metadata ? metadata.languageId : '-?-'}`)
				),
				$('tr', undefined,
					$('td.tm-metadata-key', undefined, 'token type' as string),
					$('td.tm-metadata-value', undefined, `${metadata ? this._tokenTypeToString(metadata.tokenType) : '-?-'}`)
				),
				$('tr', undefined,
					$('td.tm-metadata-key', undefined, 'font style' as string),
					$('td.tm-metadata-value', undefined, `${metadata ? this._fontStyleToString(metadata.fontStyle) : '-?-'}`)
				),
				$('tr', undefined,
					$('td.tm-metadata-key', undefined, 'foreground'),
					$('td.tm-metadata-value', undefined, `${metadata ? Color.Format.CSS.formatHex(metadata.foreground) : '-?-'}`)
				),
				$('tr', undefined,
					$('td.tm-metadata-key', undefined, 'background'),
					$('td.tm-metadata-value', undefined, `${metadata ? Color.Format.CSS.formatHex(metadata.background) : '-?-'}`)
				)
			)
		));
		append(this._domNode, $('hr.tokens-inspect-separator'));

		if (token1Index < data.tokens1.length) {
			append(this._domNode, $('span.tm-token-type', undefined, data.tokens1[token1Index].type));
		}

		this._editor.layoutContentWidget(this);
	}

	private _decodeMetadata(metadata: number): IDecodedMetadata {
		const colorMap = TokenizationRegistry.getColorMap()!;
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

	private _tokenTypeToString(tokenType: StandardTokenType): string {
		switch (tokenType) {
			case StandardTokenType.Other: return 'Other';
			case StandardTokenType.Comment: return 'Comment';
			case StandardTokenType.String: return 'String';
			case StandardTokenType.RegEx: return 'RegEx';
			default: return '??';
		}
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
		if (fontStyle & FontStyle.Strikethrough) {
			r += 'strikethrough ';
		}
		if (r.length === 0) {
			r = '---';
		}
		return r;
	}

	private _getTokensAtLine(lineNumber: number): ICompleteLineTokenization {
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

	private _getStateBeforeLine(lineNumber: number): IState {
		let state: IState = this._tokenizationSupport.getInitialState();

		for (let i = 1; i < lineNumber; i++) {
			const tokenizationResult = this._tokenizationSupport.tokenize(this._model.getLineContent(i), true, state);
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

registerEditorContribution(InspectTokensController.ID, InspectTokensController, EditorContributionInstantiation.Lazy);
registerEditorAction(InspectTokens);
