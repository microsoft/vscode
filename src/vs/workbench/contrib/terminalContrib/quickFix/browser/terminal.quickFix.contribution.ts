/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
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
import { ChatMessageRole, ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
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
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
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
			// Clear any existing ghost text first
			clearGhostText();
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
		this.add(this._addon.onDidUpdateQuickFixes(async e => {
			// Only track the latest command's quick fixes
			this._quickFixMenuItems.value = e.actions ? xterm.decorationAddon.registerMenuItems(e.command, e.actions) : undefined;

			// Get the first terminal command quick fix (filter out copilot-debug suggestions)
			const terminalCommandFix = e.actions?.find(a =>
				a.type === TerminalQuickFixType.TerminalCommand &&
				a.command &&
				!a.command.startsWith('copilot-debug')
			);

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
				return;
			}

			// AI-powered fix: if no quick fix found but command failed, try AI (requires Copilot)
			if (ghostTextEnabled && !terminalCommandFix && e.command) {
				const output = e.command.getOutput() ?? '';
				const commandLine = e.command.command;
				const exitCode = e.command.exitCode;
				// Try AI if: command failed (non-zero exit) AND output is short (< 1000 chars = likely error message)
				const shouldTryAI = exitCode !== 0 && output.length < 1000;
				if (shouldTryAI && commandLine) {
					const aiSuggestion = await this._getAICommandSuggestion(commandLine, output);
					if (aiSuggestion) {
						writeGhostText(aiSuggestion);
					}
				}
			}
		}));

		// Clear ghost text when user types (but not for Tab/Arrow which accept it)
		this.add(xterm.raw.onKey(e => {
			if (currentGhostText && e.domEvent.key !== 'Tab' && e.domEvent.key !== 'ArrowRight') {
				clearGhostText();
			}
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

	/**
	 * Get AI-powered command suggestion for typos
	 */
	private async _getAICommandSuggestion(command: string, errorOutput: string): Promise<string | undefined> {
		console.log('[QuickFix AI] User command:', command);
		console.log('[QuickFix AI] Error output:', errorOutput.substring(0, 200));

		try {
			// Select a fast model (gpt-4o-mini preferred for speed)
			let models = await this._languageModelsService.selectLanguageModels({
				vendor: 'copilot',
				family: 'gpt-4o-mini'
			});

			if (models.length === 0) {
				// Fallback to any available Copilot model
				models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot' });
				if (models.length === 0) {
					console.log('[QuickFix AI] No Copilot models available');
					return undefined;
				}
			}

			console.log('[QuickFix AI] Using model:', models[0]);

			const prompt = `Command: ${command}
Error: ${errorOutput.substring(0, 200)}
What is the correct shell command? Reply with ONLY the corrected command, nothing else.`;

			const cts = new CancellationTokenSource();
			const response = await this._languageModelsService.sendChatRequest(
				models[0],
				new ExtensionIdentifier('core'),
				[{ role: ChatMessageRole.User, content: [{ type: 'text', value: prompt }] }],
				{},
				cts.token
			);

			let result = '';
			for await (const part of response.stream) {
				const parts = Array.isArray(part) ? part : [part];
				for (const p of parts) {
					if (p.type === 'text') {
						result += p.value;
					}
				}
			}

			console.log('[QuickFix AI] Raw response:', result);

			// Clean up the response - strip markdown code fences and extract just the command
			let cleaned = result.trim();
			// Remove markdown code fences (```bash, ```sh, ```, etc.)
			cleaned = cleaned.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
			// Take first non-empty line
			cleaned = cleaned.split('\n').map(l => l.trim()).filter(l => l)[0] || '';

			console.log('[QuickFix AI] Parsed command:', cleaned);

			// Don't suggest the same command
			if (cleaned && cleaned !== command) {
				return cleaned;
			}
		} catch (e) {
			console.log('[QuickFix AI] Error:', e);
		}
		return undefined;
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
