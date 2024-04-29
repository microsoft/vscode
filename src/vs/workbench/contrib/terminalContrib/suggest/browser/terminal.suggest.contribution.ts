/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import * as dom from 'vs/base/browser/dom';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize2 } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService, IReadableSet } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveInstanceAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalConfiguration, ITerminalProcessManager, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { SuggestAddon } from 'vs/workbench/contrib/terminalContrib/suggest/browser/terminalSuggestAddon';
import { TerminalSuggestCommandId } from 'vs/workbench/contrib/terminalContrib/suggest/common/terminal.suggest';

// #region Terminal Contributions

class TerminalSuggestContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.suggest';

	static get(instance: ITerminalInstance): TerminalSuggestContribution | null {
		return instance.getContribution<TerminalSuggestContribution>(TerminalSuggestContribution.ID);
	}

	private readonly _addon: MutableDisposable<SuggestAddon> = new MutableDisposable();
	private _terminalSuggestWidgetContextKeys: IReadableSet<string> = new Set(TerminalContextKeys.suggestWidgetVisible.key);
	private _terminalSuggestWidgetVisibleContextKey: IContextKey<boolean>;

	get addon(): SuggestAddon | undefined { return this._addon.value; }

	constructor(
		private readonly _instance: ITerminalInstance,
		_processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
		this.add(toDisposable(() => this._addon?.dispose()));
		this._terminalSuggestWidgetVisibleContextKey = TerminalContextKeys.suggestWidgetVisible.bindTo(this._contextKeyService);
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._loadSuggestAddon(xterm.raw);
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
		if (sendingKeybindingsToShell) {
			this._addon.dispose();
			return;
		}
		if (this._terminalSuggestWidgetVisibleContextKey) {
			this._addon.value = this._instantiationService.createInstance(SuggestAddon, this._instance.capabilities, this._terminalSuggestWidgetVisibleContextKey);
			xterm.loadAddon(this._addon.value);
			this._addon.value.setPanel(dom.findParentWithClass(xterm.element!, 'panel')!);
			this._addon.value.setScreen(xterm.element!.querySelector('.xterm-screen')!);
			this.add(this._instance.onDidBlur(() => this._addon.value?.hideSuggestWidget()));
			this.add(this._addon.value.onAcceptedCompletion(async text => {
				this._instance.focus();
				this._instance.sendText(text, false);
			}));
			this.add(this._instance.onDidSendText(() => this._addon.value?.hideSuggestWidget()));
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
		primary: KeyCode.Enter,
		secondary: [KeyCode.Tab],
		// Enter is bound to other workbench keybindings that this needs to beat
		weight: KeybindingWeight.WorkbenchContrib + 1
	},
	run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.acceptSelectedSuggestion()
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

// #endregion
