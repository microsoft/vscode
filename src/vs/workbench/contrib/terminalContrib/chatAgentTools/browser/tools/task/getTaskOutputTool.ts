/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../../../chat/common/languageModelToolsService.js';
import { ITaskService, Task, TasksAvailableContext } from '../../../../../tasks/common/taskService.js';
import { ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { collectTerminalResults, getTaskDefinition, getTaskForTool, resolveDependencyTasks } from '../../taskHelpers.js';
import { toolResultDetailsFromResponse, toolResultMessageFromResponse } from './taskHelpers.js';

type GetTaskOutputToolClassification = {
	taskId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the task.' };
	bufferLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The length of the terminal buffer as a string.' };
	pollDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long polling for output took (ms).' };
	inputToolManualAcceptCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user manually accepted a detected suggestion' };
	inputToolManualRejectCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user manually rejected a detected suggestion' };
	inputToolManualChars: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of characters input by manual acceptance of suggestions' };
	owner: 'meganrogge';
	comment: 'Understanding the usage of the getTaskOutput tool';
};
type GetTaskOutputToolEvent = {
	taskId: string;
	bufferLength: number;
	pollDurationMs: number | undefined;
	inputToolManualAcceptCount: number;
	inputToolManualRejectCount: number;
	inputToolManualChars: number;
};

export const GetTaskOutputToolData: IToolData = {
	id: 'get_task_output',
	toolReferenceName: 'getTaskOutput',
	displayName: localize('getTaskOutputTool.displayName', 'Get Task Output'),
	modelDescription: 'Get the output of a task',
	source: ToolDataSource.Internal,
	when: TasksAvailableContext,
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
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();
	}
	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IGetTaskOutputInputParams;

		const taskDefinition = getTaskDefinition(args.id);
		const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
		if (!task) {
			return { invocationMessage: new MarkdownString(localize('copilotChat.taskNotFound', 'Task not found: `{0}`', args.id)) };
		}
		const taskLabel = task._label;
		const activeTasks = await this._tasksService.getActiveTasks();
		if (activeTasks.includes(task)) {
			return { invocationMessage: new MarkdownString(localize('copilotChat.taskAlreadyRunning', 'The task `{0}` is already running.', taskLabel)) };
		}

		return {
			invocationMessage: new MarkdownString(localize('copilotChat.checkingTerminalOutput', 'Checking output for task `{0}`', taskLabel)),
			pastTenseMessage: new MarkdownString(localize('copilotChat.checkedTerminalOutput', 'Checked output for task `{0}`', taskLabel)),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IGetTaskOutputInputParams;
		const taskDefinition = getTaskDefinition(args.id);
		const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
		if (!task) {
			return { content: [{ kind: 'text', value: `Task not found: ${args.id}` }], toolResultMessage: new MarkdownString(localize('copilotChat.taskNotFound', 'Task not found: `{0}`', args.id)) };
		}

		const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
		const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
		const taskLabel = task._label;
		const terminals = resources?.map(resource => this._terminalService.instances.find(t => t.resource.path === resource?.path && t.resource.scheme === resource.scheme)).filter(t => !!t);
		if (!terminals || terminals.length === 0) {
			return { content: [{ kind: 'text', value: `Terminal not found for task ${taskLabel}` }], toolResultMessage: new MarkdownString(localize('copilotChat.terminalNotFound', 'Terminal not found for task `{0}`', taskLabel)) };
		}
		const store = new DisposableStore();
		const terminalResults = await collectTerminalResults(
			terminals,
			task,
			this._instantiationService,
			invocation.context!,
			_progress,
			token,
			store,
			() => this._isTaskActive(task),
			dependencyTasks
		);
		store.dispose();
		for (const r of terminalResults) {
			this._telemetryService.publicLog2?.<GetTaskOutputToolEvent, GetTaskOutputToolClassification>('copilotChat.getTaskOutputTool.get', {
				taskId: args.id,
				bufferLength: r.output.length ?? 0,
				pollDurationMs: r.pollDurationMs ?? 0,
				inputToolManualAcceptCount: r.inputToolManualAcceptCount ?? 0,
				inputToolManualRejectCount: r.inputToolManualRejectCount ?? 0,
				inputToolManualChars: r.inputToolManualChars ?? 0,
			});
		}
		const details = terminalResults.map(r => `Terminal: ${r.name}\nOutput:\n${r.output}`);
		const uniqueDetails = Array.from(new Set(details)).join('\n\n');
		const toolResultDetails = toolResultDetailsFromResponse(terminalResults);
		const toolResultMessage = toolResultMessageFromResponse(undefined, taskLabel, toolResultDetails, terminalResults);

		return {
			content: [{ kind: 'text', value: uniqueDetails }],
			toolResultMessage,
			toolResultDetails
		};
	}
	private async _isTaskActive(task: Task): Promise<boolean> {
		const activeTasks = await this._tasksService.getActiveTasks();
		return activeTasks?.includes(task) ?? false;
	}
}
