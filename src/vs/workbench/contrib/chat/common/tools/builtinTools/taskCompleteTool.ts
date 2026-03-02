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
	'You have not yet called task_complete. If you are still planning, stop planning and start working. ' +
	'If you hit an error, try to resolve it or find another approach. ' +
	'Keep going until the task is fully done, then call task_complete.';

export const TaskCompleteToolData: IToolData = {
	id: TaskCompleteToolId,
	displayName: 'Task Complete',
	modelDescription:
		'Signal that the user\'s task is fully done. Call this only after you have made all changes, ' +
		'verified they work (e.g. no compile errors, tests pass if relevant), and are confident nothing remains. ' +
		'Provide a brief summary of what was accomplished. If the summary is trivial (e.g. answering a question), omit it. ' +
		'Do not restate the summary in your message text — it is shown to the user directly.',
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
