/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { localize } from '../../../../../../../nls.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { IChatService } from '../../../../../chat/common/chatService.js';
import { ILanguageModelsService } from '../../../../../chat/common/languageModels.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../../chat/common/languageModelToolsService.js';
import { ITaskService, ITaskSummary, Task, TasksAvailableContext } from '../../../../../tasks/common/taskService.js';
import { ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { collectTerminalResults, getTaskDefinition, getTaskForTool, resolveDependencyTasks, toolResultDetailsFromResponse } from '../../taskHelpers.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { OutputMonitorState } from '../monitoring/bufferOutputPollingTypes.js';

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
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IRunTaskToolInput;

		if (!invocation.context) {
			return { content: [{ kind: 'text', value: `No invocation context` }], toolResultMessage: `No invocation context` };
		}

		const taskDefinition = getTaskDefinition(args.id);
		const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
		if (!task) {
			return { content: [{ kind: 'text', value: `Task not found: ${args.id}` }], toolResultMessage: new MarkdownString(localize('copilotChat.taskNotFound', 'Task not found: `{0}`', args.id)) };
		}
		const taskLabel = task._label;
		const activeTasks = await this._tasksService.getActiveTasks();
		if (activeTasks.includes(task)) {
			return { content: [{ kind: 'text', value: `The task ${taskLabel} is already running.` }], toolResultMessage: new MarkdownString(localize('copilotChat.taskAlreadyRunning', 'The task `{0}` is already running.', taskLabel)) };
		}

		const raceResult = await Promise.race([this._tasksService.run(task), timeout(3000)]);
		const result: ITaskSummary | undefined = raceResult && typeof raceResult === 'object' ? raceResult as ITaskSummary : undefined;

		const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
		const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
		if (!resources || resources.length === 0) {
			return { content: [{ kind: 'text', value: `Task started but no terminal was found for: ${taskLabel}` }], toolResultMessage: new MarkdownString(localize('copilotChat.noTerminal', 'Task started but no terminal was found for: `{0}`', taskLabel)) };
		}
		const terminals = this._terminalService.instances.filter(t => resources.some(r => r.path === t.resource.path && r.scheme === t.resource.scheme));
		if (terminals.length === 0) {
			return { content: [{ kind: 'text', value: `Task started but no terminal was found for: ${taskLabel}` }], toolResultMessage: new MarkdownString(localize('copilotChat.noTerminal', 'Task started but no terminal was found for: `{0}`', taskLabel)) };
		}

		const terminalResults = await collectTerminalResults(
			terminals,
			task,
			this._languageModelsService,
			this._tasksService,
			this._chatService,
			invocation.context!,
			_progress,
			token,
			() => this._isTaskActive(task),
			dependencyTasks
		);
		for (const r of terminalResults) {
			this._telemetryService.publicLog2?.<RunTaskToolEvent, RunTaskToolClassification>('copilotChat.runTaskTool.run', {
				taskId: args.id,
				bufferLength: r.output.length ?? 0,
				pollDurationMs: r.pollDurationMs ?? 0,
			});
		}

		const details = terminalResults.map(r => `Terminal: ${r.name}\nOutput:\n${r.output}`);
		const uniqueDetails = Array.from(new Set(details)).join('\n\n');
		const toolResultDetails = toolResultDetailsFromResponse(terminalResults);

		let resultSummary = '';
		if (result?.exitCode) {
			resultSummary = localize('copilotChat.taskFailedWithExitCode', 'Task `{0}` failed with exit code {1}.', taskLabel, result.exitCode);
		} else {
			resultSummary += `\`${taskLabel}\` task `;
			resultSummary += terminalResults.every(r => r.state === OutputMonitorState.Idle)
				? (toolResultDetails.length ? `finished with \`${toolResultDetails.length}\` problems` : 'finished')
				: (toolResultDetails.length ? `started and will continue to run in the background with \`${toolResultDetails.length}\` problems` : 'started and will continue to run in the background');
		}

		return {
			content: [{ kind: 'text', value: uniqueDetails }],
			toolResultMessage: new MarkdownString(resultSummary),
			toolResultDetails: toolResultDetails
		};
	}

	private async _isTaskActive(task: Task): Promise<boolean> {
		const activeTasks = await this._tasksService.getActiveTasks();
		return Promise.resolve(activeTasks?.includes(task));
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunTaskToolInput;
		const taskDefinition = getTaskDefinition(args.id);

		const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
		if (!task) {
			return { invocationMessage: new MarkdownString(localize('copilotChat.taskNotFound', 'Task not found: `{0}`', args.id)) };
		}
		const taskLabel = task._label;
		const activeTasks = await this._tasksService.getActiveTasks();
		if (task && activeTasks.includes(task)) {
			return { invocationMessage: new MarkdownString(localize('copilotChat.taskAlreadyActive', 'The task is already running.')) };
		}

		if (await this._isTaskActive(task)) {
			return {
				invocationMessage: new MarkdownString(localize('copilotChat.taskIsAlreadyRunning', '`{0}` is already running.', taskLabel)),
				pastTenseMessage: new MarkdownString(localize('copilotChat.taskWasAlreadyRunning', '`{0}` was already running.', taskLabel)),
				confirmationMessages: undefined
			};
		}

		return {
			invocationMessage: new MarkdownString(localize('copilotChat.runningTask', 'Running `{0}`', taskLabel)),
			pastTenseMessage: new MarkdownString(task?.configurationProperties.isBackground
				? localize('copilotChat.startedTask', 'Started `{0}`', taskLabel)
				: localize('copilotChat.ranTask', 'Ran `{0}`', taskLabel)),
			confirmationMessages: task
				? { title: localize('copilotChat.allowTaskRunTitle', 'Allow task run?'), message: localize('copilotChat.allowTaskRunMsg', 'Allow Copilot to run the task `{0}`?', taskLabel) }
				: undefined
		};
	}
}

export const RunTaskToolData: IToolData = {
	id: 'run_task',
	toolReferenceName: 'runTask',
	displayName: localize('runInTerminalTool.displayName', 'Run Task'),
	modelDescription: 'Runs a VS Code task.\n\n- If you see that an appropriate task exists for building or running code, prefer to use this tool to run the task instead of using the run_in_terminal tool.\n- Make sure that any appropriate build or watch task is running before trying to run tests or execute code.\n- If the user asks to run a task, use this tool to do so.',
	userDescription: localize('runInTerminalTool.userDescription', 'Tool for running tasks in the workspace'),
	icon: Codicon.tools,
	source: ToolDataSource.Internal,
	when: TasksAvailableContext,
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


