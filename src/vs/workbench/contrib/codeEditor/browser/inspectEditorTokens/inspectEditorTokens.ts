/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./inspectEditorTokens';
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
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { FontStyle, LanguageIdentifier, StandardTokenType, TokenMetadata, DocumentSemanticTokensProviderRegistry, SemanticTokensLegend, SemanticTokens, LanguageId } from 'vs/editor/common/modes';
import { IModeService } from 'vs/editor/common/services/modeService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { editorHoverBackground, editorHoverBorder } from 'vs/platform/theme/common/colorRegistry';
import { HIGH_CONTRAST, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { findMatchingThemeRule } from 'vs/workbench/services/textMate/common/TMHelper';
import { ITextMateService, IGrammar, IToken, StackElement } from 'vs/workbench/services/textMate/common/textMateService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { ColorThemeData, TokenStyleDefinitions, TokenStyleDefinition } from 'vs/workbench/services/themes/common/colorThemeData';
import { TokenStylingRule } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import type { IEditorSemanticHighlightingOptions } from 'vs/editor/common/config/editorOptions';

class InspectEditorTokensController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.inspectEditorTokens';

	public static get(editor: ICodeEditor): InspectEditorTokensController {
		return editor.getContribution<InspectEditorTokensController>(InspectEditorTokensController.ID);
	}

	private _editor: ICodeEditor;
	private _textMateService: ITextMateService;
	private _themeService: IWorkbenchThemeService;
	private _modeService: IModeService;
	private _notificationService: INotificationService;
	private _configurationService: IConfigurationService;
	private _widget: InspectEditorTokensWidget | null;

	constructor(
		editor: ICodeEditor,
		@ITextMateService textMateService: ITextMateService,
		@IModeService modeService: IModeService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@INotificationService notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();
		this._editor = editor;
		this._textMateService = textMateService;
		this._themeService = themeService;
		this._modeService = modeService;
		this._notificationService = notificationService;
		this._configurationService = configurationService;
		this._widget = null;

		this._register(this._editor.onDidChangeModel((e) => this.stop()));
		this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
		this._register(this._editor.onKeyUp((e) => e.keyCode === KeyCode.Escape && this.stop()));
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
		this._widget = new InspectEditorTokensWidget(this._editor, this._textMateService, this._modeService, this._themeService, this._notificationService, this._configurationService);
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

class InspectEditorTokens extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.inspectTMScopes',
			label: nls.localize('inspectEditorTokens', "Developer: Inspect Editor Tokens and Scopes"),
			alias: 'Developer: Inspect Editor Tokens and Scopes',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let controller = InspectEditorTokensController.get(editor);
		if (controller) {
			controller.toggle();
		}
	}
}

interface ITextMateTokenInfo {
	token: IToken;
	metadata: IDecodedMetadata;
}

interface ISemanticTokenInfo {
	type: string;
	modifiers: string[];
	range: Range;
	metadata: IDecodedMetadata,
	definitions: TokenStyleDefinitions
}

interface IDecodedMetadata {
	languageIdentifier: LanguageIdentifier;
	tokenType: StandardTokenType;
	fontStyle: string;
	foreground?: string;
	background?: string;
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

type SemanticTokensResult = { tokens: SemanticTokens, legend: SemanticTokensLegend };

class InspectEditorTokensWidget extends Disposable implements IContentWidget {

	private static readonly _ID = 'editor.contrib.inspectEditorTokensWidget';

	// Editor.IContentWidget.allowEditorOverflow
	public readonly allowEditorOverflow = true;

	private _isDisposed: boolean;
	private readonly _editor: IActiveCodeEditor;
	private readonly _modeService: IModeService;
	private readonly _themeService: IWorkbenchThemeService;
	private readonly _notificationService: INotificationService;
	private readonly _configurationService: IConfigurationService;
	private readonly _model: ITextModel;
	private readonly _domNode: HTMLElement;
	private readonly _grammar: Promise<IGrammar | null>;
	private readonly _semanticTokens: Promise<SemanticTokensResult | null>;
	private readonly _currentRequestCancellationTokenSource: CancellationTokenSource;

	constructor(
		editor: IActiveCodeEditor,
		textMateService: ITextMateService,
		modeService: IModeService,
		themeService: IWorkbenchThemeService,
		notificationService: INotificationService,
		configurationService: IConfigurationService
	) {
		super();
		this._isDisposed = false;
		this._editor = editor;
		this._modeService = modeService;
		this._themeService = themeService;
		this._notificationService = notificationService;
		this._configurationService = configurationService;
		this._model = this._editor.getModel();
		this._domNode = document.createElement('div');
		this._domNode.className = 'token-inspect-widget';
		this._currentRequestCancellationTokenSource = new CancellationTokenSource();
		this._grammar = textMateService.createGrammar(this._model.getLanguageIdentifier().language);
		this._semanticTokens = this._computeSemanticTokens();
		this._beginCompute(this._editor.getPosition());
		this._register(this._editor.onDidChangeCursorPosition((e) => this._beginCompute(this._editor.getPosition())));
		this._editor.addContentWidget(this);
	}

	public dispose(): void {
		this._isDisposed = true;
		this._editor.removeContentWidget(this);
		this._currentRequestCancellationTokenSource.cancel();
		super.dispose();
	}

	public getId(): string {
		return InspectEditorTokensWidget._ID;
	}

	private _beginCompute(position: Position): void {
		dom.clearNode(this._domNode);
		this._domNode.appendChild(document.createTextNode(nls.localize('inspectTMScopesWidget.loading', "Loading...")));

		Promise.all([this._grammar, this._semanticTokens]).then(([grammar, semanticTokens]) => {
			if (this._isDisposed) {
				return;
			}
			let text = this._compute(grammar, semanticTokens, position);
			this._domNode.innerHTML = text;
			this._editor.layoutContentWidget(this);
		}, (err) => {
			this._notificationService.warn(err);

			setTimeout(() => {
				InspectEditorTokensController.get(this._editor).stop();
			});
		});

	}

	private _isSemanticColoringEnabled() {
		const options = this._configurationService.getValue<IEditorSemanticHighlightingOptions>('editor.semanticHighlighting', { overrideIdentifier: this._model.getLanguageIdentifier().language, resource: this._model.uri });
		return options && options.enabled;
	}

	private _compute(grammar: IGrammar | null, semanticTokens: SemanticTokensResult | null, position: Position): string {
		const textMateTokenInfo = grammar && this._getTokensAtPosition(grammar, position);
		const semanticTokenInfo = semanticTokens && this._getSemanticTokenAtPosition(semanticTokens, position);

		let tokenText;

		let metadata: IDecodedMetadata | undefined;
		let tmFallback: IDecodedMetadata | undefined;

		if (semanticTokenInfo) {
			tokenText = this._model.getValueInRange(semanticTokenInfo.range);
			metadata = semanticTokenInfo.metadata;
			if (textMateTokenInfo) {
				tmFallback = textMateTokenInfo.metadata;
			}
		} else if (textMateTokenInfo) {
			let tokenStartIndex = textMateTokenInfo.token.startIndex;
			let tokenEndIndex = textMateTokenInfo.token.endIndex;
			tokenText = this._model.getLineContent(position.lineNumber).substring(tokenStartIndex, tokenEndIndex);
			metadata = textMateTokenInfo.metadata;
		} else {
			return 'No grammar or semantic tokens available.';
		}

		let result = '';
		result += `<h2 class="tiw-token">${renderTokenText(tokenText)}<span class="tiw-token-length">(${tokenText.length} ${tokenText.length === 1 ? 'char' : 'chars'})</span></h2>`;
		result += `<hr class="tiw-metadata-separator" style="clear:both"/>`;

		result += `<table class="tiw-metadata-table"><tbody>`;
		result += `<tr><td class="tiw-metadata-key">language</td><td class="tiw-metadata-value">${escape(textMateTokenInfo?.metadata.languageIdentifier.language || '')}</td></tr>`;
		result += `<tr><td class="tiw-metadata-key">standard token type</td><td class="tiw-metadata-value">${this._tokenTypeToString(textMateTokenInfo?.metadata.tokenType || StandardTokenType.Other)}</td></tr>`;
		result += `</tbody></table>`;

		result += `<hr class="tiw-metadata-separator"/>`;
		result += `<table class="tiw-metadata-table"><tbody>`;
		result += this._formatMetadata(metadata, tmFallback);
		result += `</tbody></table>`;

		if (semanticTokenInfo) {
			result += `<hr class="tiw-metadata-separator"/>`;
			result += `<table class="tiw-metadata-table"><tbody>`;
			result += `<tr><td class="tiw-metadata-key">semantic token type</td><td class="tiw-metadata-value">${semanticTokenInfo.type}</td></tr>`;
			const modifiers = semanticTokenInfo.modifiers.join(' ') || '-';
			result += `<tr><td class="tiw-metadata-key">semantic token modifiers</td><td class="tiw-metadata-value">${modifiers}</td></tr>`;
			result += `</tbody></table>`;

			result += `<div>${this._renderTokenStyleDefinition(semanticTokenInfo.definitions.foreground)}</div>`;
		}

		if (textMateTokenInfo) {
			let theme = this._themeService.getColorTheme();
			result += `<hr class="tiw-metadata-separator"/>`;
			if (!semanticTokenInfo) {
				let matchingRule = findMatchingThemeRule(theme, textMateTokenInfo.token.scopes, false);
				if (matchingRule) {
					result += `<code class="tiw-theme-selector">${matchingRule.rawSelector}\n${JSON.stringify(matchingRule.settings, null, '\t')}</code>`;
				} else {
					result += `<span class="tiw-theme-selector">No theme selector.</span>`;
				}
			}

			result += `<ul>`;
			for (let i = textMateTokenInfo.token.scopes.length - 1; i >= 0; i--) {
				result += `<li>${escape(textMateTokenInfo.token.scopes[i])}</li>`;
			}
			result += `</ul>`;
		}
		return result;
	}

	private _formatMetadata(metadata?: IDecodedMetadata, fallback?: IDecodedMetadata) {
		let result = '';

		function render(label: string, value: string | undefined, property: keyof IDecodedMetadata) {
			const info = metadata?.[property] !== value ? ` (tm)` : '';
			return `<tr><td class="tiw-metadata-key">${label}</td><td class="tiw-metadata-value">${value + info}</td></tr>`;
		}

		const fontStyle = metadata?.fontStyle || fallback?.fontStyle;
		result += render('font style', fontStyle, 'fontStyle');
		const foreground = metadata?.foreground || fallback?.foreground;
		result += render('foreground', foreground, 'foreground');
		const background = metadata?.background || fallback?.background;
		result += render('background', background, 'background');

		if (foreground && background) {
			const backgroundColor = Color.fromHex(background), foregroundColor = Color.fromHex(foreground);

			if (backgroundColor.isOpaque()) {
				result += `<tr><td class="tiw-metadata-key">contrast ratio</td><td class="tiw-metadata-value">${backgroundColor.getContrastRatio(foregroundColor.makeOpaque(backgroundColor)).toFixed(2)}</td></tr>`;
			} else {
				result += '<tr><td class="tiw-metadata-key">Contrast ratio cannot be precise for background colors that use transparency</td><td class="tiw-metadata-value"></td></tr>';
			}
		}
		return result;
	}

	private _decodeMetadata(metadata: number): IDecodedMetadata {
		let colorMap = this._themeService.getColorTheme().tokenColorMap;
		let languageId = TokenMetadata.getLanguageId(metadata);
		let tokenType = TokenMetadata.getTokenType(metadata);
		let fontStyle = TokenMetadata.getFontStyle(metadata);
		let foreground = TokenMetadata.getForeground(metadata);
		let background = TokenMetadata.getBackground(metadata);
		return {
			languageIdentifier: this._modeService.getLanguageIdentifier(languageId)!,
			tokenType: tokenType,
			fontStyle: this._fontStyleToString(fontStyle),
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

	private _getTokensAtPosition(grammar: IGrammar, position: Position): ITextMateTokenInfo {
		const lineNumber = position.lineNumber;
		let stateBeforeLine = this._getStateBeforeLine(grammar, lineNumber);

		let tokenizationResult1 = grammar.tokenizeLine(this._model.getLineContent(lineNumber), stateBeforeLine);
		let tokenizationResult2 = grammar.tokenizeLine2(this._model.getLineContent(lineNumber), stateBeforeLine);

		let token1Index = 0;
		for (let i = tokenizationResult1.tokens.length - 1; i >= 0; i--) {
			let t = tokenizationResult1.tokens[i];
			if (position.column - 1 >= t.startIndex) {
				token1Index = i;
				break;
			}
		}

		let token2Index = 0;
		for (let i = (tokenizationResult2.tokens.length >>> 1); i >= 0; i--) {
			if (position.column - 1 >= tokenizationResult2.tokens[(i << 1)]) {
				token2Index = i;
				break;
			}
		}

		return {
			token: tokenizationResult1.tokens[token1Index],
			metadata: this._decodeMetadata(tokenizationResult2.tokens[(token2Index << 1) + 1])
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

	private isSemanticTokens(token: any): token is SemanticTokens {
		return token && token.data;
	}

	private async _computeSemanticTokens(): Promise<SemanticTokensResult | null> {
		if (!this._isSemanticColoringEnabled()) {
			return null;
		}

		const tokenProviders = DocumentSemanticTokensProviderRegistry.ordered(this._model);
		if (tokenProviders.length) {
			const provider = tokenProviders[0];
			const tokens = await Promise.resolve(provider.provideDocumentSemanticTokens(this._model, null, this._currentRequestCancellationTokenSource.token));
			if (this.isSemanticTokens(tokens)) {
				return { tokens, legend: provider.getLegend() };
			}
		}
		return null;
	}

	private _getSemanticTokenAtPosition(semanticTokens: SemanticTokensResult, pos: Position): ISemanticTokenInfo | null {
		const tokenData = semanticTokens.tokens.data;
		let lastLine = 0;
		let lastCharacter = 0;
		const posLine = pos.lineNumber - 1, posCharacter = pos.column - 1; // to 0-based position
		for (let i = 0; i < tokenData.length; i += 5) {
			const lineDelta = tokenData[i], charDelta = tokenData[i + 1], len = tokenData[i + 2], typeIdx = tokenData[i + 3], modSet = tokenData[i + 4];
			const line = lastLine + lineDelta; // 0-based
			const character = lineDelta === 0 ? lastCharacter + charDelta : charDelta; // 0-based
			if (posLine === line && character <= posCharacter && posCharacter < character + len) {
				const type = semanticTokens.legend.tokenTypes[typeIdx];
				const modifiers = semanticTokens.legend.tokenModifiers.filter((_, k) => modSet & 1 << k);
				const range = new Range(line + 1, character + 1, line + 1, character + 1 + len);
				const definitions = {};
				const colorMap = this._themeService.getColorTheme().tokenColorMap;
				const theme = this._themeService.getTheme() as ColorThemeData;
				const tokenStyle = theme.getTokenStyleMetadata(type, modifiers, true, definitions);

				let fontStyle = FontStyle.None;
				let foreground: string | undefined = undefined;
				if (tokenStyle) {
					fontStyle = (
						(tokenStyle.italic ? FontStyle.Italic : 0)
						| (tokenStyle.bold ? FontStyle.Bold : 0)
						| (tokenStyle.underline ? FontStyle.Underline : 0)
					);
					if (tokenStyle.foreground) {
						foreground = colorMap[tokenStyle.foreground];
					}
				}

				const metadata: IDecodedMetadata = {
					languageIdentifier: this._modeService.getLanguageIdentifier(LanguageId.Null)!,
					tokenType: StandardTokenType.Other,
					fontStyle: this._fontStyleToString(fontStyle),
					foreground: foreground,
				};

				return { type, modifiers, range, metadata, definitions };
			}
			lastLine = line;
			lastCharacter = character;
		}
		return null;
	}

	private _renderTokenStyleDefinition(definition: TokenStyleDefinition | undefined): string {
		if (definition === undefined) {
			return '';
		}
		const theme = this._themeService.getTheme() as ColorThemeData;

		const isTokenStylingRule = (d: any): d is TokenStylingRule => !!d.value;
		if (Array.isArray(definition)) {
			let result = '';
			let matchingRule = undefined;
			result += `<ul>`;
			for (const d of definition) {
				result += `<li>${escape(d.join(' '))}</li>`;
				matchingRule = findMatchingThemeRule(theme, d, false);
				if (matchingRule) {
					break;
				}
			}
			result += `</ul>`;

			if (matchingRule) {
				result += `<code class="tiw-theme-selector">${matchingRule.rawSelector}\n${JSON.stringify(matchingRule.settings, null, '\t')}</code>`;
			}
			return result;
		} else if (isTokenStylingRule(definition)) {

			const scope = theme.getTokenStylingRuleScope(definition);

			if (scope === 'setting') {
				return `User settings: ${definition.selector}`;
			} else if (scope === 'theme') {
				return `Color theme: ${definition.selector}`;
			}
			return '';
		} else if (typeof definition === 'string') {
			const [type, ...modifiers] = definition.split('.');
			const definitions: TokenStyleDefinitions = {};
			const m = theme.getTokenStyleMetadata(type, modifiers, true, definitions);
			if (m && definitions.foreground) {
				return this._renderTokenStyleDefinition(definitions.foreground);
			}
			return '';
		} else {
			return `Token style: Foreground: ${definition.foreground}, bold: ${definition.bold}, italic: ${definition.italic}, underline: ${definition.underline},`;
		}
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

registerEditorContribution(InspectEditorTokensController.ID, InspectEditorTokensController);
registerEditorAction(InspectEditorTokens);

registerThemingParticipant((theme, collector) => {
	const border = theme.getColor(editorHoverBorder);
	if (border) {
		let borderWidth = theme.type === HIGH_CONTRAST ? 2 : 1;
		collector.addRule(`.monaco-editor .token-inspect-widget { border: ${borderWidth}px solid ${border}; }`);
		collector.addRule(`.monaco-editor .token-inspect-widget .tiw-metadata-separator { background-color: ${border}; }`);
	}
	const background = theme.getColor(editorHoverBackground);
	if (background) {
		collector.addRule(`.monaco-editor .token-inspect-widget { background-color: ${background}; }`);
	}
});
