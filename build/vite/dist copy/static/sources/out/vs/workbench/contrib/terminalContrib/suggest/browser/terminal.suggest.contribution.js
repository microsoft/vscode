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
var TerminalSuggestContribution_1, TerminalSuggestProvidersConfigurationManager_1;
import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable, Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { registerActiveInstanceAction, registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { terminalSuggestConfigSection, registerTerminalSuggestProvidersConfiguration } from '../common/terminalSuggestConfiguration.js';
import { ITerminalCompletionService, TerminalCompletionService } from './terminalCompletionService.js';
import { ITerminalContributionService } from '../../../terminal/common/terminalExtensionPoints.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { SuggestAddon } from './terminalSuggestAddon.js';
import { TerminalClipboardContribution } from '../../clipboard/browser/terminal.clipboard.contribution.js';
import { SimpleSuggestContext } from '../../../../services/suggest/browser/simpleSuggestWidget.js';
import { SuggestDetailsClassName } from '../../../../services/suggest/browser/simpleSuggestWidgetDetails.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import './terminalSymbolIcons.js';
import { LspCompletionProviderAddon } from './lspCompletionProviderAddon.js';
import { createTerminalLanguageVirtualUri, LspTerminalModelContentProvider } from './lspTerminalModelContentProvider.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { getTerminalLspSupportedLanguageObj } from './lspTerminalUtil.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { Codicon } from '../../../../../base/common/codicons.js';
registerSingleton(ITerminalCompletionService, TerminalCompletionService, 1 /* InstantiationType.Delayed */);
// #region Terminal Contributions
let TerminalSuggestContribution = class TerminalSuggestContribution extends DisposableStore {
    static { TerminalSuggestContribution_1 = this; }
    static { this.ID = 'terminal.suggest'; }
    static get(instance) {
        return instance.getContribution(TerminalSuggestContribution_1.ID);
    }
    get addon() { return this._addon.value; }
    get lspAddons() { return Array.from(this._lspAddons.values()); }
    constructor(_ctx, _contextKeyService, _configurationService, _instantiationService, _terminalCompletionService, _textModelService, _languageFeaturesService) {
        super();
        this._ctx = _ctx;
        this._contextKeyService = _contextKeyService;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._terminalCompletionService = _terminalCompletionService;
        this._textModelService = _textModelService;
        this._languageFeaturesService = _languageFeaturesService;
        this._addon = new MutableDisposable();
        this._lspAddons = this.add(new DisposableMap());
        this._lspModelProvider = new MutableDisposable();
        this.add(toDisposable(() => {
            this._addon?.dispose();
            this._lspModelProvider?.value?.dispose();
            this._lspModelProvider?.dispose();
        }));
        this._terminalSuggestWidgetVisibleContextKey = TerminalContextKeys.suggestWidgetVisible.bindTo(this._contextKeyService);
        this.add(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.suggest.enabled" /* TerminalSuggestSettingId.Enabled */)) {
                const completionsEnabled = this._configurationService.getValue(terminalSuggestConfigSection).enabled;
                if (!completionsEnabled) {
                    this._addon.clear();
                    this._lspAddons.clearAndDisposeAll();
                }
                const xtermRaw = this._ctx.instance.xterm?.raw;
                if (!!xtermRaw && completionsEnabled) {
                    this._loadAddons(xtermRaw);
                }
            }
        }));
        // Initialize the dynamic providers configuration manager
        TerminalSuggestProvidersConfigurationManager.initialize(this._instantiationService);
        // Listen for terminal location changes to update the suggest widget container
        this.add(this._ctx.instance.onDidChangeTarget((target) => {
            this._updateContainerForTarget(target);
        }));
        // The terminal view can be reparented (for example when moved into a new view). Ensure the
        // suggest widget follows the terminal's DOM when focus returns to the instance.
        this.add(this._ctx.instance.onDidFocus(() => {
            const xtermRaw = this._ctx.instance.xterm?.raw;
            if (xtermRaw) {
                this._prepareAddonLayout(xtermRaw);
            }
        }));
    }
    xtermOpen(xterm) {
        const config = this._configurationService.getValue(terminalSuggestConfigSection);
        const enabled = config.enabled;
        if (!enabled) {
            return;
        }
        this._loadAddons(xterm.raw);
        this.add(Event.runAndSubscribe(this._ctx.instance.onDidChangeShellType, async () => {
            this._refreshAddons();
            this._lspModelProvider.value?.shellTypeChanged(this._ctx.instance.shellType);
        }));
    }
    async _loadLspCompletionAddon(xterm) {
        let lspTerminalObj = undefined;
        // TODO: Change to always load after settings update for terminal suggest provider
        if (!this._ctx.instance.shellType || !(lspTerminalObj = getTerminalLspSupportedLanguageObj(this._ctx.instance.shellType))) {
            this._lspAddons.clearAndDisposeAll();
            return;
        }
        const virtualTerminalDocumentUri = createTerminalLanguageVirtualUri(this._ctx.instance.instanceId, lspTerminalObj.extension);
        // Load and register the LSP completion providers (one per language server)
        this._lspModelProvider.value = this._instantiationService.createInstance(LspTerminalModelContentProvider, this._ctx.instance.capabilities, this._ctx.instance.instanceId, virtualTerminalDocumentUri, this._ctx.instance.shellType);
        this.add(this._lspModelProvider.value);
        const textVirtualModel = await this._textModelService.createModelReference(virtualTerminalDocumentUri);
        this.add(textVirtualModel);
        const virtualProviders = this._languageFeaturesService.completionProvider.all(textVirtualModel.object.textEditorModel);
        const filteredProviders = virtualProviders.filter(p => p._debugDisplayName !== 'wordbasedCompletions');
        // Iterate through all available providers
        for (const provider of filteredProviders) {
            const lspCompletionProviderAddon = this._instantiationService.createInstance(LspCompletionProviderAddon, provider, textVirtualModel, this._lspModelProvider.value);
            this._lspAddons.set(provider._debugDisplayName, lspCompletionProviderAddon);
            xterm.loadAddon(lspCompletionProviderAddon);
            this.add(this._terminalCompletionService.registerTerminalCompletionProvider('lsp', lspCompletionProviderAddon.id, lspCompletionProviderAddon, ...(lspCompletionProviderAddon.triggerCharacters ?? [])));
        }
    }
    _loadAddons(xterm) {
        // Don't re-create the addon
        if (this._addon.value) {
            return;
        }
        const addon = this._addon.value = this._instantiationService.createInstance(SuggestAddon, this._ctx.instance.sessionId, this._ctx.instance.shellType, this._ctx.instance.capabilities, this._terminalSuggestWidgetVisibleContextKey);
        xterm.loadAddon(addon);
        this._loadLspCompletionAddon(xterm);
        this._prepareAddonLayout(xterm);
        this.add(dom.addDisposableListener(this._ctx.instance.domElement, dom.EventType.FOCUS_OUT, (e) => {
            const focusedElement = e.relatedTarget;
            if (focusedElement?.classList.contains(SuggestDetailsClassName)) {
                // Don't hide the suggest widget if the focus is moving to the details
                return;
            }
            addon.hideSuggestWidget(true);
        }));
        this.add(addon.onAcceptedCompletion(async (text) => {
            this._ctx.instance.focus();
            this._ctx.instance.sendText(text, false);
        }));
        const clipboardContrib = TerminalClipboardContribution.get(this._ctx.instance);
        this.add(clipboardContrib.onWillPaste(() => addon.isPasting = true));
        this.add(clipboardContrib.onDidPaste(() => {
            // Delay this slightly as synchronizing the prompt input is debounced
            setTimeout(() => addon.isPasting = false, 100);
        }));
        if (!isWindows) {
            let barrier;
            this.add(addon.onDidReceiveCompletions(() => {
                barrier?.open();
                barrier = undefined;
            }));
        }
    }
    _refreshAddons() {
        const addon = this._addon.value;
        if (!addon) {
            return;
        }
        addon.shellType = this._ctx.instance.shellType;
        if (!this._ctx.instance.xterm?.raw) {
            return;
        }
        // Relies on shell type being set
        this._loadLspCompletionAddon(this._ctx.instance.xterm.raw);
    }
    _updateContainerForTarget(target) {
        const addon = this._addon.value;
        if (!addon || !this._ctx.instance.xterm?.raw) {
            return;
        }
        this._prepareAddonLayout(this._ctx.instance.xterm.raw);
    }
    async _prepareAddonLayout(xterm) {
        const addon = this._addon.value;
        if (!addon || this.isDisposed) {
            return;
        }
        const xtermElement = xterm.element ?? await this._waitForXtermElement(xterm);
        if (!xtermElement || this.isDisposed || addon !== this._addon.value) {
            return;
        }
        const container = this._resolveAddonContainer(xtermElement);
        addon.setContainerWithOverflow(container);
        // eslint-disable-next-line no-restricted-syntax
        const screenElement = xtermElement?.querySelector('.xterm-screen');
        if (dom.isHTMLElement(screenElement)) {
            addon.setScreen(screenElement);
        }
    }
    async _waitForXtermElement(xterm) {
        if (xterm.element) {
            return xterm.element;
        }
        await Promise.race([
            Event.toPromise(Event.filter(this._ctx.instance.onDidChangeVisibility, visible => visible)),
            Event.toPromise(this._ctx.instance.onDisposed)
        ]);
        if (this.isDisposed || this._ctx.instance.isDisposed) {
            return undefined;
        }
        return xterm.element ?? undefined;
    }
    _resolveAddonContainer(xtermElement) {
        if (this._ctx.instance.target === TerminalLocation.Editor) {
            return xtermElement;
        }
        return dom.findParentWithClass(xtermElement, 'panel') ?? xtermElement;
    }
};
TerminalSuggestContribution = TerminalSuggestContribution_1 = __decorate([
    __param(1, IContextKeyService),
    __param(2, IConfigurationService),
    __param(3, IInstantiationService),
    __param(4, ITerminalCompletionService),
    __param(5, ITextModelService),
    __param(6, ILanguageFeaturesService)
], TerminalSuggestContribution);
registerTerminalContribution(TerminalSuggestContribution.ID, TerminalSuggestContribution);
// #endregion
// #region Actions
registerTerminalAction({
    id: "workbench.action.terminal.changeSelectionModeNever" /* TerminalSuggestCommandId.ChangeSelectionModeNever */,
    title: localize2('workbench.action.terminal.changeSelectionMode.never', 'Selection Mode: None'),
    tooltip: localize2('workbench.action.terminal.changeSelectionMode.never.tooltip', 'Do not select the top suggestion until down is pressed, at which point Tab or Enter will accept the suggestion. Activate to change.'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible, ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */}`, 'never')),
    menu: {
        id: MenuId.MenubarTerminalSuggestStatusMenu,
        group: 'left',
        order: 1,
        when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */}`, 'never'), ContextKeyExpr.or(ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.quickSuggestions" /* TerminalSuggestSettingId.QuickSuggestions */}`, true), ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.suggestOnTriggerCharacters" /* TerminalSuggestSettingId.SuggestOnTriggerCharacters */}`, true)))
    },
    run: (c, accessor) => {
        accessor.get(IConfigurationService).updateValue("terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */, 'partial');
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.changeSelectionModePartial" /* TerminalSuggestCommandId.ChangeSelectionModePartial */,
    title: localize2('workbench.action.terminal.changeSelectionMode.partial', 'Selection Mode: Partial (Tab)'),
    tooltip: localize2('workbench.action.terminal.changeSelectionMode.partial.tooltip', 'Partially select the top suggestion, Tab will accept a suggestion when visible. Activate to change.'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible, ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */}`, 'partial')),
    menu: {
        id: MenuId.MenubarTerminalSuggestStatusMenu,
        group: 'left',
        order: 1,
        when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */}`, 'partial'), ContextKeyExpr.or(ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.quickSuggestions" /* TerminalSuggestSettingId.QuickSuggestions */}`, true), ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.suggestOnTriggerCharacters" /* TerminalSuggestSettingId.SuggestOnTriggerCharacters */}`, true)))
    },
    run: (c, accessor) => {
        accessor.get(IConfigurationService).updateValue("terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */, 'always');
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.changeSelectionModeAlways" /* TerminalSuggestCommandId.ChangeSelectionModeAlways */,
    title: localize2('workbench.action.terminal.changeSelectionMode.always', 'Selection Mode: Always (Tab or Enter)'),
    tooltip: localize2('workbench.action.terminal.changeSelectionMode.always.tooltip', 'Always select the top suggestion, Tab or Enter will accept a suggestion when visible. Activate to change.'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    menu: {
        id: MenuId.MenubarTerminalSuggestStatusMenu,
        group: 'left',
        order: 1,
        when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */}`, 'always'), ContextKeyExpr.or(ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.quickSuggestions" /* TerminalSuggestSettingId.QuickSuggestions */}`, true), ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.suggestOnTriggerCharacters" /* TerminalSuggestSettingId.SuggestOnTriggerCharacters */}`, true)))
    },
    run: (c, accessor) => {
        accessor.get(IConfigurationService).updateValue("terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */, 'never');
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.doNotShowSuggestOnType" /* TerminalSuggestCommandId.DoNotShowOnType */,
    title: localize2('workbench.action.terminal.doNotShowSuggestOnType', 'Don\'t show IntelliSense unless triggered explicitly. This disables the quick suggestions and suggest on trigger characters settings.'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    icon: Codicon.eye,
    menu: {
        id: MenuId.MenubarTerminalSuggestStatusMenu,
        group: 'right',
        order: 1,
        when: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.quickSuggestions" /* TerminalSuggestSettingId.QuickSuggestions */}.commands`, 'on'), ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.quickSuggestions" /* TerminalSuggestSettingId.QuickSuggestions */}.arguments`, 'on')), ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.suggestOnTriggerCharacters" /* TerminalSuggestSettingId.SuggestOnTriggerCharacters */}`, true)),
    },
    run: (c, accessor) => {
        accessor.get(IConfigurationService).updateValue("terminal.integrated.suggest.quickSuggestions" /* TerminalSuggestSettingId.QuickSuggestions */, { commands: 'off', arguments: 'off', unknown: 'off' });
        accessor.get(IConfigurationService).updateValue("terminal.integrated.suggest.suggestOnTriggerCharacters" /* TerminalSuggestSettingId.SuggestOnTriggerCharacters */, false);
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.showSuggestOnType" /* TerminalSuggestCommandId.ShowOnType */,
    title: localize2('workbench.action.terminal.showSuggestOnType', 'Show IntelliSense while typing. This enables the quick suggestions for commands and arguments, and suggest on trigger characters settings.'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    icon: Codicon.eyeClosed,
    menu: {
        id: MenuId.MenubarTerminalSuggestStatusMenu,
        group: 'right',
        order: 1,
        when: ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.quickSuggestions" /* TerminalSuggestSettingId.QuickSuggestions */}.commands`, 'off'), ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.quickSuggestions" /* TerminalSuggestSettingId.QuickSuggestions */}.arguments`, 'off')), ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.suggestOnTriggerCharacters" /* TerminalSuggestSettingId.SuggestOnTriggerCharacters */}`, false)),
    },
    run: (c, accessor) => {
        accessor.get(IConfigurationService).updateValue("terminal.integrated.suggest.quickSuggestions" /* TerminalSuggestSettingId.QuickSuggestions */, { commands: 'on', arguments: 'on', unknown: 'off' });
        accessor.get(IConfigurationService).updateValue("terminal.integrated.suggest.suggestOnTriggerCharacters" /* TerminalSuggestSettingId.SuggestOnTriggerCharacters */, true);
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.suggestLearnMore" /* TerminalSuggestCommandId.LearnMore */,
    title: localize2('workbench.action.terminal.learnMore', 'Learn More'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    icon: Codicon.question,
    menu: {
        id: MenuId.MenubarTerminalSuggestStatusMenu,
        group: 'right',
        order: 2
    },
    run: (c, accessor) => {
        (accessor.get(IOpenerService)).open('https://aka.ms/vscode-terminal-intellisense');
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.configureSuggestSettings" /* TerminalSuggestCommandId.ConfigureSettings */,
    title: localize2('workbench.action.terminal.configureSuggestSettings', 'Configure'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    icon: Codicon.gear,
    menu: {
        id: MenuId.MenubarTerminalSuggestStatusMenu,
        group: 'right',
        order: 3
    },
    run: (c, accessor) => accessor.get(IPreferencesService).openSettings({ query: terminalSuggestConfigSection })
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.triggerSuggest" /* TerminalSuggestCommandId.TriggerSuggest */,
    title: localize2('workbench.action.terminal.triggerSuggest', 'Trigger Suggest'),
    f1: false,
    keybinding: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 10 /* KeyCode.Space */,
        mac: { primary: 256 /* KeyMod.WinCtrl */ | 10 /* KeyCode.Space */ },
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
        when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.suggestWidgetVisible.negate(), ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.enabled" /* TerminalSuggestSettingId.Enabled */}`, true))
    },
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.requestCompletions(true)
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.resetSuggestWidgetSize" /* TerminalSuggestCommandId.ResetWidgetSize */,
    title: localize2('workbench.action.terminal.resetSuggestWidgetSize', 'Reset Suggest Widget Size'),
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.resetWidgetSize()
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.selectPrevSuggestion" /* TerminalSuggestCommandId.SelectPrevSuggestion */,
    title: localize2('workbench.action.terminal.selectPrevSuggestion', 'Select the Previous Suggestion'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    keybinding: {
        // Up is bound to other workbench keybindings that this needs to beat
        primary: 16 /* KeyCode.UpArrow */,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
        when: ContextKeyExpr.or(SimpleSuggestContext.HasNavigated, ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.upArrowNavigatesHistory" /* TerminalSuggestSettingId.UpArrowNavigatesHistory */}`, false))
    },
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectPreviousSuggestion()
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.selectPrevPageSuggestion" /* TerminalSuggestCommandId.SelectPrevPageSuggestion */,
    title: localize2('workbench.action.terminal.selectPrevPageSuggestion', 'Select the Previous Page Suggestion'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    keybinding: {
        // Up is bound to other workbench keybindings that this needs to beat
        primary: 11 /* KeyCode.PageUp */,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1
    },
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectPreviousPageSuggestion()
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.selectNextSuggestion" /* TerminalSuggestCommandId.SelectNextSuggestion */,
    title: localize2('workbench.action.terminal.selectNextSuggestion', 'Select the Next Suggestion'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    keybinding: {
        // Down is bound to other workbench keybindings that this needs to beat
        primary: 18 /* KeyCode.DownArrow */,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1
    },
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectNextSuggestion()
});
registerActiveInstanceAction({
    id: 'terminalSuggestToggleExplainMode',
    title: localize2('workbench.action.terminal.suggestToggleExplainMode', 'Suggest Toggle Explain Modes'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    keybinding: {
        // Down is bound to other workbench keybindings that this needs to beat
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
        primary: 2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */,
    },
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.toggleExplainMode()
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.suggestToggleDetailsFocus" /* TerminalSuggestCommandId.ToggleDetailsFocus */,
    title: localize2('workbench.action.terminal.suggestToggleDetailsFocus', 'Suggest Toggle Suggestion Focus'),
    f1: false,
    // HACK: This does not work with a precondition of `TerminalContextKeys.suggestWidgetVisible`, so make sure to not override the editor's keybinding
    precondition: EditorContextKeys.textInputFocus.negate(),
    keybinding: {
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 10 /* KeyCode.Space */,
        mac: { primary: 256 /* KeyMod.WinCtrl */ | 512 /* KeyMod.Alt */ | 10 /* KeyCode.Space */ }
    },
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.toggleSuggestionFocus()
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.suggestToggleDetails" /* TerminalSuggestCommandId.ToggleDetails */,
    title: localize2('workbench.action.terminal.suggestToggleDetails', 'Suggest Toggle Details'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen, TerminalContextKeys.focus, TerminalContextKeys.suggestWidgetVisible, SimpleSuggestContext.HasFocusedSuggestion),
    keybinding: {
        // HACK: Force weight to be higher than that to start terminal chat
        weight: 400 /* KeybindingWeight.ExternalExtension */ + 2,
        primary: 2048 /* KeyMod.CtrlCmd */ | 10 /* KeyCode.Space */,
        secondary: [2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */],
        mac: { primary: 256 /* KeyMod.WinCtrl */ | 10 /* KeyCode.Space */, secondary: [2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */] }
    },
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.toggleSuggestionDetails()
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.selectNextPageSuggestion" /* TerminalSuggestCommandId.SelectNextPageSuggestion */,
    title: localize2('workbench.action.terminal.selectNextPageSuggestion', 'Select the Next Page Suggestion'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    keybinding: {
        // Down is bound to other workbench keybindings that this needs to beat
        primary: 12 /* KeyCode.PageDown */,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1
    },
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectNextPageSuggestion()
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.acceptSelectedSuggestion" /* TerminalSuggestCommandId.AcceptSelectedSuggestion */,
    title: localize2('workbench.action.terminal.acceptSelectedSuggestion', 'Insert'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    keybinding: [{
            primary: 2 /* KeyCode.Tab */,
            // Tab is bound to other workbench keybindings that this needs to beat
            weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 2,
            when: ContextKeyExpr.and(SimpleSuggestContext.HasFocusedSuggestion)
        },
        {
            primary: 3 /* KeyCode.Enter */,
            // Enter accepts when: explicitly invoked (ctrl+space), OR not in partial mode, OR not first suggestion, OR user has navigated
            when: ContextKeyExpr.and(SimpleSuggestContext.HasFocusedSuggestion, ContextKeyExpr.or(SimpleSuggestContext.ExplicitlyInvoked, ContextKeyExpr.notEquals(`config.${"terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */}`, 'partial'), SimpleSuggestContext.FirstSuggestionFocused.toNegated(), SimpleSuggestContext.HasNavigated)),
            weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1
        }],
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.acceptSelectedSuggestion()
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.acceptSelectedSuggestionEnter" /* TerminalSuggestCommandId.AcceptSelectedSuggestionEnter */,
    title: localize2('workbench.action.terminal.acceptSelectedSuggestionEnter', 'Accept Selected Suggestion (Enter)'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    keybinding: {
        primary: 3 /* KeyCode.Enter */,
        // Enter is bound to other workbench keybindings that this needs to beat
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
        when: ContextKeyExpr.notEquals(`config.${"terminal.integrated.suggest.runOnEnter" /* TerminalSuggestSettingId.RunOnEnter */}`, 'never'),
    },
    run: async (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.acceptSelectedSuggestion(undefined, true)
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.hideSuggestWidget" /* TerminalSuggestCommandId.HideSuggestWidget */,
    title: localize2('workbench.action.terminal.hideSuggestWidget', 'Hide Suggest Widget'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    keybinding: {
        primary: 9 /* KeyCode.Escape */,
        // Escape is bound to other workbench keybindings that this needs to beat
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1
    },
    run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.hideSuggestWidget(true)
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.hideSuggestWidgetAndNavigateHistory" /* TerminalSuggestCommandId.HideSuggestWidgetAndNavigateHistory */,
    title: localize2('workbench.action.terminal.hideSuggestWidgetAndNavigateHistory', 'Hide Suggest Widget and Navigate History'),
    f1: false,
    precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
    keybinding: {
        primary: 16 /* KeyCode.UpArrow */,
        when: ContextKeyExpr.and(SimpleSuggestContext.HasNavigated.negate(), ContextKeyExpr.equals(`config.${"terminal.integrated.suggest.upArrowNavigatesHistory" /* TerminalSuggestSettingId.UpArrowNavigatesHistory */}`, true)),
        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 2
    },
    run: (activeInstance) => {
        TerminalSuggestContribution.get(activeInstance)?.addon?.hideSuggestWidget(true);
        activeInstance.sendText('\u001b[A', false); // Up arrow
    }
});
// #endregion
// #region Dynamic Providers Configuration
let TerminalSuggestProvidersConfigurationManager = class TerminalSuggestProvidersConfigurationManager extends Disposable {
    static { TerminalSuggestProvidersConfigurationManager_1 = this; }
    static initialize(instantiationService) {
        if (!this._instance) {
            this._instance = instantiationService.createInstance(TerminalSuggestProvidersConfigurationManager_1);
        }
    }
    constructor(_terminalCompletionService, _terminalContributionService) {
        super();
        this._terminalCompletionService = _terminalCompletionService;
        this._terminalContributionService = _terminalContributionService;
        this._register(this._terminalCompletionService.onDidChangeProviders(() => {
            this._updateConfiguration();
        }));
        this._register(this._terminalContributionService.onDidChangeTerminalCompletionProviders(() => {
            this._updateConfiguration();
        }));
        // Initial configuration
        this._updateConfiguration();
    }
    _updateConfiguration() {
        // Add statically declared providers from package.json contributions
        const providers = new Map();
        this._terminalContributionService.terminalCompletionProviders.forEach(o => providers.set(o.extensionIdentifier, { ...o, id: o.extensionIdentifier }));
        // Add dynamically registered providers (that aren't already declared statically)
        for (const { id } of this._terminalCompletionService.providers) {
            if (id && !providers.has(id)) {
                providers.set(id, { id });
            }
        }
        registerTerminalSuggestProvidersConfiguration(providers);
    }
};
TerminalSuggestProvidersConfigurationManager = TerminalSuggestProvidersConfigurationManager_1 = __decorate([
    __param(0, ITerminalCompletionService),
    __param(1, ITerminalContributionService)
], TerminalSuggestProvidersConfigurationManager);
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuc3VnZ2VzdC5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3Rlcm1pbmFsLnN1Z2dlc3QuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBRTFELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEksT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNsRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFlLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFdEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFdkYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLHNCQUFzQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDcEgsT0FBTyxFQUFFLDRCQUE0QixFQUFxQyxNQUFNLGlEQUFpRCxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSw0QkFBNEIsRUFBZ0UsNkNBQTZDLEVBQXFDLE1BQU0sMkNBQTJD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