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
var SearchWidget_1;
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Widget } from '../../../../base/browser/ui/widget.js';
import { Action } from '../../../../base/common/actions.js';
import { Delayer, disposableTimeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { CONTEXT_FIND_WIDGET_NOT_VISIBLE } from '../../../../editor/contrib/find/browser/findModel.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ContextScopedReplaceInput } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { isSearchViewFocused, getSearchView } from './searchActionsBase.js';
import * as Constants from '../common/constants.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { searchReplaceAllIcon, searchHideReplaceIcon, searchShowContextIcon, searchShowReplaceIcon } from './searchIcons.js';
import { ToggleSearchEditorContextLinesCommandId } from '../../searchEditor/browser/constants.js';
import { showHistoryKeybindingHint } from '../../../../platform/history/browser/historyWidgetKeybindingHint.js';
import { defaultInputBoxStyles, defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { NotebookFindFilters } from '../../notebook/browser/contrib/find/findFilters.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { NotebookEditorInput } from '../../notebook/common/notebookEditorInput.js';
import { SearchFindInput } from './searchFindInput.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { NotebookFindScopeType } from '../../notebook/common/notebookCommon.js';
/** Specified in searchview.css */
const SingleLineInputHeight = 26;
class ReplaceAllAction extends Action {
    static { this.ID = 'search.action.replaceAll'; }
    constructor(_searchWidget) {
        super(ReplaceAllAction.ID, '', ThemeIcon.asClassName(searchReplaceAllIcon), false);
        this._searchWidget = _searchWidget;
    }
    set searchWidget(searchWidget) {
        this._searchWidget = searchWidget;
    }
    run() {
        if (this._searchWidget) {
            return this._searchWidget.triggerReplaceAll();
        }
        return Promise.resolve();
    }
}
const hoverLifecycleOptions = { groupId: 'search-widget' };
const ctrlKeyMod = (isMacintosh ? 256 /* KeyMod.WinCtrl */ : 2048 /* KeyMod.CtrlCmd */);
function stopPropagationForMultiLineUpwards(event, value, textarea) {
    const isMultiline = !!value.match(/\n/);
    if (textarea && (isMultiline || textarea.clientHeight > SingleLineInputHeight) && textarea.selectionStart > 0) {
        event.stopPropagation();
        return;
    }
}
function stopPropagationForMultiLineDownwards(event, value, textarea) {
    const isMultiline = !!value.match(/\n/);
    if (textarea && (isMultiline || textarea.clientHeight > SingleLineInputHeight) && textarea.selectionEnd < textarea.value.length) {
        event.stopPropagation();
        return;
    }
}
let SearchWidget = class SearchWidget extends Widget {
    static { SearchWidget_1 = this; }
    static { this.INPUT_MAX_HEIGHT = 134; }
    static { this.REPLACE_ALL_DISABLED_LABEL = nls.localize('search.action.replaceAll.disabled.label', "Replace All (Submit Search to Enable)"); }
    static { this.REPLACE_ALL_ENABLED_LABEL = (keyBindingService2) => {
        return keyBindingService2.appendKeybinding(nls.localize('search.action.replaceAll.enabled.label', "Replace All"), ReplaceAllAction.ID);
    }; }
    constructor(container, options, contextViewService, contextKeyService, keybindingService, clipboardServce, configurationService, accessibilityService, contextMenuService, instantiationService, editorService) {
        super();
        this.contextViewService = contextViewService;
        this.contextKeyService = contextKeyService;
        this.keybindingService = keybindingService;
        this.clipboardServce = clipboardServce;
        this.configurationService = configurationService;
        this.accessibilityService = accessibilityService;
        this.contextMenuService = contextMenuService;
        this.instantiationService = instantiationService;
        this.editorService = editorService;
        this.ignoreGlobalFindBufferOnNextFocus = false;
        this.previousGlobalFindBufferValue = null;
        /**
         * Tracks whether the accessibility help hint has been announced in the ARIA label.
         * Reset when the widget loses focus, allowing the hint to be announced again
         * on the next focus.
         */
        this._accessibilityHelpHintAnnounced = false;
        this._onSearchSubmit = this._register(new Emitter());
        this.onSearchSubmit = this._onSearchSubmit.event;
        this._onSearchCancel = this._register(new Emitter());
        this.onSearchCancel = this._onSearchCancel.event;
        this._onReplaceToggled = this._register(new Emitter());
        this.onReplaceToggled = this._onReplaceToggled.event;
        this._onReplaceStateChange = this._register(new Emitter());
        this.onReplaceStateChange = this._onReplaceStateChange.event;
        this._onPreserveCaseChange = this._register(new Emitter());
        this.onPreserveCaseChange = this._onPreserveCaseChange.event;
        this._onReplaceValueChanged = this._register(new Emitter());
        this.onReplaceValueChanged = this._onReplaceValueChanged.event;
        this._onReplaceAll = this._register(new Emitter());
        this.onReplaceAll = this._onReplaceAll.event;
        this._onBlur = this._register(new Emitter());
        this.onBlur = this._onBlur.event;
        this._onDidHeightChange = this._register(new Emitter());
        this.onDidHeightChange = this._onDidHeightChange.event;
        this._onDidToggleContext = this._register(new Emitter());
        this.onDidToggleContext = this._onDidToggleContext.event;
        this.replaceActive = Constants.SearchContext.ReplaceActiveKey.bindTo(this.contextKeyService);
        this.searchInputBoxFocused = Constants.SearchContext.SearchInputBoxFocusedKey.bindTo(this.contextKeyService);
        this.replaceInputBoxFocused = Constants.SearchContext.ReplaceInputBoxFocusedKey.bindTo(this.contextKeyService);
        const notebookOptions = options.notebookOptions ??
            {
                isInNotebookMarkdownInput: true,
                isInNotebookMarkdownPreview: true,
                isInNotebookCellInput: true,
                isInNotebookCellOutput: true
            };
        this._notebookFilters = this._register(new NotebookFindFilters(notebookOptions.isInNotebookMarkdownInput, notebookOptions.isInNotebookMarkdownPreview, notebookOptions.isInNotebookCellInput, notebookOptions.isInNotebookCellOutput, { findScopeType: NotebookFindScopeType.None }));
        this._register(this._notebookFilters.onDidChange(() => {
            if (this.searchInput) {
                this.searchInput.updateFilterStyles();
            }
        }));
        this._register(this.editorService.onDidEditorsChange((e) => {
            if (this.searchInput &&
                e.event.editor instanceof NotebookEditorInput &&
                (e.event.kind === 5 /* GroupModelChangeKind.EDITOR_OPEN */ || e.event.kind === 6 /* GroupModelChangeKind.EDITOR_CLOSE */)) {
                this.searchInput.filterVisible = this._hasNotebookOpen();
            }
        }));
        this._replaceHistoryDelayer = new Delayer(500);
        this._toggleReplaceButtonListener = this._register(new MutableDisposable());
        this.render(container, options);
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('editor.accessibilitySupport')) {
                this.updateAccessibilitySupport();
            }
        }));
        this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.updateAccessibilitySupport()));
        this.updateAccessibilitySupport();
    }
    _hasNotebookOpen() {
        const editors = this.editorService.editors;
        return editors.some(editor => editor instanceof NotebookEditorInput);
    }
    getNotebookFilters() {
        return this._notebookFilters;
    }
    focus(select = true, focusReplace = false, suppressGlobalSearchBuffer = false) {
        this.ignoreGlobalFindBufferOnNextFocus = suppressGlobalSearchBuffer;
        if (focusReplace && this.isReplaceShown()) {
            if (this.replaceInput) {
                this._updateSearchInputAriaLabel(false);
                this.replaceInput.focus();
                if (select) {
                    this.replaceInput.select();
                }
            }
        }
        else {
            if (this.searchInput) {
                this._updateSearchInputAriaLabel(true);
                this.searchInput.focus();
                if (select) {
                    this.searchInput.select();
                }
            }
        }
    }
    /**
     * Updates the ARIA label of the search input box.
     * When a screen reader is active and the accessibility verbosity setting is enabled,
     * includes a hint about pressing Alt+F1 for accessibility help on first focus.
     * The hint is only announced once per focus cycle to prevent double-speak.
     * @param includeHint Whether to include the accessibility help hint in the label
     */
    _updateSearchInputAriaLabel(includeHint) {
        if (!this.searchInput) {
            return;
        }
        let searchLabel = nls.localize('label.Search', 'Search: Type Search Term and press Enter to search');
        // Include accessibility help hint when requested, screen reader is active, and setting is enabled
        // Note: Using raw string for setting ID - this setting may not be registered yet
        if (includeHint && !this._accessibilityHelpHintAnnounced && this.configurationService.getValue('accessibility.verbosity.find') && this.accessibilityService.isScreenReaderOptimized()) {
            const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
            if (keybinding) {
                searchLabel += ', ' + nls.localize('accessibilityHelpHintInLabel', "Press {0} for accessibility help", keybinding);
                this._accessibilityHelpHintAnnounced = true;
                // Reset to plain label after delay to avoid repeated announcement on focus changes
                this._labelResetTimeout?.dispose();
                this._labelResetTimeout = disposableTimeout(() => {
                    if (this.searchInput) {
                        this.searchInput.inputBox.setAriaLabel(nls.localize('label.Search', 'Search: Type Search Term and press Enter to search'));
                    }
                }, 1000);
            }
        }
        this.searchInput.inputBox.setAriaLabel(searchLabel);
    }
    setWidth(width) {
        this.searchInput?.inputBox.layout();
        if (this.replaceInput) {
            this.replaceInput.width = width - 28;
            this.replaceInput.inputBox.layout();
        }
    }
    clear() {
        this.searchInput?.clear();
        this.replaceInput?.setValue('');
        this.setReplaceAllActionState(false);
    }
    isReplaceShown() {
        return this.replaceContainer ? !this.replaceContainer.classList.contains('disabled') : false;
    }
    isReplaceActive() {
        return !!this.replaceActive.get();
    }
    getReplaceValue() {
        return this.replaceInput?.getValue() ?? '';
    }
    toggleReplace(show) {
        if (show === undefined || show !== this.isReplaceShown()) {
            this.onToggleReplaceButton();
        }
    }
    getSearchHistory() {
        return this.searchInput?.inputBox.getHistory() ?? [];
    }
    getReplaceHistory() {
        return this.replaceInput?.inputBox.getHistory() ?? [];
    }
    prependSearchHistory(history) {
        this.searchInput?.inputBox.prependHistory(history);
    }
    prependReplaceHistory(history) {
        this.replaceInput?.inputBox.prependHistory(history);
    }
    clearHistory() {
        this.searchInput?.inputBox.clearHistory();
        this.replaceInput?.inputBox.clearHistory();
    }
    showNextSearchTerm() {
        this.searchInput?.inputBox.showNextValue();
    }
    showPreviousSearchTerm() {
        this.searchInput?.inputBox.showPreviousValue();
    }
    showNextReplaceTerm() {
        this.replaceInput?.inputBox.showNextValue();
    }
    showPreviousReplaceTerm() {
        this.replaceInput?.inputBox.showPreviousValue();
    }
    searchInputHasFocus() {
        return !!this.searchInputBoxFocused.get();
    }
    replaceInputHasFocus() {
        return !!this.replaceInput?.inputBox.hasFocus();
    }
    focusReplaceAllAction() {
        this.replaceActionBar?.focus(true);
    }
    focusRegexAction() {
        this.searchInput?.focusOnRegex();
    }
    set replaceButtonVisibility(val) {
        if (this.toggleReplaceButton) {
            this.toggleReplaceButton.element.style.display = val ? '' : 'none';
        }
    }
    render(container, options) {
        this.domNode = dom.append(container, dom.$('.search-widget'));
        this.domNode.style.position = 'relative';
        if (!options._hideReplaceToggle) {
            this.renderToggleReplaceButton(this.domNode);
        }
        this.renderSearchInput(this.domNode, options);
        this.renderReplaceInput(this.domNode, options);
    }
    updateAccessibilitySupport() {
        this.searchInput?.setFocusInputOnOptionClick(!this.accessibilityService.isScreenReaderOptimized());
    }
    renderToggleReplaceButton(parent) {
        const opts = {
            buttonBackground: undefined,
            buttonBorder: undefined,
            buttonForeground: undefined,
            buttonHoverBackground: undefined,
            buttonSecondaryBackground: undefined,
            buttonSecondaryForeground: undefined,
            buttonSecondaryHoverBackground: undefined,
            buttonSeparator: undefined,
            title: nls.localize('search.replace.toggle.button.title', "Toggle Replace"),
            hoverDelegate: getDefaultHoverDelegate('element'),
        };
        this.toggleReplaceButton = this._register(new Button(parent, opts));
        this.toggleReplaceButton.element.setAttribute('aria-expanded', 'false');
        this.toggleReplaceButton.element.classList.add('toggle-replace-button');
        this.toggleReplaceButton.icon = searchHideReplaceIcon;
        this._toggleReplaceButtonListener.value = this.toggleReplaceButton.onDidClick(() => this.onToggleReplaceButton());
    }
    renderSearchInput(parent, options) {
        const history = options.searchHistory || [];
        const inputOptions = {
            label: nls.localize('label.Search', 'Search: Type Search Term and press Enter to search'),
            validation: (value) => this.validateSearchInput(value),
            placeholder: nls.localize('search.placeHolder', "Search"),
            appendCaseSensitiveLabel: this.keybindingService.appendKeybinding('', "toggleSearchCaseSensitive" /* Constants.SearchCommandIds.ToggleCaseSensitiveCommandId */),
            appendWholeWordsLabel: this.keybindingService.appendKeybinding('', "toggleSearchWholeWord" /* Constants.SearchCommandIds.ToggleWholeWordCommandId */),
            appendRegexLabel: this.keybindingService.appendKeybinding('', "toggleSearchRegex" /* Constants.SearchCommandIds.ToggleRegexCommandId */),
            history: new Set(history),
            showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService),
            flexibleHeight: true,
            flexibleMaxHeight: SearchWidget_1.INPUT_MAX_HEIGHT,
            showCommonFindToggles: true,
            inputBoxStyles: options.inputBoxStyles,
            toggleStyles: options.toggleStyles,
            hoverLifecycleOptions,
        };
        const searchInputContainer = dom.append(parent, dom.$('.search-container.input-box'));
        this.searchInput = this._register(new SearchFindInput(searchInputContainer, this.contextViewService, inputOptions, this.contextKeyService, this.contextMenuService, this.instantiationService, this._notebookFilters, this._hasNotebookOpen()));
        this._register(this.searchInput.onKeyDown((keyboardEvent) => this.onSearchInputKeyDown(keyboardEvent)));
        this.searchInput.setValue(options.value || '');
        this.searchInput.setRegex(!!options.isRegex);
        this.searchInput.setCaseSensitive(!!options.isCaseSensitive);
        this.searchInput.setWholeWords(!!options.isWholeWords);
        this._register(this.searchInput.onCaseSensitiveKeyDown((keyboardEvent) => this.onCaseSensitiveKeyDown(keyboardEvent)));
        this._register(this.searchInput.onRegexKeyDown((keyboardEvent) => this.onRegexKeyDown(keyboardEvent)));
        this._register(this.searchInput.inputBox.onDidChange(() => this.onSearchInputChanged()));
        this._register(this.searchInput.inputBox.onDidHeightChange(() => this._onDidHeightChange.fire()));
        this._register(this.onReplaceValueChanged(() => {
            this._replaceHistoryDelayer.trigger(() => this.replaceInput?.inputBox.addToHistory());
        }));
        this.searchInputFocusTracker = this._register(dom.trackFocus(this.searchInput.inputBox.inputElement));
        this._register(this.searchInputFocusTracker.onDidFocus(async () => {
            this.searchInputBoxFocused.set(true);
            const useGlobalFindBuffer = this.searchConfiguration.globalFindClipboard;
            if (!this.ignoreGlobalFindBufferOnNextFocus && useGlobalFindBuffer) {
                const globalBufferText = await this.clipboardServce.readFindText();
                if (globalBufferText && this.previousGlobalFindBufferValue !== globalBufferText) {
                    this.searchInput?.inputBox.addToHistory();
                    this.searchInput?.setValue(globalBufferText);
                    this.searchInput?.select();
                }
                this.previousGlobalFindBufferValue = globalBufferText;
            }
            this.ignoreGlobalFindBufferOnNextFocus = false;
        }));
        this._register(this.searchInputFocusTracker.onDidBlur(() => this.searchInputBoxFocused.set(false)));
        this.showContextToggle = new Toggle({
            isChecked: false,
            title: this.keybindingService.appendKeybinding(nls.localize('showContext', "Toggle Context Lines"), ToggleSearchEditorContextLinesCommandId),
            icon: searchShowContextIcon,
            hoverLifecycleOptions,
            ...defaultToggleStyles
        });
        this._register(this.showContextToggle.onChange(() => this.onContextLinesChanged()));
        if (options.showContextToggle) {
            this.contextLinesInput = new InputBox(searchInputContainer, this.contextViewService, { type: 'number', inputBoxStyles: defaultInputBoxStyles });
            this.contextLinesInput.element.classList.add('context-lines-input');
            this.contextLinesInput.value = '' + (this.configurationService.getValue('search').searchEditor.defaultNumberOfContextLines ?? 1);
            this._register(this.contextLinesInput.onDidChange((value) => {
                if (value !== '0') {
                    this.showContextToggle.checked = true;
                }
                this.onContextLinesChanged();
            }));
            dom.append(searchInputContainer, this.showContextToggle.domNode);
        }
    }
    onContextLinesChanged() {
        this._onDidToggleContext.fire();
        if (this.contextLinesInput.value.includes('-')) {
            this.contextLinesInput.value = '0';
        }
        this._onDidToggleContext.fire();
    }
    setContextLines(lines) {
        if (!this.contextLinesInput) {
            return;
        }
        if (lines === 0) {
            this.showContextToggle.checked = false;
        }
        else {
            this.showContextToggle.checked = true;
            this.contextLinesInput.value = '' + lines;
        }
    }
    renderReplaceInput(parent, options) {
        this.replaceContainer = dom.append(parent, dom.$('.replace-container.disabled'));
        const replaceBox = dom.append(this.replaceContainer, dom.$('.replace-input'));
        this.replaceInput = this._register(new ContextScopedReplaceInput(replaceBox, this.contextViewService, {
            label: nls.localize('label.Replace', 'Replace: Type replace term and press Enter to preview'),
            placeholder: nls.localize('search.replace.placeHolder', "Replace"),
            appendPreserveCaseLabel: this.keybindingService.appendKeybinding('', "toggleSearchPreserveCase" /* Constants.SearchCommandIds.TogglePreserveCaseId */),
            history: new Set(options.replaceHistory),
            showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService),
            flexibleHeight: true,
            flexibleMaxHeight: SearchWidget_1.INPUT_MAX_HEIGHT,
            inputBoxStyles: options.inputBoxStyles,
            toggleStyles: options.toggleStyles,
            hoverLifecycleOptions
        }, this.contextKeyService, true));
        this._register(this.replaceInput.onDidOptionChange(viaKeyboard => {
            if (!viaKeyboard) {
                if (this.replaceInput) {
                    this._onPreserveCaseChange.fire(this.replaceInput.getPreserveCase());
                }
            }
        }));
        this._register(this.replaceInput.onKeyDown((keyboardEvent) => this.onReplaceInputKeyDown(keyboardEvent)));
        this.replaceInput.setValue(options.replaceValue || '');
        this._register(this.replaceInput.inputBox.onDidChange(() => this._onReplaceValueChanged.fire()));
        this._register(this.replaceInput.inputBox.onDidHeightChange(() => this._onDidHeightChange.fire()));
        this.replaceAllAction = new ReplaceAllAction(this);
        this.replaceAllAction.label = SearchWidget_1.REPLACE_ALL_DISABLED_LABEL;
        this.replaceActionBar = this._register(new ActionBar(this.replaceContainer));
        this.replaceActionBar.push([this.replaceAllAction], { icon: true, label: false });
        this.onkeydown(this.replaceActionBar.domNode, (keyboardEvent) => this.onReplaceActionbarKeyDown(keyboardEvent));
        this.replaceInputFocusTracker = this._register(dom.trackFocus(this.replaceInput.inputBox.inputElement));
        this._register(this.replaceInputFocusTracker.onDidFocus(() => this.replaceInputBoxFocused.set(true)));
        this._register(this.replaceInputFocusTracker.onDidBlur(() => this.replaceInputBoxFocused.set(false)));
        this._register(this.replaceInput.onPreserveCaseKeyDown((keyboardEvent) => this.onPreserveCaseKeyDown(keyboardEvent)));
    }
    triggerReplaceAll() {
        this._onReplaceAll.fire();
        return Promise.resolve();
    }
    onToggleReplaceButton() {
        this.replaceContainer?.classList.toggle('disabled');
        if (this.isReplaceShown()) {
            this.toggleReplaceButton?.element.classList.remove(...ThemeIcon.asClassNameArray(searchHideReplaceIcon));
            this.toggleReplaceButton?.element.classList.add(...ThemeIcon.asClassNameArray(searchShowReplaceIcon));
        }
        else {
            this.toggleReplaceButton?.element.classList.remove(...ThemeIcon.asClassNameArray(searchShowReplaceIcon));
            this.toggleReplaceButton?.element.classList.add(...ThemeIcon.asClassNameArray(searchHideReplaceIcon));
        }
        this.toggleReplaceButton?.element.setAttribute('aria-expanded', this.isReplaceShown() ? 'true' : 'false');
        this.updateReplaceActiveState();
        this._onReplaceToggled.fire();
    }
    setValue(value) {
        this.searchInput?.setValue(value);
    }
    setReplaceAllActionState(enabled) {
        if (this.replaceAllAction && (this.replaceAllAction.enabled !== enabled)) {
            this.replaceAllAction.enabled = enabled;
            this.replaceAllAction.label = enabled ? SearchWidget_1.REPLACE_ALL_ENABLED_LABEL(this.keybindingService) : SearchWidget_1.REPLACE_ALL_DISABLED_LABEL;
            this.updateReplaceActiveState();
        }
    }
    updateReplaceActiveState() {
        const currentState = this.isReplaceActive();
        const newState = this.isReplaceShown() && !!this.replaceAllAction?.enabled;
        if (currentState !== newState) {
            this.replaceActive.set(newState);
            this._onReplaceStateChange.fire(newState);
            this.replaceInput?.inputBox.layout();
        }
    }
    validateSearchInput(value) {
        if (value.length === 0) {
            return null;
        }
        if (!(this.searchInput?.getRegex())) {
            return null;
        }
        try {
            new RegExp(value, 'u');
        }
        catch (e) {
            return { content: e.message };
        }
        return null;
    }
    onSearchInputChanged() {
        this.searchInput?.clearMessage();
        this.setReplaceAllActionState(false);
        if (this.searchConfiguration.searchOnType) {
            if (this.searchInput?.getRegex()) {
                try {
                    const regex = new RegExp(this.searchInput.getValue(), 'ug');
                    const matchienessHeuristic = `
								~!@#$%^&*()_+
								\`1234567890-=
								qwertyuiop[]\\
								QWERTYUIOP{}|
								asdfghjkl;'
								ASDFGHJKL:"
								zxcvbnm,./
								ZXCVBNM<>? `.match(regex)?.length ?? 0;
                    const delayMultiplier = matchienessHeuristic < 50 ? 1 :
                        matchienessHeuristic < 100 ? 5 : // expressions like `.` or `\w`
                            10; // only things matching empty string
                    this.submitSearch(true, this.searchConfiguration.searchOnTypeDebouncePeriod * delayMultiplier);
                }
                catch {
                    // pass
                }
            }
            else {
                this.submitSearch(true, this.searchConfiguration.searchOnTypeDebouncePeriod);
            }
        }
    }
    onSearchInputKeyDown(keyboardEvent) {
        if (keyboardEvent.equals(ctrlKeyMod | 3 /* KeyCode.Enter */)) {
            this.searchInput?.inputBox.insertAtCursor('\n');
            keyboardEvent.preventDefault();
        }
        if (keyboardEvent.equals(3 /* KeyCode.Enter */)) {
            this.searchInput?.onSearchSubmit();
            this.submitSearch();
            keyboardEvent.preventDefault();
        }
        else if (keyboardEvent.equals(9 /* KeyCode.Escape */)) {
            this._onSearchCancel.fire({ focus: true });
            keyboardEvent.preventDefault();
        }
        else if (keyboardEvent.equals(2 /* KeyCode.Tab */)) {
            if (this.isReplaceShown()) {
                this.replaceInput?.focus();
            }
            else {
                this.searchInput?.focusOnCaseSensitive();
            }
            keyboardEvent.preventDefault();
        }
        else if (keyboardEvent.equals(16 /* KeyCode.UpArrow */)) {
            // eslint-disable-next-line no-restricted-syntax
            stopPropagationForMultiLineUpwards(keyboardEvent, this.searchInput?.getValue() ?? '', this.searchInput?.domNode.querySelector('textarea') ?? null);
        }
        else if (keyboardEvent.equals(18 /* KeyCode.DownArrow */)) {
            // eslint-disable-next-line no-restricted-syntax
            stopPropagationForMultiLineDownwards(keyboardEvent, this.searchInput?.getValue() ?? '', this.searchInput?.domNode.querySelector('textarea') ?? null);
        }
        else if (keyboardEvent.equals(11 /* KeyCode.PageUp */)) {
            const inputElement = this.searchInput?.inputBox.inputElement;
            if (inputElement) {
                inputElement.setSelectionRange(0, 0);
                inputElement.focus();
                keyboardEvent.preventDefault();
            }
        }
        else if (keyboardEvent.equals(12 /* KeyCode.PageDown */)) {
            const inputElement = this.searchInput?.inputBox.inputElement;
            if (inputElement) {
                const endOfText = inputElement.value.length;
                inputElement.setSelectionRange(endOfText, endOfText);
                inputElement.focus();
                keyboardEvent.preventDefault();
            }
        }
    }
    onCaseSensitiveKeyDown(keyboardEvent) {
        if (keyboardEvent.equals(1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */)) {
            if (this.isReplaceShown()) {
                this.replaceInput?.focus();
                keyboardEvent.preventDefault();
            }
        }
    }
    onRegexKeyDown(keyboardEvent) {
        if (keyboardEvent.equals(2 /* KeyCode.Tab */)) {
            if (this.isReplaceShown()) {
                this.replaceInput?.focusOnPreserve();
                keyboardEvent.preventDefault();
            }
        }
    }
    onPreserveCaseKeyDown(keyboardEvent) {
        if (keyboardEvent.equals(2 /* KeyCode.Tab */)) {
            if (this.isReplaceActive()) {
                this.focusReplaceAllAction();
            }
            else {
                this._onBlur.fire();
            }
            keyboardEvent.preventDefault();
        }
        else if (keyboardEvent.equals(1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */)) {
            this.focusRegexAction();
            keyboardEvent.preventDefault();
        }
    }
    onReplaceInputKeyDown(keyboardEvent) {
        if (keyboardEvent.equals(ctrlKeyMod | 3 /* KeyCode.Enter */)) {
            this.replaceInput?.inputBox.insertAtCursor('\n');
            keyboardEvent.preventDefault();
        }
        if (keyboardEvent.equals(3 /* KeyCode.Enter */)) {
            this.submitSearch();
            keyboardEvent.preventDefault();
        }
        else if (keyboardEvent.equals(2 /* KeyCode.Tab */)) {
            this.searchInput?.focusOnCaseSensitive();
            keyboardEvent.preventDefault();
        }
        else if (keyboardEvent.equals(1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */)) {
            this.searchInput?.focus();
            keyboardEvent.preventDefault();
        }
        else if (keyboardEvent.equals(16 /* KeyCode.UpArrow */)) {
            // eslint-disable-next-line no-restricted-syntax
            stopPropagationForMultiLineUpwards(keyboardEvent, this.replaceInput?.getValue() ?? '', this.replaceInput?.domNode.querySelector('textarea') ?? null);
        }
        else if (keyboardEvent.equals(18 /* KeyCode.DownArrow */)) {
            // eslint-disable-next-line no-restricted-syntax
            stopPropagationForMultiLineDownwards(keyboardEvent, this.replaceInput?.getValue() ?? '', this.replaceInput?.domNode.querySelector('textarea') ?? null);
        }
    }
    onReplaceActionbarKeyDown(keyboardEvent) {
        if (keyboardEvent.equals(1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */)) {
            this.focusRegexAction();
            keyboardEvent.preventDefault();
        }
    }
    async submitSearch(triggeredOnType = false, delay = 0) {
        this.searchInput?.validate();
        if (!this.searchInput?.inputBox.isInputValid()) {
            return;
        }
        const value = this.searchInput.getValue();
        const useGlobalFindBuffer = this.searchConfiguration.globalFindClipboard;
        if (value && useGlobalFindBuffer) {
            await this.clipboardServce.writeFindText(value);
        }
        this._onSearchSubmit.fire({ triggeredOnType, delay });
    }
    getContextLines() {
        return this.showContextToggle.checked ? +this.contextLinesInput.value : 0;
    }
    modifyContextLines(increase) {
        const current = +this.contextLinesInput.value;
        const modified = current + (increase ? 1 : -1);
        this.showContextToggle.checked = modified !== 0;
        this.contextLinesInput.value = '' + modified;
    }
    toggleContextLines() {
        this.showContextToggle.checked = !this.showContextToggle.checked;
        this.onContextLinesChanged();
    }
    dispose() {
        this.setReplaceAllActionState(false);
        super.dispose();
    }
    get searchConfiguration() {
        return this.configurationService.getValue('search');
    }
};
SearchWidget = SearchWidget_1 = __decorate([
    __param(2, IContextViewService),
    __param(3, IContextKeyService),
    __param(4, IKeybindingService),
    __param(5, IClipboardService),
    __param(6, IConfigurationService),
    __param(7, IAccessibilityService),
    __param(8, IContextMenuService),
    __param(9, IInstantiationService),
    __param(10, IEditorService)
], SearchWidget);
export { SearchWidget };
export function registerContributions() {
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: ReplaceAllAction.ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, CONTEXT_FIND_WIDGET_NOT_VISIBLE),
        primary: 512 /* KeyMod.Alt */ | 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
        handler: accessor => {
            const viewsService = accessor.get(IViewsService);
            if (isSearchViewFocused(viewsService)) {
                const searchView = getSearchView(viewsService);
                if (searchView) {
                    new ReplaceAllAction(searchView.searchAndReplaceWidget).run();
                }
            }
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2Jyb3dzZXIvc2VhcmNoV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFFdkQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxNQUFNLEVBQWtCLE1BQU0sOENBQThDLENBQUM7QUFHdEYsT0FBTyxFQUE2QixRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDL0QsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFFbEUsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ25ILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8s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