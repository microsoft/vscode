/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import * as dom from 'vs/base/browser/dom';
import { AutoOpenBarrier } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { isWindows } from 'vs/base/common/platform';
import { localize2 } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService, IReadableSet } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { ShellIntegrationOscPs } from 'vs/platform/terminal/common/xterm/shellIntegrationAddon';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveInstanceAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, TERMINAL_CONFIG_SECTION, type ITerminalConfiguration } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { parseCompletionsFromShell, SuggestAddon, VSCodeSuggestOscPt, type CompressedPwshCompletion, type PwshCompletion } from 'vs/workbench/contrib/terminalContrib/suggest/browser/terminalSuggestAddon';
import { TerminalSuggestCommandId } from 'vs/workbench/contrib/terminalContrib/suggest/common/terminal.suggest';
import { terminalSuggestConfigSection, TerminalSuggestSettingId, type ITerminalSuggestConfiguration } from 'vs/workbench/contrib/terminalContrib/suggest/common/terminalSuggestConfiguration';
import { SimpleCompletionItem } from 'vs/workbench/services/suggest/browser/simpleCompletionItem';

const enum Constants {
	CachedPwshCommandsStorageKey = 'terminal.suggest.pwshCommands'
}

// #region Terminal Contributions

class TerminalSuggestContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.suggest';

	static get(instance: ITerminalInstance): TerminalSuggestContribution | null {
		return instance.getContribution<TerminalSuggestContribution>(TerminalSuggestContribution.ID);
	}

	private _xterm?: RawXtermTerminal;
	private readonly _addon: MutableDisposable<SuggestAddon> = new MutableDisposable();
	private _terminalSuggestWidgetContextKeys: IReadableSet<string> = new Set(TerminalContextKeys.suggestWidgetVisible.key);
	private _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>;

	get addon(): SuggestAddon | undefined { return this._addon.value; }

	private static readonly _cachedPwshCommands: Set<SimpleCompletionItem> = new Set();

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this.add(toDisposable(() => this._addon?.dispose()));
		this._terminalSuggestWidgetVisibleContextKey = TerminalContextKeys.suggestWidgetVisible.bindTo(this._contextKeyService);

		// Attempt to load cached pwsh commands if not already loaded
		if (TerminalSuggestContribution._cachedPwshCommands.size === 0) {
			const config = this._storageService.get(Constants.CachedPwshCommandsStorageKey, StorageScope.APPLICATION, undefined);
			if (config !== undefined) {
				const completions = JSON.parse(config);
				for (const c of completions) {
					TerminalSuggestContribution._cachedPwshCommands.add(c);
				}
			}
		}

		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSuggestSettingId.Enabled)) {
				this.clearSuggestCache();
			}
		}));
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._xterm = xterm.raw;
		const config = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection);
		const enabled = config.enabled;
		if (!enabled) {
			return;
		}
		this.add(xterm.raw.parser.registerOscHandler(ShellIntegrationOscPs.VSCode, data => {
			return this._handleVSCodeSequence(data);
		}));
	}

	private _handleVSCodeSequence(data: string): boolean | Promise<boolean> {
		if (!this._xterm) {
			return false;
		}

		// Pass the sequence along to the capability
		const [command, ...args] = data.split(';');
		switch (command) {
			case VSCodeSuggestOscPt.CompletionsPwshCommands:
				return this._handleCompletionsPwshCommandsSequence(this._xterm, data, command, args);
		}

		// Unrecognized sequence
		return false;
	}

	private async _handleCompletionsPwshCommandsSequence(terminal: RawXtermTerminal, data: string, command: string, args: string[]): Promise<boolean> {
		const type = args[0];
		const rawCompletions: PwshCompletion | PwshCompletion[] | CompressedPwshCompletion[] | CompressedPwshCompletion = JSON.parse(data.slice(command.length + type.length + 2/*semi-colons*/));
		const completions = parseCompletionsFromShell(rawCompletions);

		const set = TerminalSuggestContribution._cachedPwshCommands;
		set.clear();
		for (const c of completions) {
			set.add(c);
		}

		this._storageService.store(Constants.CachedPwshCommandsStorageKey, JSON.stringify(Array.from(set.values())), StorageScope.APPLICATION, StorageTarget.MACHINE);

		return true;
	}

	clearSuggestCache(): void {
		TerminalSuggestContribution._cachedPwshCommands.clear();
		this._storageService.remove(Constants.CachedPwshCommandsStorageKey, StorageScope.APPLICATION);
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		const config = this._configurationService.getValue<ITerminalSuggestConfiguration>(terminalSuggestConfigSection);
		const enabled = config.enabled;
		if (!enabled) {
			return;
		}
		this.add(Event.runAndSubscribe(this._instance.onDidChangeShellType, async () => {
			this._loadSuggestAddon(xterm.raw);
		}));
		this.add(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this._terminalSuggestWidgetContextKeys)) {
				this._loadSuggestAddon(xterm.raw);
			}
		}));
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.SendKeybindingsToShell)) {
				this._loadSuggestAddon(xterm.raw);
			}
		}));
	}

	private _loadSuggestAddon(xterm: RawXtermTerminal): void {
		const sendingKeybindingsToShell = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION).sendKeybindingsToShell;
		if (sendingKeybindingsToShell || this._instance.shellType !== 'pwsh') {
			this._addon.clear();
			return;
		}
		if (this._terminalSuggestWidgetVisibleContextKey) {
			const addon = this._addon.value = this._instantiationService.createInstance(SuggestAddon, TerminalSuggestContribution._cachedPwshCommands, this._instance.capabilities, this._terminalSuggestWidgetVisibleContextKey);
			xterm.loadAddon(addon);
			addon.setPanel(dom.findParentWithClass(xterm.element!, 'panel')!);
			addon.setScreen(xterm.element!.querySelector('.xterm-screen')!);
			this.add(this._instance.onDidBlur(() => addon.hideSuggestWidget()));
			this.add(addon.onAcceptedCompletion(async text => {
				this._instance.focus();
				this._instance.sendText(text, false);
			}));

			// If completions are requested, pause and queue input events until completions are
			// received. This fixing some problems in PowerShell, particularly enter not executing
			// when typing quickly and some characters being printed twice. On Windows this isn't
			// needed because inputs are _not_ echoed when not handled immediately.
			// TODO: This should be based on the OS of the pty host, not the client
			if (!isWindows) {
				let barrier: AutoOpenBarrier | undefined;
				this.add(addon.onDidRequestCompletions(() => {
					barrier = new AutoOpenBarrier(2000);
					this._instance.pauseInputEvents(barrier);
				}));
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
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.acceptSelectedSuggestion(undefined, true)
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
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.clearSuggestCache()
});

// #endregion
