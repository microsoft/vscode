/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import * as dom from '../../../../../base/browser/dom.js';
import { AutoOpenBarrier } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { GeneralShellType, TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerActiveInstanceAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalSuggestCommandId } from '../common/terminal.suggest.js';
import { terminalSuggestConfigSection, TerminalSuggestSettingId, type ITerminalSuggestConfiguration } from '../common/terminalSuggestConfiguration.js';
import { ITerminalCompletionService, TerminalCompletionService } from './terminalCompletionService.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { SuggestAddon } from './terminalSuggestAddon.js';
import { TerminalClipboardContribution } from '../../clipboard/browser/terminal.clipboard.contribution.js';
import { PwshCompletionProviderAddon } from './pwshCompletionProviderAddon.js';
import { SimpleSuggestContext } from '../../../../services/suggest/browser/simpleSuggestWidget.js';
import { SuggestDetailsClassName } from '../../../../services/suggest/browser/simpleSuggestWidgetDetails.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import './terminalSymbolIcons.js';

registerSingleton(ITerminalCompletionService, TerminalCompletionService, InstantiationType.Delayed);

// #region Terminal Contributions

class TerminalSuggestContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.suggest';

	static get(instance: ITerminalInstance): TerminalSuggestContribution | null {
		return instance.getContribution<TerminalSuggestContribution>(TerminalSuggestContribution.ID);
	}

	private readonly _addon: MutableDisposable<SuggestAddon> = new MutableDisposable();
	private readonly _pwshAddon: MutableDisposable<PwshCompletionProviderAddon> = new MutableDisposable();
	private readonly _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>;

	get addon(): SuggestAddon | undefined { return this._addon.value; }
	get pwshAddon(): PwshCompletionProviderAddon | undefined { return this._pwshAddon.value; }

	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalCompletionService private readonly _terminalCompletionService: ITerminalCompletionService
	) {
		super();
		this.add(toDisposable(() => {
			this._addon?.dispose();
			this._pwshAddon?.dispose();
		}));
		this._terminalSuggestWidgetVisibleContextKey = TerminalContextKeys.suggestWidgetVisible.bindTo(this._contextKeyService);
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSuggestSettingId.Enabled)) {
				const completionsEnabled = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection).enabled;
				if (!completionsEnabled) {
					this._addon.clear();
					this._pwshAddon.clear();
				}
				const xtermRaw = this._ctx.instance.xterm?.raw;
				if (!!xtermRaw && completionsEnabled) {
					this._loadAddons(xtermRaw);
				}
			}
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
		}));
	}

	private async _loadPwshCompletionAddon(xterm: RawXtermTerminal): Promise<void> {
		// Disable when shell type is not powershell
		if (this._ctx.instance.shellType !== GeneralShellType.PowerShell) {
			this._pwshAddon.clear();
			return;
		}

		// Disable the addon on old backends (not conpty or Windows 11)
		await this._ctx.instance.processReady;
		const processTraits = this._ctx.processManager.processTraits;
		if (processTraits?.windowsPty && (processTraits.windowsPty.backend !== 'conpty' || processTraits?.windowsPty.buildNumber <= 19045)) {
			return;
		}

		const pwshCompletionProviderAddon = this._pwshAddon.value = this._instantiationService.createInstance(PwshCompletionProviderAddon, undefined, this._ctx.instance.capabilities);
		xterm.loadAddon(pwshCompletionProviderAddon);
		this.add(pwshCompletionProviderAddon);
		this.add(pwshCompletionProviderAddon.onDidRequestSendText(text => {
			this._ctx.instance.focus();
			this._ctx.instance.sendText(text, false);
		}));
		this.add(this._terminalCompletionService.registerTerminalCompletionProvider('builtinPwsh', pwshCompletionProviderAddon.id, pwshCompletionProviderAddon));
		// If completions are requested, pause and queue input events until completions are
		// received. This fixing some problems in PowerShell, particularly enter not executing
		// when typing quickly and some characters being printed twice. On Windows this isn't
		// needed because inputs are _not_ echoed when not handled immediately.
		// TODO: This should be based on the OS of the pty host, not the client
		if (!isWindows) {
			let barrier: AutoOpenBarrier | undefined;
			if (pwshCompletionProviderAddon) {
				this.add(pwshCompletionProviderAddon.onDidRequestSendText(() => {
					barrier = new AutoOpenBarrier(2000);
					this._ctx.instance.pauseInputEvents(barrier);
				}));
			}
			if (this._pwshAddon.value) {
				this.add(this._pwshAddon.value.onDidReceiveCompletions(() => {
					barrier?.open();
					barrier = undefined;
				}));
			} else {
				throw Error('no addon');
			}
		}
	}

	private _loadAddons(xterm: RawXtermTerminal): void {
		// Don't re-create the addon
		if (this._addon.value) {
			return;
		}

		const addon = this._addon.value = this._instantiationService.createInstance(SuggestAddon, this._ctx.instance.shellType, this._ctx.instance.capabilities, this._terminalSuggestWidgetVisibleContextKey);
		xterm.loadAddon(addon);
		this._loadPwshCompletionAddon(xterm);
		if (this._ctx.instance.target === TerminalLocation.Editor) {
			addon.setContainerWithOverflow(xterm.element!);
		} else {
			addon.setContainerWithOverflow(dom.findParentWithClass(xterm.element!, 'panel')!);
		}
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
		this._loadPwshCompletionAddon(this._ctx.instance.xterm.raw);
	}
}

registerTerminalContribution(TerminalSuggestContribution.ID, TerminalSuggestContribution);

// #endregion

// #region Actions

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
		weight: KeybindingWeight.WorkbenchContrib + 1
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
	keybinding: {
		primary: KeyCode.Tab,
		// Tab is bound to other workbench keybindings that this needs to beat
		weight: KeybindingWeight.WorkbenchContrib + 1
	},
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
		when: ContextKeyExpr.notEquals(`config.${TerminalSuggestSettingId.RunOnEnter}`, 'ignore'),
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
	run: (activeInstance, c, accessor) => accessor.get(IPreferencesService).openSettings({ query: terminalSuggestConfigSection })
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.ClearSuggestCache,
	title: localize2('workbench.action.terminal.clearSuggestCache', 'Clear Suggest Cache'),
	f1: true,
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.pwshAddon?.clearSuggestCache()
});

// #endregion
