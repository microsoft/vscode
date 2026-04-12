/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-no-dangerous-type-assertions */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var KeybindingsEditor_1, ActionsColumnRenderer_1, CommandColumnRenderer_1, SourceColumnRenderer_1, WhenColumnRenderer_1;
import './media/keybindingsEditor.css';
import { localize } from '../../../../nls.js';
import { Delayer } from '../../../../base/common/async.js';
import * as DOM from '../../../../base/browser/dom.js';
import { isIOS, OS } from '../../../../base/common/platform.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ToggleActionViewItem } from '../../../../base/browser/ui/toggle/toggle.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { KEYBINDING_ENTRY_TEMPLATE_ID } from '../../../services/preferences/browser/keybindingsEditorModel.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { DefineKeybindingWidget, KeybindingsSearchWidget } from './keybindingWidgets.js';
import { CONTEXT_KEYBINDING_FOCUS, CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE, KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN, KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR, KEYBINDINGS_EDITOR_COMMAND_ADD, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE, CONTEXT_WHEN_FOCUS } from '../common/preferences.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingEditingService } from '../../../services/keybinding/common/keybindingEditing.js';
import { IThemeService, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { badgeBackground, contrastBorder, badgeForeground, listActiveSelectionForeground, listInactiveSelectionForeground, listHoverForeground, listFocusForeground, editorBackground, foreground, listActiveSelectionBackground, listInactiveSelectionBackground, listFocusBackground, listHoverBackground, registerColor, tableOddRowsBackgroundColor, asCssVariable } from '../../../../platform/theme/common/colorRegistry.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { WorkbenchTable } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MenuRegistry, MenuId, isIMenuItem } from '../../../../platform/actions/common/actions.js';
import { WORKBENCH_BACKGROUND } from '../../../common/theme.js';
import { keybindingsRecordKeysIcon, keybindingsSortIcon, keybindingsAddIcon, preferencesClearInputIcon, keybindingsEditIcon } from './preferencesIcons.js';
import { ToolBar } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { defaultKeybindingLabelStyles, defaultToggleStyles, getInputBoxStyle } from '../../../../platform/theme/browser/defaultStyles.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { isString } from '../../../../base/common/types.js';
import { SuggestEnabledInput } from '../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { settingsTextInputBorder } from '../common/settingsEditorColorRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerNavigableContainer } from '../../../browser/actions/widgetNavigationCommands.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
const $ = DOM.$;
let KeybindingsEditor = class KeybindingsEditor extends EditorPane {
    static { KeybindingsEditor_1 = this; }
    static { this.ID = 'workbench.editor.keybindings'; }
    constructor(group, telemetryService, themeService, keybindingsService, contextMenuService, keybindingEditingService, contextKeyService, notificationService, clipboardService, instantiationService, editorService, storageService, configurationService, accessibilityService) {
        super(KeybindingsEditor_1.ID, group, telemetryService, themeService, storageService);
        this.keybindingsService = keybindingsService;
        this.contextMenuService = contextMenuService;
        this.keybindingEditingService = keybindingEditingService;
        this.contextKeyService = contextKeyService;
        this.notificationService = notificationService;
        this.clipboardService = clipboardService;
        this.instantiationService = instantiationService;
        this.editorService = editorService;
        this.configurationService = configurationService;
        this.accessibilityService = accessibilityService;
        this._onDefineWhenExpression = this._register(new Emitter());
        this.onDefineWhenExpression = this._onDefineWhenExpression.event;
        this._onRejectWhenExpression = this._register(new Emitter());
        this.onRejectWhenExpression = this._onRejectWhenExpression.event;
        this._onAcceptWhenExpression = this._register(new Emitter());
        this.onAcceptWhenExpression = this._onAcceptWhenExpression.event;
        this._onLayout = this._register(new Emitter());
        this.onLayout = this._onLayout.event;
        this.keybindingsEditorModel = null;
        this.unAssignedKeybindingItemToRevealAndFocus = null;
        this.tableEntries = [];
        this.dimension = null;
        this.latestEmptyFilters = [];
        this.delayedFiltering = this._register(new Delayer(300));
        this._register(keybindingsService.onDidUpdateKeybindings(() => this.render(!!this.keybindingFocusContextKey.get())));
        this.keybindingsEditorContextKey = CONTEXT_KEYBINDINGS_EDITOR.bindTo(this.contextKeyService);
        this.searchFocusContextKey = CONTEXT_KEYBINDINGS_SEARCH_FOCUS.bindTo(this.contextKeyService);
        this.keybindingFocusContextKey = CONTEXT_KEYBINDING_FOCUS.bindTo(this.contextKeyService);
        this.searchHasValueContextKey = CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE.bindTo(this.contextKeyService);
        this.searchHistoryDelayer = this._register(new Delayer(500));
        this.recordKeysAction = this._register(new Action(KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, localize('recordKeysLabel', "Record Keys"), ThemeIcon.asClassName(keybindingsRecordKeysIcon)));
        this.recordKeysAction.checked = false;
        this.sortByPrecedenceAction = this._register(new Action(KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, localize('sortByPrecedeneLabel', "Sort by Precedence (Highest first)"), ThemeIcon.asClassName(keybindingsSortIcon)));
        this.sortByPrecedenceAction.checked = false;
        this.overflowWidgetsDomNode = $('.keybindings-overflow-widgets-container.monaco-editor');
    }
    create(parent) {
        super.create(parent);
        this._register(registerNavigableContainer({
            name: 'keybindingsEditor',
            focusNotifiers: [this],
            focusNextWidget: () => {
                if (this.searchWidget.hasFocus()) {
                    this.focusKeybindings();
                }
            },
            focusPreviousWidget: () => {
                if (!this.searchWidget.hasFocus()) {
                    this.focusSearch();
                }
            }
        }));
    }
    createEditor(parent) {
        const keybindingsEditorElement = DOM.append(parent, $('div', { class: 'keybindings-editor' }));
        this.createAriaLabelElement(keybindingsEditorElement);
        this.createOverlayContainer(keybindingsEditorElement);
        this.createHeader(keybindingsEditorElement);
        this.createBody(keybindingsEditorElement);
    }
    setInput(input, options, context, token) {
        this.keybindingsEditorContextKey.set(true);
        return super.setInput(input, options, context, token)
            .then(() => this.render(!!(options && options.preserveFocus)));
    }
    clearInput() {
        super.clearInput();
        this.keybindingsEditorContextKey.reset();
        this.keybindingFocusContextKey.reset();
    }
    layout(dimension) {
        this.dimension = dimension;
        this.layoutSearchWidget(dimension);
        this.overlayContainer.style.width = dimension.width + 'px';
        this.overlayContainer.style.height = dimension.height + 'px';
        this.defineKeybindingWidget.layout(this.dimension);
        this.layoutKeybindingsTable();
        this._onLayout.fire();
    }
    focus() {
        super.focus();
        const activeKeybindingEntry = this.activeKeybindingEntry;
        if (activeKeybindingEntry) {
            this.selectEntry(activeKeybindingEntry);
        }
        else if (!isIOS) {
            this.searchWidget.focus();
        }
    }
    get activeKeybindingEntry() {
        const focusedElement = this.keybindingsTable.getFocusedElements()[0];
        return focusedElement && focusedElement.templateId === KEYBINDING_ENTRY_TEMPLATE_ID ? focusedElement : null;
    }
    async defineKeybinding(keybindingEntry, add) {
        this.selectEntry(keybindingEntry);
        this.showOverlayContainer();
        try {
            const key = await this.defineKeybindingWidget.define();
            if (key) {
                await this.updateKeybinding(keybindingEntry, key, keybindingEntry.keybindingItem.when, add);
            }
        }
        catch (error) {
            this.onKeybindingEditingError(error);
        }
        finally {
            this.hideOverlayContainer();
            this.selectEntry(keybindingEntry);
        }
    }
    defineWhenExpression(keybindingEntry) {
        if (keybindingEntry.keybindingItem.keybinding) {
            this.selectEntry(keybindingEntry);
            this._onDefineWhenExpression.fire(keybindingEntry);
        }
    }
    rejectWhenExpression(keybindingEntry) {
        this._onRejectWhenExpression.fire(keybindingEntry);
    }
    acceptWhenExpression(keybindingEntry) {
        this._onAcceptWhenExpression.fire(keybindingEntry);
    }
    async updateKeybinding(keybindingEntry, key, when, add) {
        const currentKey = keybindingEntry.keybindingItem.keybinding ? keybindingEntry.keybindingItem.keybinding.getUserSettingsLabel() : '';
        if (currentKey !== key || keybindingEntry.keybindingItem.when !== when) {
            if (add) {
                await this.keybindingEditingService.addKeybinding(keybindingEntry.keybindingItem.keybindingItem, key, when || undefined);
            }
            else {
                await this.keybindingEditingService.editKeybinding(keybindingEntry.keybindingItem.keybindingItem, key, when || undefined);
            }
            if (!keybindingEntry.keybindingItem.keybinding) { // reveal only if keybinding was added to unassinged. Because the entry will be placed in different position after rendering
                this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
            }
        }
    }
    async removeKeybinding(keybindingEntry) {
        this.selectEntry(keybindingEntry);
        if (keybindingEntry.keybindingItem.keybinding) { // This should be a pre-condition
            try {
                await this.keybindingEditingService.removeKeybinding(keybindingEntry.keybindingItem.keybindingItem);
                this.focus();
            }
            catch (error) {
                this.onKeybindingEditingError(error);
                this.selectEntry(keybindingEntry);
            }
        }
    }
    async resetKeybinding(keybindingEntry) {
        this.selectEntry(keybindingEntry);
        try {
            await this.keybindingEditingService.resetKeybinding(keybindingEntry.keybindingItem.keybindingItem);
            if (!keybindingEntry.keybindingItem.keybinding) { // reveal only if keybinding was added to unassinged. Because the entry will be placed in different position after rendering
                this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
            }
            this.selectEntry(keybindingEntry);
        }
        catch (error) {
            this.onKeybindingEditingError(error);
            this.selectEntry(keybindingEntry);
        }
    }
    async copyKeybinding(keybinding) {
        this.selectEntry(keybinding);
        const userFriendlyKeybinding = {
            key: keybinding.keybindingItem.keybinding ? keybinding.keybindingItem.keybinding.getUserSettingsLabel() || '' : '',
            command: keybinding.keybindingItem.command
        };
        if (keybinding.keybindingItem.when) {
            userFriendlyKeybinding.when = keybinding.keybindingItem.when;
        }
        await this.clipboardService.writeText(JSON.stringify(userFriendlyKeybinding, null, '  '));
    }
    async copyKeybindingCommand(keybinding) {
        this.selectEntry(keybinding);
        await this.clipboardService.writeText(keybinding.keybindingItem.command);
    }
    async copyKeybindingCommandTitle(keybinding) {
        this.selectEntry(keybinding);
        await this.clipboardService.writeText(keybinding.keybindingItem.commandLabel);
    }
    focusSearch() {
        this.searchWidget.focus();
    }
    search(filter) {
        this.focusSearch();
        this.searchWidget.setValue(filter);
        this.selectEntry(0);
    }
    clearSearchResults() {
        this.searchWidget.clear();
        this.searchHasValueContextKey.set(false);
    }
    showSimilarKeybindings(keybindingEntry) {
        const value = `"${keybindingEntry.keybindingItem.keybinding.getAriaLabel()}"`;
        if (value !== this.searchWidget.getValue()) {
            this.searchWidget.setValue(value);
        }
    }
    createAriaLabelElement(parent) {
        this.ariaLabelElement = DOM.append(parent, DOM.$(''));
        this.ariaLabelElement.setAttribute('id', 'keybindings-editor-aria-label-element');
        this.ariaLabelElement.setAttribute('aria-live', 'assertive');
    }
    createOverlayContainer(parent) {
        this.overlayContainer = DOM.append(parent, $('.overlay-container'));
        this.overlayContainer.style.position = 'absolute';
        this.overlayContainer.style.zIndex = '40'; // has to greater than sash z-index which is 35
        this.defineKeybindingWidget = this._register(this.instantiationService.createInstance(DefineKeybindingWidget, this.overlayContainer));
        this._register(this.defineKeybindingWidget.onDidChange(keybindingStr => this.defineKeybindingWidget.printExisting(this.keybindingsEditorModel.fetch(`"${keybindingStr}"`).length)));
        this._register(this.defineKeybindingWidget.onShowExistingKeybidings(keybindingStr => this.searchWidget.setValue(`"${keybindingStr}"`)));
        this.hideOverlayContainer();
    }
    showOverlayContainer() {
        this.overlayContainer.style.display = 'block';
    }
    hideOverlayContainer() {
        this.overlayContainer.style.display = 'none';
    }
    createHeader(parent) {
        this.headerContainer = DOM.append(parent, $('.keybindings-header'));
        const fullTextSearchPlaceholder = localize('SearchKeybindings.FullTextSearchPlaceholder', "Type to search in keybindings");
        const keybindingsSearchPlaceholder = localize('SearchKeybindings.KeybindingsSearchPlaceholder', "Recording Keys. Press Escape to exit");
        const clearInputAction = this._register(new Action(KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, localize('clearInput', "Clear Keybindings Search Input"), ThemeIcon.asClassName(preferencesClearInputIcon), false, async () => this.clearSearchResults()));
        const searchContainer = DOM.append(this.headerContainer, $('.search-container'));
        this.searchWidget = this._register(this.instantiationService.createInstance(KeybindingsSearchWidget, searchContainer, {
            ariaLabel: fullTextSearchPlaceholder,
            placeholder: fullTextSearchPlaceholder,
            focusKey: this.searchFocusContextKey,
            ariaLabelledBy: 'keybindings-editor-aria-label-element',
            recordEnter: true,
            quoteRecordedKeys: true,
            history: new Set((this.getMemento(0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */)).searchHistory ?? []),
            inputBoxStyles: getInputBoxStyle({
                inputBorder: settingsTextInputBorder
            })
        }));
        this._register(this.searchWidget.onDidChange(searchValue => {
            const hasValue = !!searchValue;
            clearInputAction.enabled = hasValue;
            this.searchHasValueContextKey.set(hasValue);
            this.delayedFiltering.trigger(() => this.filterKeybindings());
            this.updateSearchOptions();
        }));
        this._register(this.searchWidget.onEscape(() => this.recordKeysAction.checked = false));
        this.actionsContainer = DOM.append(searchContainer, DOM.$('.keybindings-search-actions-container'));
        const recordingBadge = this.createRecordingBadge(this.actionsContainer);
        this._register(this.sortByPrecedenceAction.onDidChange(e => {
            if (e.checked !== undefined) {
                this.renderKeybindingsEntries(false);
            }
            this.updateSearchOptions();
        }));
        this._register(this.recordKeysAction.onDidChange(e => {
            if (e.checked !== undefined) {
                recordingBadge.classList.toggle('disabled', !e.checked);
                if (e.checked) {
                    this.searchWidget.inputBox.setPlaceHolder(keybindingsSearchPlaceholder);
                    this.searchWidget.inputBox.setAriaLabel(keybindingsSearchPlaceholder);
                    this.searchWidget.startRecordingKeys();
                    this.searchWidget.focus();
                }
                else {
                    this.searchWidget.inputBox.setPlaceHolder(fullTextSearchPlaceholder);
                    this.searchWidget.inputBox.setAriaLabel(fullTextSearchPlaceholder);
                    this.searchWidget.stopRecordingKeys();
                    this.searchWidget.focus();
                }
                this.updateSearchOptions();
            }
        }));
        const actions = [this.recordKeysAction, this.sortByPrecedenceAction, clearInputAction];
        const toolBar = this._register(new ToolBar(this.actionsContainer, this.contextMenuService, {
            actionViewItemProvider: (action, options) => {
                if (action.id === this.sortByPrecedenceAction.id || action.id === this.recordKeysAction.id) {
                    return new ToggleActionViewItem(null, action, { ...options, keybinding: this.keybindingsService.lookupKeybinding(action.id)?.getLabel(), toggleStyles: defaultToggleStyles });
                }
                return undefined;
            },
            getKeyBinding: action => this.keybindingsService.lookupKeybinding(action.id)
        }));
        toolBar.setActions(actions);
        this._register(this.keybindingsService.onDidUpdateKeybindings(() => toolBar.setActions(actions)));
    }
    updateSearchOptions() {
        const keybindingsEditorInput = this.input;
        if (keybindingsEditorInput) {
            keybindingsEditorInput.searchOptions = {
                searchValue: this.searchWidget.getValue(),
                recordKeybindings: !!this.recordKeysAction.checked,
                sortByPrecedence: !!this.sortByPrecedenceAction.checked
            };
        }
    }
    createRecordingBadge(container) {
        const recordingBadge = DOM.append(container, DOM.$('.recording-badge.monaco-count-badge.long.disabled'));
        recordingBadge.textContent = localize('recording', "Recording Keys");
        recordingBadge.style.backgroundColor = asCssVariable(badgeBackground);
        recordingBadge.style.color = asCssVariable(badgeForeground);
        recordingBadge.style.border = `1px solid ${asCssVariable(contrastBorder)}`;
        return recordingBadge;
    }
    layoutSearchWidget(dimension) {
        this.searchWidget.layout(dimension);
        this.headerContainer.classList.toggle('small', dimension.width < 400);
        this.searchWidget.inputBox.inputElement.style.paddingRight = `${DOM.getTotalWidth(this.actionsContainer) + 12}px`;
    }
    createBody(parent) {
        const bodyContainer = DOM.append(parent, $('.keybindings-body'));
        this.createTable(bodyContainer);
    }
    createTable(parent) {
        this.keybindingsTableContainer = DOM.append(parent, $('.keybindings-table-container'));
        this.keybindingsTable = this._register(this.instantiationService.createInstance(WorkbenchTable, 'KeybindingsEditor', this.keybindingsTableContainer, new Delegate(), [
            {
                label: '',
                tooltip: '',
                weight: 0,
                minimumWidth: 40,
                maximumWidth: 40,
                templateId: ActionsColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            },
            {
                label: localize('command', "Command"),
                tooltip: '',
                weight: 0.3,
                templateId: CommandColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            },
            {
                label: localize('keybinding', "Keybinding"),
                tooltip: '',
                weight: 0.2,
                templateId: KeybindingColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            },
            {
                label: localize('when', "When"),
                tooltip: '',
                weight: 0.35,
                templateId: WhenColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            },
            {
                label: localize('source', "Source"),
                tooltip: '',
                weight: 0.15,
                templateId: SourceColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            },
        ], [
            this.instantiationService.createInstance(ActionsColumnRenderer, this),
            this.instantiationService.createInstance(CommandColumnRenderer),
            this.instantiationService.createInstance(KeybindingColumnRenderer),
            this.instantiationService.createInstance(WhenColumnRenderer, this),
            this.instantiationService.createInstance(SourceColumnRenderer),
        ], {
            identityProvider: { getId: (e) => e.id },
            horizontalScrolling: false,
            accessibilityProvider: new AccessibilityProvider(this.configurationService),
            keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e) => e.keybindingItem.commandLabel || e.keybindingItem.command },
            overrideStyles: {
                listBackground: editorBackground
            },
            multipleSelectionSupport: false,
            setRowLineHeight: false,
            openOnSingleClick: false,
            transformOptimization: false // disable transform optimization as it causes the editor overflow widgets to be mispositioned
        }));
        this._register(this.keybindingsTable.onContextMenu(e => this.onContextMenu(e)));
        this._register(this.keybindingsTable.onDidChangeFocus(e => this.onFocusChange()));
        this._register(this.keybindingsTable.onDidFocus(() => {
            this.keybindingsTable.getHTMLElement().classList.add('focused');
            this.onFocusChange();
        }));
        this._register(this.keybindingsTable.onDidBlur(() => {
            this.keybindingsTable.getHTMLElement().classList.remove('focused');
            this.keybindingFocusContextKey.reset();
        }));
        this._register(this.keybindingsTable.onDidOpen((e) => {
            // stop double click action on the input #148493
            if (e.browserEvent?.defaultPrevented) {
                return;
            }
            const activeKeybindingEntry = this.activeKeybindingEntry;
            if (activeKeybindingEntry) {
                this.defineKeybinding(activeKeybindingEntry, false);
            }
        }));
        DOM.append(this.keybindingsTableContainer, this.overflowWidgetsDomNode);
    }
    async render(preserveFocus) {
        if (this.input) {
            const input = this.input;
            this.keybindingsEditorModel = await input.resolve();
            await this.keybindingsEditorModel.resolve(this.getActionsLabels());
            this.renderKeybindingsEntries(false, preserveFocus);
            if (input.searchOptions) {
                this.recordKeysAction.checked = input.searchOptions.recordKeybindings;
                this.sortByPrecedenceAction.checked = input.searchOptions.sortByPrecedence;
                this.searchWidget.setValue(input.searchOptions.searchValue);
            }
            else {
                this.updateSearchOptions();
            }
        }
    }
    getActionsLabels() {
        const actionsLabels = new Map();
        for (const editorAction of EditorExtensionsRegistry.getEditorActions()) {
            actionsLabels.set(editorAction.id, editorAction.label);
        }
        for (const menuItem of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
            if (isIMenuItem(menuItem)) {
                const title = typeof menuItem.command.title === 'string' ? menuItem.command.title : menuItem.command.title.value;
                const category = menuItem.command.category ? typeof menuItem.command.category === 'string' ? menuItem.command.category : menuItem.command.category.value : undefined;
                actionsLabels.set(menuItem.command.id, category ? `${category}: ${title}` : title);
            }
        }
        return actionsLabels;
    }
    filterKeybindings() {
        this.renderKeybindingsEntries(this.searchWidget.hasFocus());
        this.searchHistoryDelayer.trigger(() => {
            this.searchWidget.inputBox.addToHistory();
            (this.getMemento(0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */)).searchHistory = this.searchWidget.inputBox.getHistory();
            this.saveState();
        });
    }
    clearKeyboardShortcutSearchHistory() {
        this.searchWidget.inputBox.clearHistory();
        (this.getMemento(0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */)).searchHistory = this.searchWidget.inputBox.getHistory();
        this.saveState();
    }
    renderKeybindingsEntries(reset, preserveFocus) {
        if (this.keybindingsEditorModel) {
            const filter = this.searchWidget.getValue();
            const keybindingsEntries = this.keybindingsEditorModel.fetch(filter, this.sortByPrecedenceAction.checked);
            this.accessibilityService.alert(localize('foundResults', "{0} results", keybindingsEntries.length));
            this.ariaLabelElement.setAttribute('aria-label', this.getAriaLabel(keybindingsEntries));
            if (keybindingsEntries.length === 0) {
                this.latestEmptyFilters.push(filter);
            }
            const currentSelectedIndex = this.keybindingsTable.getSelection()[0];
            this.tableEntries = keybindingsEntries;
            this.keybindingsTable.splice(0, this.keybindingsTable.length, this.tableEntries);
            this.layoutKeybindingsTable();
            if (reset) {
                this.keybindingsTable.setSelection([]);
                this.keybindingsTable.setFocus([]);
            }
            else {
                if (this.unAssignedKeybindingItemToRevealAndFocus) {
                    const index = this.getNewIndexOfUnassignedKeybinding(this.unAssignedKeybindingItemToRevealAndFocus);
                    if (index !== -1) {
                        this.keybindingsTable.reveal(index, 0.2);
                        this.selectEntry(index);
                    }
                    this.unAssignedKeybindingItemToRevealAndFocus = null;
                }
                else if (currentSelectedIndex !== -1 && currentSelectedIndex < this.tableEntries.length) {
                    this.selectEntry(currentSelectedIndex, preserveFocus);
                }
                else if (this.editorService.activeEditorPane === this && !preserveFocus) {
                    this.focus();
                }
            }
        }
    }
    getAriaLabel(keybindingsEntries) {
        if (this.sortByPrecedenceAction.checked) {
            return localize('show sorted keybindings', "Showing {0} Keybindings in precedence order", keybindingsEntries.length);
        }
        else {
            return localize('show keybindings', "Showing {0} Keybindings in alphabetical order", keybindingsEntries.length);
        }
    }
    layoutKeybindingsTable() {
        if (!this.dimension) {
            return;
        }
        const tableHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12 /*padding*/);
        this.keybindingsTableContainer.style.height = `${tableHeight}px`;
        this.keybindingsTable.layout(tableHeight);
    }
    getIndexOf(listEntry) {
        const index = this.tableEntries.indexOf(listEntry);
        if (index === -1) {
            for (let i = 0; i < this.tableEntries.length; i++) {
                if (this.tableEntries[i].id === listEntry.id) {
                    return i;
                }
            }
        }
        return index;
    }
    getNewIndexOfUnassignedKeybinding(unassignedKeybinding) {
        for (let index = 0; index < this.tableEntries.length; index++) {
            const entry = this.tableEntries[index];
            if (entry.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
                const keybindingItemEntry = entry;
                if (keybindingItemEntry.keybindingItem.command === unassignedKeybinding.keybindingItem.command) {
                    return index;
                }
            }
        }
        return -1;
    }
    selectEntry(keybindingItemEntry, focus = true) {
        const index = typeof keybindingItemEntry === 'number' ? keybindingItemEntry : this.getIndexOf(keybindingItemEntry);
        if (index !== -1 && index < this.keybindingsTable.length) {
            if (focus) {
                this.keybindingsTable.domFocus();
                this.keybindingsTable.setFocus([index]);
            }
            this.keybindingsTable.setSelection([index]);
        }
    }
    focusKeybindings() {
        this.keybindingsTable.domFocus();
        const currentFocusIndices = this.keybindingsTable.getFocus();
        this.keybindingsTable.setFocus([currentFocusIndices.length ? currentFocusIndices[0] : 0]);
    }
    selectKeybinding(keybindingItemEntry) {
        this.selectEntry(keybindingItemEntry);
    }
    recordSearchKeys() {
        this.recordKeysAction.checked = true;
    }
    toggleSortByPrecedence() {
        this.sortByPrecedenceAction.checked = !this.sortByPrecedenceAction.checked;
    }
    onContextMenu(e) {
        if (!e.element) {
            return;
        }
        if (e.element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
            const keybindingItemEntry = e.element;
            this.selectEntry(keybindingItemEntry);
            this.contextMenuService.showContextMenu({
                getAnchor: () => e.anchor,
                getActions: () => [
                    this.createCopyAction(keybindingItemEntry),
                    this.createCopyCommandAction(keybindingItemEntry),
                    this.createCopyCommandTitleAction(keybindingItemEntry),
                    new Separator(),
                    ...(keybindingItemEntry.keybindingItem.keybinding
                        ? [this.createDefineKeybindingAction(keybindingItemEntry), this.createAddKeybindingAction(keybindingItemEntry)]
                        : [this.createDefineKeybindingAction(keybindingItemEntry)]),
                    new Separator(),
                    this.createRemoveAction(keybindingItemEntry),
                    this.createResetAction(keybindingItemEntry),
                    new Separator(),
                    this.createDefineWhenExpressionAction(keybindingItemEntry),
                    new Separator(),
                    this.createShowConflictsAction(keybindingItemEntry)
                ]
            });
        }
    }
    onFocusChange() {
        this.keybindingFocusContextKey.reset();
        const element = this.keybindingsTable.getFocusedElements()[0];
        if (!element) {
            return;
        }
        if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
            this.keybindingFocusContextKey.set(true);
        }
    }
    createDefineKeybindingAction(keybindingItemEntry) {
        return {
            label: keybindingItemEntry.keybindingItem.keybinding ? localize('changeLabel', "Change Keybinding...") : localize('addLabel', "Add Keybinding..."),
            enabled: true,
            id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
            run: () => this.defineKeybinding(keybindingItemEntry, false)
        };
    }
    createAddKeybindingAction(keybindingItemEntry) {
        return {
            label: localize('addLabel', "Add Keybinding..."),
            enabled: true,
            id: KEYBINDINGS_EDITOR_COMMAND_ADD,
            run: () => this.defineKeybinding(keybindingItemEntry, true)
        };
    }
    createDefineWhenExpressionAction(keybindingItemEntry) {
        return {
            label: localize('editWhen', "Change When Expression"),
            enabled: !!keybindingItemEntry.keybindingItem.keybinding,
            id: KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN,
            run: () => this.defineWhenExpression(keybindingItemEntry)
        };
    }
    createRemoveAction(keybindingItem) {
        return {
            label: localize('removeLabel', "Remove Keybinding"),
            enabled: !!keybindingItem.keybindingItem.keybinding,
            id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
            run: () => this.removeKeybinding(keybindingItem)
        };
    }
    createResetAction(keybindingItem) {
        return {
            label: localize('resetLabel', "Reset Keybinding"),
            enabled: !keybindingItem.keybindingItem.keybindingItem.isDefault,
            id: KEYBINDINGS_EDITOR_COMMAND_RESET,
            run: () => this.resetKeybinding(keybindingItem)
        };
    }
    createShowConflictsAction(keybindingItem) {
        return {
            label: localize('showSameKeybindings', "Show Same Keybindings"),
            enabled: !!keybindingItem.keybindingItem.keybinding,
            id: KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR,
            run: () => this.showSimilarKeybindings(keybindingItem)
        };
    }
    createCopyAction(keybindingItem) {
        return {
            label: localize('copyLabel', "Copy"),
            enabled: true,
            id: KEYBINDINGS_EDITOR_COMMAND_COPY,
            run: () => this.copyKeybinding(keybindingItem)
        };
    }
    createCopyCommandAction(keybinding) {
        return {
            label: localize('copyCommandLabel', "Copy Command ID"),
            enabled: true,
            id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND,
            run: () => this.copyKeybindingCommand(keybinding)
        };
    }
    createCopyCommandTitleAction(keybinding) {
        return {
            label: localize('copyCommandTitleLabel', "Copy Command Title"),
            enabled: !!keybinding.keybindingItem.commandLabel,
            id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE,
            run: () => this.copyKeybindingCommandTitle(keybinding)
        };
    }
    onKeybindingEditingError(error) {
        this.notificationService.error(typeof error === 'string' ? error : localize('error', "Error '{0}' while editing the keybinding. Please open 'keybindings.json' file and check for errors.", `${error}`));
    }
};
KeybindingsEditor = KeybindingsEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IKeybindingService),
    __param(4, IContextMenuService),
    __param(5, IKeybindingEditingService),
    __param(6, IContextKeyService),
    __param(7, INotificationService),
    __param(8, IClipboardService),
    __param(9, IInstantiationService),
    __param(10, IEditorService),
    __param(11, IStorageService),
    __param(12, IConfigurationService),
    __param(13, IAccessibilityService)
], KeybindingsEditor);
export { KeybindingsEditor };
class Delegate {
    constructor() {
        this.headerRowHeight = 30;
    }
    getHeight(element) {
        if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
            const commandIdMatched = element.keybindingItem.commandLabel && element.commandIdMatches;
            const commandDefaultLabelMatched = !!element.commandDefaultLabelMatches;
            const extensionIdMatched = !!element.extensionIdMatches;
            if (commandIdMatched && commandDefaultLabelMatched) {
                return 60;
            }
            if (extensionIdMatched || commandIdMatched || commandDefaultLabelMatched) {
                return 40;
            }
        }
        return 24;
    }
}
let ActionsColumnRenderer = class ActionsColumnRenderer {
    static { ActionsColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'actions'; }
    constructor(keybindingsEditor, keybindingsService) {
        this.keybindingsEditor = keybindingsEditor;
        this.keybindingsService = keybindingsService;
        this.templateId = ActionsColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const element = DOM.append(container, $('.actions'));
        const actionBar = new ActionBar(element);
        return { actionBar };
    }
    renderElement(keybindingItemEntry, index, templateData) {
        templateData.actionBar.clear();
        const actions = [];
        if (keybindingItemEntry.keybindingItem.keybinding) {
            actions.push(this.createEditAction(keybindingItemEntry));
        }
        else {
            actions.push(this.createAddAction(keybindingItemEntry));
        }
        templateData.actionBar.push(actions, { icon: true });
    }
    createEditAction(keybindingItemEntry) {
        return {
            class: ThemeIcon.asClassName(keybindingsEditIcon),
            enabled: true,
            id: 'editKeybinding',
            tooltip: this.keybindingsService.appendKeybinding(localize('editKeybindingLabel', "Change Keybinding"), KEYBINDINGS_EDITOR_COMMAND_DEFINE),
            run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry, false)
        };
    }
    createAddAction(keybindingItemEntry) {
        return {
            class: ThemeIcon.asClassName(keybindingsAddIcon),
            enabled: true,
            id: 'addKeybinding',
            tooltip: this.keybindingsService.appendKeybinding(localize('addKeybindingLabel', "Add Keybinding"), KEYBINDINGS_EDITOR_COMMAND_DEFINE),
            run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry, false)
        };
    }
    disposeTemplate(templateData) {
        templateData.actionBar.dispose();
    }
};
ActionsColumnRenderer = ActionsColumnRenderer_1 = __decorate([
    __param(1, IKeybindingService)
], ActionsColumnRenderer);
let CommandColumnRenderer = class CommandColumnRenderer {
    static { CommandColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'commands'; }
    constructor(_hoverService) {
        this._hoverService = _hoverService;
        this.templateId = CommandColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const commandColumn = DOM.append(container, $('.command'));
        const commandColumnHover = this._hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), commandColumn, '');
        const commandLabelContainer = DOM.append(commandColumn, $('.command-label'));
        const commandLabel = new HighlightedLabel(commandLabelContainer);
        const commandDefaultLabelContainer = DOM.append(commandColumn, $('.command-default-label'));
        const commandDefaultLabel = new HighlightedLabel(commandDefaultLabelContainer);
        const commandIdLabelContainer = DOM.append(commandColumn, $('.command-id.code'));
        const commandIdLabel = new HighlightedLabel(commandIdLabelContainer);
        return { commandColumn, commandColumnHover, commandLabelContainer, commandLabel, commandDefaultLabelContainer, commandDefaultLabel, commandIdLabelContainer, commandIdLabel };
    }
    renderElement(keybindingItemEntry, index, templateData) {
        const keybindingItem = keybindingItemEntry.keybindingItem;
        const commandIdMatched = !!(keybindingItem.commandLabel && keybindingItemEntry.commandIdMatches);
        const commandDefaultLabelMatched = !!keybindingItemEntry.commandDefaultLabelMatches;
        templateData.commandColumn.classList.toggle('vertical-align-column', commandIdMatched || commandDefaultLabelMatched);
        const title = keybindingItem.commandLabel ? localize('title', "{0} ({1})", keybindingItem.commandLabel, keybindingItem.command) : keybindingItem.command;
        templateData.commandColumn.setAttribute('aria-label', title);
        templateData.commandColumnHover.update(title);
        if (keybindingItem.commandLabel) {
            templateData.commandLabelContainer.classList.remove('hide');
            templateData.commandLabel.set(keybindingItem.commandLabel, keybindingItemEntry.commandLabelMatches);
        }
        else {
            templateData.commandLabelContainer.classList.add('hide');
            templateData.commandLabel.set(undefined);
        }
        if (keybindingItemEntry.commandDefaultLabelMatches) {
            templateData.commandDefaultLabelContainer.classList.remove('hide');
            templateData.commandDefaultLabel.set(keybindingItem.commandDefaultLabel, keybindingItemEntry.commandDefaultLabelMatches);
        }
        else {
            templateData.commandDefaultLabelContainer.classList.add('hide');
            templateData.commandDefaultLabel.set(undefined);
        }
        if (keybindingItemEntry.commandIdMatches || !keybindingItem.commandLabel) {
            templateData.commandIdLabelContainer.classList.remove('hide');
            templateData.commandIdLabel.set(keybindingItem.command, keybindingItemEntry.commandIdMatches);
        }
        else {
            templateData.commandIdLabelContainer.classList.add('hide');
            templateData.commandIdLabel.set(undefined);
        }
    }
    disposeTemplate(templateData) {
        templateData.commandColumnHover.dispose();
        templateData.commandDefaultLabel.dispose();
        templateData.commandIdLabel.dispose();
        templateData.commandLabel.dispose();
    }
};
CommandColumnRenderer = CommandColumnRenderer_1 = __decorate([
    __param(0, IHoverService)
], CommandColumnRenderer);
class KeybindingColumnRenderer {
    static { this.TEMPLATE_ID = 'keybindings'; }
    constructor() {
        this.templateId = KeybindingColumnRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const element = DOM.append(container, $('.keybinding'));
        const keybindingLabel = new KeybindingLabel(DOM.append(element, $('div.keybinding-label')), OS, defaultKeybindingLabelStyles);
        return { keybindingLabel };
    }
    renderElement(keybindingItemEntry, index, templateData) {
        if (keybindingItemEntry.keybindingItem.keybinding) {
            templateData.keybindingLabel.set(keybindingItemEntry.keybindingItem.keybinding, keybindingItemEntry.keybindingMatches);
        }
        else {
            templateData.keybindingLabel.set(undefined, undefined);
        }
    }
    disposeTemplate(templateData) {
        templateData.keybindingLabel.dispose();
    }
}
function onClick(element, callback) {
    const disposables = new DisposableStore();
    disposables.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, DOM.finalHandler(callback)));
    disposables.add(DOM.addDisposableListener(element, DOM.EventType.KEY_UP, e => {
        const keyboardEvent = new StandardKeyboardEvent(e);
        if (keyboardEvent.equals(10 /* KeyCode.Space */) || keyboardEvent.equals(3 /* KeyCode.Enter */)) {
            e.preventDefault();
            e.stopPropagation();
            callback();
        }
    }));
    return disposables;
}
let SourceColumnRenderer = class SourceColumnRenderer {
    static { SourceColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'source'; }
    constructor(extensionsWorkbenchService, hoverService) {
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.hoverService = hoverService;
        this.templateId = SourceColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const sourceColumn = DOM.append(container, $('.source'));
        const sourceColumnHover = this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), sourceColumn, '');
        const sourceLabel = new HighlightedLabel(DOM.append(sourceColumn, $('.source-label')));
        const extensionContainer = DOM.append(sourceColumn, $('.extension-container'));
        const extensionLabel = DOM.append(extensionContainer, $('a.extension-label', { tabindex: 0 }));
        const extensionId = new HighlightedLabel(DOM.append(extensionContainer, $('.extension-id-container.code')));
        return { sourceColumn, sourceColumnHover, sourceLabel, extensionLabel, extensionContainer, extensionId, disposables: new DisposableStore() };
    }
    renderElement(keybindingItemEntry, index, templateData) {
        templateData.disposables.clear();
        if (isString(keybindingItemEntry.keybindingItem.source)) {
            templateData.extensionContainer.classList.add('hide');
            templateData.sourceLabel.element.classList.remove('hide');
            templateData.sourceColumnHover.update('');
            templateData.sourceLabel.set(keybindingItemEntry.keybindingItem.source || '-', keybindingItemEntry.sourceMatches);
        }
        else {
            templateData.extensionContainer.classList.remove('hide');
            templateData.sourceLabel.element.classList.add('hide');
            const extension = keybindingItemEntry.keybindingItem.source;
            const extensionLabel = extension.displayName ?? extension.identifier.value;
            templateData.sourceColumnHover.update(localize('extension label', "Extension ({0})", extensionLabel));
            templateData.extensionLabel.textContent = extensionLabel;
            templateData.disposables.add(onClick(templateData.extensionLabel, () => {
                this.extensionsWorkbenchService.open(extension.identifier.value);
            }));
            if (keybindingItemEntry.extensionIdMatches) {
                templateData.extensionId.element.classList.remove('hide');
                templateData.extensionId.set(extension.identifier.value, keybindingItemEntry.extensionIdMatches);
            }
            else {
                templateData.extensionId.element.classList.add('hide');
                templateData.extensionId.set(undefined);
            }
        }
    }
    disposeTemplate(templateData) {
        templateData.sourceColumnHover.dispose();
        templateData.disposables.dispose();
        templateData.sourceLabel.dispose();
        templateData.extensionId.dispose();
    }
};
SourceColumnRenderer = SourceColumnRenderer_1 = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IHoverService)
], SourceColumnRenderer);
let WhenInputWidget = class WhenInputWidget extends Disposable {
    constructor(parent, keybindingsEditor, instantiationService, contextKeyService) {
        super();
        this._onDidAccept = this._register(new Emitter());
        this.onDidAccept = this._onDidAccept.event;
        this._onDidReject = this._register(new Emitter());
        this.onDidReject = this._onDidReject.event;
        const focusContextKey = CONTEXT_WHEN_FOCUS.bindTo(contextKeyService);
        this.input = this._register(instantiationService.createInstance(SuggestEnabledInput, 'keyboardshortcutseditor#wheninput', parent, {
            provideResults: () => {
                const result = [];
                for (const contextKey of RawContextKey.all()) {
                    result.push({ label: contextKey.key, documentation: contextKey.description, detail: contextKey.type, kind: 14 /* CompletionItemKind.Constant */ });
                }
                return result;
            },
            triggerCharacters: ['!', ' '],
            wordDefinition: /[a-zA-Z.]+/,
            alwaysShowSuggestions: true,
        }, '', `keyboardshortcutseditor#wheninput`, { focusContextKey, overflowWidgetsDomNode: keybindingsEditor.overflowWidgetsDomNode }));
        this._register((DOM.addDisposableListener(this.input.element, DOM.EventType.DBLCLICK, e => DOM.EventHelper.stop(e))));
        this._register(toDisposable(() => focusContextKey.reset()));
        this._register(keybindingsEditor.onAcceptWhenExpression(() => this._onDidAccept.fire(this.input.getValue())));
        this._register(Event.any(keybindingsEditor.onRejectWhenExpression, this.input.onDidBlur)(() => this._onDidReject.fire()));
    }
    layout(dimension) {
        this.input.layout(dimension);
    }
    show(value) {
        this.input.setValue(value);
        this.input.focus(true);
    }
};
WhenInputWidget = __decorate([
    __param(2, IInstantiationService),
    __param(3, IContextKeyService)
], WhenInputWidget);
let WhenColumnRenderer = class WhenColumnRenderer {
    static { WhenColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'when'; }
    constructor(keybindingsEditor, hoverService, instantiationService) {
        this.keybindingsEditor = keybindingsEditor;
        this.hoverService = hoverService;
        this.instantiationService = instantiationService;
        this.templateId = WhenColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const element = DOM.append(container, $('.when'));
        const whenLabelContainer = DOM.append(element, $('div.when-label'));
        const whenLabel = new HighlightedLabel(whenLabelContainer);
        const whenInputContainer = DOM.append(element, $('div.when-input-container'));
        return {
            element,
            whenLabelContainer,
            whenLabel,
            whenInputContainer,
            disposables: new DisposableStore(),
        };
    }
    renderElement(keybindingItemEntry, index, templateData) {
        templateData.disposables.clear();
        const whenInputDisposables = templateData.disposables.add(new DisposableStore());
        templateData.disposables.add(this.keybindingsEditor.onDefineWhenExpression(e => {
            if (keybindingItemEntry === e) {
                templateData.element.classList.add('input-mode');
                const inputWidget = whenInputDisposables.add(this.instantiationService.createInstance(WhenInputWidget, templateData.whenInputContainer, this.keybindingsEditor));
                inputWidget.layout(new DOM.Dimension(templateData.element.parentElement.clientWidth, 18));
                inputWidget.show(keybindingItemEntry.keybindingItem.when || '');
                const hideInputWidget = () => {
                    whenInputDisposables.clear();
                    templateData.element.classList.remove('input-mode');
                    templateData.element.parentElement.style.paddingLeft = '10px';
                    DOM.clearNode(templateData.whenInputContainer);
                };
                whenInputDisposables.add(inputWidget.onDidAccept(value => {
                    hideInputWidget();
                    this.keybindingsEditor.updateKeybinding(keybindingItemEntry, keybindingItemEntry.keybindingItem.keybinding ? keybindingItemEntry.keybindingItem.keybinding.getUserSettingsLabel() || '' : '', value);
                    this.keybindingsEditor.selectKeybinding(keybindingItemEntry);
                }));
                whenInputDisposables.add(inputWidget.onDidReject(() => {
                    hideInputWidget();
                    this.keybindingsEditor.selectKeybinding(keybindingItemEntry);
                }));
                templateData.element.parentElement.style.paddingLeft = '0px';
            }
        }));
        templateData.whenLabelContainer.classList.toggle('code', !!keybindingItemEntry.keybindingItem.when);
        templateData.whenLabelContainer.classList.toggle('empty', !keybindingItemEntry.keybindingItem.when);
        if (keybindingItemEntry.keybindingItem.when) {
            templateData.whenLabel.set(keybindingItemEntry.keybindingItem.when, keybindingItemEntry.whenMatches, keybindingItemEntry.keybindingItem.when);
            templateData.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), templateData.element, keybindingItemEntry.keybindingItem.when));
        }
        else {
            templateData.whenLabel.set('-');
        }
    }
    disposeTemplate(templateData) {
        templateData.disposables.dispose();
        templateData.whenLabel.dispose();
    }
};
WhenColumnRenderer = WhenColumnRenderer_1 = __decorate([
    __param(1, IHoverService),
    __param(2, IInstantiationService)
], WhenColumnRenderer);
class AccessibilityProvider {
    constructor(configurationService) {
        this.configurationService = configurationService;
    }
    getWidgetAriaLabel() {
        return localize('keybindingsLabel', "Keybindings");
    }
    getAriaLabel({ keybindingItem }) {
        const ariaLabel = [
            keybindingItem.commandLabel ? keybindingItem.commandLabel : keybindingItem.command,
            keybindingItem.keybinding?.getAriaLabel() || localize('noKeybinding', "No keybinding assigned"),
            keybindingItem.when ? keybindingItem.when : localize('noWhen', "No when context"),
            isString(keybindingItem.source) ? keybindingItem.source : keybindingItem.source.description ?? keybindingItem.source.identifier.value,
        ];
        if (this.configurationService.getValue("accessibility.verbosity.keybindingsEditor" /* AccessibilityVerbositySettingId.KeybindingsEditor */)) {
            const kbEditorAriaLabel = localize('keyboard shortcuts aria label', "use space or enter to change the keybinding.");
            ariaLabel.push(kbEditorAriaLabel);
        }
        return ariaLabel.join(', ');
    }
}
registerColor('keybindingTable.headerBackground', tableOddRowsBackgroundColor, 'Background color for the keyboard shortcuts table header.');
registerColor('keybindingTable.rowsBackground', tableOddRowsBackgroundColor, 'Background color for the keyboard shortcuts table alternating rows.');
registerThemingParticipant((theme, collector) => {
    const foregroundColor = theme.getColor(foreground);
    if (foregroundColor) {
        const whenForegroundColor = foregroundColor.transparent(.8).makeOpaque(WORKBENCH_BACKGROUND(theme));
        collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
    }
    const listActiveSelectionForegroundColor = theme.getColor(listActiveSelectionForeground);
    const listActiveSelectionBackgroundColor = theme.getColor(listActiveSelectionBackground);
    if (listActiveSelectionForegroundColor && listActiveSelectionBackgroundColor) {
        const whenForegroundColor = listActiveSelectionForegroundColor.transparent(.8).makeOpaque(listActiveSelectionBackgroundColor);
        collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row.selected .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
    }
    const listInactiveSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
    const listInactiveSelectionBackgroundColor = theme.getColor(listInactiveSelectionBackground);
    if (listInactiveSelectionForegroundColor && listInactiveSelectionBackgroundColor) {
        const whenForegroundColor = listInactiveSelectionForegroundColor.transparent(.8).makeOpaque(listInactiveSelectionBackgroundColor);
        collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table .monaco-list-row.selected .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
    }
    const listFocusForegroundColor = theme.getColor(listFocusForeground);
    const listFocusBackgroundColor = theme.getColor(listFocusBackground);
    if (listFocusForegroundColor && listFocusBackgroundColor) {
        const whenForegroundColor = listFocusForegroundColor.transparent(.8).makeOpaque(listFocusBackgroundColor);
        collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row.focused .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
    }
    const listHoverForegroundColor = theme.getColor(listHoverForeground);
    const listHoverBackgroundColor = theme.getColor(listHoverBackground);
    if (listHoverForegroundColor && listHoverBackgroundColor) {
        const whenForegroundColor = listHoverForegroundColor.transparent(.8).makeOpaque(listHoverBackgroundColor);
        collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row:hover:not(.focused):not(.selected) .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ3NFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9wcmVmZXJlbmNlcy9icm93c2VyL2tleWJpbmRpbmdzRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLDREQUE0RDs7Ozs7Ozs7Ozs7QUFFNUQsT0FBTywrQkFBK0IsQ0FBQztBQUN2QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNwRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUNwRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDakcsT0FBTyxFQUFXLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDL0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlGLE9BQU8sRUFBMEIsNEJBQTRCLEVBQUUsTUFBTSxpRUFBaUUs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