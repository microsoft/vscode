/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ToolDataSource, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type CountTokensCallback, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';

export const GetTerminalLastCommandToolData: IToolData = {
	id: 'terminal_last_command',
	toolReferenceName: 'terminalLastCommand',
	legacyToolReferenceFullNames: ['runCommands/terminalLastCommand'],
	displayName: localize('terminalLastCommandTool.displayName', 'Get Terminal Last Command'),
	modelDescription: 'Get the last command run in the active terminal.',
	source: ToolDataSource.Internal,
	icon: Codicon.terminal,
};

export class GetTerminalLastCommandTool extends Disposable implements IToolImpl {

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('getTerminalLastCommand.progressive', "Getting last terminal command"),
			pastTenseMessage: localize('getTerminalLastCommand.past', "Got last terminal command"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const activeInstance = this._terminalService.activeInstance;
		if (!activeInstance) {
			return {
				content: [{
					kind: 'text',
					value: 'No active terminal instance found.'
				}]
			};
		}

		const commandDetection = activeInstance.capabilities.get(TerminalCapability.CommandDetection);
		if (!commandDetection) {
			return {
				content: [{
					kind: 'text',
					value: 'No command detection capability available in the active terminal.'
				}]
			};
		}

		const executingCommand = commandDetection.executingCommand;
		if (executingCommand) {
			const userPrompt: string[] = [];
			userPrompt.push('The following command is currently executing in the terminal:');
			userPrompt.push(executingCommand);

			const cwd = commandDetection.cwd;
			if (cwd) {
				userPrompt.push('It is running in the directory:');
				userPrompt.push(cwd);
			}

			return {
				content: [{
					kind: 'text',
					value: userPrompt.join('\n')
				}]
			};
		}

		const commands = commandDetection.commands;
		if (!commands || commands.length === 0) {
			return {
				content: [{
					kind: 'text',
					value: 'No command has been run in the active terminal.'
				}]
			};
		}

		const lastCommand = commands[commands.length - 1];
		const userPrompt: string[] = [];

		if (lastCommand.command) {
			userPrompt.push('The following is the last command run in the terminal:');
			userPrompt.push(lastCommand.command);
		}

		if (lastCommand.cwd) {
			userPrompt.push('It was run in the directory:');
			userPrompt.push(lastCommand.cwd);
		}

		if (lastCommand.exitCode !== undefined) {
			userPrompt.push(`It exited with code: ${lastCommand.exitCode}`);
		}

		if (lastCommand.hasOutput() && lastCommand.getOutput) {
			const output = lastCommand.getOutput();
			if (output && output.trim().length > 0) {
				userPrompt.push('It has the following output:');
				userPrompt.push(output);
			}
		}

		return {
			content: [{
				kind: 'text',
				value: userPrompt.join('\n')
			}]
		};
	}
}
