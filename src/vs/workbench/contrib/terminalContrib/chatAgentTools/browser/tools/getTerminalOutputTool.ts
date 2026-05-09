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

export const GetTerminalOutputToolData: IToolData = {
	id: TerminalToolId.GetTerminalOutput,
	toolReferenceName: 'getTerminalOutput',
	legacyToolReferenceFullNames: ['runCommands/getTerminalOutput'],
	displayName: localize('getTerminalOutputTool.displayName', 'Get Terminal Output'),
	modelDescription: `Get output from an active terminal execution (identified by the \`id\` returned from ${TerminalToolId.RunInTerminal}).`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: `The ID of an active terminal execution to check (returned by ${TerminalToolId.RunInTerminal} for async executions, or for sync executions that timed out and were moved to the background). This must be the exact opaque UUID returned by that tool; terminal names, labels, or integers are invalid.`,
				pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
			},
		},
		required: ['id'],
	}
};

export interface IGetTerminalOutputInputParams {
	id?: string;
}

export class GetTerminalOutputTool extends Disposable implements IToolImpl {

	constructor() {
		super();
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('getTerminalOutput.progressive', "Checking terminal output"),
			pastTenseMessage: localize('getTerminalOutput.past', "Checked terminal output"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IGetTerminalOutputInputParams;

		if (!args.id) {
			return {
				content: [{
					kind: 'text',
					value: `Error: 'id' (the persistent terminal UUID returned by ${TerminalToolId.RunInTerminal} in async mode) must be provided.`
				}]
			};
		}

		const execution = RunInTerminalTool.getExecution(args.id);
		if (!execution) {
			return {
				content: [{
					kind: 'text',
					value: `Error: No active terminal execution found with ID ${args.id}. The ID must be the exact value returned by ${TerminalToolId.RunInTerminal} in async mode.`
				}]
			};
		}

		return {
			content: [{
				kind: 'text',
				value: `Output of terminal ${args.id}:\n${execution.getOutput()}`
			}]
		};
	}
}
