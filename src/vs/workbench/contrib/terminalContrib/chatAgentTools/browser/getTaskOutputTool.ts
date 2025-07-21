/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/languageModelToolsService.js';
import { ConfiguringTask } from '../../../tasks/common/tasks.js';
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

		let task;
		let index = 0;
		const taskDefinition = await getTaskDefinition(args.id);
		// TODO: fix hack with file://
		const wTasks: IStringDictionary<ConfiguringTask> | undefined = (await this._tasksService.getWorkspaceTasks())?.get('file://' + args.workspaceFolder)?.configurations?.byIdentifier;
		for (const workspaceTask of Object.values(wTasks ?? {})) {
			if ((!workspaceTask.type || workspaceTask.type === taskDefinition?.taskType) && workspaceTask._label === taskDefinition?.taskLabel) {
				task = workspaceTask;
				break;
			} else if (args.id === workspaceTask.type + ': ' + index) {
				task = workspaceTask;
				break;
			}
			index++;
		}

		// TODO: make these markdown too?
		if (!task) {
			return { invocationMessage: `Task not found: \`${args.id}\`` };
		}
		const resolvedTask = await this._tasksService.tryResolveTask(task);
		if (!resolvedTask) {
			return { invocationMessage: `Task not found: \`${args.id}\`` };
		}

		const activeTasks = await this._tasksService.getActiveTasks();
		if (activeTasks.includes(resolvedTask)) {
			return { invocationMessage: `The task \`${taskDefinition.taskLabel}\` is already running.` };
		}

		return {
			invocationMessage: `Checking terminal output for \`${taskDefinition.taskLabel}\``,
			pastTenseMessage: `Checked terminal output for \`${taskDefinition.taskLabel}\``,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IGetTaskOutputInputParams;
		let task;
		let index = 0;
		const taskDefinition = await getTaskDefinition(args.id);
		// TODO: fix hack with file://
		const wTasks: IStringDictionary<ConfiguringTask> | undefined = (await this._tasksService.getWorkspaceTasks())?.get('file://' + args.workspaceFolder)?.configurations?.byIdentifier;
		for (const workspaceTask of Object.values(wTasks ?? {})) {
			if ((!workspaceTask.type || workspaceTask.type === taskDefinition?.taskType) && workspaceTask._label === taskDefinition?.taskLabel) {
				task = workspaceTask;
				break;
			} else if (args.id === workspaceTask.type + ': ' + index) {
				task = workspaceTask;
				break;
			}
			index++;
		}

		if (!task) {
			return { content: [], toolResultMessage: `Task not found: \`${args.id}\`` };
		}
		const resolvedTask = await this._tasksService.tryResolveTask(task);
		if (!resolvedTask) {
			return { content: [], toolResultMessage: `Task not found: \`${args.id}\`` };
		}


		const resource = this._tasksService.getTerminalForTask(resolvedTask);
		const terminal = this._terminalService.instances.find(t => t.resource.path === resource?.path && t.resource.scheme === resource.scheme);
		if (!terminal) {
			return { content: [], toolResultMessage: `Terminal not found for task \`${taskDefinition?.taskLabel}\`` };
		}
		return {
			content: [{
				kind: 'text',
				value: `Output of task \`${taskDefinition.taskLabel}\`:\n${getOutput(terminal)}`
			}]
		};
	}
}
