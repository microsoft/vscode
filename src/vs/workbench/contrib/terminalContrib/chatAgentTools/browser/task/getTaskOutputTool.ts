/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../../chat/common/languageModelToolsService.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { getOutput } from '../bufferOutputPolling.js';
import { getTaskDefinition, getTaskForTool } from './taskHelpers.js';

export const GetTaskOutputToolData: IToolData = {
	id: 'get_task_output2',
	toolReferenceName: 'getTaskOutput',
	displayName: localize('getTaskOutputTool.displayName', 'Get Task Output'),
	modelDescription: 'Get the output of a task',
	source: ToolDataSource.Internal,
	canBeReferencedInPrompt: true,
	inputSchema: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: 'The task ID for which to get the output.'
			},
			workspaceFolder: {
				type: 'string',
				description: 'The workspace folder path containing the task'
			},
		},
		required: [
			'id',
			'workspaceFolder'
		]
	}
};

export interface IGetTaskOutputInputParams {
	id: string;
	workspaceFolder: string;
}

export class GetTaskOutputTool extends Disposable implements IToolImpl {
	constructor(
		@ITaskService private readonly _tasksService: ITaskService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
	}
	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IGetTaskOutputInputParams;

		const taskDefinition = await getTaskDefinition(args.id);
		const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._tasksService);
		if (!task) {
			return { invocationMessage: new MarkdownString(`Task not found: \`${args.id}\``) };
		}
		const activeTasks = await this._tasksService.getActiveTasks();
		if (activeTasks.includes(task)) {
			return { invocationMessage: new MarkdownString(`The task \`${taskDefinition.taskLabel}\` is already running.`) };
		}

		return {
			invocationMessage: new MarkdownString(`Checking terminal output for \`${taskDefinition.taskLabel}\``),
			pastTenseMessage: new MarkdownString(`Checked terminal output for \`${taskDefinition.taskLabel}\``),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IGetTaskOutputInputParams;
		const taskDefinition = await getTaskDefinition(args.id);
		const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._tasksService);
		if (!task) {
			return { content: [], toolResultMessage: new MarkdownString(`Task not found: \`${args.id}\``) };
		}

		const resource = this._tasksService.getTerminalForTask(task);
		const terminal = this._terminalService.instances.find(t => t.resource.path === resource?.path && t.resource.scheme === resource.scheme);
		if (!terminal) {
			return { content: [], toolResultMessage: new MarkdownString(`Terminal not found for task \`${taskDefinition?.taskLabel}\``) };
		}
		return {
			content: [{
				kind: 'text',
				value: `Output of task \`${taskDefinition.taskLabel}\`:\n${getOutput(terminal)}`
			}]
		};
	}
}
