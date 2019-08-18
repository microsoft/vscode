/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./inspectTMScopes';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { CharCode } from 'vs/base/common/charCode';
import { Color } from 'vs/base/common/color';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { escape } from 'vs/base/common/strings';
import { ContentWidgetPositionPreference, IActiveCodeEditor, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { FontStyle, LanguageIdentifier, StandardTokenType, TokenMetadata, TokenizationRegistry } from 'vs/editor/common/modes';
import { IModeService } from 'vs/editor/common/services/modeService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { editorHoverBackground, editorHoverBorder } from 'vs/platform/theme/common/colorRegistry';
import { HIGH_CONTRAST, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { findMatchingThemeRule } from 'vs/workbench/services/textMate/common/TMHelper';
import { ITextMateService, IGrammar, IToken, StackElement } from 'vs/workbench/services/textMate/common/textMateService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';

class InspectTMScopesController extends Disposable implements IEditorContribution {

	private static readonly ID = 'editor.contrib.inspectTMScopes';

	public static get(editor: ICodeEditor): InspectTMScopesController {
		return editor.getContribution<InspectTMScopesController>(InspectTMScopesController.ID);
	}

	private _editor: ICodeEditor;
	private _textMateService: ITextMateService;
	private _themeService: IWorkbenchThemeService;
	private _modeService: IModeService;
	private _notificationService: INotificationService;
	private _widget: InspectTMScopesWidget | null;

	constructor(
		editor: ICodeEditor,
		@ITextMateService textMateService: ITextMateService,
		@IModeService modeService: IModeService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@INotificationService notificationService: INotificationService
	) {
		super();
		this._editor = editor;
		this._textMateService = textMateService;
		this._themeService = themeService;
		this._modeService = modeService;
		this._notificationService = notificationService;
		this._widget = null;

		this._register(this._editor.onDidChangeModel((e) => this.stop()));
		this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
		this._register(this._editor.onKeyUp((e) => e.keyCode === KeyCode.Escape && this.stop()));
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
		if (!this._editor.hasModel()) {
			return;
		}
		this._widget = new InspectTMScopesWidget(this._editor, this._textMateService, this._modeService, this._themeService, this._notificationService);
	}

	public stop(): void {
		if (this._widget) {
			this._widget.dispose();
			this._widget = null;
		}
	}

	public toggle(): void {
		if (!this._widget) {
			this.launch();
		} else {
			this.stop();
		}
	}
}

class InspectTMScopes extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.inspectTMScopes',
			label: nls.localize('inspectTMScopes', "Developer: Inspect TM Scopes"),
			alias: 'Developer: Inspect TM Scopes',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let controller = InspectTMScopesController.get(editor);
		if (controller) {
			controller.toggle();
		}
	}
}

interface ICompleteLineTokenization {
	startState: StackElement | null;
	tokens1: IToken[];
	tokens2: Uint32Array;
	endState: StackElement;
}

interface IDecodedMetadata {
	languageIdentifier: LanguageIdentifier;
	tokenType: StandardTokenType;
	fontStyle: FontStyle;
	foreground: Color;
	background: Color;
}

function renderTokenText(tokenText: string): string {
	if (tokenText.length > 40) {
		tokenText = tokenText.substr(0, 20) + '…' + tokenText.substr(tokenText.length - 20);
	}
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

	private static readonly _ID = 'editor.contrib.inspectTMScopesWidget';

	// Editor.IContentWidget.allowEditorOverflow
	public readonly allowEditorOverflow = true;

	private _isDisposed: boolean;
	private readonly _editor: IActiveCodeEditor;
	private readonly _modeService: IModeService;
	private readonly _themeService: IWorkbenchThemeService;
	private readonly _notificationService: INotificationService;
	private readonly _model: ITextModel;
	private readonly _domNode: HTMLElement;
	private readonly _grammar: Promise<IGrammar>;

	constructor(
		editor: IActiveCodeEditor,
		textMateService: ITextMateService,
		modeService: IModeService,
		themeService: IWorkbenchThemeService,
		notificationService: INotificationService
	) {
		super();
		this._isDisposed = false;
		this._editor = editor;
		this._modeService = modeService;
		this._themeService = themeService;
		this._notificationService = notificationService;
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
		this._grammar.then(
			(grammar) => this._compute(grammar, position),
			(err) => {
				this._notificationService.warn(err);
				setTimeout(() => {
					InspectTMScopesController.get(this._editor).stop();
				});
			}
		);
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

		result += `<hr class="tm-metadata-separator" style="clear:both"/>`;

		let metadata = this._decodeMetadata(data.tokens2[(token2Index << 1) + 1]);
		result += `<table class="tm-metadata-table"><tbody>`;
		result += `<tr><td class="tm-metadata-key">language</td><td class="tm-metadata-value">${escape(metadata.languageIdentifier.language)}</td></tr>`;
		result += `<tr><td class="tm-metadata-key">token type</td><td class="tm-metadata-value">${this._tokenTypeToString(metadata.tokenType)}</td></tr>`;
		result += `<tr><td class="tm-metadata-key">font style</td><td class="tm-metadata-value">${this._fontStyleToString(metadata.fontStyle)}</td></tr>`;
		result += `<tr><td class="tm-metadata-key">foreground</td><td class="tm-metadata-value">${Color.Format.CSS.formatHexA(metadata.foreground)}</td></tr>`;
		result += `<tr><td class="tm-metadata-key">background</td><td class="tm-metadata-value">${Color.Format.CSS.formatHexA(metadata.background)}</td></tr>`;
		if (metadata.background.isOpaque() && metadata.foreground.isOpaque()) {
			result += `<tr><td class="tm-metadata-key">contrast ratio</td><td class="tm-metadata-value">${metadata.background.getContrastRatio(metadata.foreground).toFixed(2)}</td></tr>`;
		} else {
			result += '<tr><td class="tm-metadata-key">Contrast ratio cannot be precise for colors that use transparency</td><td class="tm-metadata-value"></td></tr>';
		}
		result += `</tbody></table>`;

		let theme = this._themeService.getColorTheme();
		result += `<hr class="tm-metadata-separator"/>`;
		let matchingRule = findMatchingThemeRule(theme, data.tokens1[token1Index].scopes, false);
		if (matchingRule) {
			result += `<code class="tm-theme-selector">${matchingRule.rawSelector}\n${JSON.stringify(matchingRule.settings, null, '\t')}</code>`;
		} else {
			result += `<span class="tm-theme-selector">No theme selector.</span>`;
		}

		result += `<hr class="tm-metadata-separator"/>`;

		result += `<ul>`;
		for (let i = data.tokens1[token1Index].scopes.length - 1; i >= 0; i--) {
			result += `<li>${escape(data.tokens1[token1Index].scopes[i])}</li>`;
		}
		result += `</ul>`;


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

	private _getStateBeforeLine(grammar: IGrammar, lineNumber: number): StackElement | null {
		let state: StackElement | null = null;

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

registerEditorContribution(InspectTMScopesController);
registerEditorAction(InspectTMScopes);

registerThemingParticipant((theme, collector) => {
	const border = theme.getColor(editorHoverBorder);
	if (border) {
		let borderWidth = theme.type === HIGH_CONTRAST ? 2 : 1;
		collector.addRule(`.monaco-editor .tm-inspect-widget { border: ${borderWidth}px solid ${border}; }`);
		collector.addRule(`.monaco-editor .tm-inspect-widget .tm-metadata-separator { background-color: ${border}; }`);
	}
	const background = theme.getColor(editorHoverBackground);
	if (background) {
		collector.addRule(`.monaco-editor .tm-inspect-widget { background-color: ${background}; }`);
	}
});
