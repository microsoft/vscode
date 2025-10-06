/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import * as dom from '../../../../../base/browser/dom.js';
import { AutoOpenBarrier } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable, toDisposable, Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerActiveInstanceAction, registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalSuggestCommandId } from '../common/terminal.suggest.js';
import { terminalSuggestConfigSection, TerminalSuggestSettingId, type ITerminalSuggestConfiguration, registerTerminalSuggestProvidersConfiguration } from '../common/terminalSuggestConfiguration.js';
import { ITerminalCompletionService, TerminalCompletionService } from './terminalCompletionService.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
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

registerSingleton(ITerminalCompletionService, TerminalCompletionService, InstantiationType.Delayed);

// #region Terminal Contributions

class TerminalSuggestContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.suggest';

	static get(instance: ITerminalInstance): TerminalSuggestContribution | null {
		return instance.getContribution<TerminalSuggestContribution>(TerminalSuggestContribution.ID);
	}

	private readonly _addon: MutableDisposable<SuggestAddon> = new MutableDisposable();
	private readonly _lspAddons: DisposableMap<string, LspCompletionProviderAddon> = this.add(new DisposableMap());
	private readonly _lspModelProvider: MutableDisposable<LspTerminalModelContentProvider> = new MutableDisposable();
	private readonly _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>;

	get addon(): SuggestAddon | undefined { return this._addon.value; }
	get lspAddons(): LspCompletionProviderAddon[] { return Array.from(this._lspAddons.values()); }

	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalCompletionService private readonly _terminalCompletionService: ITerminalCompletionService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this.add(toDisposable(() => {
			this._addon?.dispose();
			this._lspModelProvider?.value?.dispose();
			this._lspModelProvider?.dispose();
		}));
		this._terminalSuggestWidgetVisibleContextKey = TerminalContextKeys.suggestWidgetVisible.bindTo(this._contextKeyService);
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSuggestSettingId.Enabled)) {
				const completionsEnabled = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection).enabled;
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
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		const config = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection);
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

	private async _loadLspCompletionAddon(xterm: RawXtermTerminal): Promise<void> {
		let lspTerminalObj = undefined;
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
			this.add(this._terminalCompletionService.registerTerminalCompletionProvider(
				'lsp',
				lspCompletionProviderAddon.id,
				lspCompletionProviderAddon,
				...(lspCompletionProviderAddon.triggerCharacters ?? [])
			));
		}
	}

	private _loadAddons(xterm: RawXtermTerminal): void {
		// Don't re-create the addon
		if (this._addon.value) {
			return;
		}

		const addon = this._addon.value = this._instantiationService.createInstance(SuggestAddon, this._ctx.instance.sessionId, this._ctx.instance.shellType, this._ctx.instance.capabilities, this._terminalSuggestWidgetVisibleContextKey);
		xterm.loadAddon(addon);
		this._loadLspCompletionAddon(xterm);

		let container: HTMLElement | null = null;
		if (this._ctx.instance.target === TerminalLocation.Editor) {
			container = xterm.element!;
		} else {
			container = dom.findParentWithClass(xterm.element!, 'panel');
			if (!container) {
				// Fallback for sidebar or unknown location
				container = xterm.element!;
			}
		}
		addon.setContainerWithOverflow(container);
		addon.setScreen(xterm.element!.querySelector('.xterm-screen')!);

		this.add(dom.addDisposableListener(this._ctx.instance.domElement, dom.EventType.FOCUS_OUT, (e) => {
			const focusedElement = e.relatedTarget as HTMLElement;
			if (focusedElement?.classList.contains(SuggestDetailsClassName)) {
				// Don't hide the suggest widget if the focus is moving to the details
				return;
			}
			addon.hideSuggestWidget(true);
		}));

		this.add(addon.onAcceptedCompletion(async text => {
			this._ctx.instance.focus();
			this._ctx.instance.sendText(text, false);
		}));
		const clipboardContrib = TerminalClipboardContribution.get(this._ctx.instance)!;
		this.add(clipboardContrib.onWillPaste(() => addon.isPasting = true));
		this.add(clipboardContrib.onDidPaste(() => {
			// Delay this slightly as synchronizing the prompt input is debounced
			setTimeout(() => addon.isPasting = false, 100);
		}));
		if (!isWindows) {
			let barrier: AutoOpenBarrier | undefined;
			this.add(addon.onDidReceiveCompletions(() => {
				barrier?.open();
				barrier = undefined;
			}));
		}
	}

	private _refreshAddons(): void {
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

	private _updateContainerForTarget(target: TerminalLocation | undefined): void {
		const addon = this._addon.value;
		if (!addon || !this._ctx.instance.xterm?.raw) {
			return;
		}

		const xtermElement = this._ctx.instance.xterm.raw.element;
		if (!xtermElement) {
			return;
		}

		// Update the container based on the new target location
		if (target === TerminalLocation.Editor) {
			addon.setContainerWithOverflow(xtermElement);
		} else {
			const panelContainer = dom.findParentWithClass(xtermElement, 'panel');
			if (panelContainer) {
				addon.setContainerWithOverflow(panelContainer);
			}
		}
	}
}

registerTerminalContribution(TerminalSuggestContribution.ID, TerminalSuggestContribution);

// #endregion

// #region Actions

registerTerminalAction({
	id: TerminalSuggestCommandId.ConfigureSettings,
	title: localize2('workbench.action.terminal.configureSuggestSettings', 'Configure'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Comma,
		weight: KeybindingWeight.WorkbenchContrib
	},
	menu: {
		id: MenuId.MenubarTerminalSuggestStatusMenu,
		group: 'right',
		order: 1
	},
	run: (c, accessor) => accessor.get(IPreferencesService).openSettings({ query: terminalSuggestConfigSection })
});

registerTerminalAction({
	id: TerminalSuggestCommandId.LearnMore,
	title: localize2('workbench.action.terminal.learnMore', 'Learn More'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	menu: {
		id: MenuId.MenubarTerminalSuggestStatusMenu,
		group: 'center',
		order: 1
	},
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
		weight: KeybindingWeight.WorkbenchContrib + 1,
		when: TerminalContextKeys.suggestWidgetVisible
	},
	run: (c, accessor) => {
		(accessor.get(IOpenerService)).open('https://aka.ms/vscode-terminal-intellisense');
	}
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.RequestCompletions,
	title: localize2('workbench.action.terminal.requestCompletions', 'Request Completions'),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.Space,
		mac: { primary: KeyMod.WinCtrl | KeyCode.Space },
		weight: KeybindingWeight.WorkbenchContrib + 1,
		when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.suggestWidgetVisible.negate(), ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.Enabled}`, true))
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.requestCompletions(true)
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.ResetWidgetSize,
	title: localize2('workbench.action.terminal.resetSuggestWidgetSize', 'Reset Suggest Widget Size'),
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.resetWidgetSize()
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.SelectPrevSuggestion,
	title: localize2('workbench.action.terminal.selectPrevSuggestion', 'Select the Previous Suggestion'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding: {
		// Up is bound to other workbench keybindings that this needs to beat
		primary: KeyCode.UpArrow,
		weight: KeybindingWeight.WorkbenchContrib + 1,
		when: ContextKeyExpr.or(SimpleSuggestContext.HasNavigated, ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.UpArrowNavigatesHistory}`, false))
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectPreviousSuggestion()
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.SelectPrevPageSuggestion,
	title: localize2('workbench.action.terminal.selectPrevPageSuggestion', 'Select the Previous Page Suggestion'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding: {
		// Up is bound to other workbench keybindings that this needs to beat
		primary: KeyCode.PageUp,
		weight: KeybindingWeight.WorkbenchContrib + 1
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectPreviousPageSuggestion()
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.SelectNextSuggestion,
	title: localize2('workbench.action.terminal.selectNextSuggestion', 'Select the Next Suggestion'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding: {
		// Down is bound to other workbench keybindings that this needs to beat
		primary: KeyCode.DownArrow,
		weight: KeybindingWeight.WorkbenchContrib + 1
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
		weight: KeybindingWeight.WorkbenchContrib + 1,
		primary: KeyMod.CtrlCmd | KeyCode.Slash,
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.toggleExplainMode()
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.ToggleDetailsFocus,
	title: localize2('workbench.action.terminal.suggestToggleDetailsFocus', 'Suggest Toggle Suggestion Focus'),
	f1: false,
	// HACK: This does not work with a precondition of `TerminalContextKeys.suggestWidgetVisible`, so make sure to not override the editor's keybinding
	precondition: EditorContextKeys.textInputFocus.negate(),
	keybinding: {
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Space,
		mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Space }
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.toggleSuggestionFocus()
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.ToggleDetails,
	title: localize2('workbench.action.terminal.suggestToggleDetails', 'Suggest Toggle Details'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen, TerminalContextKeys.focus, TerminalContextKeys.suggestWidgetVisible, SimpleSuggestContext.HasFocusedSuggestion),
	keybinding: {
		// HACK: Force weight to be higher than that to start terminal chat
		weight: KeybindingWeight.ExternalExtension + 2,
		primary: KeyMod.CtrlCmd | KeyCode.Space,
		secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
		mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.CtrlCmd | KeyCode.KeyI] }
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.toggleSuggestionDetails()
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.SelectNextPageSuggestion,
	title: localize2('workbench.action.terminal.selectNextPageSuggestion', 'Select the Next Page Suggestion'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding: {
		// Down is bound to other workbench keybindings that this needs to beat
		primary: KeyCode.PageDown,
		weight: KeybindingWeight.WorkbenchContrib + 1
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectNextPageSuggestion()
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.AcceptSelectedSuggestion,
	title: localize2('workbench.action.terminal.acceptSelectedSuggestion', 'Insert'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding: [{
		primary: KeyCode.Tab,
		// Tab is bound to other workbench keybindings that this needs to beat
		weight: KeybindingWeight.WorkbenchContrib + 2,
		when: ContextKeyExpr.and(SimpleSuggestContext.HasFocusedSuggestion)
	},
	{
		primary: KeyCode.Enter,
		when: ContextKeyExpr.and(SimpleSuggestContext.HasFocusedSuggestion, ContextKeyExpr.or(ContextKeyExpr.notEquals(`config.${TerminalSuggestSettingId.SelectionMode}`, 'partial'), ContextKeyExpr.or(SimpleSuggestContext.FirstSuggestionFocused.toNegated(), SimpleSuggestContext.HasNavigated))),
		weight: KeybindingWeight.WorkbenchContrib + 1
	}],
	menu: {
		id: MenuId.MenubarTerminalSuggestStatusMenu,
		order: 1,
		group: 'left'
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.acceptSelectedSuggestion()
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.AcceptSelectedSuggestionEnter,
	title: localize2('workbench.action.terminal.acceptSelectedSuggestionEnter', 'Accept Selected Suggestion (Enter)'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding: {
		primary: KeyCode.Enter,
		// Enter is bound to other workbench keybindings that this needs to beat
		weight: KeybindingWeight.WorkbenchContrib + 1,
		when: ContextKeyExpr.notEquals(`config.${TerminalSuggestSettingId.RunOnEnter}`, 'never'),
	},
	run: async (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.acceptSelectedSuggestion(undefined, true)
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.HideSuggestWidget,
	title: localize2('workbench.action.terminal.hideSuggestWidget', 'Hide Suggest Widget'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding: {
		primary: KeyCode.Escape,
		// Escape is bound to other workbench keybindings that this needs to beat
		weight: KeybindingWeight.WorkbenchContrib + 1
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.hideSuggestWidget(true)
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.HideSuggestWidgetAndNavigateHistory,
	title: localize2('workbench.action.terminal.hideSuggestWidgetAndNavigateHistory', 'Hide Suggest Widget and Navigate History'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding:
	{
		primary: KeyCode.UpArrow,
		when: ContextKeyExpr.and(SimpleSuggestContext.HasNavigated.negate(), ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.UpArrowNavigatesHistory}`, true)),
		weight: KeybindingWeight.WorkbenchContrib + 2
	},
	run: (activeInstance) => {
		TerminalSuggestContribution.get(activeInstance)?.addon?.hideSuggestWidget(true);
		activeInstance.sendText('\u001b[A', false); // Up arrow
	}
});

// #endregion

// #region Dynamic Providers Configuration

class TerminalSuggestProvidersConfigurationManager extends Disposable {
	private static _instance: TerminalSuggestProvidersConfigurationManager | undefined;

	static initialize(instantiationService: IInstantiationService): void {
		if (!this._instance) {
			this._instance = instantiationService.createInstance(TerminalSuggestProvidersConfigurationManager);
		}
	}

	constructor(
		@ITerminalCompletionService private readonly _terminalCompletionService: ITerminalCompletionService
	) {
		super();
		this._register(this._terminalCompletionService.onDidChangeProviders(() => {
			this._updateConfiguration();
		}));
		// Initial configuration
		this._updateConfiguration();
	}

	private _updateConfiguration(): void {
		const providers = Array.from(this._terminalCompletionService.providers);
		const providerIds = providers.map(p => p.id).filter((id): id is string => typeof id === 'string');
		registerTerminalSuggestProvidersConfiguration(providerIds);
	}
}

// #endregion
