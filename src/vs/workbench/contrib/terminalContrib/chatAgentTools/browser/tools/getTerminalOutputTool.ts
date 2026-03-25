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
	modelDescription: `Get the output of a background terminal command previously started with ${TerminalToolId.RunInTerminal}. The ID must be the exact opaque value returned by ${TerminalToolId.RunInTerminal} when isBackground=true; terminal names, labels, and integers are not valid IDs.`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: `The ID of the background terminal to check (returned by ${TerminalToolId.RunInTerminal} when isBackground=true). This must be the exact opaque ID returned by that tool; terminal names, labels, or integers are invalid.`,
				pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
			},
		},
		required: [
			'id',
		]
	}
};

export interface IGetTerminalOutputInputParams {
	id: string;
}

export class GetTerminalOutputTool extends Disposable implements IToolImpl {
	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('bg.progressive', "Checking background terminal output"),
			pastTenseMessage: localize('bg.past', "Checked background terminal output"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IGetTerminalOutputInputParams;
		const execution = RunInTerminalTool.getExecution(args.id);
		if (!execution) {
			return {
				content: [{
					kind: 'text',
					value: `Error: No active terminal execution found with ID ${args.id}. The ID must be the exact value returned by ${TerminalToolId.RunInTerminal} for a background command.`
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
