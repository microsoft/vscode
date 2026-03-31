/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { buildCommandDisplayText, normalizeCommandForExecution } from '../runInTerminalHelpers.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
import { TerminalToolId } from './toolIds.js';

export const SendToTerminalToolData: IToolData = {
	id: TerminalToolId.SendToTerminal,
	toolReferenceName: 'sendToTerminal',
	displayName: localize('sendToTerminalTool.displayName', 'Send to Terminal'),
	modelDescription: `Send a command to an existing background terminal that was started with ${TerminalToolId.RunInTerminal}. Use this to send commands to long-running terminal sessions. The ID must be the exact opaque value returned by ${TerminalToolId.RunInTerminal}. After sending, use ${TerminalToolId.GetTerminalOutput} to check for updated output.`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: `The ID of the background terminal to send a command to (returned by ${TerminalToolId.RunInTerminal}).`,
				pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
			},
			command: {
				type: 'string',
				description: 'The command to send to the terminal. The text will be sent followed by Enter to execute it.'
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
	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as ISendToTerminalInputParams;
		const displayCommand = buildCommandDisplayText(args.command);

		const invocationMessage = new MarkdownString();
		invocationMessage.appendText(localize('send.progressive', "Sending {0} to terminal", displayCommand));

		const pastTenseMessage = new MarkdownString();
		pastTenseMessage.appendText(localize('send.past', "Sent {0} to terminal", displayCommand));

		const confirmationMessage = new MarkdownString();
		confirmationMessage.appendText(localize('send.confirm.message', "Run {0} in background terminal {1}", displayCommand, args.id));

		return {
			invocationMessage,
			pastTenseMessage,
			confirmationMessages: {
				title: localize('send.confirm.title', "Send to Terminal"),
				message: confirmationMessage,
			},
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

		await execution.instance.sendText(normalizeCommandForExecution(args.command), true);

		return {
			content: [{
				kind: 'text',
				value: `Successfully sent command to terminal ${args.id}. Use ${TerminalToolId.GetTerminalOutput} to check for updated output.`
			}]
		};
	}
}
