/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ITaskService } from '../../../tasks/common/taskService.js';
import { CountTokensCallback, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../../common/languageModelToolsService.js';

export const RunTaskToolId = 'vscode_runTask_internal';

export const RunTaskToolData: IToolData = {
	id: RunTaskToolId,
	toolReferenceName: 'runTask',
	canBeReferencedInPrompt: true,
	icon: ThemeIcon.fromId(Codicon.play.id),
	displayName: localize('runTaskTool.displayName', 'Run Task'),
	modelDescription: localize('runTaskTool.modelDescription', 'This tool allows running tasks from the workspace. It can execute npm scripts, build tasks, or any other tasks defined in tasks.json. When the task name is not specified or is undefined, it will try to select an appropriate default task.'),
	userDescription: localize('runTaskTool.userDescription', 'Run a task from the workspace'),
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			task: {
				type: 'string',
				description: 'The name or label of the task to run. If undefined or not provided, a default task will be selected.',
			},
		},
	}
};

export interface IRunTaskToolInput {
	task?: string;
}

export class RunTaskTool implements IToolImpl {

	constructor(
		@ITaskService private readonly taskService: ITaskService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const parameters = invocation.parameters as IRunTaskToolInput;
		let taskName = parameters.task;

		// If task is undefined or not provided, try to find a suitable default task
		if (!taskName || taskName === 'undefined') {
			const resolvedInput = await this.resolveToolInput(parameters);
			taskName = resolvedInput.task;
		}

		if (!taskName) {
			return {
				content: [{
					kind: 'text',
					value: localize('runTaskTool.noTaskFound', 'No task specified and no suitable default task found.')
				}]
			};
		}

		try {
			// Get all available tasks
			const allTasks = await this.taskService.tasks();
			
			// Find the task by name or label
			const taskToRun = allTasks.find(task => 
				task.name === taskName || 
				task._label === taskName ||
				task.configurationProperties.identifier === taskName
			);

			if (!taskToRun) {
				return {
					content: [{
						kind: 'text',
						value: localize('runTaskTool.taskNotFound', 'Task "{0}" not found. Available tasks: {1}', taskName, allTasks.map(t => t.name).join(', '))
					}]
				};
			}

			// Run the task
			const result = await this.taskService.run(taskToRun);
			
			if (result) {
				return {
					content: [{
						kind: 'text',
						value: localize('runTaskTool.taskStarted', 'Task "{0}" started successfully.', taskName)
					}]
				};
			} else {
				return {
					content: [{
						kind: 'text',
						value: localize('runTaskTool.taskFailed', 'Failed to start task "{0}".', taskName)
					}]
				};
			}
		} catch (error) {
			return {
				content: [{
					kind: 'text',
					value: localize('runTaskTool.error', 'Error running task "{0}": {1}', taskName, error instanceof Error ? error.message : String(error))
				}]
			};
		}
	}

	/**
	 * Resolves tool input when task name is undefined or not provided.
	 * Attempts to find a suitable default task from tasks.json.
	 */
	async resolveToolInput(input: IRunTaskToolInput): Promise<IRunTaskToolInput> {
		if (input.task && input.task !== 'undefined') {
			return input;
		}

		try {
			// Get all available tasks
			const allTasks = await this.taskService.tasks();
			
			if (allTasks.length === 0) {
				return input;
			}

			// Priority order for selecting default task:
			// 1. npm start script
			// 2. npm build script  
			// 3. npm test script
			// 4. First npm script
			// 5. First task with 'default' in group
			// 6. First available task

			const npmTasks = allTasks.filter(task => task.type === 'npm');
			
			// Try to find common npm scripts in priority order
			const commonScripts = ['start', 'build', 'test', 'dev', 'serve'];
			for (const scriptName of commonScripts) {
				const task = npmTasks.find(t => t.name === scriptName);
				if (task) {
					return { task: task.name };
				}
			}

			// If no common npm scripts, try first npm task
			if (npmTasks.length > 0) {
				return { task: npmTasks[0].name };
			}

			// Try to find default task in any group
			const defaultTask = allTasks.find(task => 
				task.configurationProperties.group && 
				typeof task.configurationProperties.group === 'object' &&
				task.configurationProperties.group.isDefault
			);
			
			if (defaultTask) {
				return { task: defaultTask.name };
			}

			// Fall back to first available task
			return { task: allTasks[0].name };

		} catch (error) {
			// If there's an error resolving, return the original input
			return input;
		}
	}
}