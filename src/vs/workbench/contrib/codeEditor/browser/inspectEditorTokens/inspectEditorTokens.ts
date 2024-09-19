/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './inspectEditorTokens.css';
import * as nls from '../../../../../nls.js';
import * as dom from '../../../../../base/browser/dom.js';
import { CharCode } from '../../../../../base/common/charCode.js';
import { Color } from '../../../../../base/common/color.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ContentWidgetPositionPreference, IActiveCodeEditor, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { EditorAction, ServicesAccessor, registerEditorAction, registerEditorContribution, EditorContributionInstantiation } from '../../../../../editor/browser/editorExtensions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { SemanticTokensLegend, SemanticTokens, TreeSitterTokenizationRegistry } from '../../../../../editor/common/languages.js';
import { FontStyle, ColorId, StandardTokenType, TokenMetadata } from '../../../../../editor/common/encodedTokenAttributes.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { findMatchingThemeRule } from '../../../../services/textMate/common/TMHelper.js';
import { ITextMateTokenizationService } from '../../../../services/textMate/browser/textMateTokenizationFeature.js';
import type { IGrammar, IToken, StateStack } from 'vscode-textmate';
import { IWorkbenchThemeService } from '../../../../services/themes/common/workbenchThemeService.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { ColorThemeData, TokenStyleDefinitions, TokenStyleDefinition, TextMateThemingRuleDefinitions } from '../../../../services/themes/common/colorThemeData.js';
import { SemanticTokenRule, TokenStyleData, TokenStyle } from '../../../../../platform/theme/common/tokenClassificationRegistry.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SEMANTIC_HIGHLIGHTING_SETTING_ID, IEditorSemanticHighlightingOptions } from '../../../../../editor/contrib/semanticTokens/common/semanticTokensConfig.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITreeSitterParserService } from '../../../../../editor/common/services/treeSitterParserService.js';
// eslint-disable-next-line local/code-import-patterns
import type { Parser } from '@vscode/tree-sitter-wasm';

const $ = dom.$;

export class InspectEditorTokensController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.inspectEditorTokens';

	public static get(editor: ICodeEditor): InspectEditorTokensController | null {
		return editor.getContribution<InspectEditorTokensController>(InspectEditorTokensController.ID);
	}

	private _editor: ICodeEditor;
	private _textMateService: ITextMateTokenizationService;
	private _treeSitterService: ITreeSitterParserService;
	private _themeService: IWorkbenchThemeService;
	private _languageService: ILanguageService;
	private _notificationService: INotificationService;
	private _configurationService: IConfigurationService;
	private _languageFeaturesService: ILanguageFeaturesService;
	private _widget: InspectEditorTokensWidget | null;

	constructor(
		editor: ICodeEditor,
		@ITextMateTokenizationService textMateService: ITextMateTokenizationService,
		@ITreeSitterParserService treeSitterService: ITreeSitterParserService,
		@ILanguageService languageService: ILanguageService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@INotificationService notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService
	) {
		super();
		this._editor = editor;
		this._textMateService = textMateService;
		this._treeSitterService = treeSitterService;
		this._themeService = themeService;
		this._languageService = languageService;
		this._notificationService = notificationService;
		this._configurationService = configurationService;
		this._languageFeaturesService = languageFeaturesService;
		this._widget = null;

		this._register(this._editor.onDidChangeModel((e) => this.stop()));
		this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
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
		if (this._editor.getModel().uri.scheme === Schemas.vscodeNotebookCell) {
			// disable in notebooks
			return;
		}
		this._widget = new InspectEditorTokensWidget(this._editor, this._textMateService, this._treeSitterService, this._languageService, this._themeService, this._notificationService, this._configurationService, this._languageFeaturesService);
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
		const controller = InspectEditorTokensController.get(editor);
		controller?.toggle();
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
	metadata?: IDecodedMetadata;
	definitions: TokenStyleDefinitions;
}

interface IDecodedMetadata {
	languageId: string | undefined;
	tokenType: StandardTokenType;
	bold: boolean | undefined;
	italic: boolean | undefined;
	underline: boolean | undefined;
	strikethrough: boolean | undefined;
	foreground: string | undefined;
	background: string | undefined;
}

function renderTokenText(tokenText: string): string {
	if (tokenText.length > 40) {
		tokenText = tokenText.substr(0, 20) + '…' + tokenText.substr(tokenText.length - 20);
	}
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

type SemanticTokensResult = { tokens: SemanticTokens; legend: SemanticTokensLegend };

class InspectEditorTokensWidget extends Disposable implements IContentWidget {

	private static readonly _ID = 'editor.contrib.inspectEditorTokensWidget';

	// Editor.IContentWidget.allowEditorOverflow
	public readonly allowEditorOverflow = true;

	private _isDisposed: boolean;
	private readonly _editor: IActiveCodeEditor;
	private readonly _languageService: ILanguageService;
	private readonly _themeService: IWorkbenchThemeService;
	private readonly _textMateService: ITextMateTokenizationService;
	private readonly _treeSitterService: ITreeSitterParserService;
	private readonly _notificationService: INotificationService;
	private readonly _configurationService: IConfigurationService;
	private readonly _languageFeaturesService: ILanguageFeaturesService;
	private readonly _model: ITextModel;
	private readonly _domNode: HTMLElement;
	private readonly _currentRequestCancellationTokenSource: CancellationTokenSource;

	constructor(
		editor: IActiveCodeEditor,
		textMateService: ITextMateTokenizationService,
		treeSitterService: ITreeSitterParserService,
		languageService: ILanguageService,
		themeService: IWorkbenchThemeService,
		notificationService: INotificationService,
		configurationService: IConfigurationService,
		languageFeaturesService: ILanguageFeaturesService
	) {
		super();
		this._isDisposed = false;
		this._editor = editor;
		this._languageService = languageService;
		this._themeService = themeService;
		this._textMateService = textMateService;
		this._treeSitterService = treeSitterService;
		this._notificationService = notificationService;
		this._configurationService = configurationService;
		this._languageFeaturesService = languageFeaturesService;
		this._model = this._editor.getModel();
		this._domNode = document.createElement('div');
		this._domNode.className = 'token-inspect-widget';
		this._currentRequestCancellationTokenSource = new CancellationTokenSource();
		this._beginCompute(this._editor.getPosition());
		this._register(this._editor.onDidChangeCursorPosition((e) => this._beginCompute(this._editor.getPosition())));
		this._register(themeService.onDidColorThemeChange(_ => this._beginCompute(this._editor.getPosition())));
		this._register(configurationService.onDidChangeConfiguration(e => e.affectsConfiguration('editor.semanticHighlighting.enabled') && this._beginCompute(this._editor.getPosition())));
		this._editor.addContentWidget(this);
	}

	public override dispose(): void {
		this._isDisposed = true;
		this._editor.removeContentWidget(this);
		this._currentRequestCancellationTokenSource.cancel();
		super.dispose();
	}

	public getId(): string {
		return InspectEditorTokensWidget._ID;
	}

	private _beginCompute(position: Position): void {
		const grammar = this._textMateService.createTokenizer(this._model.getLanguageId());
		const semanticTokens = this._computeSemanticTokens(position);
		const tree = this._treeSitterService.getParseResult(this._model);

		dom.clearNode(this._domNode);
		this._domNode.appendChild(document.createTextNode(nls.localize('inspectTMScopesWidget.loading', "Loading...")));

		Promise.all([grammar, semanticTokens]).then(([grammar, semanticTokens]) => {
			if (this._isDisposed) {
				return;
			}
			this._compute(grammar, semanticTokens, tree?.tree, position);
			this._domNode.style.maxWidth = `${Math.max(this._editor.getLayoutInfo().width * 0.66, 500)}px`;
			this._editor.layoutContentWidget(this);
		}, (err) => {
			this._notificationService.warn(err);

			setTimeout(() => {
				InspectEditorTokensController.get(this._editor)?.stop();
			});
		});

	}

	private _isSemanticColoringEnabled() {
		const setting = this._configurationService.getValue<IEditorSemanticHighlightingOptions>(SEMANTIC_HIGHLIGHTING_SETTING_ID, { overrideIdentifier: this._model.getLanguageId(), resource: this._model.uri })?.enabled;
		if (typeof setting === 'boolean') {
			return setting;
		}
		return this._themeService.getColorTheme().semanticHighlighting;
	}

	private _compute(grammar: IGrammar | null, semanticTokens: SemanticTokensResult | null, tree: Parser.Tree | undefined, position: Position) {
		const textMateTokenInfo = grammar && this._getTokensAtPosition(grammar, position);
		const semanticTokenInfo = semanticTokens && this._getSemanticTokenAtPosition(semanticTokens, position);
		const treeSitterTokenInfo = tree && this._getTreeSitterTokenAtPosition(tree, position);
		if (!textMateTokenInfo && !semanticTokenInfo && !treeSitterTokenInfo) {
			dom.reset(this._domNode, 'No grammar or semantic tokens available.');
			return;
		}

		const tmMetadata = textMateTokenInfo?.metadata;
		const semMetadata = semanticTokenInfo?.metadata;

		const semTokenText = semanticTokenInfo && renderTokenText(this._model.getValueInRange(semanticTokenInfo.range));
		const tmTokenText = textMateTokenInfo && renderTokenText(this._model.getLineContent(position.lineNumber).substring(textMateTokenInfo.token.startIndex, textMateTokenInfo.token.endIndex));

		const tokenText = semTokenText || tmTokenText || '';

		dom.reset(this._domNode,
			$('h2.tiw-token', undefined,
				tokenText,
				$('span.tiw-token-length', undefined, `${tokenText.length} ${tokenText.length === 1 ? 'char' : 'chars'}`)));
		dom.append(this._domNode, $('hr.tiw-metadata-separator', { 'style': 'clear:both' }));
		dom.append(this._domNode, $('table.tiw-metadata-table', undefined,
			$('tbody', undefined,
				$('tr', undefined,
					$('td.tiw-metadata-key', undefined, 'language'),
					$('td.tiw-metadata-value', undefined, tmMetadata?.languageId || '')
				),
				$('tr', undefined,
					$('td.tiw-metadata-key', undefined, 'standard token type' as string),
					$('td.tiw-metadata-value', undefined, this._tokenTypeToString(tmMetadata?.tokenType || StandardTokenType.Other))
				),
				...this._formatMetadata(semMetadata, tmMetadata)
			)
		));

		if (semanticTokenInfo) {
			dom.append(this._domNode, $('hr.tiw-metadata-separator'));
			const table = dom.append(this._domNode, $('table.tiw-metadata-table', undefined));
			const tbody = dom.append(table, $('tbody', undefined,
				$('tr', undefined,
					$('td.tiw-metadata-key', undefined, 'semantic token type' as string),
					$('td.tiw-metadata-value', undefined, semanticTokenInfo.type)
				)
			));
			if (semanticTokenInfo.modifiers.length) {
				dom.append(tbody, $('tr', undefined,
					$('td.tiw-metadata-key', undefined, 'modifiers'),
					$('td.tiw-metadata-value', undefined, semanticTokenInfo.modifiers.join(' ')),
				));
			}
			if (semanticTokenInfo.metadata) {
				const properties: (keyof TokenStyleData)[] = ['foreground', 'bold', 'italic', 'underline', 'strikethrough'];
				const propertiesByDefValue: { [rule: string]: string[] } = {};
				const allDefValues = new Array<[Array<HTMLElement | string>, string]>(); // remember the order
				// first collect to detect when the same rule is used for multiple properties
				for (const property of properties) {
					if (semanticTokenInfo.metadata[property] !== undefined) {
						const definition = semanticTokenInfo.definitions[property];
						const defValue = this._renderTokenStyleDefinition(definition, property);
						const defValueStr = defValue.map(el => dom.isHTMLElement(el) ? el.outerHTML : el).join();
						let properties = propertiesByDefValue[defValueStr];
						if (!properties) {
							propertiesByDefValue[defValueStr] = properties = [];
							allDefValues.push([defValue, defValueStr]);
						}
						properties.push(property);
					}
				}
				for (const [defValue, defValueStr] of allDefValues) {
					dom.append(tbody, $('tr', undefined,
						$('td.tiw-metadata-key', undefined, propertiesByDefValue[defValueStr].join(', ')),
						$('td.tiw-metadata-value', undefined, ...defValue)
					));
				}
			}
		}

		if (textMateTokenInfo) {
			const theme = this._themeService.getColorTheme();
			dom.append(this._domNode, $('hr.tiw-metadata-separator'));
			const table = dom.append(this._domNode, $('table.tiw-metadata-table'));
			const tbody = dom.append(table, $('tbody'));

			if (tmTokenText && tmTokenText !== tokenText) {
				dom.append(tbody, $('tr', undefined,
					$('td.tiw-metadata-key', undefined, 'textmate token' as string),
					$('td.tiw-metadata-value', undefined, `${tmTokenText} (${tmTokenText.length})`)
				));
			}
			const scopes = new Array<HTMLElement | string>();
			for (let i = textMateTokenInfo.token.scopes.length - 1; i >= 0; i--) {
				scopes.push(textMateTokenInfo.token.scopes[i]);
				if (i > 0) {
					scopes.push($('br'));
				}
			}
			dom.append(tbody, $('tr', undefined,
				$('td.tiw-metadata-key', undefined, 'textmate scopes' as string),
				$('td.tiw-metadata-value.tiw-metadata-scopes', undefined, ...scopes),
			));

			const matchingRule = findMatchingThemeRule(theme, textMateTokenInfo.token.scopes, false);
			const semForeground = semanticTokenInfo?.metadata?.foreground;
			if (matchingRule) {
				if (semForeground !== textMateTokenInfo.metadata.foreground) {
					let defValue = $('code.tiw-theme-selector', undefined,
						matchingRule.rawSelector, $('br'), JSON.stringify(matchingRule.settings, null, '\t'));
					if (semForeground) {
						defValue = $('s', undefined, defValue);
					}
					dom.append(tbody, $('tr', undefined,
						$('td.tiw-metadata-key', undefined, 'foreground'),
						$('td.tiw-metadata-value', undefined, defValue),
					));
				}
			} else if (!semForeground) {
				dom.append(tbody, $('tr', undefined,
					$('td.tiw-metadata-key', undefined, 'foreground'),
					$('td.tiw-metadata-value', undefined, 'No theme selector' as string),
				));
			}
		}

		if (treeSitterTokenInfo) {
			dom.append(this._domNode, $('hr.tiw-metadata-separator'));
			const table = dom.append(this._domNode, $('table.tiw-metadata-table'));
			const tbody = dom.append(table, $('tbody'));

			dom.append(tbody, $('tr', undefined,
				$('td.tiw-metadata-key', undefined, 'tree-sitter token' as string),
				$('td.tiw-metadata-value', undefined, `${treeSitterTokenInfo.text}`)
			));
			const scopes = new Array<HTMLElement | string>();
			let node = treeSitterTokenInfo;
			while (node.parent) {
				scopes.push(node.type);
				node = node.parent;
				if (node) {
					scopes.push($('br'));
				}
			}

			dom.append(tbody, $('tr', undefined,
				$('td.tiw-metadata-key', undefined, 'tree-sitter scopes' as string),
				$('td.tiw-metadata-value.tiw-metadata-scopes', undefined, ...scopes),
			));

			const tokenizationSupport = TreeSitterTokenizationRegistry.get(this._model.getLanguageId());
			const captures = tokenizationSupport?.captureAtPosition(position.lineNumber, position.column, this._model);
			if (captures && captures.length > 0) {
				dom.append(tbody, $('tr', undefined,
					$('td.tiw-metadata-key', undefined, 'foreground'),
					$('td.tiw-metadata-value', undefined, captures[captures.length - 1].name),
				));
			}
		}
	}

	private _formatMetadata(semantic?: IDecodedMetadata, tm?: IDecodedMetadata): Array<HTMLElement | string> {
		const elements = new Array<HTMLElement | string>();

		function render(property: 'foreground' | 'background') {
			const value = semantic?.[property] || tm?.[property];
			if (value !== undefined) {
				const semanticStyle = semantic?.[property] ? 'tiw-metadata-semantic' : '';
				elements.push($('tr', undefined,
					$('td.tiw-metadata-key', undefined, property),
					$(`td.tiw-metadata-value.${semanticStyle}`, undefined, value)
				));
			}
			return value;
		}

		const foreground = render('foreground');
		const background = render('background');
		if (foreground && background) {
			const backgroundColor = Color.fromHex(background), foregroundColor = Color.fromHex(foreground);
			if (backgroundColor.isOpaque()) {
				elements.push($('tr', undefined,
					$('td.tiw-metadata-key', undefined, 'contrast ratio' as string),
					$('td.tiw-metadata-value', undefined, backgroundColor.getContrastRatio(foregroundColor.makeOpaque(backgroundColor)).toFixed(2))
				));
			} else {
				elements.push($('tr', undefined,
					$('td.tiw-metadata-key', undefined, 'Contrast ratio cannot be precise for background colors that use transparency' as string),
					$('td.tiw-metadata-value')
				));
			}
		}

		const fontStyleLabels = new Array<HTMLElement | string>();

		function addStyle(key: 'bold' | 'italic' | 'underline' | 'strikethrough') {
			let label: HTMLElement | string | undefined;
			if (semantic && semantic[key]) {
				label = $('span.tiw-metadata-semantic', undefined, key);
			} else if (tm && tm[key]) {
				label = key;
			}
			if (label) {
				if (fontStyleLabels.length) {
					fontStyleLabels.push(' ');
				}
				fontStyleLabels.push(label);
			}
		}
		addStyle('bold');
		addStyle('italic');
		addStyle('underline');
		addStyle('strikethrough');
		if (fontStyleLabels.length) {
			elements.push($('tr', undefined,
				$('td.tiw-metadata-key', undefined, 'font style' as string),
				$('td.tiw-metadata-value', undefined, ...fontStyleLabels)
			));
		}
		return elements;
	}

	private _decodeMetadata(metadata: number): IDecodedMetadata {
		const colorMap = this._themeService.getColorTheme().tokenColorMap;
		const languageId = TokenMetadata.getLanguageId(metadata);
		const tokenType = TokenMetadata.getTokenType(metadata);
		const fontStyle = TokenMetadata.getFontStyle(metadata);
		const foreground = TokenMetadata.getForeground(metadata);
		const background = TokenMetadata.getBackground(metadata);
		return {
			languageId: this._languageService.languageIdCodec.decodeLanguageId(languageId),
			tokenType: tokenType,
			bold: (fontStyle & FontStyle.Bold) ? true : undefined,
			italic: (fontStyle & FontStyle.Italic) ? true : undefined,
			underline: (fontStyle & FontStyle.Underline) ? true : undefined,
			strikethrough: (fontStyle & FontStyle.Strikethrough) ? true : undefined,
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

	private _getTokensAtPosition(grammar: IGrammar, position: Position): ITextMateTokenInfo {
		const lineNumber = position.lineNumber;
		const stateBeforeLine = this._getStateBeforeLine(grammar, lineNumber);

		const tokenizationResult1 = grammar.tokenizeLine(this._model.getLineContent(lineNumber), stateBeforeLine);
		const tokenizationResult2 = grammar.tokenizeLine2(this._model.getLineContent(lineNumber), stateBeforeLine);

		let token1Index = 0;
		for (let i = tokenizationResult1.tokens.length - 1; i >= 0; i--) {
			const t = tokenizationResult1.tokens[i];
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

	private _getStateBeforeLine(grammar: IGrammar, lineNumber: number): StateStack | null {
		let state: StateStack | null = null;

		for (let i = 1; i < lineNumber; i++) {
			const tokenizationResult = grammar.tokenizeLine(this._model.getLineContent(i), state);
			state = tokenizationResult.ruleStack;
		}

		return state;
	}

	private isSemanticTokens(token: any): token is SemanticTokens {
		return token && token.data;
	}

	private async _computeSemanticTokens(position: Position): Promise<SemanticTokensResult | null> {
		if (!this._isSemanticColoringEnabled()) {
			return null;
		}

		const tokenProviders = this._languageFeaturesService.documentSemanticTokensProvider.ordered(this._model);
		if (tokenProviders.length) {
			const provider = tokenProviders[0];
			const tokens = await Promise.resolve(provider.provideDocumentSemanticTokens(this._model, null, this._currentRequestCancellationTokenSource.token));
			if (this.isSemanticTokens(tokens)) {
				return { tokens, legend: provider.getLegend() };
			}
		}
		const rangeTokenProviders = this._languageFeaturesService.documentRangeSemanticTokensProvider.ordered(this._model);
		if (rangeTokenProviders.length) {
			const provider = rangeTokenProviders[0];
			const lineNumber = position.lineNumber;
			const range = new Range(lineNumber, 1, lineNumber, this._model.getLineMaxColumn(lineNumber));
			const tokens = await Promise.resolve(provider.provideDocumentRangeSemanticTokens(this._model, range, this._currentRequestCancellationTokenSource.token));
			if (this.isSemanticTokens(tokens)) {
				return { tokens, legend: provider.getLegend() };
			}
		}
		return null;
	}

	private _getSemanticTokenAtPosition(semanticTokens: SemanticTokensResult, pos: Position): ISemanticTokenInfo | null {
		const tokenData = semanticTokens.tokens.data;
		const defaultLanguage = this._model.getLanguageId();
		let lastLine = 0;
		let lastCharacter = 0;
		const posLine = pos.lineNumber - 1, posCharacter = pos.column - 1; // to 0-based position
		for (let i = 0; i < tokenData.length; i += 5) {
			const lineDelta = tokenData[i], charDelta = tokenData[i + 1], len = tokenData[i + 2], typeIdx = tokenData[i + 3], modSet = tokenData[i + 4];
			const line = lastLine + lineDelta; // 0-based
			const character = lineDelta === 0 ? lastCharacter + charDelta : charDelta; // 0-based
			if (posLine === line && character <= posCharacter && posCharacter < character + len) {
				const type = semanticTokens.legend.tokenTypes[typeIdx] || 'not in legend (ignored)';
				const modifiers = [];
				let modifierSet = modSet;
				for (let modifierIndex = 0; modifierSet > 0 && modifierIndex < semanticTokens.legend.tokenModifiers.length; modifierIndex++) {
					if (modifierSet & 1) {
						modifiers.push(semanticTokens.legend.tokenModifiers[modifierIndex]);
					}
					modifierSet = modifierSet >> 1;
				}
				if (modifierSet > 0) {
					modifiers.push('not in legend (ignored)');
				}
				const range = new Range(line + 1, character + 1, line + 1, character + 1 + len);
				const definitions = {};
				const colorMap = this._themeService.getColorTheme().tokenColorMap;
				const theme = this._themeService.getColorTheme() as ColorThemeData;
				const tokenStyle = theme.getTokenStyleMetadata(type, modifiers, defaultLanguage, true, definitions);

				let metadata: IDecodedMetadata | undefined = undefined;
				if (tokenStyle) {
					metadata = {
						languageId: undefined,
						tokenType: StandardTokenType.Other,
						bold: tokenStyle?.bold,
						italic: tokenStyle?.italic,
						underline: tokenStyle?.underline,
						strikethrough: tokenStyle?.strikethrough,
						foreground: colorMap[tokenStyle?.foreground || ColorId.None],
						background: undefined
					};
				}

				return { type, modifiers, range, metadata, definitions };
			}
			lastLine = line;
			lastCharacter = character;
		}
		return null;
	}

	private _walkTreeforPosition(cursor: Parser.TreeCursor, pos: Position): Parser.SyntaxNode | null {
		const offset = this._model.getOffsetAt(pos);
		cursor.gotoFirstChild();
		let goChild: boolean = false;
		let lastGoodNode: Parser.SyntaxNode | null = null;
		do {
			if (cursor.currentNode.startIndex <= offset && offset < cursor.currentNode.endIndex) {
				goChild = true;
				lastGoodNode = cursor.currentNode;
			} else {
				goChild = false;
			}
		} while (goChild ? cursor.gotoFirstChild() : cursor.gotoNextSibling());
		return lastGoodNode;
	}

	private _getTreeSitterTokenAtPosition(tree: Parser.Tree, pos: Position): Parser.SyntaxNode | null {
		const cursor = tree.walk();

		return this._walkTreeforPosition(cursor, pos);
	}

	private _renderTokenStyleDefinition(definition: TokenStyleDefinition | undefined, property: keyof TokenStyleData): Array<HTMLElement | string> {
		const elements = new Array<HTMLElement | string>();
		if (definition === undefined) {
			return elements;
		}
		const theme = this._themeService.getColorTheme() as ColorThemeData;

		if (Array.isArray(definition)) {
			const scopesDefinition: TextMateThemingRuleDefinitions = {};
			theme.resolveScopes(definition, scopesDefinition);
			const matchingRule = scopesDefinition[property];
			if (matchingRule && scopesDefinition.scope) {
				const scopes = $('ul.tiw-metadata-values');
				const strScopes = Array.isArray(matchingRule.scope) ? matchingRule.scope : [String(matchingRule.scope)];

				for (const strScope of strScopes) {
					scopes.appendChild($('li.tiw-metadata-value.tiw-metadata-scopes', undefined, strScope));
				}

				elements.push(
					scopesDefinition.scope.join(' '),
					scopes,
					$('code.tiw-theme-selector', undefined, JSON.stringify(matchingRule.settings, null, '\t')));
				return elements;
			}
			return elements;
		} else if (SemanticTokenRule.is(definition)) {
			const scope = theme.getTokenStylingRuleScope(definition);
			if (scope === 'setting') {
				elements.push(`User settings: ${definition.selector.id} - ${this._renderStyleProperty(definition.style, property)}`);
				return elements;
			} else if (scope === 'theme') {
				elements.push(`Color theme: ${definition.selector.id} - ${this._renderStyleProperty(definition.style, property)}`);
				return elements;
			}
			return elements;
		} else {
			const style = theme.resolveTokenStyleValue(definition);
			elements.push(`Default: ${style ? this._renderStyleProperty(style, property) : ''}`);
			return elements;
		}
	}

	private _renderStyleProperty(style: TokenStyle, property: keyof TokenStyleData) {
		switch (property) {
			case 'foreground': return style.foreground ? Color.Format.CSS.formatHexA(style.foreground, true) : '';
			default: return style[property] !== undefined ? String(style[property]) : '';
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

registerEditorContribution(InspectEditorTokensController.ID, InspectEditorTokensController, EditorContributionInstantiation.Lazy);
registerEditorAction(InspectEditorTokens);
