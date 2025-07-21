/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { localize } from '../../../../../nls.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../chat/common/languageModelToolsService.js';
import { TaskDefinitionRegistry } from '../../../tasks/common/taskDefinitionRegistry.js';
import { ITaskDefinition } from '../../../tasks/common/tasks.js';
import { ITaskService, ITaskSummary, Task } from '../../../tasks/common/taskService.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { pollForOutputAndIdle, promptForMorePolling } from './bufferOutputPolling.js';
import { getOutput } from './outputHelpers.js';

type RunTaskToolClassification = {
	taskId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the task.' };
	bufferLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The length of the terminal buffer as a string.' };
	pollDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long polling for output took (ms).' };
	owner: 'meganrogge';
	comment: 'Understanding the usage of the runTask tool';
};
type RunTaskToolEvent = {
	taskId: string;
	bufferLength: number;
	pollDurationMs: number | undefined;
};

interface IRunTaskToolInput extends IToolInvocation {
	id: string;
	workspaceFolder: string;
}

export class RunTaskTool implements IToolImpl {

	constructor(
		@ITaskService private readonly _tasksService: ITaskService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IChatService private readonly _chatService: IChatService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IRunTaskToolInput;

		if (!invocation.context) {
			return { content: [], toolResultMessage: `No invocation context` };
		}
		const taskDefinition = await this._getTaskDefinition(args);
		const task = (await this._tasksService.tasks()).find(t => {
			return t.getDefinition() === taskDefinition?.task;
		});
		if (!taskDefinition || !task) {
			return { content: [], toolResultMessage: `Task not found: ${args.id}` };
		}
		const activeTasks = await this._tasksService.getActiveTasks();
		if (activeTasks.includes(task)) {
			return { content: [], toolResultMessage: `The task is already running.` };
		}

		const raceResult = await Promise.race([this._tasksService.run(task), timeout(3000)]);
		const result: ITaskSummary | undefined = raceResult && typeof raceResult === 'object' ? raceResult as ITaskSummary : undefined;

		const sessionId = this._tasksService.getTerminalSessionIdForTask(task);
		const terminal = this._terminalService.instances.find(t => t.sessionId === sessionId);
		if (!terminal) {
			return { content: [], toolResultMessage: `Task started but no terminal found for task ${taskDefinition.taskLabel}` };
		}

		let outputAndIdle = await pollForOutputAndIdle({ getOutput: () => getOutput(terminal), isActive: () => this._isTaskActive(task) }, false, token, this._languageModelsService);
		if (!outputAndIdle.terminalExecutionIdleBeforeTimeout) {
			const extendPolling = await promptForMorePolling(taskDefinition.taskLabel, invocation.context, this._chatService);
			if (extendPolling) {
				outputAndIdle = await pollForOutputAndIdle({ getOutput: () => getOutput(terminal), isActive: () => this._isTaskActive(task) }, true, token, this._languageModelsService);
			}
		}
		let output = '';
		if (result?.exitCode) {
			output = `Task finished with exit code ${result.exitCode}.`;
		} else {
			if (outputAndIdle.terminalExecutionIdleBeforeTimeout) {
				output += ` Task finished with output: ${outputAndIdle.output}`;
			} else {
				output += ` Task started and will continue to run in the background with current output: ${outputAndIdle.output}.`;
			}
		}
		this._telemetryService.publicLog2?.<RunTaskToolEvent, RunTaskToolClassification>('copilotChat.runTaskTool.run', {
			taskId: args.id,
			bufferLength: outputAndIdle.output.length,
			pollDurationMs: outputAndIdle?.pollDurationMs ?? 0,
		});
		return { content: [], toolResultMessage: output };
	}


	private async _isTaskActive(task: Task): Promise<boolean> {
		const activeTasks = await this._tasksService.getActiveTasks();
		return Promise.resolve(activeTasks?.includes(task));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunTaskToolInput;

		const taskDefinition = (await this._getTaskDefinition(args));
		const task = (await this._tasksService.tasks()).find(t => {
			return t.getDefinition() === taskDefinition?.task;
		});
		if (!task || !taskDefinition) {
			return { invocationMessage: `Task not found: ${args.id}` };
		}

		const activeTasks = await this._tasksService.getActiveTasks();
		if (task && activeTasks.includes(task)) {
			return { invocationMessage: `The task is already running.` };
		}

		if (!task) {
			return { invocationMessage: `Task not found: ${args.id}` };
		}

		// const position = workspaceFolder && task && await this._tasksService.getTaskConfigPosition(workspaceFolder, task);
		// const link = (s: string) => position ? `[${s}](${position.uri.toString()}#${position.range.startLineNumber}-${position.range.endLineNumber})` : s;
		// const trustedMark = (value: string) => {
		// 	const s = new MarkdownString(value);
		// 	s.isTrusted = true;
		// 	return s;
		// };

		if (await this._isTaskActive(task)) {
			return {
				// TODO: do these have to be localized?
				invocationMessage: `${(taskDefinition.taskLabel ?? args.id)} is already running.`,
				pastTenseMessage: `${(taskDefinition.taskLabel ?? args.id)} was already running.`,
				confirmationMessages: undefined
			};
		}

		return {
			invocationMessage: `Running ${taskDefinition.taskLabel}`,
			pastTenseMessage: task?.configurationProperties.isBackground ? `Started ${taskDefinition.taskLabel}` : `Ran ${taskDefinition.taskLabel}`,
			confirmationMessages: task
				? { title: `Allow task run?`, message: `Allow Copilot to run the task ${taskDefinition.taskLabel}?` }
				: undefined
		};
	}

	private async _getTaskDefinition(input: IRunTaskToolInput) {
		const idx = input.id.indexOf(': ');
		const taskType = input.id.substring(0, idx);
		let taskLabel = input.id.substring(idx + 2);

		let foundTask: ITaskDefinition | undefined;
		TaskDefinitionRegistry.all()?.forEach((t: ITaskDefinition, i) => {
			if (t.taskType === taskType && (t.properties?.label || String(i)) === taskLabel) {
				foundTask = t;
			}
		});
		if (foundTask) {
			try {
				if (typeof parseInt(taskLabel) === 'number') {
					taskLabel = input.id;
				}
			} catch { }
			return { task: foundTask, taskLabel };
		}
		return undefined;
	}
}

// ToolRegistry.registerTool(RunTaskTool);


export function getTaskRepresentation(task: Task): string {
	const taskDefinition = task.getDefinition(true);
	if (!taskDefinition) {
		return '';
	}
	if ('label' in taskDefinition) {
		return taskDefinition.label;
	} else if ('script' in taskDefinition) {
		return taskDefinition.script;
	} else if ('command' in taskDefinition) {
		return taskDefinition.command;
	}
	return '';
}


export const RunTaskToolData: IToolData = {
	id: 'run_task2',
	toolReferenceName: 'runTask2',
	canBeReferencedInPrompt: true,
	displayName: localize('runInTerminalTool.displayName', 'Run Task'),
	modelDescription: 'Runs a VS Code task.\n\n- If you see that an appropriate task exists for building or running code, prefer to use this tool to run the task instead of using the run_in_terminal tool.\n- Make sure that any appropriate build or watch task is running before trying to run tests or execute code.\n- If the user asks to run a task, use this tool to do so.',
	userDescription: localize('runInTerminalTool.userDescription', 'Tool for running tasks in the workspace'),
	source: ToolDataSource.Internal,
	inputSchema: {
		'type': 'object',
		'properties': {
			'workspaceFolder': {
				'type': 'string',
				'description': 'The workspace folder path containing the task'
			},
			'id': {
				'type': 'string',
				'description': 'The task ID to run.'
			}
		},
		'required': [
			'workspaceFolder',
			'id'
		]
	}
};


