/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerActiveInstanceAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import './media/terminalQuickFix.css';
import { ITerminalQuickFixService, TerminalQuickFixType } from './quickFix.js';
import { TerminalQuickFixAddon } from './quickFixAddon.js';
import { freePort, gitCreatePr, gitFastForwardPull, gitPushSetUpstream, gitSimilar, gitTwoDashes, pwshGeneralError, pwshUnixCommandNotFoundError } from './terminalQuickFixBuiltinActions.js';
import { TerminalQuickFixService } from './terminalQuickFixService.js';

// #region Services

registerSingleton(ITerminalQuickFixService, TerminalQuickFixService, InstantiationType.Delayed);

// #endregion

// #region Contributions

class TerminalQuickFixContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'quickFix';

	static get(instance: ITerminalInstance): TerminalQuickFixContribution | null {
		return instance.getContribution<TerminalQuickFixContribution>(TerminalQuickFixContribution.ID);
	}

	private _addon?: TerminalQuickFixAddon;
	get addon(): TerminalQuickFixAddon | undefined { return this._addon; }

	private readonly _quickFixMenuItems = this.add(new MutableDisposable());

	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		// Create addon
		this._addon = this._instantiationService.createInstance(TerminalQuickFixAddon, this._ctx.instance.sessionId, undefined, this._ctx.instance.capabilities);
		xterm.raw.loadAddon(this._addon);

		// Track ghost text state
		let currentGhostText: string | undefined;

		const writeGhostText = (text: string) => {
			// Write dim text (ANSI escape: \x1b[2m = dim, \x1b[0m = reset)
			// Also save cursor, write, restore cursor
			xterm.raw.write(`\x1b7\x1b[2m${text}\x1b8`);
			currentGhostText = text;
		};

		const clearGhostText = () => {
			if (currentGhostText) {
				// Clear the ghost text by overwriting with spaces
				xterm.raw.write(`\x1b7${' '.repeat(currentGhostText.length)}\x1b8`);
				currentGhostText = undefined;
			}
		};

		const acceptGhostText = () => {
			if (currentGhostText) {
				const text = currentGhostText;
				clearGhostText();
				// Write the command to the terminal (without executing)
				this._ctx.instance.runCommand(text, false);
				return true;
			}
			return false;
		};

		// Intercept Tab and Right-arrow to accept ghost text
		xterm.raw.attachCustomKeyEventHandler((e: KeyboardEvent) => {
			if (currentGhostText && (e.key === 'Tab' || e.key === 'ArrowRight') && e.type === 'keydown') {
				e.preventDefault();
				e.stopPropagation();
				acceptGhostText();
				return false; // Prevent default terminal handling
			}
			return true; // Allow other keys through
		});

		// Hook up listeners
		this.add(this._addon.onDidRequestRerunCommand((e) => this._ctx.instance.runCommand(e.command, e.shouldExecute || false)));
		this.add(this._addon.onDidUpdateQuickFixes(e => {
			// Only track the latest command's quick fixes
			this._quickFixMenuItems.value = e.actions ? xterm.decorationAddon.registerMenuItems(e.command, e.actions) : undefined;

			// Get the first terminal command quick fix
			const terminalCommandFix = e.actions?.find(a => a.type === TerminalQuickFixType.TerminalCommand && a.command);

			// Ghost text mode: write dim text to terminal
			const ghostTextEnabled = this._configurationService.getValue<boolean>(TerminalSettingId.ShellIntegrationQuickFixGhostText);
			if (ghostTextEnabled && terminalCommandFix?.command) {
				writeGhostText(terminalCommandFix.command);
				return;
			}

			// Auto-fill mode: fill the prompt immediately
			const autoFillEnabled = this._configurationService.getValue<boolean>(TerminalSettingId.ShellIntegrationQuickFixAutoFill);
			if (autoFillEnabled && terminalCommandFix?.command) {
				this._ctx.instance.runCommand(terminalCommandFix.command, false);
			}
		}));

		// Clear ghost text when user types
		this.add(xterm.raw.onData(() => {
			clearGhostText();
		}));

		// Register quick fixes
		for (const actionOption of [
			gitTwoDashes(),
			gitFastForwardPull(),
			freePort((port: string, command: string) => this._ctx.instance.freePortKillProcess(port, command)),
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

// #endregion

// #region Actions

const enum TerminalQuickFixCommandId {
	ShowQuickFixes = 'workbench.action.terminal.showQuickFixes',
}

registerActiveInstanceAction({
	id: TerminalQuickFixCommandId.ShowQuickFixes,
	title: localize2('workbench.action.terminal.showQuickFixes', 'Show Terminal Quick Fixes'),
	precondition: TerminalContextKeys.focus,
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.Period,
		weight: KeybindingWeight.WorkbenchContrib
	},
	run: (activeInstance) => TerminalQuickFixContribution.get(activeInstance)?.addon?.showMenu()
});

// #endregion
