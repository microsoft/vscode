/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/languageModelToolsService.js';
import { ITaskService } from '../../../tasks/common/taskService.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { getOutput } from './bufferOutputPolling.js';
import { getTaskDefinition } from './taskHelpers.js';

export const GetTaskOutputToolData: IToolData = {
	id: 'get_task_output',
	toolReferenceName: 'getTaskOutput',
	displayName: localize('getTaskOutputTool.displayName', 'Get Task Output'),
	modelDescription: 'Get the output of a task',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			command: {
				type: 'string',
				description: 'The ID of the task terminal output to check.'
			},
		},
		required: [
			'id',
		]
	}
};

export interface IGetTaskOutputInputParams {
	id: string;
}

export class GetTaskOutputTool extends Disposable implements IToolImpl {
	constructor(
		@ITaskService private readonly _tasksService: ITaskService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
	}
	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('bg.progressive', "Checking task terminal output"),
			pastTenseMessage: localize('bg.past', "Checked task terminal output"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IGetTaskOutputInputParams;
		const taskDefinition = await getTaskDefinition(args.id);
		const task = (await this._tasksService.tasks()).find(t => {
			return t.getDefinition() === taskDefinition?.task;
		});
		if (!taskDefinition || !task) {
			return { content: [], toolResultMessage: `Task not found: ${taskDefinition?.taskLabel}` };
		}
		const resource = this._tasksService.getTerminalForTask(task);
		const terminal = this._terminalService.instances.find(t => t.resource.path === resource?.path && t.resource.scheme === resource.scheme);
		if (!terminal) {
			return { content: [], toolResultMessage: `Terminal not found for task ${taskDefinition?.taskLabel}` };
		}
		return {
			content: [{
				kind: 'text',
				value: `Output of task ${taskDefinition.taskLabel}:\n${getOutput(terminal)}`
			}]
		};
	}
}
