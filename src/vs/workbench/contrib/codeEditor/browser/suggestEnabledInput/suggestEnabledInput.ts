/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./suggestEnabledInput';
import { $, Dimension, append } from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { mixin } from 'vs/base/common/objects';
import { isMacintosh } from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import * as languages from 'vs/editor/common/languages';
import { IModelService } from 'vs/editor/common/services/model';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ColorIdentifier, asCssVariable, asCssVariableWithDefault, editorSelectionBackground, inputBackground, inputBorder, inputForeground, inputPlaceholderForeground, selectionBackground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { HistoryNavigator } from 'vs/base/common/history';
import { registerAndCreateHistoryNavigationContext, IHistoryNavigationContext } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { ensureValidWordDefinition, getWordAtText } from 'vs/editor/common/core/wordHelper';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export interface SuggestResultsProvider {
	/**
	 * Provider function for suggestion results.
	 *
	 * @param query the full text of the input.
	 */
	provideResults: (query: string) => (Partial<languages.CompletionItem> & ({ label: string }) | string)[];

	/**
	 * Trigger characters for this input. Suggestions will appear when one of these is typed,
	 * or upon `ctrl+space` triggering at a word boundary.
	 *
	 * Defaults to the empty array.
	 */
	triggerCharacters?: string[];

	/**
	 * Optional regular expression that describes what a word is
	 *
	 * Defaults to space separated words.
	 */
	wordDefinition?: RegExp;

	/**
	 * Show suggestions even if the trigger character is not present.
	 *
	 * Defaults to false.
	 */
	alwaysShowSuggestions?: boolean;

	/**
	 * Defines the sorting function used when showing results.
	 *
	 * Defaults to the identity function.
	 */
	sortKey?: (result: string) => string;
}

interface SuggestEnabledInputOptions {
	/**
	 * The text to show when no input is present.
	 *
	 * Defaults to the empty string.
	 */
	placeholderText?: string;

	/**
	 * Initial value to be shown
	 */
	value?: string;

	/**
	 * Context key tracking the focus state of this element
	 */
	focusContextKey?: IContextKey<boolean>;

	/**
	 * Place overflow widgets inside an external DOM node.
	 * Defaults to an internal DOM node.
	 */
	overflowWidgetsDomNode?: HTMLElement;

	/**
	 * Override the default styling of the input.
	 */
	styleOverrides?: ISuggestEnabledInputStyleOverrides;
}

export interface ISuggestEnabledInputStyleOverrides {
	inputBackground?: ColorIdentifier;
	inputForeground?: ColorIdentifier;
	inputBorder?: ColorIdentifier;
	inputPlaceholderForeground?: ColorIdentifier;
}

export class SuggestEnabledInput extends Widget {

	private readonly _onShouldFocusResults = new Emitter<void>();
	readonly onShouldFocusResults: Event<void> = this._onShouldFocusResults.event;

	private readonly _onInputDidChange = new Emitter<string | undefined>();
	readonly onInputDidChange: Event<string | undefined> = this._onInputDidChange.event;

	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private readonly _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;

	readonly inputWidget: CodeEditorWidget;
	private readonly inputModel: ITextModel;
	protected stylingContainer: HTMLDivElement;
	readonly element: HTMLElement;
	private placeholderText: HTMLDivElement;

	constructor(
		id: string,
		parent: HTMLElement,
		suggestionProvider: SuggestResultsProvider,
		ariaLabel: string,
		resourceHandle: string,
		options: SuggestEnabledInputOptions,
		@IInstantiationService defaultInstantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();

		this.stylingContainer = append(parent, $('.suggest-input-container'));
		this.element = parent;
		this.placeholderText = append(this.stylingContainer, $('.suggest-input-placeholder', undefined, options.placeholderText || ''));

		const editorOptions: IEditorConstructionOptions = mixin(
			getSimpleEditorOptions(configurationService),
			getSuggestEnabledInputOptions(ariaLabel));
		editorOptions.overflowWidgetsDomNode = options.overflowWidgetsDomNode;

		const scopedContextKeyService = this.getScopedContextKeyService(contextKeyService);

		const instantiationService = scopedContextKeyService
			? defaultInstantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))
			: defaultInstantiationService;

		this.inputWidget = this._register(instantiationService.createInstance(CodeEditorWidget, this.stylingContainer,
			editorOptions,
			{
				contributions: EditorExtensionsRegistry.getSomeEditorContributions([
					SuggestController.ID,
					SnippetController2.ID,
					ContextMenuController.ID,
					MenuPreventer.ID,
					SelectionClipboardContributionID,
				]),
				isSimpleWidget: true,
			}));

		this._register(configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('editor.accessibilitySupport') ||
				e.affectsConfiguration('editor.cursorBlinking')) {
				const accessibilitySupport = configurationService.getValue<'auto' | 'off' | 'on'>('editor.accessibilitySupport');
				const cursorBlinking = configurationService.getValue<'blink' | 'smooth' | 'phase' | 'expand' | 'solid'>('editor.cursorBlinking');
				this.inputWidget.updateOptions({
					accessibilitySupport,
					cursorBlinking
				});
			}
		}));

		this._register(this.inputWidget.onDidFocusEditorText(() => this._onDidFocus.fire()));
		this._register(this.inputWidget.onDidBlurEditorText(() => this._onDidBlur.fire()));

		const scopeHandle = uri.parse(resourceHandle);
		this.inputModel = modelService.createModel('', null, scopeHandle, true);
		this._register(this.inputModel);
		this.inputWidget.setModel(this.inputModel);

		this._register(this.inputWidget.onDidPaste(() => this.setValue(this.getValue()))); // setter cleanses

		this._register((this.inputWidget.onDidFocusEditorText(() => {
			if (options.focusContextKey) { options.focusContextKey.set(true); }
			this.stylingContainer.classList.add('synthetic-focus');
		})));
		this._register((this.inputWidget.onDidBlurEditorText(() => {
			if (options.focusContextKey) { options.focusContextKey.set(false); }
			this.stylingContainer.classList.remove('synthetic-focus');
		})));

		this._register(Event.chain(this.inputWidget.onKeyDown, $ => $.filter(e => e.keyCode === KeyCode.Enter))(e => { e.preventDefault(); /** Do nothing. Enter causes new line which is not expected. */ }, this));
		this._register(Event.chain(this.inputWidget.onKeyDown, $ => $.filter(e => e.keyCode === KeyCode.DownArrow && (isMacintosh ? e.metaKey : e.ctrlKey)))(() => this._onShouldFocusResults.fire(), this));

		let preexistingContent = this.getValue();
		const inputWidgetModel = this.inputWidget.getModel();
		if (inputWidgetModel) {
			this._register(inputWidgetModel.onDidChangeContent(() => {
				const content = this.getValue();
				this.placeholderText.style.visibility = content ? 'hidden' : 'visible';
				if (preexistingContent.trim() === content.trim()) { return; }
				this._onInputDidChange.fire(undefined);
				preexistingContent = content;
			}));
		}

		const validatedSuggestProvider = {
			provideResults: suggestionProvider.provideResults,
			sortKey: suggestionProvider.sortKey || (a => a),
			triggerCharacters: suggestionProvider.triggerCharacters || [],
			wordDefinition: suggestionProvider.wordDefinition ? ensureValidWordDefinition(suggestionProvider.wordDefinition) : undefined,
			alwaysShowSuggestions: !!suggestionProvider.alwaysShowSuggestions,
		};

		this.setValue(options.value || '');

		this._register(languageFeaturesService.completionProvider.register({ scheme: scopeHandle.scheme, pattern: '**/' + scopeHandle.path, hasAccessToAllModels: true }, {
			_debugDisplayName: `suggestEnabledInput/${id}`,
			triggerCharacters: validatedSuggestProvider.triggerCharacters,
			provideCompletionItems: (model: ITextModel, position: Position, _context: languages.CompletionContext) => {
				const query = model.getValue();

				const zeroIndexedColumn = position.column - 1;
				let alreadyTypedCount = 0, zeroIndexedWordStart = 0;

				if (validatedSuggestProvider.wordDefinition) {
					const wordAtText = getWordAtText(position.column, validatedSuggestProvider.wordDefinition, query, 0);
					alreadyTypedCount = wordAtText?.word.length ?? 0;
					zeroIndexedWordStart = wordAtText ? wordAtText.startColumn - 1 : 0;
				} else {
					zeroIndexedWordStart = query.lastIndexOf(' ', zeroIndexedColumn - 1) + 1;
					alreadyTypedCount = zeroIndexedColumn - zeroIndexedWordStart;
				}

				// dont show suggestions if the user has typed something, but hasn't used the trigger character
				if (!validatedSuggestProvider.alwaysShowSuggestions && alreadyTypedCount > 0 && validatedSuggestProvider.triggerCharacters?.indexOf(query[zeroIndexedWordStart]) === -1) {
					return { suggestions: [] };
				}

				return {
					suggestions: suggestionProvider.provideResults(query).map((result): languages.CompletionItem => {
						let label: string;
						let rest: Partial<languages.CompletionItem> | undefined;
						if (typeof result === 'string') {
							label = result;
						} else {
							label = result.label;
							rest = result;
						}

						return {
							label,
							insertText: label,
							range: Range.fromPositions(position.delta(0, -alreadyTypedCount), position),
							sortText: validatedSuggestProvider.sortKey(label),
							kind: languages.CompletionItemKind.Keyword,
							...rest
						};
					})
				};
			}
		}));

		this.style(options.styleOverrides || {});
	}

	protected getScopedContextKeyService(_contextKeyService: IContextKeyService): IContextKeyService | undefined {
		return undefined;
	}

	public updateAriaLabel(label: string): void {
		this.inputWidget.updateOptions({ ariaLabel: label });
	}

	public setValue(val: string) {
		val = val.replace(/\s/g, ' ');
		const fullRange = this.inputModel.getFullModelRange();
		this.inputWidget.executeEdits('suggestEnabledInput.setValue', [EditOperation.replace(fullRange, val)]);
		this.inputWidget.setScrollTop(0);
		this.inputWidget.setPosition(new Position(1, val.length + 1));
	}

	public getValue(): string {
		return this.inputWidget.getValue();
	}

	private style(styleOverrides: ISuggestEnabledInputStyleOverrides): void {
		this.stylingContainer.style.backgroundColor = asCssVariable(styleOverrides.inputBackground ?? inputBackground);
		this.stylingContainer.style.color = asCssVariable(styleOverrides.inputForeground ?? inputForeground);
		this.placeholderText.style.color = asCssVariable(styleOverrides.inputPlaceholderForeground ?? inputPlaceholderForeground);
		this.stylingContainer.style.borderWidth = '1px';
		this.stylingContainer.style.borderStyle = 'solid';
		this.stylingContainer.style.borderColor = asCssVariableWithDefault(styleOverrides.inputBorder ?? inputBorder, 'transparent');

		const cursor = this.stylingContainer.getElementsByClassName('cursor')[0] as HTMLDivElement;
		if (cursor) {
			cursor.style.backgroundColor = asCssVariable(styleOverrides.inputForeground ?? inputForeground);
		}
	}

	public focus(selectAll?: boolean): void {
		this.inputWidget.focus();

		if (selectAll && this.inputWidget.getValue()) {
			this.selectAll();
		}
	}

	public onHide(): void {
		this.inputWidget.onHide();
	}

	public layout(dimension: Dimension): void {
		this.inputWidget.layout(dimension);
		this.placeholderText.style.width = `${dimension.width - 2}px`;
	}

	private selectAll(): void {
		this.inputWidget.setSelection(new Range(1, 1, 1, this.getValue().length + 1));
	}
}

export interface ISuggestEnabledHistoryOptions {
	id: string;
	ariaLabel: string;
	parent: HTMLElement;
	suggestionProvider: SuggestResultsProvider;
	resourceHandle: string;
	suggestOptions: SuggestEnabledInputOptions;
	history: string[];
}

export class SuggestEnabledInputWithHistory extends SuggestEnabledInput implements IHistoryNavigationWidget {
	protected readonly history: HistoryNavigator<string>;

	constructor(
		{ id, parent, ariaLabel, suggestionProvider, resourceHandle, suggestOptions, history }: ISuggestEnabledHistoryOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, parent, suggestionProvider, ariaLabel, resourceHandle, suggestOptions, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService);
		this.history = new HistoryNavigator<string>(history, 100);
	}

	public addToHistory(): void {
		const value = this.getValue();
		if (value && value !== this.getCurrentValue()) {
			this.history.add(value);
		}
	}

	public getHistory(): string[] {
		return this.history.getHistory();
	}

	public showNextValue(): void {
		if (!this.history.has(this.getValue())) {
			this.addToHistory();
		}

		let next = this.getNextValue();
		if (next) {
			next = next === this.getValue() ? this.getNextValue() : next;
		}

		this.setValue(next ?? '');
	}

	public showPreviousValue(): void {
		if (!this.history.has(this.getValue())) {
			this.addToHistory();
		}

		let previous = this.getPreviousValue();
		if (previous) {
			previous = previous === this.getValue() ? this.getPreviousValue() : previous;
		}

		if (previous) {
			this.setValue(previous);
			this.inputWidget.setPosition({ lineNumber: 0, column: 0 });
		}
	}

	public clearHistory(): void {
		this.history.clear();
	}

	private getCurrentValue(): string | null {
		let currentValue = this.history.current();
		if (!currentValue) {
			currentValue = this.history.last();
			this.history.next();
		}
		return currentValue;
	}

	private getPreviousValue(): string | null {
		return this.history.previous() || this.history.first();
	}

	private getNextValue(): string | null {
		return this.history.next();
	}
}

export class ContextScopedSuggestEnabledInputWithHistory extends SuggestEnabledInputWithHistory {
	private historyContext!: IHistoryNavigationContext;

	constructor(
		options: ISuggestEnabledHistoryOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(options, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService);

		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this.historyContext;
		this._register(this.inputWidget.onDidChangeCursorPosition(({ position }) => {
			const viewModel = this.inputWidget._getViewModel()!;
			const lastLineNumber = viewModel.getLineCount();
			const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
			const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
			historyNavigationBackwardsEnablement.set(viewPosition.lineNumber === 1 && viewPosition.column === 1);
			historyNavigationForwardsEnablement.set(viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol);
		}));
	}

	protected override getScopedContextKeyService(contextKeyService: IContextKeyService) {
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		this.historyContext = this._register(registerAndCreateHistoryNavigationContext(
			scopedContextKeyService,
			this,
		));

		return scopedContextKeyService;
	}
}

// Override styles in selections.ts
registerThemingParticipant((theme, collector) => {
	const selectionBackgroundColor = theme.getColor(selectionBackground);

	if (selectionBackgroundColor) {
		// Override inactive selection bg
		const inputBackgroundColor = theme.getColor(inputBackground);
		if (inputBackgroundColor) {
			collector.addRule(`.suggest-input-container .monaco-editor .selected-text { background-color: ${inputBackgroundColor.transparent(0.4)}; }`);
		}

		// Override selected fg
		const inputForegroundColor = theme.getColor(inputForeground);
		if (inputForegroundColor) {
			collector.addRule(`.suggest-input-container .monaco-editor .view-line span.inline-selected-text { color: ${inputForegroundColor}; }`);
		}

		const backgroundColor = theme.getColor(inputBackground);
		if (backgroundColor) {
			collector.addRule(`.suggest-input-container .monaco-editor-background { background-color: ${backgroundColor}; } `);
		}
		collector.addRule(`.suggest-input-container .monaco-editor .focused .selected-text { background-color: ${selectionBackgroundColor}; }`);
	} else {
		// Use editor selection color if theme has not set a selection background color
		collector.addRule(`.suggest-input-container .monaco-editor .focused .selected-text { background-color: ${theme.getColor(editorSelectionBackground)}; }`);
	}
});


function getSuggestEnabledInputOptions(ariaLabel?: string): IEditorOptions {
	return {
		fontSize: 13,
		lineHeight: 20,
		wordWrap: 'off',
		scrollbar: { vertical: 'hidden', },
		roundedSelection: false,
		guides: {
			indentation: false
		},
		cursorWidth: 1,
		fontFamily: DEFAULT_FONT_FAMILY,
		ariaLabel: ariaLabel || '',
		snippetSuggestions: 'none',
		suggest: { filterGraceful: false, showIcons: false },
		autoClosingBrackets: 'never'
	};
}
