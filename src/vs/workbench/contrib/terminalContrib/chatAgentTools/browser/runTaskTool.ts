/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { localize } from '../../../../../nls.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../chat/common/languageModelToolsService.js';
import { TaskDefinitionRegistry } from '../../../tasks/common/taskDefinitionRegistry.js';
import { ITaskDefinition } from '../../../tasks/common/tasks.js';
import { ITaskService, ITaskSummary, Task } from '../../../tasks/common/taskService.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { getOutput } from './outputHelpers.js';

// Telemetry event and classification types for runTaskTool
type RunTaskToolClassification = {
	taskLabel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The label of the task.' };
	reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Why the polling ended: idle or inactive.' };
	bufferLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The length of the terminal buffer as a string.' };
	taskRunDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long the task ran (ms).' };
	pollDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long polling for output took (ms).' };
	totalDuration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total duration from start to finish (ms).' };
	evalDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long output evaluation took (ms).' };
	owner: 'meganrogge';
	comment: 'Understanding the usage of the runTask tool';
};
type RunTaskToolEvent = {
	taskLabel: string;
	reason: 'idle' | 'inactive' | undefined;
	bufferLength: string;
	taskRunDurationMs: number;
	pollDurationMs: number | undefined;
	totalDuration: number | undefined;
	evalDurationMs: number | undefined;
};

interface IRunTaskToolInput extends IToolInvocation {
	id: string;
	workspaceFolder: string;
}

export class RunTaskTool implements IToolImpl {

	private _lastBufferLength: number | undefined;

	constructor(
		@ITaskService private readonly _tasksService: ITaskService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) { }

	async invoke(options: IRunTaskToolInput, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = options.parameters as IRunTaskToolInput;
		const taskDefinition = await this._getTaskDefinition(args);
		const task = (await this._tasksService.tasks()).find(t => {
			return t.getDefinition() === taskDefinition?.task;
		});
		if (!taskDefinition || !task) {
			return { content: [], toolResultMessage: `Task not found: ${options.id}` };
		}
		const activeTasks = await this._tasksService.getActiveTasks();
		if (taskDefinition && activeTasks.includes(task)) {
			return { content: [], toolResultMessage: `The task is already running.` };
		}

		if (!taskDefinition) {
			return { content: [], toolResultMessage: `Task not found: ${options.id}` };
		}

		const totalStartTime = Date.now();
		const taskStartTime = totalStartTime;
		const raceResult = await Promise.race([this._tasksService.run(task), timeout(3000)]);
		const result: ITaskSummary | undefined = raceResult && typeof raceResult === 'object' ? raceResult as ITaskSummary : undefined;
		const taskEndTime = Date.now();
		const taskRunDurationMs = taskEndTime - taskStartTime;
		let totalDurationMs: number | undefined;

		// Start with 500 to ensure the buffer has content
		const checkIntervals = [1000, 100, 100, 100, 100, 100];

		let pollStartTime: number | undefined;
		let pollEndTime: number | undefined;
		let pollDurationMs: number | undefined;
		let idleOrInactive: 'idle' | 'inactive' | undefined;

		let lastEvalDurationMs: number | undefined;
		if (taskDefinition) {
			let terminal: ITerminalInstance | undefined;
			let idleCount = 0;
			pollStartTime = Date.now();
			for (const interval of checkIntervals) {
				await timeout(interval);
				if (!terminal) {
					const sessionId = this._tasksService.getTerminalSessionIdForTask(task);
					terminal = this._terminalService.instances.find(t => t.sessionId === sessionId);
				}
				if (!terminal) {
					break;
				}
				const buffer = getOutput(terminal);
				const inactive = !this._isTaskActive(task);

				const currentBufferLength = buffer.length;
				this._lastBufferLength = currentBufferLength;

				if (currentBufferLength === this._lastBufferLength) {
					idleCount++;
				} else {
					idleCount = 0;
				}

				// If buffer is idle for threshold or task is inactive, evaluate output
				if (idleCount >= 2 || inactive) {
					pollEndTime = Date.now();
					pollDurationMs = pollEndTime - (pollStartTime ?? pollEndTime);
					idleOrInactive = inactive ? 'inactive' : 'idle';
					const evalStartTime = Date.now();
					const evalResult = await this._evaluateOutputForErrors(buffer, token);
					const evalEndTime = Date.now();
					const evalDurationMs = evalEndTime - evalStartTime;
					lastEvalDurationMs = evalDurationMs;
					totalDurationMs = Date.now() - totalStartTime;
					this._telemetryService.publicLog2?.<RunTaskToolEvent, RunTaskToolClassification>('copilotChat.runTaskTool.run', {
						taskLabel: taskDefinition.taskLabel,
						reason: idleOrInactive,
						bufferLength: String(buffer.length),
						taskRunDurationMs,
						pollDurationMs,
						totalDuration: totalDurationMs,
						evalDurationMs: lastEvalDurationMs
					});
					return { content: [], toolResultMessage: evalResult };
				}
			}
		}

		if (!pollDurationMs) {
			totalDurationMs = Date.now() - totalStartTime;
			this._telemetryService.publicLog2?.<RunTaskToolEvent, RunTaskToolClassification>('copilotChat.runTaskTool.run', {
				taskLabel: taskDefinition.taskLabel,
				reason: undefined,
				bufferLength: '0',
				taskRunDurationMs,
				pollDurationMs: undefined,
				totalDuration: totalDurationMs,
				evalDurationMs: lastEvalDurationMs
			});
		}

		let output: string = 'Task started and will continue to run in the background.';

		if (result?.exitCode) {
			output = `Task finished with exit code ${result.exitCode}.`;
		} else {
			output = 'Task started and will continue to run in the background.';
		}

		return { content: [], toolResultMessage: output };
	}

	private async _isTaskActive(task: Task): Promise<boolean> {
		const activeTasks = await this._tasksService.getActiveTasks();
		return Promise.resolve(activeTasks?.includes(task));
	}

	private async _evaluateOutputForErrors(output: string, token: CancellationToken): Promise<string> {
		return `The task output is ${output}`;

		//TODO:
		// const endpoint = await this._endpointProvider.getChatEndpoint('gpt-4o-mini');

		// const fetchResult = await endpoint.makeChatRequest(
		// 	'taskOutputEvaluation',
		// 	[{ role: ChatRole.User, content: [{ type: ChatCompletionContentPartKind.Text, text: `Review this output to determine if the task exited or if there are errors ${output}. If it has exited, explain why.` }] }],
		// 	undefined,
		// 	token,
		// 	ChatLocation.Panel
		// );
		// if (fetchResult.type !== 'success') {
		// 	return 'Error evaluating task output';
		// }
		// return fetchResult.value;
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


