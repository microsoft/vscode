/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress, CountTokensCallback } from '../languageModelToolsService.js';

export const TaskCompleteToolId = 'task_complete';

/**
 * Message sent to the agent when the session goes idle without task completion.
 */
export const AUTOPILOT_CONTINUATION_MESSAGE =
	'You have not yet marked the task as complete using the task_complete tool. ' +
	'You MUST call task_complete when done — whether the task involved code changes, answering a question, or any other interaction.\n\n' +
	'Do NOT repeat or restate your previous response. Pick up where you left off.\n\n' +
	'If you were planning, stop planning and start implementing. ' +
	'You are not done until you have fully completed the task.\n\n' +
	'IMPORTANT: Do NOT call task_complete if:\n' +
	'- You have open questions or ambiguities — make good decisions and keep working\n' +
	'- You encountered an error — try to resolve it or find an alternative approach\n' +
	'- There are remaining steps — complete them first\n\n' +
	'Keep working autonomously until the task is truly finished, then call task_complete.';

export const TaskCompleteToolData: IToolData = {
	id: TaskCompleteToolId,
	displayName: 'Task Complete',
	modelDescription:
		'Signal that the user\'s task is fully done. You MUST call this tool when your work is complete — ' +
		'whether you made code changes, answered a question, or completed any other kind of task. ' +
		'Provide a brief summary of what was accomplished. If the summary is trivial (e.g. answering a question), omit it. ' +
		'Do not restate the summary in your message text — it is shown to the user directly.\n\n' +
		'When to call:\n' +
		'- After answering the user\'s question or completing a conversational request\n' +
		'- After you have completed ALL requested changes\n' +
		'- After verifying results: tests pass, terminal commands succeeded, tool calls returned expected output\n\n' +
		'When NOT to call:\n' +
		'- If a terminal command failed or produced unexpected output\n' +
		'- If an MCP or external tool call returned an error\n' +
		'- If you encountered errors you have not resolved\n' +
		'- If there are remaining steps to complete\n' +
		'- If you have not verified your changes work',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			summary: {
				type: 'string',
				description: 'Brief summary of what was accomplished. Omit for trivial interactions.',
			},
		},
	},
};

export class TaskCompleteTool implements IToolImpl {
	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			presentation: ToolInvocationPresentation.Hidden,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { summary?: string };
		const summary = params?.summary ?? 'All done!';
		return {
			content: [{
				kind: 'text',
				value: summary,
			}],
		};
	}
}
