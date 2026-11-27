/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolInvocationPresentation, ToolProgress, CountTokensCallback } from '../languageModelToolsService.js';

export const TaskCompleteToolId = 'task_complete';

export const TaskCompleteToolData: IToolData = {
	id: TaskCompleteToolId,
	displayName: 'Task Complete',
	modelDescription:
		'Signal that the user\'s task is fully done. You MUST call this tool when your work is complete — ' +
		'whether you made code changes, answered a question, or completed any other kind of task. ' +
		'Provide a brief summary of what was accomplished. ' +
		'Do not restate the summary in your message text — it is shown to the user directly.\n\n' +
		'IMPORTANT: Before calling this tool, you MUST output a brief text message summarizing what was done. ' +
		'The task is not complete until both your summary message AND this tool call are present.\n\n' +
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
