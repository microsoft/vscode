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
import { ContextKeyExpr, IContextKey, IContextKeyService, IReadableSet } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { GeneralShellType, TerminalLocation, TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerActiveInstanceAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TERMINAL_CONFIG_SECTION, type ITerminalConfiguration } from '../../../terminal/common/terminal.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalSuggestCommandId } from '../common/terminal.suggest.js';
import { terminalSuggestConfigSection, TerminalSuggestSettingId, type ITerminalSuggestConfiguration } from '../common/terminalSuggestConfiguration.js';
import { ITerminalCompletionService, TerminalCompletionService } from './terminalCompletionService.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { SuggestAddon } from './terminalSuggestAddon.js';
import { TerminalClipboardContribution } from '../../clipboard/browser/terminal.clipboard.contribution.js';
import { PwshCompletionProviderAddon } from './pwshCompletionProviderAddon.js';

registerSingleton(ITerminalCompletionService, TerminalCompletionService, InstantiationType.Delayed);

// #region Terminal Contributions

class TerminalSuggestContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.suggest';

	static get(instance: ITerminalInstance): TerminalSuggestContribution | null {
		return instance.getContribution<TerminalSuggestContribution>(TerminalSuggestContribution.ID);
	}

	private readonly _addon: MutableDisposable<SuggestAddon> = new MutableDisposable();
	private readonly _pwshAddon: MutableDisposable<PwshCompletionProviderAddon> = new MutableDisposable();
	private _terminalSuggestWidgetContextKeys: IReadableSet<string> = new Set(TerminalContextKeys.suggestWidgetVisible.key);
	private _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>;

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
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		const config = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection);
		const enabled = config.enabled;
		if (!enabled) {
			return;
		}
		this.add(Event.runAndSubscribe(this._ctx.instance.onDidChangeShellType, async () => {
			this._loadAddons(xterm.raw);
		}));
		this.add(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this._terminalSuggestWidgetContextKeys)) {
				this._loadAddons(xterm.raw);
			}
		}));
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.SendKeybindingsToShell)) {
				this._loadAddons(xterm.raw);
			}
		}));
	}

	private _loadPwshCompletionAddon(xterm: RawXtermTerminal): void {
		if (this._ctx.instance.shellType !== GeneralShellType.PowerShell) {
			return;
		}
		const pwshCompletionProviderAddon = this._pwshAddon.value = this._instantiationService.createInstance(PwshCompletionProviderAddon, undefined, this._ctx.instance.capabilities);
		xterm.loadAddon(pwshCompletionProviderAddon);
		this.add(pwshCompletionProviderAddon);
		this.add(pwshCompletionProviderAddon.onDidRequestSendText(text => {
			this._ctx.instance.focus();
			this._ctx.instance.sendText(text, false);
		}));
		this.add(this._terminalCompletionService.registerTerminalCompletionProvider('builtinPwsh', 'pwsh', pwshCompletionProviderAddon));
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
		const sendingKeybindingsToShell = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION).sendKeybindingsToShell;
		if (sendingKeybindingsToShell || !this._ctx.instance.shellType) {
			this._addon.clear();
			this._pwshAddon.clear();
			return;
		}
		if (this._terminalSuggestWidgetVisibleContextKey) {
			const addon = this._addon.value = this._instantiationService.createInstance(SuggestAddon, this._ctx.instance.shellType, this._ctx.instance.capabilities, this._terminalSuggestWidgetVisibleContextKey);
			xterm.loadAddon(addon);
			this._loadPwshCompletionAddon(xterm);
			if (this._ctx.instance.target === TerminalLocation.Editor) {
				addon.setContainerWithOverflow(xterm.element!);
			} else {
				addon.setContainerWithOverflow(dom.findParentWithClass(xterm.element!, 'panel')!);
			}
			addon.setScreen(xterm.element!.querySelector('.xterm-screen')!);
			this.add(this._ctx.instance.onDidBlur(() => addon.hideSuggestWidget()));
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
		when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.terminalShellIntegrationEnabled, ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.Enabled}`, true))
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.requestCompletions()
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
	title: localize2('workbench.action.terminal.acceptSelectedSuggestion', 'Accept Selected Suggestion'),
	f1: false,
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
	keybinding: {
		primary: KeyCode.Tab,
		// Tab is bound to other workbench keybindings that this needs to beat
		weight: KeybindingWeight.WorkbenchContrib + 1
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
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.hideSuggestWidget()
});

registerActiveInstanceAction({
	id: TerminalSuggestCommandId.ClearSuggestCache,
	title: localize2('workbench.action.terminal.clearSuggestCache', 'Clear Suggest Cache'),
	f1: true,
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.pwshAddon?.clearSuggestCache()
});

// #endregion
