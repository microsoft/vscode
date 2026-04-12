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
import { $, append } from '../../../../../base/browser/dom.js';
import { DEFAULT_FONT_FAMILY } from '../../../../../base/browser/fonts.js';
import { Widget } from '../../../../../base/browser/ui/widget.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { HistoryNavigator } from '../../../../../base/common/history.js';
import { mixin } from '../../../../../base/common/objects.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { URI as uri } from '../../../../../base/common/uri.js';
import './suggestEnabledInput.css';
import { EditorExtensionsRegistry } from '../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ensureValidWordDefinition, getWordAtText } from '../../../../../editor/common/core/wordHelper.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ContextMenuController } from '../../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { SnippetController2 } from '../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { registerAndCreateHistoryNavigationContext } from '../../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { asCssVariable, asCssVariableWithDefault, inputBackground, inputBorder, inputForeground, inputPlaceholderForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { MenuPreventer } from '../menuPreventer.js';
import { SelectionClipboardContributionID } from '../selectionClipboard.js';
import { getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../simpleEditorOptions.js';
let SuggestEnabledInput = class SuggestEnabledInput extends Widget {
    constructor(id, parent, suggestionProvider, ariaLabel, resourceHandle, options, defaultInstantiationService, modelService, contextKeyService, languageFeaturesService, configurationService) {
        super();
        this._onShouldFocusResults = this._register(new Emitter());
        this.onShouldFocusResults = this._onShouldFocusResults.event;
        this._onInputDidChange = this._register(new Emitter());
        this.onInputDidChange = this._onInputDidChange.event;
        this._onDidFocus = this._register(new Emitter());
        this.onDidFocus = this._onDidFocus.event;
        this._onDidBlur = this._register(new Emitter());
        this.onDidBlur = this._onDidBlur.event;
        this.stylingContainer = append(parent, $('.suggest-input-container'));
        this.element = parent;
        this.placeholderText = append(this.stylingContainer, $('.suggest-input-placeholder', undefined, options.placeholderText || ''));
        const editorOptions = mixin(getSimpleEditorOptions(configurationService), getSuggestEnabledInputOptions(ariaLabel));
        editorOptions.overflowWidgetsDomNode = options.overflowWidgetsDomNode;
        const scopedContextKeyService = this.getScopedContextKeyService(contextKeyService);
        const instantiationService = scopedContextKeyService
            ? this._register(defaultInstantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])))
            : defaultInstantiationService;
        this.inputWidget = this._register(instantiationService.createInstance(CodeEditorWidget, this.stylingContainer, editorOptions, {
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
                const accessibilitySupport = configurationService.getValue('editor.accessibilitySupport');
                const cursorBlinking = configurationService.getValue('editor.cursorBlinking');
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
            if (options.focusContextKey) {
                options.focusContextKey.set(true);
            }
            this.stylingContainer.classList.add('synthetic-focus');
        })));
        this._register((this.inputWidget.onDidBlurEditorText(() => {
            if (options.focusContextKey) {
                options.focusContextKey.set(false);
            }
            this.stylingContainer.classList.remove('synthetic-focus');
        })));
        this._register(Event.chain(this.inputWidget.onKeyDown, $ => $.filter(e => e.keyCode === 3 /* KeyCode.Enter */))(e => { e.preventDefault(); /** Do nothing. Enter causes new line which is not expected. */ }, this));
        this._register(Event.chain(this.inputWidget.onKeyDown, $ => $.filter(e => e.keyCode === 18 /* KeyCode.DownArrow */ && (isMacintosh ? e.metaKey : e.ctrlKey)))(() => this._onShouldFocusResults.fire(), this));
        let preexistingContent = this.getValue();
        const inputWidgetModel = this.inputWidget.getModel();
        if (inputWidgetModel) {
            this._register(inputWidgetModel.onDidChangeContent(() => {
                const content = this.getValue();
                this.placeholderText.style.visibility = content ? 'hidden' : 'visible';
                if (preexistingContent.trim() === content.trim()) {
                    return;
                }
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
            provideCompletionItems: (model, position, _context) => {
                const query = model.getValue();
                const zeroIndexedColumn = position.column - 1;
                let alreadyTypedCount = 0, zeroIndexedWordStart = 0;
                if (validatedSuggestProvider.wordDefinition) {
                    const wordAtText = getWordAtText(position.column, validatedSuggestProvider.wordDefinition, query, 0);
                    alreadyTypedCount = wordAtText?.word.length ?? 0;
                    zeroIndexedWordStart = wordAtText ? wordAtText.startColumn - 1 : 0;
                }
                else {
                    zeroIndexedWordStart = query.lastIndexOf(' ', zeroIndexedColumn - 1) + 1;
                    alreadyTypedCount = zeroIndexedColumn - zeroIndexedWordStart;
                }
                // dont show suggestions if the user has typed something, but hasn't used the trigger character
                if (!validatedSuggestProvider.alwaysShowSuggestions && alreadyTypedCount > 0 && validatedSuggestProvider.triggerCharacters?.indexOf(query[zeroIndexedWordStart]) === -1) {
                    return { suggestions: [] };
                }
                return {
                    suggestions: suggestionProvider.provideResults(query).map((result) => {
                        let label;
                        let rest;
                        if (typeof result === 'string') {
                            label = result;
                        }
                        else {
                            label = result.label;
                            rest = result;
                        }
                        return {
                            label,
                            insertText: label,
                            range: Range.fromPositions(position.delta(0, -alreadyTypedCount), position),
                            sortText: validatedSuggestProvider.sortKey(label),
                            kind: 17 /* languages.CompletionItemKind.Keyword */,
                            ...rest
                        };
                    })
                };
            }
        }));
        this.style(options.styleOverrides || {});
    }
    getScopedContextKeyService(_contextKeyService) {
        return undefined;
    }
    updateAriaLabel(label) {
        this.inputWidget.updateOptions({ ariaLabel: label });
    }
    setValue(val) {
        val = val.replace(/\s/g, ' ');
        const fullRange = this.inputModel.getFullModelRange();
        this.inputWidget.executeEdits('suggestEnabledInput.setValue', [EditOperation.replace(fullRange, val)]);
        this.inputWidget.setScrollTop(0);
        this.inputWidget.setPosition(new Position(1, val.length + 1));
    }
    getValue() {
        return this.inputWidget.getValue();
    }
    style(styleOverrides) {
        this.stylingContainer.style.backgroundColor = asCssVariable(styleOverrides.inputBackground ?? inputBackground);
        this.stylingContainer.style.color = asCssVariable(styleOverrides.inputForeground ?? inputForeground);
        this.placeholderText.style.color = asCssVariable(styleOverrides.inputPlaceholderForeground ?? inputPlaceholderForeground);
        this.stylingContainer.style.borderWidth = '1px';
        this.stylingContainer.style.borderStyle = 'solid';
        this.stylingContainer.style.borderColor = asCssVariableWithDefault(styleOverrides.inputBorder ?? inputBorder, 'transparent');
        // eslint-disable-next-line no-restricted-syntax
        const cursor = this.stylingContainer.getElementsByClassName('cursor')[0];
        if (cursor) {
            cursor.style.backgroundColor = asCssVariable(styleOverrides.inputForeground ?? inputForeground);
        }
    }
    focus(selectAll) {
        this.inputWidget.focus();
        if (selectAll && this.inputWidget.getValue()) {
            this.selectAll();
        }
    }
    onHide() {
        this.inputWidget.onHide();
    }
    layout(dimension) {
        this.inputWidget.layout(dimension);
        this.placeholderText.style.width = `${dimension.width - 2}px`;
    }
    selectAll() {
        this.inputWidget.setSelection(new Range(1, 1, 1, this.getValue().length + 1));
    }
};
SuggestEnabledInput = __decorate([
    __param(6, IInstantiationService),
    __param(7, IModelService),
    __param(8, IContextKeyService),
    __param(9, ILanguageFeaturesService),
    __param(10, IConfigurationService)
], SuggestEnabledInput);
export { SuggestEnabledInput };
let SuggestEnabledInputWithHistory = class SuggestEnabledInputWithHistory extends SuggestEnabledInput {
    constructor({ id, parent, ariaLabel, suggestionProvider, resourceHandle, suggestOptions, history }, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService) {
        super(id, parent, suggestionProvider, ariaLabel, resourceHandle, suggestOptions, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService);
        this.history = this._register(new HistoryNavigator(new Set(history), 100));
    }
    addToHistory() {
        const value = this.getValue();
        if (value && value !== this.getCurrentValue()) {
            this.history.add(value);
        }
    }
    getHistory() {
        return this.history.getHistory();
    }
    showNextValue() {
        if (!this.history.has(this.getValue())) {
            this.addToHistory();
        }
        let next = this.getNextValue();
        if (next) {
            next = next === this.getValue() ? this.getNextValue() : next;
        }
        this.setValue(next ?? '');
    }
    showPreviousValue() {
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
    clearHistory() {
        this.history.clear();
    }
    getCurrentValue() {
        let currentValue = this.history.current();
        if (!currentValue) {
            currentValue = this.history.last();
            this.history.next();
        }
        return currentValue;
    }
    getPreviousValue() {
        return this.history.previous() || this.history.first();
    }
    getNextValue() {
        return this.history.next();
    }
};
SuggestEnabledInputWithHistory = __decorate([
    __param(1, IInstantiationService),
    __param(2, IModelService),
    __param(3, IContextKeyService),
    __param(4, ILanguageFeaturesService),
    __param(5, IConfigurationService)
], SuggestEnabledInputWithHistory);
export { SuggestEnabledInputWithHistory };
let ContextScopedSuggestEnabledInputWithHistory = class ContextScopedSuggestEnabledInputWithHistory extends SuggestEnabledInputWithHistory {
    constructor(options, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService) {
        super(options, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService);
        const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this.historyContext;
        this._register(this.inputWidget.onDidChangeCursorPosition(({ position }) => {
            const viewModel = this.inputWidget._getViewModel();
            const lastLineNumber = viewModel.getLineCount();
            const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
            const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
            historyNavigationBackwardsEnablement.set(viewPosition.lineNumber === 1 && viewPosition.column === 1);
            historyNavigationForwardsEnablement.set(viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol);
        }));
    }
    getScopedContextKeyService(contextKeyService) {
        const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
        this.historyContext = this._register(registerAndCreateHistoryNavigationContext(scopedContextKeyService, this));
        return scopedContextKeyService;
    }
};
ContextScopedSuggestEnabledInputWithHistory = __decorate([
    __param(1, IInstantiationService),
    __param(2, IModelService),
    __param(3, IContextKeyService),
    __param(4, ILanguageFeaturesService),
    __param(5, IConfigurationService)
], ContextScopedSuggestEnabledInputWithHistory);
export { ContextScopedSuggestEnabledInputWithHistory };
setupSimpleEditorSelectionStyling('.suggest-input-container');
function getSuggestEnabledInputOptions(ariaLabel) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdEVuYWJsZWRJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9zdWdnZXN0RW5hYmxlZElucHV0L3N1Z2dlc3RFbmFibGVkSW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBYSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUzRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUV6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLElBQUksR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTywyQkFBMkIsQ0FBQztBQUVuQyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUV2RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsYUFBYSxFQUFF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