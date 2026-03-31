/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
import { TerminalToolId } from './toolIds.js';

export const SendToTerminalToolData: IToolData = {
	id: TerminalToolId.SendToTerminal,
	toolReferenceName: 'sendToTerminal',
	displayName: localize('sendToTerminalTool.displayName', 'Send to Terminal'),
	modelDescription: `Send a command or input to an existing background terminal. Use this to interact with long-running processes (e.g., SSH sessions, REPLs, servers) that were started with ${TerminalToolId.RunInTerminal}. The command will be sent as keyboard input to the terminal. The ID must be the exact opaque value returned by ${TerminalToolId.RunInTerminal}.`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: `The ID of the background terminal to send input to (returned by ${TerminalToolId.RunInTerminal}).`,
				pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
			},
			command: {
				type: 'string',
				description: 'The command or input text to send to the terminal. The text will be sent followed by Enter (executed). Use this to type commands, answer prompts, or send input to interactive programs.'
			},
		},
		required: [
			'id',
			'command',
		]
	}
};

export interface ISendToTerminalInputParams {
	id: string;
	command: string;
}

export class SendToTerminalTool extends Disposable implements IToolImpl {
	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('send.progressive', "Sending command to terminal"),
			pastTenseMessage: localize('send.past', "Sent command to terminal"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as ISendToTerminalInputParams;

		const execution = RunInTerminalTool.getExecution(args.id);
		if (!execution) {
			return {
				content: [{
					kind: 'text',
					value: `Error: No active terminal execution found with ID ${args.id}. The terminal may have already been killed or the ID is invalid. The ID must be the exact value returned by ${TerminalToolId.RunInTerminal}.`
				}]
			};
		}

		// Send the command text to the terminal, executing it (shouldExecute=true adds Enter)
		await execution.instance.sendText(args.command, true);

		const output = execution.getOutput();

		return {
			content: [{
				kind: 'text',
				value: `Successfully sent command to terminal ${args.id}. Current terminal output:\n${output}`
			}]
		};
	}
}
