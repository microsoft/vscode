/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveInstanceAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { ITerminalQuickFixService } from 'vs/workbench/contrib/terminalContrib/quickFix/browser/quickFix';
import { TerminalQuickFixAddon } from 'vs/workbench/contrib/terminalContrib/quickFix/browser/quickFixAddon';
import { freePort, gitCreatePr, gitPushSetUpstream, gitSimilar, gitTwoDashes, pwshGeneralError, pwshUnixCommandNotFoundError } from 'vs/workbench/contrib/terminalContrib/quickFix/browser/terminalQuickFixBuiltinActions';
import { TerminalQuickFixService } from 'vs/workbench/contrib/terminalContrib/quickFix/browser/terminalQuickFixService';
import type { Terminal as RawXtermTerminal } from 'xterm';

// Services
registerSingleton(ITerminalQuickFixService, TerminalQuickFixService, InstantiationType.Delayed);

// Contributions
class TerminalQuickFixContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'quickFix';

	static get(instance: ITerminalInstance): TerminalQuickFixContribution | null {
		return instance.getContribution<TerminalQuickFixContribution>(TerminalQuickFixContribution.ID);
	}

	private _addon?: TerminalQuickFixAddon;
	get addon(): TerminalQuickFixAddon | undefined { return this._addon; }

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		// Create addon
		this._addon = this._instantiationService.createInstance(TerminalQuickFixAddon, undefined, this._instance.capabilities);
		xterm.raw.loadAddon(this._addon);

		// Hook up listeners
		this.add(this._addon.onDidRequestRerunCommand((e) => this._instance.runCommand(e.command, e.addNewLine || false)));

		// Register quick fixes
		for (const actionOption of [
			gitTwoDashes(),
			freePort(this),
			gitSimilar(),
			gitPushSetUpstream(),
			gitCreatePr(),
			pwshUnixCommandNotFoundError(),
			pwshGeneralError()
		]) {
			this._addon.registerCommandFinishedListener(actionOption);
		}
	}
}
registerTerminalContribution(TerminalQuickFixContribution.ID, TerminalQuickFixContribution);

// Actions
registerActiveInstanceAction({
	id: TerminalCommandId.ShowQuickFixes,
	title: { value: localize('workbench.action.terminal.showQuickFixes', "Show Terminal Quick Fixes"), original: 'Show Terminal Quick Fixes' },
	precondition: TerminalContextKeys.focus,
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.Period,
		weight: KeybindingWeight.WorkbenchContrib
	},
	run: (activeInstance) => TerminalQuickFixContribution.get(activeInstance)?.addon?.showMenu()
});
