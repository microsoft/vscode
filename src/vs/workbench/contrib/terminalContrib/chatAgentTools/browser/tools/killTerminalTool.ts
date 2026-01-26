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

export const KillTerminalToolData: IToolData = {
	id: TerminalToolId.KillTerminal,
	toolReferenceName: 'killTerminal',
	displayName: localize('killTerminalTool.displayName', 'Kill Terminal'),
	modelDescription: `Kill a terminal by its ID. Use this to clean up terminals that are no longer needed (e.g., after stopping a server or when a long-running task completes). The terminal ID is returned by ${TerminalToolId.RunInTerminal} when isBackground=true.`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: `The ID of the background terminal to kill (returned by ${TerminalToolId.RunInTerminal} when isBackground=true).`
			},
		},
		required: [
			'id',
		]
	}
};

export interface IKillTerminalInputParams {
	id: string;
}

export class KillTerminalTool extends Disposable implements IToolImpl {
	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('kill.progressive', "Killing terminal"),
			pastTenseMessage: localize('kill.past', "Killed terminal"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IKillTerminalInputParams;

		const execution = RunInTerminalTool.getExecution(args.id);
		if (!execution) {
			return {
				content: [{
					kind: 'text',
					value: `Error: No active terminal execution found with ID ${args.id}. The terminal may have already been killed or the ID is invalid.`
				}]
			};
		}

		// Get the final output before killing
		const finalOutput = execution.getOutput();

		// Dispose the terminal instance (this kills the process)
		execution.instance.dispose();

		// Remove the execution from tracking
		RunInTerminalTool.removeExecution(args.id);

		const outputSummary = finalOutput
			? `Final output before termination:\n${finalOutput}`
			: 'No output was captured.';

		return {
			content: [{
				kind: 'text',
				value: `Successfully killed background terminal ${args.id}. ${outputSummary}`
			}]
		};
	}
}
