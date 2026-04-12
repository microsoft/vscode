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
import * as nls from '../../../../../../nls.js';
import * as dom from '../../../../../../base/browser/dom.js';
import './notebookFindReplaceWidget.css';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { DropdownMenuActionViewItem } from '../../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { FindInput } from '../../../../../../base/browser/ui/findinput/findInput.js';
import { ProgressBar } from '../../../../../../base/browser/ui/progressbar/progressbar.js';
import { Sash } from '../../../../../../base/browser/ui/sash/sash.js';
import { Toggle } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { Widget } from '../../../../../../base/browser/ui/widget.js';
import { Action, ActionRunner, Separator } from '../../../../../../base/common/actions.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { isSafari } from '../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { FindReplaceState } from '../../../../../../editor/contrib/find/browser/findState.js';
import { findNextMatchIcon, findPreviousMatchIcon, findReplaceAllIcon, findReplaceIcon, findSelectionIcon, SimpleButton } from '../../../../../../editor/contrib/find/browser/findWidget.js';
import { parseReplaceString, ReplacePattern } from '../../../../../../editor/contrib/find/browser/replacePattern.js';
import { getActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ContextScopedReplaceInput, registerAndCreateHistoryNavigationContext } from '../../../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { defaultInputBoxStyles, defaultProgressBarStyles, defaultToggleStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { registerIcon, widgetClose } from '../../../../../../platform/theme/common/iconRegistry.js';
import { registerThemingParticipant } from '../../../../../../platform/theme/common/themeService.js';
import { filterIcon } from '../../../../extensions/browser/extensionsIcons.js';
import { NotebookFindFilters } from './findFilters.js';
import { NotebookFindScopeType, NotebookSetting } from '../../../common/notebookCommon.js';
const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous Match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next Match");
const NLS_TOGGLE_SELECTION_FIND_TITLE = nls.localize('label.toggleSelectionFind', "Find in Selection");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");
const NLS_TOGGLE_REPLACE_MODE_BTN_LABEL = nls.localize('label.toggleReplaceButton', "Toggle Replace");
const NLS_REPLACE_INPUT_LABEL = nls.localize('label.replace', "Replace");
const NLS_REPLACE_INPUT_PLACEHOLDER = nls.localize('placeholder.replace', "Replace");
const NLS_REPLACE_BTN_LABEL = nls.localize('label.replaceButton', "Replace");
const NLS_REPLACE_ALL_BTN_LABEL = nls.localize('label.replaceAllButton', "Replace All");
export const findFilterButton = registerIcon('find-filter', Codicon.filter, nls.localize('findFilterIcon', 'Icon for Find Filter in find widget.'));
const NOTEBOOK_FIND_FILTERS = nls.localize('notebook.find.filter.filterAction', "Find Filters");
const NOTEBOOK_FIND_IN_MARKUP_INPUT = nls.localize('notebook.find.filter.findInMarkupInput', "Markdown Source");
const NOTEBOOK_FIND_IN_MARKUP_PREVIEW = nls.localize('notebook.find.filter.findInMarkupPreview', "Rendered Markdown");
const NOTEBOOK_FIND_IN_CODE_INPUT = nls.localize('notebook.find.filter.findInCodeInput', "Code Cell Source");
const NOTEBOOK_FIND_IN_CODE_OUTPUT = nls.localize('notebook.find.filter.findInCodeOutput', "Code Cell Output");
const NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH = 419;
const NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING = 4;
let NotebookFindFilterActionViewItem = class NotebookFindFilterActionViewItem extends DropdownMenuActionViewItem {
    constructor(filters, action, options, actionRunner, contextMenuService) {
        super(action, { getActions: () => this.getActions() }, contextMenuService, {
            ...options,
            actionRunner,
            classNames: action.class,
            anchorAlignmentProvider: () => 1 /* AnchorAlignment.RIGHT */
        });
        this.filters = filters;
    }
    render(container) {
        super.render(container);
        this.updateChecked();
    }
    getActions() {
        const markdownInput = {
            checked: this.filters.markupInput,
            class: undefined,
            enabled: true,
            id: 'findInMarkdownInput',
            label: NOTEBOOK_FIND_IN_MARKUP_INPUT,
            run: async () => {
                this.filters.markupInput = !this.filters.markupInput;
            },
            tooltip: ''
        };
        const markdownPreview = {
            checked: this.filters.markupPreview,
            class: undefined,
            enabled: true,
            id: 'findInMarkdownInput',
            label: NOTEBOOK_FIND_IN_MARKUP_PREVIEW,
            run: async () => {
                this.filters.markupPreview = !this.filters.markupPreview;
            },
            tooltip: ''
        };
        const codeInput = {
            checked: this.filters.codeInput,
            class: undefined,
            enabled: true,
            id: 'findInCodeInput',
            label: NOTEBOOK_FIND_IN_CODE_INPUT,
            run: async () => {
                this.filters.codeInput = !this.filters.codeInput;
            },
            tooltip: ''
        };
        const codeOutput = {
            checked: this.filters.codeOutput,
            class: undefined,
            enabled: true,
            id: 'findInCodeOutput',
            label: NOTEBOOK_FIND_IN_CODE_OUTPUT,
            run: async () => {
                this.filters.codeOutput = !this.filters.codeOutput;
            },
            tooltip: '',
            dispose: () => null
        };
        if (isSafari) {
            return [
                markdownInput,
                codeInput
            ];
        }
        else {
            return [
                markdownInput,
                markdownPreview,
                new Separator(),
                codeInput,
                codeOutput,
            ];
        }
    }
    updateChecked() {
        this.element.classList.toggle('checked', this._action.checked);
    }
};
NotebookFindFilterActionViewItem = __decorate([
    __param(4, IContextMenuService)
], NotebookFindFilterActionViewItem);
export class NotebookFindInputFilterButton extends Disposable {
    constructor(filters, contextMenuService, instantiationService, options, tooltip = NOTEBOOK_FIND_FILTERS) {
        super();
        this.filters = filters;
        this.contextMenuService = contextMenuService;
        this.instantiationService = instantiationService;
        this._actionbar = null;
        this._toggleStyles = options.toggleStyles;
        this._filtersAction = this._register(new Action('notebookFindFilterAction', tooltip, 'notebook-filters ' + ThemeIcon.asClassName(filterIcon)));
        this._filtersAction.checked = false;
        this._filterButtonContainer = dom.$('.find-filter-button');
        this._filterButtonContainer.classList.add('monaco-custom-toggle');
        this.createFilters(this._filterButtonContainer);
    }
    get container() {
        return this._filterButtonContainer;
    }
    width() {
        return 2 /*margin left*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
    }
    enable() {
        this.container.setAttribute('aria-disabled', String(false));
    }
    disable() {
        this.container.setAttribute('aria-disabled', String(true));
    }
    set visible(visible) {
        this._filterButtonContainer.style.display = visible ? '' : 'none';
    }
    get visible() {
        return this._filterButtonContainer.style.display !== 'none';
    }
    applyStyles(filterChecked) {
        const toggleStyles = this._toggleStyles;
        this._filterButtonContainer.style.border = '1px solid transparent';
        this._filterButtonContainer.style.borderRadius = '3px';
        this._filterButtonContainer.style.borderColor = (filterChecked && toggleStyles.inputActiveOptionBorder) || '';
        this._filterButtonContainer.style.color = (filterChecked && toggleStyles.inputActiveOptionForeground) || 'inherit';
        this._filterButtonContainer.style.backgroundColor = (filterChecked && toggleStyles.inputActiveOptionBackground) || '';
    }
    createFilters(container) {
        this._actionbar = this._register(new ActionBar(container, {
            actionViewItemProvider: (action, options) => {
                if (action.id === this._filtersAction.id) {
                    return this.instantiationService.createInstance(NotebookFindFilterActionViewItem, this.filters, action, options, this._register(new ActionRunner()));
                }
                return undefined;
            }
        }));
        this._actionbar.push(this._filtersAction, { icon: true, label: false });
    }
}
export class NotebookFindInput extends FindInput {
    constructor(filters, contextKeyService, contextMenuService, instantiationService, parent, contextViewProvider, options) {
        super(parent, contextViewProvider, options);
        this.filters = filters;
        this.contextMenuService = contextMenuService;
        this.instantiationService = instantiationService;
        this._filterChecked = false;
        this._register(registerAndCreateHistoryNavigationContext(contextKeyService, this.inputBox));
        this._findFilter = this._register(new NotebookFindInputFilterButton(filters, contextMenuService, instantiationService, options));
        this.inputBox.paddingRight = (this.caseSensitive?.width() ?? 0) + (this.wholeWords?.width() ?? 0) + (this.regex?.width() ?? 0) + this._findFilter.width();
        this.controls.appendChild(this._findFilter.container);
    }
    setEnabled(enabled) {
        super.setEnabled(enabled);
        if (enabled && !this._filterChecked) {
            this.regex?.enable();
        }
        else {
            this.regex?.disable();
        }
    }
    updateFilterState(changed) {
        this._filterChecked = changed;
        if (this.regex) {
            if (this._filterChecked) {
                this.regex.disable();
                this.regex.domNode.tabIndex = -1;
                this.regex.domNode.classList.toggle('disabled', true);
            }
            else {
                this.regex.enable();
                this.regex.domNode.tabIndex = 0;
                this.regex.domNode.classList.toggle('disabled', false);
            }
        }
        this._findFilter.applyStyles(this._filterChecked);
    }
    getToggleDomNodes() {
        const nodes = super.getToggleDomNodes();
        nodes.push(this._findFilter.container);
        return nodes;
    }
    getCellToolbarActions(menu) {
        return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), g => /^inline/.test(g));
    }
}
let SimpleFindReplaceWidget = class SimpleFindReplaceWidget extends Widget {
    constructor(_contextViewService, contextKeyService, _configurationService, contextMenuService, instantiationService, hoverService, _state = new FindReplaceState(), _notebookEditor, _findWidgetSearchHistory, _replaceWidgetHistory) {
        super();
        this._contextViewService = _contextViewService;
        this._configurationService = _configurationService;
        this.contextMenuService = contextMenuService;
        this.instantiationService = instantiationService;
        this._state = _state;
        this._notebookEditor = _notebookEditor;
        this._findWidgetSearchHistory = _findWidgetSearchHistory;
        this._replaceWidgetHistory = _replaceWidgetHistory;
        this._resizeOriginalWidth = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
        this._isVisible = false;
        this._isReplaceVisible = false;
        this.foundMatch = false;
        this.cellSelectionDecorationIds = [];
        this.textSelectionDecorationIds = [];
        this._register(this._state);
        const findFilters = this._configurationService.getValue(NotebookSetting.findFilters) ?? { markupSource: true, markupPreview: true, codeSource: true, codeOutput: true };
        const findHistoryConfig = this._configurationService.getValue('editor.find.history');
        const replaceHistoryConfig = this._configurationService.getValue('editor.find.replaceHistory');
        this._filters = this._register(new NotebookFindFilters(findFilters.markupSource, findFilters.markupPreview, findFilters.codeSource, findFilters.codeOutput, { findScopeType: NotebookFindScopeType.None }));
        this._state.change({ filters: this._filters }, false);
        this._register(this._filters.onDidChange(() => {
            this._state.change({ filters: this._filters }, false);
        }));
        this._domNode = document.createElement('div');
        this._domNode.classList.add('simple-fr-find-part-wrapper');
        this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
            if (!e || e.affectsConfiguration(NotebookSetting.globalToolbar)) {
                if (this._notebookEditor.notebookOptions.getLayoutConfiguration().globalToolbar) {
                    this._domNode.style.top = '26px';
                }
                else {
                    this._domNode.style.top = '0px';
                }
            }
        }));
        this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
        this._scopedContextKeyService = this._register(contextKeyService.createScoped(this._domNode));
        const progressContainer = dom.$('.find-replace-progress');
        this._progressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
        this._domNode.appendChild(progressContainer);
        const isInteractiveWindow = contextKeyService.getContextKeyValue('notebookType') === 'interactive';
        const hoverLifecycleOptions = { groupId: 'simple-find-widget' };
        // Toggle replace button
        this._toggleReplaceBtn = this._register(new SimpleButton({
            label: NLS_TOGGLE_REPLACE_MODE_BTN_LABEL,
            className: 'codicon toggle left',
            hoverLifecycleOptions,
            onTrigger: isInteractiveWindow ? () => { } :
                () => {
                    this._isReplaceVisible = !this._isReplaceVisible;
                    this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
                    this._updateReplaceViewDisplay();
                }
        }, hoverService));
        this._toggleReplaceBtn.setEnabled(!isInteractiveWindow);
        this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
        this._domNode.appendChild(this._toggleReplaceBtn.domNode);
        this._innerFindDomNode = document.createElement('div');
        this._innerFindDomNode.classList.add('simple-fr-find-part');
        this._findInput = this._register(new NotebookFindInput(this._filters, this._scopedContextKeyService, this.contextMenuService, this.instantiationService, null, this._contextViewService, {
            // width:FIND_INPUT_AREA_WIDTH,
            label: NLS_FIND_INPUT_LABEL,
            placeholder: NLS_FIND_INPUT_PLACEHOLDER,
            validation: (value) => {
                if (value.length === 0 || !this._findInput.getRegex()) {
                    return null;
                }
                try {
                    new RegExp(value);
                    return null;
                }
                catch (e) {
                    this.foundMatch = false;
                    this.updateButtons(this.foundMatch);
                    return { content: e.message };
                }
            },
            flexibleWidth: true,
            showCommonFindToggles: true,
            inputBoxStyles: defaultInputBoxStyles,
            toggleStyles: defaultToggleStyles,
            history: findHistoryConfig === 'workspace' ? this._findWidgetSearchHistory : new Set([]),
        }));
        // Find History with update delayer
        this._updateFindHistoryDelayer = new Delayer(500);
        this.oninput(this._findInput.domNode, (e) => {
            this.foundMatch = this.onInputChanged();
            this.updateButtons(this.foundMatch);
            this._delayedUpdateFindHistory();
        });
        this._register(this._findInput.inputBox.onDidChange(() => {
            this._state.change({ searchString: this._findInput.getValue() }, true);
        }));
        this._findInput.setRegex(!!this._state.isRegex);
        this._findInput.setCaseSensitive(!!this._state.matchCase);
        this._findInput.setWholeWords(!!this._state.wholeWord);
        this._register(this._findInput.onDidOptionChange(() => {
            this._state.change({
                isRegex: this._findInput.getRegex(),
                wholeWord: this._findInput.getWholeWords(),
                matchCase: this._findInput.getCaseSensitive()
            }, true);
        }));
        this._register(this._state.onFindReplaceStateChange(() => {
            this._findInput.setRegex(this._state.isRegex);
            this._findInput.setWholeWords(this._state.wholeWord);
            this._findInput.setCaseSensitive(this._state.matchCase);
            this._replaceInput.setPreserveCase(this._state.preserveCase);
        }));
        this._matchesCount = document.createElement('div');
        this._matchesCount.className = 'matchesCount';
        this._updateMatchesCount();
        this.prevBtn = this._register(new SimpleButton({
            label: NLS_PREVIOUS_MATCH_BTN_LABEL,
            icon: findPreviousMatchIcon,
            hoverLifecycleOptions,
            onTrigger: () => {
                this.find(true);
            }
        }, hoverService));
        this.nextBtn = this._register(new SimpleButton({
            label: NLS_NEXT_MATCH_BTN_LABEL,
            icon: findNextMatchIcon,
            hoverLifecycleOptions,
            onTrigger: () => {
                this.find(false);
            }
        }, hoverService));
        this.inSelectionToggle = this._register(new Toggle({
            icon: findSelectionIcon,
            title: NLS_TOGGLE_SELECTION_FIND_TITLE,
            isChecked: false,
            hoverLifecycleOptions,
            inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground),
            inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
            inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
        }));
        this.inSelectionToggle.domNode.style.display = 'inline';
        this._register(this.inSelectionToggle.onChange(() => {
            const checked = this.inSelectionToggle.checked;
            if (checked) {
                // selection logic:
                // 1. if there are multiple cells, do that.
                // 2. if there is only one cell, do the following:
                // 		- if there is a multi-line range highlighted, textual in selection
                // 		- if there is no range, cell in selection for that cell
                const cellSelection = this._notebookEditor.getSelections();
                const textSelection = this._notebookEditor.getSelectionViewModels()[0].getSelections();
                if (cellSelection.length > 1 || cellSelection.some(range => range.end - range.start > 1)) {
                    this._filters.findScope = {
                        findScopeType: NotebookFindScopeType.Cells,
                        selectedCellRanges: cellSelection
                    };
                    this.setCellSelectionDecorations();
                }
                else if (textSelection.length > 1 || textSelection.some(range => range.endLineNumber - range.startLineNumber >= 1)) {
                    this._filters.findScope = {
                        findScopeType: NotebookFindScopeType.Text,
                        selectedCellRanges: cellSelection,
                        selectedTextRanges: textSelection
                    };
                    this.setTextSelectionDecorations(textSelection, this._notebookEditor.getSelectionViewModels()[0]);
                }
                else {
                    this._filters.findScope = {
                        findScopeType: NotebookFindScopeType.Cells,
                        selectedCellRanges: cellSelection
                    };
                    this.setCellSelectionDecorations();
                }
            }
            else {
                this._filters.findScope = {
                    findScopeType: NotebookFindScopeType.None
                };
                this.clearCellSelectionDecorations();
                this.clearTextSelectionDecorations();
            }
        }));
        const closeBtn = this._register(new SimpleButton({
            label: NLS_CLOSE_BTN_LABEL,
            icon: widgetClose,
            hoverLifecycleOptions,
            onTrigger: () => {
                this.hide();
            }
        }, hoverService));
        this._innerFindDomNode.appendChild(this._findInput.domNode);
        this._innerFindDomNode.appendChild(this._matchesCount);
        this._innerFindDomNode.appendChild(this.prevBtn.domNode);
        this._innerFindDomNode.appendChild(this.nextBtn.domNode);
        this._innerFindDomNode.appendChild(this.inSelectionToggle.domNode);
        this._innerFindDomNode.appendChild(closeBtn.domNode);
        // _domNode wraps _innerDomNode, ensuring that
        this._domNode.appendChild(this._innerFindDomNode);
        this.onkeyup(this._innerFindDomNode, e => {
            if (e.equals(9 /* KeyCode.Escape */)) {
                this.hide();
                e.preventDefault();
                return;
            }
        });
        this._focusTracker = this._register(dom.trackFocus(this._domNode));
        this._register(this._focusTracker.onDidFocus(this.onFocusTrackerFocus.bind(this)));
        this._register(this._focusTracker.onDidBlur(this.onFocusTrackerBlur.bind(this)));
        this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
        this._register(this._findInputFocusTracker.onDidFocus(this.onFindInputFocusTrackerFocus.bind(this)));
        this._register(this._findInputFocusTracker.onDidBlur(this.onFindInputFocusTrackerBlur.bind(this)));
        this._register(dom.addDisposableListener(this._innerFindDomNode, 'click', (event) => {
            event.stopPropagation();
        }));
        // Replace
        this._innerReplaceDomNode = document.createElement('div');
        this._innerReplaceDomNode.classList.add('simple-fr-replace-part');
        this._replaceInput = this._register(new ContextScopedReplaceInput(null, undefined, {
            label: NLS_REPLACE_INPUT_LABEL,
            placeholder: NLS_REPLACE_INPUT_PLACEHOLDER,
            history: replaceHistoryConfig === 'workspace' ? this._replaceWidgetHistory : new Set([]),
            inputBoxStyles: defaultInputBoxStyles,
            toggleStyles: defaultToggleStyles,
            hoverLifecycleOptions,
        }, contextKeyService, false));
        this._innerReplaceDomNode.appendChild(this._replaceInput.domNode);
        this._replaceInputFocusTracker = this._register(dom.trackFocus(this._replaceInput.domNode));
        this._register(this._replaceInputFocusTracker.onDidFocus(this.onReplaceInputFocusTrackerFocus.bind(this)));
        this._register(this._replaceInputFocusTracker.onDidBlur(this.onReplaceInputFocusTrackerBlur.bind(this)));
        // Replace History with update delayer
        this._updateReplaceHistoryDelayer = new Delayer(500);
        this.oninput(this._replaceInput.domNode, (e) => {
            this._delayedUpdateReplaceHistory();
        });
        this._register(this._replaceInput.inputBox.onDidChange(() => {
            this._state.change({ replaceString: this._replaceInput.getValue() }, true);
        }));
        this._domNode.appendChild(this._innerReplaceDomNode);
        this._updateReplaceViewDisplay();
        this._replaceBtn = this._register(new SimpleButton({
            label: NLS_REPLACE_BTN_LABEL,
            icon: findReplaceIcon,
            hoverLifecycleOptions,
            onTrigger: () => {
                this.replaceOne();
            }
        }, hoverService));
        // Replace all button
        this._replaceAllBtn = this._register(new SimpleButton({
            label: NLS_REPLACE_ALL_BTN_LABEL,
            icon: findReplaceAllIcon,
            hoverLifecycleOptions,
            onTrigger: () => {
                this.replaceAll();
            }
        }, hoverService));
        this._innerReplaceDomNode.appendChild(this._replaceBtn.domNode);
        this._innerReplaceDomNode.appendChild(this._replaceAllBtn.domNode);
        this._resizeSash = this._register(new Sash(this._domNode, { getVerticalSashLeft: () => 0 }, { orientation: 0 /* Orientation.VERTICAL */, size: 2 }));
        this._register(this._resizeSash.onDidStart(() => {
            this._resizeOriginalWidth = this._getDomWidth();
        }));
        this._register(this._resizeSash.onDidChange((evt) => {
            let width = this._resizeOriginalWidth + evt.startX - evt.currentX;
            if (width < NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
                width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
            }
            const maxWidth = this._getMaxWidth();
            if (width > maxWidth) {
                width = maxWidth;
            }
            this._domNode.style.width = `${width}px`;
            if (this._isReplaceVisible) {
                this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
            }
            this._findInput.inputBox.layout();
        }));
        this._register(this._resizeSash.onDidReset(() => {
            // users double click on the sash
            // try to emulate what happens with editor findWidget
            const currentWidth = this._getDomWidth();
            let width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
            if (currentWidth <= NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
                width = this._getMaxWidth();
            }
            this._domNode.style.width = `${width}px`;
            if (this._isReplaceVisible) {
                this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
            }
            this._findInput.inputBox.layout();
        }));
    }
    _getMaxWidth() {
        return this._notebookEditor.getLayoutInfo().width - 64;
    }
    _getDomWidth() {
        return dom.getTotalWidth(this._domNode) - (NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING * 2);
    }
    getCellToolbarActions(menu) {
        return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), g => /^inline/.test(g));
    }
    get inputValue() {
        return this._findInput.getValue();
    }
    get replaceValue() {
        return this._replaceInput.getValue();
    }
    get replacePattern() {
        if (this._state.isRegex) {
            return parseReplaceString(this.replaceValue);
        }
        return ReplacePattern.fromStaticValue(this.replaceValue);
    }
    get focusTracker() {
        return this._focusTracker;
    }
    get isVisible() {
        return this._isVisible;
    }
    _onStateChanged(e) {
        this._updateButtons();
        this._updateMatchesCount();
    }
    _updateButtons() {
        this._findInput.setEnabled(this._isVisible);
        this._replaceInput.setEnabled(this._isVisible && this._isReplaceVisible);
        const findInputIsNonEmpty = (this._state.searchString.length > 0);
        this._replaceBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
        this._replaceAllBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
        this._domNode.classList.toggle('replaceToggled', this._isReplaceVisible);
        this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
        this.foundMatch = this._state.matchesCount > 0;
        this.updateButtons(this.foundMatch);
    }
    setCellSelectionDecorations() {
        const cellHandles = [];
        this._notebookEditor.getSelectionViewModels().forEach(viewModel => {
            cellHandles.push(viewModel.handle);
        });
        const decorations = [];
        for (const handle of cellHandles) {
            decorations.push({
                handle: handle,
                options: { className: 'nb-multiCellHighlight', outputClassName: 'nb-multiCellHighlight' }
            });
        }
        this.cellSelectionDecorationIds = this._notebookEditor.deltaCellDecorations([], decorations);
    }
    clearCellSelectionDecorations() {
        this._notebookEditor.deltaCellDecorations(this.cellSelectionDecorationIds, []);
    }
    setTextSelectionDecorations(textRanges, cell) {
        this._notebookEditor.changeModelDecorations(changeAccessor => {
            const decorations = [];
            for (const range of textRanges) {
                decorations.push({
                    ownerId: cell.handle,
                    decorations: [{
                            range: range,
                            options: {
                                description: 'text search range for notebook search scope',
                                isWholeLine: true,
                                className: 'nb-findScope'
                            }
                        }]
                });
            }
            this.textSelectionDecorationIds = changeAccessor.deltaDecorations([], decorations);
        });
    }
    clearTextSelectionDecorations() {
        this._notebookEditor.changeModelDecorations(changeAccessor => {
            changeAccessor.deltaDecorations(this.textSelectionDecorationIds, []);
        });
    }
    _updateMatchesCount() {
    }
    dispose() {
        super.dispose();
        this._domNode.remove();
    }
    getDomNode() {
        return this._domNode;
    }
    reveal(initialInput) {
        if (initialInput) {
            this._findInput.setValue(initialInput);
        }
        if (this._isVisible) {
            this._findInput.select();
            return;
        }
        this._isVisible = true;
        this.updateButtons(this.foundMatch);
        setTimeout(() => {
            this._domNode.classList.add('visible', 'visible-transition');
            this._domNode.setAttribute('aria-hidden', 'false');
            this._findInput.select();
        }, 0);
    }
    focus() {
        this._findInput.focus();
    }
    show(initialInput, options) {
        if (initialInput) {
            this._findInput.setValue(initialInput);
        }
        this._isVisible = true;
        setTimeout(() => {
            this._domNode.classList.add('visible', 'visible-transition');
            this._domNode.setAttribute('aria-hidden', 'false');
            if (options?.focus ?? true) {
                this.focus();
            }
        }, 0);
    }
    showWithReplace(initialInput, replaceInput) {
        if (initialInput) {
            this._findInput.setValue(initialInput);
        }
        if (replaceInput) {
            this._replaceInput.setValue(replaceInput);
        }
        this._isVisible = true;
        this._isReplaceVisible = true;
        this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
        this._updateReplaceViewDisplay();
        setTimeout(() => {
            this._domNode.classList.add('visible', 'visible-transition');
            this._domNode.setAttribute('aria-hidden', 'false');
            this._updateButtons();
            this._replaceInput.focus();
        }, 0);
    }
    _updateReplaceViewDisplay() {
        if (this._isReplaceVisible) {
            this._innerReplaceDomNode.style.display = 'flex';
        }
        else {
            this._innerReplaceDomNode.style.display = 'none';
        }
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
    }
    hide() {
        if (this._isVisible) {
            this.inSelectionToggle.checked = false;
            this._notebookEditor.deltaCellDecorations(this.cellSelectionDecorationIds, []);
            this._notebookEditor.changeModelDecorations(changeAccessor => {
                changeAccessor.deltaDecorations(this.textSelectionDecorationIds, []);
            });
            this._domNode.classList.remove('visible-transition');
            this._domNode.setAttribute('aria-hidden', 'true');
            // Need to delay toggling visibility until after Transition, then visibility hidden - removes from tabIndex list
            setTimeout(() => {
                this._isVisible = false;
                this.updateButtons(this.foundMatch);
                this._domNode.classList.remove('visible');
            }, 200);
        }
    }
    _delayedUpdateFindHistory() {
        this._updateFindHistoryDelayer.trigger(this._updateFindHistory.bind(this));
    }
    _updateFindHistory() {
        this._findInput.inputBox.addToHistory();
    }
    _delayedUpdateReplaceHistory() {
        this._updateReplaceHistoryDelayer.trigger(this._updateReplaceHistory.bind(this));
    }
    _updateReplaceHistory() {
        this._replaceInput.inputBox.addToHistory();
    }
    _getRegexValue() {
        return this._findInput.getRegex();
    }
    _getWholeWordValue() {
        return this._findInput.getWholeWords();
    }
    _getCaseSensitiveValue() {
        return this._findInput.getCaseSensitive();
    }
    updateButtons(foundMatch) {
        const hasInput = this.inputValue.length > 0;
        this.prevBtn.setEnabled(this._isVisible && hasInput && foundMatch);
        this.nextBtn.setEnabled(this._isVisible && hasInput && foundMatch);
    }
};
SimpleFindReplaceWidget = __decorate([
    __param(0, IContextViewService),
    __param(1, IContextKeyService),
    __param(2, IConfigurationService),
    __param(3, IContextMenuService),
    __param(4, IInstantiationService),
    __param(5, IHoverService)
], SimpleFindReplaceWidget);
export { SimpleFindReplaceWidget };
// theming
registerThemingParticipant((theme, collector) => {
    collector.addRule(`
	.notebook-editor {
		--notebook-find-width: ${NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH}px;
		--notebook-find-horizontal-padding: ${NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING}px;
	}
	`);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tGaW5kUmVwbGFjZVdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9maW5kL25vdGVib29rRmluZFJlcGxhY2VXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSwwQkFBMEIsQ0FBQztBQUNoRCxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8saUNBQWlDLENBQUM7QUFDekMsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBR3JGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ2xILE9BQU8sRUFBRSxTQUFTLEVBQXFCLE1BQU0sMERBQTBELENBQUM7QUFHeEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzNGLE9BQU8sRUFBMkIsSUFBSSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0YsT0FBTyxFQUFpQixNQUFNLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDckUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQTBCLFNBQVMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25ILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDcEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVB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