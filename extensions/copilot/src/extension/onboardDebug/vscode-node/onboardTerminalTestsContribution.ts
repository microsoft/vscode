/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IDebuggableCommandIdentifier } from '../node/debuggableCommandIdentifier';
import { COPILOT_DEBUG_COMMAND } from './copilotDebugCommandContribution';

const PROVIDER_ID = 'copilot-chat.terminalToDebugging';
const PROVIDER_ID2 = 'copilot-chat.terminalToDebuggingSuccess';

export class OnboardTerminalTestsContribution extends Disposable implements vscode.TerminalQuickFixProvider {
	/**
	 * Execution end events for terminals. This is a hacky back door to get
	 * output info into quick fixes.
	 */
	private lastExecutionFor = new Map<vscode.Terminal, vscode.TerminalShellExecutionStartEvent>();

	constructor(
		@IDebuggableCommandIdentifier private readonly debuggableCommandIdentifier: IDebuggableCommandIdentifier,
	) {
		super();
		this._register(vscode.window.registerTerminalQuickFixProvider(PROVIDER_ID, this));
		this._register(vscode.window.registerTerminalQuickFixProvider(PROVIDER_ID2, this));
		this._register(vscode.window.onDidCloseTerminal(e => {
			this.lastExecutionFor.delete(e);
		}));
		this._register(vscode.window.onDidStartTerminalShellExecution(e => {
			this.lastExecutionFor.set(e.terminal, e);
		}));
		this._register(vscode.commands.registerCommand('github.copilot.chat.rerunWithCopilotDebug', () => {
			const terminal = vscode.window.activeTerminal;
			const execution = terminal && this.lastExecutionFor.get(terminal);
			if (!execution) {
				return;
			}

			terminal.sendText(`${COPILOT_DEBUG_COMMAND} ${execution.execution.commandLine.value}`, true);
		}));
	}

	async provideTerminalQuickFixes(
		commandMatchResult: vscode.TerminalCommandMatchResult,
		token: vscode.CancellationToken
	): Promise<undefined | vscode.TerminalQuickFixTerminalCommand> {
		const activeTerminal = vscode.window.activeTerminal?.shellIntegration;
		const cwd = activeTerminal?.cwd;
		if (!await this.debuggableCommandIdentifier.isDebuggable(cwd, commandMatchResult.commandLine, token)) {
			return undefined;
		}

		// todo@connor4312: try to parse stack trace and shell intergation and
		// set a breakpoint on any failure position
		return {
			terminalCommand: `${COPILOT_DEBUG_COMMAND} ${commandMatchResult.commandLine}`,
			shouldExecute: false,
		};
	}
}
