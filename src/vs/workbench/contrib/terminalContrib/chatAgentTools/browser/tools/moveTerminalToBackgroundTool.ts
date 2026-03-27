/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { RunInTerminalTool } from './runInTerminalTool.js';
import { TerminalToolId } from './toolIds.js';

export const MoveTerminalToBackgroundToolData: IToolData = {
	id: TerminalToolId.MoveTerminalToBackground,
	toolReferenceName: 'moveTerminalToBackground',
	displayName: localize('moveTerminalToBackgroundTool.displayName', 'Move Terminal to Background'),
	modelDescription: `Move a foreground terminal execution to the background so it continues running without blocking. Use this when a foreground terminal command is taking longer than expected and you can continue with other work. After moving to background, use ${TerminalToolId.GetTerminalOutput} to check its output or ${TerminalToolId.AwaitTerminal} to wait for completion.`,
	icon: Codicon.terminal,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: `The ID of the terminal to move to the background (returned by ${TerminalToolId.RunInTerminal}).`,
				pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
			},
		},
		required: ['id']
	}
};

export interface IMoveTerminalToBackgroundInputParams {
	id: string;
}

export class MoveTerminalToBackgroundTool extends Disposable implements IToolImpl {

	constructor(
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
	) {
		super();
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('moveToBackground.progressive', "Moving terminal to background"),
			pastTenseMessage: localize('moveToBackground.past', "Moved terminal to background"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IMoveTerminalToBackgroundInputParams;

		const execution = RunInTerminalTool.getExecution(args.id);
		if (!execution) {
			return {
				content: [{
					kind: 'text',
					value: `Error: No active terminal execution found with ID ${args.id}. The terminal may have already completed or the ID is invalid.`
				}]
			};
		}

		const terminalToolSessionId = execution.terminalToolSessionId;
		if (!terminalToolSessionId) {
			return {
				content: [{
					kind: 'text',
					value: `Error: Terminal execution ${args.id} does not have a session ID and cannot be moved to the background.`
				}]
			};
		}

		// Fire the continue-in-background event. This triggers the existing listener
		// in RunInTerminalTool that calls execution.setBackground(), resolves the
		// foreground race promise, and cleans up session terminal associations.
		this._terminalChatService.continueInBackground(terminalToolSessionId);

		const currentOutput = execution.getOutput();
		const outputSummary = currentOutput
			? `Output collected so far:\n${currentOutput}`
			: 'No output has been captured yet.';

		return {
			content: [{
				kind: 'text',
				value: `Successfully moved terminal ${args.id} to the background. The command continues running. Use ${TerminalToolId.GetTerminalOutput} to check its output or ${TerminalToolId.AwaitTerminal} to wait for completion.\n${outputSummary}`
			}]
		};
	}
}
