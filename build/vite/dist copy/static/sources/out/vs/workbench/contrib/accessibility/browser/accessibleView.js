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
import { EventType, addDisposableListener, getActiveWindow, getWindow, isActiveElement } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { Schemas } from '../../../../base/common/network.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { AccessibilityHelpNLS } from '../../../../editor/common/standaloneStrings.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { FloatingEditorToolbar } from '../../../../editor/contrib/floatingMenu/browser/floatingMenu.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, ExtensionContentProvider, isIAccessibleViewContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX, IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { FloatingEditorClickMenu } from '../../../browser/codeeditor.js';
import { IChatCodeBlockContextProviderService } from '../../chat/browser/chat.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { accessibilityHelpIsShown, accessibleViewContainsCodeBlocks, accessibleViewCurrentProviderId, accessibleViewGoToSymbolSupported, accessibleViewHasAssignedKeybindings, accessibleViewHasUnassignedKeybindings, accessibleViewInCodeBlock, accessibleViewIsShown, accessibleViewOnLastLine, accessibleViewSupportsNavigation, accessibleViewVerbosityEnabled } from './accessibilityConfiguration.js';
import { resolveContentAndKeybindingItems } from './accessibleViewKeybindingResolver.js';
var DIMENSIONS;
(function (DIMENSIONS) {
    DIMENSIONS[DIMENSIONS["MAX_WIDTH"] = 900] = "MAX_WIDTH";
    DIMENSIONS[DIMENSIONS["WIDTH_RATIO"] = 0.75] = "WIDTH_RATIO";
    DIMENSIONS[DIMENSIONS["MAX_HEIGHT_RATIO"] = 0.6] = "MAX_HEIGHT_RATIO";
})(DIMENSIONS || (DIMENSIONS = {}));
let AccessibleView = class AccessibleView extends Disposable {
    get editorWidget() { return this._editorWidget; }
    constructor(_openerService, _instantiationService, _configurationService, _modelService, _contextViewService, _contextKeyService, _accessibilityService, _keybindingService, _layoutService, _menuService, _commandService, _codeBlockContextProviderService, _storageService, _quickInputService, _accessibilitySignalService) {
        super();
        this._openerService = _openerService;
        this._instantiationService = _instantiationService;
        this._configurationService = _configurationService;
        this._modelService = _modelService;
        this._contextViewService = _contextViewService;
        this._contextKeyService = _contextKeyService;
        this._accessibilityService = _accessibilityService;
        this._keybindingService = _keybindingService;
        this._layoutService = _layoutService;
        this._menuService = _menuService;
        this._commandService = _commandService;
        this._codeBlockContextProviderService = _codeBlockContextProviderService;
        this._storageService = _storageService;
        this._quickInputService = _quickInputService;
        this._accessibilitySignalService = _accessibilitySignalService;
        this._isInQuickPick = false;
        this._lastProviderPosition = new Map();
        this._accessiblityHelpIsShown = accessibilityHelpIsShown.bindTo(this._contextKeyService);
        this._accessibleViewIsShown = accessibleViewIsShown.bindTo(this._contextKeyService);
        this._accessibleViewSupportsNavigation = accessibleViewSupportsNavigation.bindTo(this._contextKeyService);
        this._accessibleViewVerbosityEnabled = accessibleViewVerbosityEnabled.bindTo(this._contextKeyService);
        this._accessibleViewGoToSymbolSupported = accessibleViewGoToSymbolSupported.bindTo(this._contextKeyService);
        this._accessibleViewCurrentProviderId = accessibleViewCurrentProviderId.bindTo(this._contextKeyService);
        this._accessibleViewInCodeBlock = accessibleViewInCodeBlock.bindTo(this._contextKeyService);
        this._accessibleViewContainsCodeBlocks = accessibleViewContainsCodeBlocks.bindTo(this._contextKeyService);
        this._onLastLine = accessibleViewOnLastLine.bindTo(this._contextKeyService);
        this._hasUnassignedKeybindings = accessibleViewHasUnassignedKeybindings.bindTo(this._contextKeyService);
        this._hasAssignedKeybindings = accessibleViewHasAssignedKeybindings.bindTo(this._contextKeyService);
        this._container = document.createElement('div');
        this._container.classList.add('accessible-view');
        if (this._configurationService.getValue("accessibility.hideAccessibleView" /* AccessibilityWorkbenchSettingId.HideAccessibleView */)) {
            this._container.classList.add('hide');
        }
        const codeEditorWidgetOptions = {
            contributions: EditorExtensionsRegistry.getEditorContributions()
                .filter(c => c.id !== CodeActionController.ID && c.id !== FloatingEditorClickMenu.ID && c.id !== FloatingEditorToolbar.ID)
        };
        const titleBar = document.createElement('div');
        titleBar.classList.add('accessible-view-title-bar');
        this._title = document.createElement('div');
        this._title.classList.add('accessible-view-title');
        titleBar.appendChild(this._title);
        const actionBar = document.createElement('div');
        actionBar.classList.add('accessible-view-action-bar');
        titleBar.appendChild(actionBar);
        this._container.appendChild(titleBar);
        this._toolbar = this._register(_instantiationService.createInstance(WorkbenchToolBar, actionBar, { orientation: 0 /* ActionsOrientation.HORIZONTAL */ }));
        this._toolbar.context = { viewId: 'accessibleView' };
        const toolbarElt = this._toolbar.getElement();
        toolbarElt.tabIndex = 0;
        const editorOptions = {
            ...getSimpleEditorOptions(this._configurationService),
            lineDecorationsWidth: 6,
            dragAndDrop: false,
            cursorWidth: 1,
            wordWrap: 'off',
            wrappingStrategy: 'advanced',
            wrappingIndent: 'none',
            padding: { top: 2, bottom: 2 },
            quickSuggestions: false,
            renderWhitespace: 'none',
            dropIntoEditor: { enabled: false },
            readOnly: true,
            fontFamily: 'var(--monaco-monospace-font)'
        };
        this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._container, editorOptions, codeEditorWidgetOptions));
        this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
            if (this._currentProvider && this._accessiblityHelpIsShown.get()) {
                this.show(this._currentProvider);
            }
        }));
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (isIAccessibleViewContentProvider(this._currentProvider) && e.affectsConfiguration(this._currentProvider.verbositySettingKey)) {
                if (this._accessiblityHelpIsShown.get()) {
                    this.show(this._currentProvider);
                }
                this._accessibleViewVerbosityEnabled.set(this._configurationService.getValue(this._currentProvider.verbositySettingKey));
                this._updateToolbar(this._currentProvider.actions, this._currentProvider.options.type);
            }
            if (e.affectsConfiguration("accessibility.hideAccessibleView" /* AccessibilityWorkbenchSettingId.HideAccessibleView */)) {
                this._container.classList.toggle('hide', this._configurationService.getValue("accessibility.hideAccessibleView" /* AccessibilityWorkbenchSettingId.HideAccessibleView */));
            }
        }));
        this._register(this._editorWidget.onDidDispose(() => this._resetContextKeys()));
        this._register(this._editorWidget.onDidChangeCursorPosition(() => {
            this._onLastLine.set(this._editorWidget.getPosition()?.lineNumber === this._editorWidget.getModel()?.getLineCount());
            const cursorPosition = this._editorWidget.getPosition()?.lineNumber;
            if (this._codeBlocks && cursorPosition !== undefined) {
                const inCodeBlock = this._codeBlocks.find(c => c.startLine <= cursorPosition && c.endLine >= cursorPosition) !== undefined;
                this._accessibleViewInCodeBlock.set(inCodeBlock);
            }
            this._playDiffSignals();
        }));
    }
    _playDiffSignals() {
        if (this._currentProvider?.id !== "diffEditor" /* AccessibleViewProviderId.DiffEditor */ && this._currentProvider?.id !== "inlineCompletions" /* AccessibleViewProviderId.InlineCompletions */) {
            return;
        }
        const position = this._editorWidget.getPosition();
        const model = this._editorWidget.getModel();
        if (!position || !model) {
            return undefined;
        }
        const lineContent = model.getLineContent(position.lineNumber);
        if (lineContent?.startsWith('+')) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted);
        }
        else if (lineContent?.startsWith('-')) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted);
        }
    }
    _resetContextKeys() {
        this._accessiblityHelpIsShown.reset();
        this._accessibleViewIsShown.reset();
        this._accessibleViewSupportsNavigation.reset();
        this._accessibleViewVerbosityEnabled.reset();
        this._accessibleViewGoToSymbolSupported.reset();
        this._accessibleViewCurrentProviderId.reset();
        this._hasAssignedKeybindings.reset();
        this._hasUnassignedKeybindings.reset();
    }
    getPosition(id) {
        if (!id || !this._lastProvider || this._lastProvider.id !== id) {
            return undefined;
        }
        return this._editorWidget.getPosition() || undefined;
    }
    setPosition(position, reveal, select) {
        this._editorWidget.setPosition(position);
        if (reveal) {
            this._editorWidget.revealPosition(position);
        }
        if (select) {
            const lineLength = this._editorWidget.getModel()?.getLineLength(position.lineNumber) ?? 0;
            if (lineLength) {
                this._editorWidget.setSelection({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: lineLength + 1 });
            }
        }
    }
    getCodeBlockContext() {
        const position = this._editorWidget.getPosition();
        if (!this._codeBlocks?.length || !position) {
            return;
        }
        const codeBlockIndex = this._codeBlocks?.findIndex(c => c.startLine <= position?.lineNumber && c.endLine >= position?.lineNumber);
        const codeBlock = codeBlockIndex !== undefined && codeBlockIndex > -1 ? this._codeBlocks[codeBlockIndex] : undefined;
        if (!codeBlock || codeBlockIndex === undefined) {
            return;
        }
        return { code: codeBlock.code, languageId: codeBlock.languageId, codeBlockIndex, element: undefined, chatSessionResource: codeBlock.chatSessionResource };
    }
    navigateToCodeBlock(type) {
        const position = this._editorWidget.getPosition();
        if (!this._codeBlocks?.length || !position) {
            return;
        }
        let codeBlock;
        const codeBlocks = this._codeBlocks.slice();
        if (type === 'previous') {
            codeBlock = codeBlocks.reverse().find(c => c.endLine < position.lineNumber);
        }
        else {
            codeBlock = codeBlocks.find(c => c.startLine > position.lineNumber);
        }
        if (!codeBlock) {
            return;
        }
        this.setPosition(new Position(codeBlock.startLine, 1), true);
    }
    showLastProvider(id) {
        if (!this._lastProvider || this._lastProvider.options.id !== id) {
            return;
        }
        this.show(this._lastProvider);
    }
    show(provider, symbol, showAccessibleViewHelp, position) {
        provider = provider ?? this._currentProvider;
        if (!provider) {
            return;
        }
        provider.onOpen?.();
        const delegate = {
            getAnchor: () => { return { x: (getActiveWindow().innerWidth / 2) - ((Math.min(this._layoutService.activeContainerDimension.width * 0.75 /* DIMENSIONS.WIDTH_RATIO */, 900 /* DIMENSIONS.MAX_WIDTH */)) / 2), y: this._layoutService.activeContainerOffset.quickPickTop }; },
            render: (container) => {
                this._viewContainer = container;
                this._viewContainer.classList.add('accessible-view-container');
                return this._render(provider, container, showAccessibleViewHelp);
            },
            onHide: () => {
                if (!showAccessibleViewHelp) {
                    this._updateLastProvider();
                    // Save cursor position before disposing so it can be restored on reopen
                    if (this._currentProvider) {
                        const currentPosition = this._editorWidget.getPosition();
                        if (currentPosition) {
                            this._lastProviderPosition.set(this._currentProvider.id, currentPosition);
                        }
                    }
                    this._currentProvider?.dispose();
                    this._currentProvider = undefined;
                    this._resetContextKeys();
                }
            }
        };
        this._contextViewService.showContextView(delegate);
        if (position) {
            // Context view takes time to show up, so we need to wait for it to show up before we can set the position
            queueMicrotask(() => {
                this._editorWidget.revealLine(position.lineNumber);
                this._editorWidget.setSelection({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column });
            });
        }
        if (symbol && this._currentProvider) {
            this.showSymbol(this._currentProvider, symbol);
        }
        if (provider instanceof AccessibleContentProvider && provider.onDidRequestClearLastProvider) {
            this._register(provider.onDidRequestClearLastProvider((id) => {
                if (this._lastProvider?.options.id === id) {
                    this._lastProvider = undefined;
                }
                this._lastProviderPosition.delete(id);
            }));
        }
        if (provider.options.id) {
            // only cache a provider with an ID so that it will eventually be cleared.
            this._lastProvider = provider;
        }
        if (provider.id === "panelChat" /* AccessibleViewProviderId.PanelChat */ || provider.id === "quickChat" /* AccessibleViewProviderId.QuickChat */) {
            this._register(this._codeBlockContextProviderService.registerProvider({ getCodeBlockContext: () => this.getCodeBlockContext() }, 'accessibleView'));
        }
        if (provider instanceof ExtensionContentProvider) {
            this._storageService.store(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${provider.id}`, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        }
        if (provider.onDidChangeContent) {
            this._register(provider.onDidChangeContent(() => {
                if (this._viewContainer) {
                    this._render(provider, this._viewContainer, showAccessibleViewHelp);
                }
            }));
        }
    }
    previous() {
        const newContent = this._currentProvider?.providePreviousContent?.();
        if (!this._currentProvider || !this._viewContainer || !newContent) {
            return;
        }
        this._render(this._currentProvider, this._viewContainer, undefined, newContent);
    }
    next() {
        const newContent = this._currentProvider?.provideNextContent?.();
        if (!this._currentProvider || !this._viewContainer || !newContent) {
            return;
        }
        this._render(this._currentProvider, this._viewContainer, undefined, newContent);
    }
    _verbosityEnabled() {
        if (!this._currentProvider) {
            return false;
        }
        return isIAccessibleViewContentProvider(this._currentProvider) ? this._configurationService.getValue(this._currentProvider.verbositySettingKey) === true : this._storageService.getBoolean(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${this._currentProvider.id}`, -1 /* StorageScope.APPLICATION */, false);
    }
    goToSymbol() {
        if (!this._currentProvider) {
            return;
        }
        this._isInQuickPick = true;
        this._instantiationService.createInstance(AccessibleViewSymbolQuickPick, this).show(this._currentProvider);
    }
    calculateCodeBlocks(markdown) {
        if (!markdown) {
            return;
        }
        if (this._currentProvider?.id !== "panelChat" /* AccessibleViewProviderId.PanelChat */ && this._currentProvider?.id !== "quickChat" /* AccessibleViewProviderId.QuickChat */) {
            return;
        }
        if (this._currentProvider.options.language && this._currentProvider.options.language !== 'markdown') {
            // Symbols haven't been provided and we cannot parse this language
            return;
        }
        const lines = markdown.split('\n');
        this._codeBlocks = [];
        let inBlock = false;
        let startLine = 0;
        let languageId;
        lines.forEach((line, i) => {
            if (!inBlock && line.startsWith('```')) {
                inBlock = true;
                startLine = i + 1;
                languageId = line.substring(3).trim();
            }
            else if (inBlock && line.endsWith('```')) {
                inBlock = false;
                const endLine = i;
                const code = lines.slice(startLine, endLine).join('\n');
                this._codeBlocks?.push({ startLine, endLine, code, languageId, chatSessionResource: undefined });
            }
        });
        this._accessibleViewContainsCodeBlocks.set(this._codeBlocks.length > 0);
    }
    getSymbols() {
        const provider = this._currentProvider ? this._currentProvider : undefined;
        if (!this._currentContent || !provider) {
            return;
        }
        const symbols = 'getSymbols' in provider ? provider.getSymbols?.() || [] : [];
        if (symbols?.length) {
            return symbols;
        }
        if (provider.options.language && provider.options.language !== 'markdown') {
            // Symbols haven't been provided and we cannot parse this language
            return;
        }
        const markdownTokens = marked.marked.lexer(this._currentContent);
        if (!markdownTokens) {
            return;
        }
        this._convertTokensToSymbols(markdownTokens, symbols);
        return symbols.length ? symbols : undefined;
    }
    openHelpLink() {
        if (!this._currentProvider?.options.readMoreUrl) {
            return;
        }
        this._openerService.open(URI.parse(this._currentProvider.options.readMoreUrl));
    }
    configureKeybindings(unassigned) {
        this._isInQuickPick = true;
        const provider = this._updateLastProvider();
        const items = unassigned ? provider?.options?.configureKeybindingItems : provider?.options?.configuredKeybindingItems;
        if (!items) {
            return;
        }
        const disposables = this._register(new DisposableStore());
        const quickPick = disposables.add(this._quickInputService.createQuickPick());
        quickPick.items = items;
        quickPick.title = localize('keybindings', 'Configure keybindings');
        quickPick.placeholder = localize('selectKeybinding', 'Select a command ID to configure a keybinding for it');
        quickPick.show();
        disposables.add(quickPick.onDidAccept(async () => {
            const item = quickPick.selectedItems[0];
            if (item) {
                await this._commandService.executeCommand('workbench.action.openGlobalKeybindings', item.id);
            }
            quickPick.dispose();
        }));
        disposables.add(quickPick.onDidHide(() => {
            if (!quickPick.selectedItems.length && provider) {
                this.show(provider);
            }
            disposables.dispose();
            this._isInQuickPick = false;
        }));
    }
    _convertTokensToSymbols(tokens, symbols) {
        let firstListItem;
        for (const token of tokens) {
            let label = undefined;
            if ('type' in token) {
                switch (token.type) {
                    case 'heading':
                    case 'paragraph':
                    case 'code':
                        label = token.text;
                        break;
                    case 'list': {
                        const firstItem = token.items[0];
                        if (!firstItem) {
                            break;
                        }
                        firstListItem = `- ${firstItem.text}`;
                        label = token.items.map(i => i.text).join(', ');
                        break;
                    }
                }
            }
            if (label) {
                symbols.push({ markdownToParse: label, label: localize('symbolLabel', "({0}) {1}", token.type, label), ariaLabel: localize('symbolLabelAria', "({0}) {1}", token.type, label), firstListItem });
                firstListItem = undefined;
            }
        }
    }
    showSymbol(provider, symbol) {
        if (!this._currentContent) {
            return;
        }
        let lineNumber = symbol.lineNumber;
        const markdownToParse = symbol.markdownToParse;
        if (lineNumber === undefined && markdownToParse === undefined) {
            // No symbols provided and we cannot parse this language
            return;
        }
        if (lineNumber === undefined && markdownToParse) {
            // Note that this scales poorly, thus isn't used for worst case scenarios like the terminal, for which a line number will always be provided.
            // Parse the markdown to find the line number
            const index = this._currentContent.split('\n').findIndex(line => line.includes(markdownToParse.split('\n')[0]) || (symbol.firstListItem && line.includes(symbol.firstListItem))) ?? -1;
            if (index >= 0) {
                lineNumber = index + 1;
            }
        }
        if (lineNumber === undefined) {
            return;
        }
        this._isInQuickPick = false;
        this.show(provider, undefined, undefined, { lineNumber, column: 1 });
        this._updateContextKeys(provider, true);
    }
    disableHint() {
        if (!isIAccessibleViewContentProvider(this._currentProvider)) {
            return;
        }
        this._configurationService.updateValue(this._currentProvider?.verbositySettingKey, false);
        alert(localize('disableAccessibilityHelp', '{0} accessibility verbosity is now disabled', this._currentProvider.verbositySettingKey));
    }
    _updateContextKeys(provider, shown) {
        if (provider.options.type === "help" /* AccessibleViewType.Help */) {
            this._accessiblityHelpIsShown.set(shown);
            this._accessibleViewIsShown.reset();
        }
        else {
            this._accessibleViewIsShown.set(shown);
            this._accessiblityHelpIsShown.reset();
        }
        this._accessibleViewSupportsNavigation.set(provider.provideNextContent !== undefined || provider.providePreviousContent !== undefined);
        this._accessibleViewVerbosityEnabled.set(this._verbosityEnabled());
        this._accessibleViewGoToSymbolSupported.set(this._goToSymbolsSupported() ? this.getSymbols()?.length > 0 : false);
    }
    _getStableUri(providerId) {
        return URI.from({ path: `accessible-view-${providerId}`, scheme: Schemas.accessibleView });
    }
    _updateContent(provider, updatedContent) {
        let content = updatedContent ?? provider.provideContent();
        if (provider.options.type === "view" /* AccessibleViewType.View */) {
            this._currentContent = content;
            this._hasUnassignedKeybindings.reset();
            this._hasAssignedKeybindings.reset();
            return;
        }
        const readMoreLinkHint = this._readMoreHint(provider);
        const disableHelpHint = this._disableVerbosityHint(provider);
        const screenReaderModeHint = this._screenReaderModeHint(provider);
        const exitThisDialogHint = this._exitDialogHint(provider);
        let configureKbHint = '';
        let configureAssignedKbHint = '';
        const resolvedContent = resolveContentAndKeybindingItems(this._keybindingService, screenReaderModeHint + content + readMoreLinkHint + disableHelpHint + exitThisDialogHint);
        if (resolvedContent) {
            content = resolvedContent.content.value;
            if (resolvedContent.configureKeybindingItems) {
                provider.options.configureKeybindingItems = resolvedContent.configureKeybindingItems;
                this._hasUnassignedKeybindings.set(true);
                configureKbHint = this._configureUnassignedKbHint();
            }
            else {
                this._hasAssignedKeybindings.reset();
            }
            if (resolvedContent.configuredKeybindingItems) {
                provider.options.configuredKeybindingItems = resolvedContent.configuredKeybindingItems;
                this._hasAssignedKeybindings.set(true);
                configureAssignedKbHint = this._configureAssignedKbHint();
            }
            else {
                this._hasAssignedKeybindings.reset();
            }
        }
        this._currentContent = content + configureKbHint + configureAssignedKbHint;
    }
    _render(provider, container, showAccessibleViewHelp, updatedContent) {
        const isSameProvider = this._currentProvider?.id === provider.id;
        const previousPosition = isSameProvider ? this._editorWidget.getPosition() : undefined;
        this._currentProvider = provider;
        this._accessibleViewCurrentProviderId.set(provider.id);
        const verbose = this._verbosityEnabled();
        this._updateContent(provider, updatedContent);
        this.calculateCodeBlocks(this._currentContent);
        this._updateContextKeys(provider, true);
        const widgetIsFocused = this._editorWidget.hasTextFocus() || this._editorWidget.hasWidgetFocus();
        const stableUri = this._getStableUri(provider.id);
        this._getTextModel(stableUri).then((model) => {
            if (!model) {
                return;
            }
            // Update the content of the existing model instead of creating a new one
            // This preserves the cursor position when content changes
            const currentContent = this._currentContent ?? '';
            if (model.getValue() !== currentContent) {
                model.setValue(currentContent);
            }
            if (this._editorWidget.getModel() !== model) {
                this._editorWidget.setModel(model);
            }
            const domNode = this._editorWidget.getDomNode();
            if (!domNode) {
                return;
            }
            model.setLanguage(provider.options.language ?? 'markdown');
            container.appendChild(this._container);
            let actionsHint = '';
            const hasActions = this._accessibleViewSupportsNavigation.get() || this._accessibleViewVerbosityEnabled.get() || this._accessibleViewGoToSymbolSupported.get() || provider.actions?.length;
            if (verbose && !showAccessibleViewHelp && hasActions) {
                actionsHint = provider.options.position ? localize('ariaAccessibleViewActionsBottom', 'Explore actions such as disabling this hint (Shift+Tab), use Escape to exit this dialog.') : localize('ariaAccessibleViewActions', 'Explore actions such as disabling this hint (Shift+Tab).');
            }
            let ariaLabel = provider.options.type === "help" /* AccessibleViewType.Help */ ? localize('accessibility-help', "Accessibility Help") : localize('accessible-view', "Accessible View");
            this._title.textContent = ariaLabel;
            if (actionsHint && provider.options.type === "view" /* AccessibleViewType.View */) {
                ariaLabel = localize('accessible-view-hint', "Accessible View, {0}", actionsHint);
            }
            else if (actionsHint) {
                ariaLabel = localize('accessibility-help-hint', "Accessibility Help, {0}", actionsHint);
            }
            if (isWindows && widgetIsFocused) {
                // prevent the screen reader on windows from reading
                // the aria label again when it's refocused
                ariaLabel = '';
            }
            this._editorWidget.updateOptions({ ariaLabel });
            this._editorWidget.focus();
            if (this._currentProvider?.options.position) {
                const position = this._editorWidget.getPosition();
                const isDefaultPosition = position?.lineNumber === 1 && position.column === 1;
                if (this._currentProvider.options.position === 'bottom' || this._currentProvider.options.position === 'initial-bottom' && isDefaultPosition) {
                    const lastLine = this.editorWidget.getModel()?.getLineCount();
                    const position = lastLine !== undefined && lastLine > 0 ? new Position(lastLine, 1) : undefined;
                    if (position) {
                        this._editorWidget.setPosition(position);
                        this._editorWidget.revealLine(position.lineNumber);
                    }
                }
            }
            else if (previousPosition) {
                this._editorWidget.setPosition(previousPosition);
            }
            else {
                // Restore the saved position for this provider if available (e.g., after close and reopen)
                const savedPosition = this._lastProviderPosition.get(provider.id);
                if (savedPosition) {
                    const lineCount = this._editorWidget.getModel()?.getLineCount() ?? 0;
                    // Only restore if the saved position is still valid within the current content
                    if (savedPosition.lineNumber <= lineCount) {
                        this._editorWidget.setPosition(savedPosition);
                        this._editorWidget.revealPosition(savedPosition);
                    }
                }
            }
        });
        this._updateToolbar(this._currentProvider.actions, provider.options.type);
        const hide = (e) => {
            const thisWindowIsFocused = getWindow(this._editorWidget.getDomNode()).document.hasFocus();
            if (!thisWindowIsFocused) {
                // When switching windows, keep accessible view open
                e?.preventDefault();
                e?.stopPropagation();
                return;
            }
            if (!this._isInQuickPick) {
                provider.onClose();
            }
            e?.stopPropagation();
            this._contextViewService.hideContextView();
            if (this._isInQuickPick) {
                return;
            }
            this._updateContextKeys(provider, false);
            // Save the cursor position for this provider so it can be restored on reopen
            const currentPosition = this._editorWidget.getPosition();
            if (currentPosition) {
                this._lastProviderPosition.set(provider.id, currentPosition);
            }
            this._lastProvider = undefined;
            this._currentContent = undefined;
            this._currentProvider?.dispose();
            this._currentProvider = undefined;
        };
        const disposableStore = new DisposableStore();
        disposableStore.add(this._editorWidget.onKeyDown((e) => {
            if (e.keyCode === 3 /* KeyCode.Enter */) {
                this._commandService.executeCommand('editor.action.openLink');
            }
            else if (e.keyCode === 9 /* KeyCode.Escape */ || shouldHide(e.browserEvent, this._keybindingService, this._configurationService)) {
                hide(e);
            }
            else if (e.keyCode === 38 /* KeyCode.KeyH */ && provider.options.readMoreUrl) {
                const url = provider.options.readMoreUrl;
                alert(AccessibilityHelpNLS.openingDocs);
                this._openerService.open(URI.parse(url));
                e.preventDefault();
                e.stopPropagation();
            }
            if (provider instanceof AccessibleContentProvider) {
                provider.onKeyDown?.(e);
            }
        }));
        disposableStore.add(addDisposableListener(this._toolbar.getElement(), EventType.KEY_DOWN, (e) => {
            const keyboardEvent = new StandardKeyboardEvent(e);
            if (keyboardEvent.equals(9 /* KeyCode.Escape */)) {
                hide(e);
            }
        }));
        disposableStore.add(this._editorWidget.onDidBlurEditorWidget(() => {
            if (!isActiveElement(this._toolbar.getElement())) {
                hide();
            }
        }));
        disposableStore.add(this._editorWidget.onDidContentSizeChange(() => this._layout()));
        disposableStore.add(this._layoutService.onDidLayoutActiveContainer(() => this._layout()));
        return disposableStore;
    }
    _updateToolbar(providedActions, type) {
        this._toolbar.setAriaLabel(type === "help" /* AccessibleViewType.Help */ ? localize('accessibleHelpToolbar', 'Accessibility Help') : localize('accessibleViewToolbar', "Accessible View"));
        const toolbarMenu = this._register(this._menuService.createMenu(MenuId.AccessibleView, this._contextKeyService));
        const menuActions = getFlatActionBarActions(toolbarMenu.getActions({}));
        if (providedActions) {
            for (const providedAction of providedActions) {
                providedAction.class = providedAction.class || ThemeIcon.asClassName(Codicon.primitiveSquare);
                providedAction.checked = undefined;
            }
            this._toolbar.setActions([...providedActions, ...menuActions]);
        }
        else {
            this._toolbar.setActions(menuActions);
        }
    }
    _layout() {
        const dimension = this._layoutService.activeContainerDimension;
        const maxHeight = dimension.height && dimension.height * 0.6 /* DIMENSIONS.MAX_HEIGHT_RATIO */;
        const height = Math.min(maxHeight, this._editorWidget.getContentHeight());
        const width = Math.min(dimension.width * 0.75 /* DIMENSIONS.WIDTH_RATIO */, 900 /* DIMENSIONS.MAX_WIDTH */);
        this._editorWidget.layout({ width, height });
    }
    async _getTextModel(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing && !existing.isDisposed()) {
            return existing;
        }
        // Create an empty model - content will be set via setValue() to preserve cursor position
        return this._modelService.createModel('', null, resource, false);
    }
    _goToSymbolsSupported() {
        if (!this._currentProvider) {
            return false;
        }
        return this._currentProvider.options.type === "help" /* AccessibleViewType.Help */ || this._currentProvider.options.language === 'markdown' || this._currentProvider.options.language === undefined || (this._currentProvider instanceof AccessibleContentProvider && !!this._currentProvider.getSymbols?.());
    }
    _updateLastProvider() {
        const provider = this._currentProvider;
        if (!provider) {
            return;
        }
        const lastProvider = provider instanceof AccessibleContentProvider ? new AccessibleContentProvider(provider.id, provider.options, provider.provideContent.bind(provider), provider.onClose.bind(provider), provider.verbositySettingKey, provider.onOpen?.bind(provider), provider.actions, provider.provideNextContent?.bind(provider), provider.providePreviousContent?.bind(provider), provider.onDidChangeContent?.bind(provider), provider.onKeyDown?.bind(provider), provider.getSymbols?.bind(provider)) : new ExtensionContentProvider(provider.id, provider.options, provider.provideContent.bind(provider), provider.onClose.bind(provider), provider.onOpen?.bind(provider), provider.provideNextContent?.bind(provider), provider.providePreviousContent?.bind(provider), provider.actions, provider.onDidChangeContent?.bind(provider));
        return lastProvider;
    }
    showAccessibleViewHelp() {
        const lastProvider = this._updateLastProvider();
        if (!lastProvider) {
            return;
        }
        let accessibleViewHelpProvider;
        if (lastProvider instanceof AccessibleContentProvider) {
            accessibleViewHelpProvider = new AccessibleContentProvider(lastProvider.id, { type: "help" /* AccessibleViewType.Help */ }, () => lastProvider.options.customHelp ? lastProvider?.options.customHelp() : this._accessibleViewHelpDialogContent(this._goToSymbolsSupported()), () => {
                this._contextViewService.hideContextView();
                // HACK: Delay to allow the context view to hide #207638
                queueMicrotask(() => this.show(lastProvider));
            }, lastProvider.verbositySettingKey);
        }
        else {
            accessibleViewHelpProvider = new ExtensionContentProvider(lastProvider.id, { type: "help" /* AccessibleViewType.Help */ }, () => lastProvider.options.customHelp ? lastProvider?.options.customHelp() : this._accessibleViewHelpDialogContent(this._goToSymbolsSupported()), () => {
                this._contextViewService.hideContextView();
                // HACK: Delay to allow the context view to hide #207638
                queueMicrotask(() => this.show(lastProvider));
            });
        }
        this._contextViewService.hideContextView();
        // HACK: Delay to allow the context view to hide #186514
        if (accessibleViewHelpProvider) {
            queueMicrotask(() => this.show(accessibleViewHelpProvider, undefined, true));
        }
    }
    _accessibleViewHelpDialogContent(providerHasSymbols) {
        const navigationHint = this._navigationHint();
        const goToSymbolHint = this._goToSymbolHint(providerHasSymbols);
        const toolbarHint = localize('toolbar', "Navigate to the toolbar (Shift+Tab).");
        const chatHints = this._getChatHints();
        let hint = localize('intro', "In the accessible view, you can:\n");
        if (navigationHint) {
            hint += ' - ' + navigationHint + '\n';
        }
        if (goToSymbolHint) {
            hint += ' - ' + goToSymbolHint + '\n';
        }
        if (toolbarHint) {
            hint += ' - ' + toolbarHint + '\n';
        }
        if (chatHints) {
            hint += chatHints;
        }
        return hint;
    }
    _getChatHints() {
        if (this._currentProvider?.id !== "panelChat" /* AccessibleViewProviderId.PanelChat */ && this._currentProvider?.id !== "quickChat" /* AccessibleViewProviderId.QuickChat */) {
            return;
        }
        return [localize('insertAtCursor', " - Insert the code block at the cursor{0}.", '<keybinding:workbench.action.chat.insertCodeBlock>'),
            localize('insertIntoNewFile', " - Insert the code block into a new file{0}.", '<keybinding:workbench.action.chat.insertIntoNewFile>'),
            localize('runInTerminal', " - Run the code block in the terminal{0}.\n", '<keybinding:workbench.action.chat.runInTerminal>')].join('\n');
    }
    _navigationHint() {
        return localize('accessibleViewNextPreviousHint', "Show the next item{0} or previous item{1}.", `<keybinding:${"editor.action.accessibleViewNext" /* AccessibilityCommandId.ShowNext */}>`, `<keybinding:${"editor.action.accessibleViewPrevious" /* AccessibilityCommandId.ShowPrevious */}>`);
    }
    _disableVerbosityHint(provider) {
        if (provider.options.type === "help" /* AccessibleViewType.Help */ && this._verbosityEnabled()) {
            return localize('acessibleViewDisableHint', "\nDisable accessibility verbosity for this feature{0}.", `<keybinding:${"editor.action.accessibleViewDisableHint" /* AccessibilityCommandId.DisableVerbosityHint */}>`);
        }
        return '';
    }
    _goToSymbolHint(providerHasSymbols) {
        if (!providerHasSymbols) {
            return;
        }
        return localize('goToSymbolHint', 'Go to a symbol{0}.', `<keybinding:${"editor.action.accessibleViewGoToSymbol" /* AccessibilityCommandId.GoToSymbol */}>`);
    }
    _configureUnassignedKbHint() {
        const configureKb = this._keybindingService.lookupKeybinding("editor.action.accessibilityHelpConfigureKeybindings" /* AccessibilityCommandId.AccessibilityHelpConfigureKeybindings */)?.getAriaLabel();
        const keybindingToConfigureQuickPick = configureKb ? '(' + configureKb + ')' : 'by assigning a keybinding to the command Accessibility Help Configure Unassigned Keybindings.';
        return localize('configureKb', '\nConfigure keybindings for commands that lack them {0}.', keybindingToConfigureQuickPick);
    }
    _configureAssignedKbHint() {
        const configureKb = this._keybindingService.lookupKeybinding("editor.action.accessibilityHelpConfigureAssignedKeybindings" /* AccessibilityCommandId.AccessibilityHelpConfigureAssignedKeybindings */)?.getAriaLabel();
        const keybindingToConfigureQuickPick = configureKb ? '(' + configureKb + ')' : 'by assigning a keybinding to the command Accessibility Help Configure Assigned Keybindings.';
        return localize('configureKbAssigned', '\nConfigure keybindings for commands that already have assignments {0}.', keybindingToConfigureQuickPick);
    }
    _screenReaderModeHint(provider) {
        const accessibilitySupport = this._accessibilityService.isScreenReaderOptimized();
        let screenReaderModeHint = '';
        const turnOnMessage = (isMacintosh
            ? AccessibilityHelpNLS.changeConfigToOnMac
            : AccessibilityHelpNLS.changeConfigToOnWinLinux);
        if (accessibilitySupport && provider.id === "editor" /* AccessibleViewProviderId.Editor */) {
            screenReaderModeHint = AccessibilityHelpNLS.auto_on;
            screenReaderModeHint += '\n';
        }
        else if (!accessibilitySupport) {
            screenReaderModeHint = AccessibilityHelpNLS.auto_off + '\n' + turnOnMessage;
            screenReaderModeHint += '\n';
        }
        return screenReaderModeHint;
    }
    _exitDialogHint(provider) {
        return this._verbosityEnabled() && !provider.options.position ? localize('exit', '\nExit this dialog (Escape).') : '';
    }
    _readMoreHint(provider) {
        return provider.options.readMoreUrl ? localize("openDoc", "\nOpen a browser window with more information related to accessibility{0}.", `<keybinding:${"editor.action.accessibilityHelpOpenHelpLink" /* AccessibilityCommandId.AccessibilityHelpOpenHelpLink */}>`) : '';
    }
};
AccessibleView = __decorate([
    __param(0, IOpenerService),
    __param(1, IInstantiationService),
    __param(2, IConfigurationService),
    __param(3, IModelService),
    __param(4, IContextViewService),
    __param(5, IContextKeyService),
    __param(6, IAccessibilityService),
    __param(7, IKeybindingService),
    __param(8, ILayoutService),
    __param(9, IMenuService),
    __param(10, ICommandService),
    __param(11, IChatCodeBlockContextProviderService),
    __param(12, IStorageService),
    __param(13, IQuickInputService),
    __param(14, IAccessibilitySignalService)
], AccessibleView);
export { AccessibleView };
let AccessibleViewService = class AccessibleViewService extends Disposable {
    constructor(_instantiationService, _configurationService, _keybindingService) {
        super();
        this._instantiationService = _instantiationService;
        this._configurationService = _configurationService;
        this._keybindingService = _keybindingService;
    }
    show(provider, position) {
        if (!this._accessibleView) {
            this._accessibleView = this._register(this._instantiationService.createInstance(AccessibleView));
        }
        this._accessibleView.show(provider, undefined, undefined, position);
    }
    configureKeybindings(unassigned) {
        this._accessibleView?.configureKeybindings(unassigned);
    }
    openHelpLink() {
        this._accessibleView?.openHelpLink();
    }
    showLastProvider(id) {
        this._accessibleView?.showLastProvider(id);
    }
    next() {
        this._accessibleView?.next();
    }
    previous() {
        this._accessibleView?.previous();
    }
    goToSymbol() {
        this._accessibleView?.goToSymbol();
    }
    getOpenAriaHint(verbositySettingKey) {
        if (!this._configurationService.getValue(verbositySettingKey)) {
            return null;
        }
        const keybinding = this._keybindingService.lookupKeybinding("editor.action.accessibleView" /* AccessibilityCommandId.OpenAccessibleView */)?.getAriaLabel();
        let hint = null;
        if (keybinding) {
            hint = localize('acessibleViewHint', "Inspect this in the accessible view with {0}", keybinding);
        }
        else {
            hint = localize('acessibleViewHintNoKbEither', "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.");
        }
        return hint;
    }
    disableHint() {
        this._accessibleView?.disableHint();
    }
    showAccessibleViewHelp() {
        this._accessibleView?.showAccessibleViewHelp();
    }
    getPosition(id) {
        return this._accessibleView?.getPosition(id) ?? undefined;
    }
    getLastPosition() {
        const lastLine = this._accessibleView?.editorWidget.getModel()?.getLineCount();
        return lastLine !== undefined && lastLine > 0 ? new Position(lastLine, 1) : undefined;
    }
    setPosition(position, reveal, select) {
        this._accessibleView?.setPosition(position, reveal, select);
    }
    getCodeBlockContext() {
        return this._accessibleView?.getCodeBlockContext();
    }
    navigateToCodeBlock(type) {
        this._accessibleView?.navigateToCodeBlock(type);
    }
};
AccessibleViewService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IConfigurationService),
    __param(2, IKeybindingService)
], AccessibleViewService);
export { AccessibleViewService };
let AccessibleViewSymbolQuickPick = class AccessibleViewSymbolQuickPick {
    constructor(_accessibleView, _quickInputService) {
        this._accessibleView = _accessibleView;
        this._quickInputService = _quickInputService;
    }
    show(provider) {
        const disposables = new DisposableStore();
        const quickPick = disposables.add(this._quickInputService.createQuickPick());
        quickPick.placeholder = localize('accessibleViewSymbolQuickPickPlaceholder', "Type to search symbols");
        quickPick.title = localize('accessibleViewSymbolQuickPickTitle', "Go to Symbol Accessible View");
        const picks = [];
        const symbols = this._accessibleView.getSymbols();
        if (!symbols) {
            return;
        }
        for (const symbol of symbols) {
            picks.push({
                label: symbol.label,
                ariaLabel: symbol.ariaLabel,
                firstListItem: symbol.firstListItem,
                lineNumber: symbol.lineNumber,
                endLineNumber: symbol.endLineNumber,
                markdownToParse: symbol.markdownToParse
            });
        }
        quickPick.canSelectMany = false;
        quickPick.items = picks;
        quickPick.show();
        disposables.add(quickPick.onDidAccept(() => {
            this._accessibleView.showSymbol(provider, quickPick.selectedItems[0]);
            quickPick.hide();
        }));
        disposables.add(quickPick.onDidHide(() => {
            if (quickPick.selectedItems.length === 0) {
                // this was escaped, so refocus the accessible view
                this._accessibleView.show(provider);
            }
            disposables.dispose();
        }));
    }
};
AccessibleViewSymbolQuickPick = __decorate([
    __param(1, IQuickInputService)
], AccessibleViewSymbolQuickPick);
function shouldHide(event, keybindingService, configurationService) {
    if (!configurationService.getValue("accessibility.accessibleView.closeOnKeyPress" /* AccessibilityWorkbenchSettingId.AccessibleViewCloseOnKeyPress */)) {
        return false;
    }
    const standardKeyboardEvent = new StandardKeyboardEvent(event);
    const resolveResult = keybindingService.softDispatch(standardKeyboardEvent, standardKeyboardEvent.target);
    const isValidChord = resolveResult.kind === 1 /* ResultKind.MoreChordsNeeded */;
    if (keybindingService.inChordMode || isValidChord) {
        return false;
    }
    return shouldHandleKey(event) && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}
function shouldHandleKey(event) {
    return !!event.code.match(/^(Key[A-Z]|Digit[0-9]|Equal|Comma|Period|Slash|Quote|Backquote|Backslash|Minus|Semicolon|Space|Enter)$/);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjZXNzaWJsZVZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxlQUFlLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2hJLE9BQU8sRUFBa0IscUJBQXFCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUVsRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTlELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBNEIsTUFBTSxrRUFBa0UsQ0FBQztBQUM5SCxPQUFPLEVBQWEsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFakYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTVFLE9BQU8sRUFBRSxv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