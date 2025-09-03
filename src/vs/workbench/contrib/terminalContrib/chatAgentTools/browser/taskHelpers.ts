/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMarkerData } from '../../../../../platform/markers/common/markers.js';
import { IToolInvocationContext, ToolProgress } from '../../../chat/common/languageModelToolsService.js';
import { ConfiguringTask, ITaskDependency, Task } from '../../../tasks/common/tasks.js';
import { ITaskService } from '../../../tasks/common/taskService.js';
import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { getOutput } from './outputHelpers.js';
import { OutputMonitor } from './tools/monitoring/outputMonitor.js';
import { IExecution, IPollingResult, OutputMonitorState } from './tools/monitoring/types.js';
import { Event } from '../../../../../base/common/event.js';


export function getTaskDefinition(id: string) {
	const idx = id.indexOf(': ');
	const taskType = id.substring(0, idx);
	let taskLabel = idx > 0 ? id.substring(idx + 2) : id;

	if (/^\d+$/.test(taskLabel)) {
		taskLabel = id;
	}

	return { taskLabel, taskType };

}

export function getTaskRepresentation(task: IConfiguredTask | Task): string {
	if ('label' in task && task.label) {
		return task.label;
	} else if ('script' in task && task.script) {
		return task.script;
	} else if ('command' in task && task.command) {
		return typeof task.command === 'string' ? task.command : task.command.name?.toString() || '';
	}
	return '';
}

export async function getTaskForTool(id: string | undefined, taskDefinition: { taskLabel?: string; taskType?: string }, workspaceFolder: string, configurationService: IConfigurationService, taskService: ITaskService, allowParentTask?: boolean): Promise<Task | undefined> {
	let index = 0;
	let task: IConfiguredTask | undefined;
	const workspaceFolderToTaskMap = await taskService.getWorkspaceTasks();
	let configTasks: IConfiguredTask[] = [];
	for (const folder of workspaceFolderToTaskMap.keys()) {
		const tasksConfig = configurationService.getValue('tasks', { resource: URI.parse(folder) }) as { tasks: IConfiguredTask[] } | undefined;
		if (tasksConfig?.tasks) {
			configTasks = configTasks.concat(tasksConfig.tasks);
		}
	}
	for (const configTask of configTasks) {
		if ((!allowParentTask && !configTask.type) || ('hide' in configTask && configTask.hide)) {
			// Skip these as they are not included in the agent prompt and we need to align with
			// the indices used there.
			continue;
		}

		if ((configTask.type && taskDefinition.taskType ? configTask.type === taskDefinition.taskType : true) &&
			((getTaskRepresentation(configTask) === taskDefinition?.taskLabel) || (id === configTask.label))) {
			task = configTask;
			break;
		} else if (!configTask.label && id === `${configTask.type}: ${index}`) {
			task = configTask;
			break;
		}
		index++;
	}
	if (!task) {
		return;
	}

	let tasksForWorkspace;
	const workspaceFolderPath = URI.file(workspaceFolder).path;
	for (const [folder, tasks] of workspaceFolderToTaskMap) {
		if (URI.parse(folder).path === workspaceFolderPath) {
			tasksForWorkspace = tasks;
			break;
		}
	}
	if (!tasksForWorkspace) {
		return;
	}
	const configuringTasks: IStringDictionary<ConfiguringTask> | undefined = tasksForWorkspace.configurations?.byIdentifier;
	const configuredTask: ConfiguringTask | undefined = Object.values(configuringTasks ?? {}).find(t => {
		return t.type === task.type && (t._label === task.label || t._label === `${task.type}: ${getTaskRepresentation(task)}` || t._label === getTaskRepresentation(task));
	});
	let resolvedTask: Task | undefined;
	if (configuredTask) {
		resolvedTask = await taskService.tryResolveTask(configuredTask);
	}
	if (!resolvedTask) {
		const customTasks: Task[] | undefined = tasksForWorkspace.set?.tasks;
		resolvedTask = customTasks?.find(t => task.label === t._label || task.label === t._label);
	}
	return resolvedTask;
}

/**
 * Represents a configured task in the system.
 *
 * This interface is used to define tasks that can be executed within the workspace.
 * It includes optional properties for identifying and describing the task.
 *
 * Properties:
 * - `type`: (optional) The type of the task, which categorizes it (e.g., "build", "test").
 * - `label`: (optional) A user-facing label for the task, typically used for display purposes.
 * - `script`: (optional) A script associated with the task, if applicable.
 * - `command`: (optional) A command associated with the task, if applicable.
 *
 */
export interface IConfiguredTask {
	label?: string;
	type?: string;
	script?: string;
	command?: string;
	args?: string[];
	isBackground?: boolean;
	problemMatcher?: string[];
	group?: string;
}

export async function resolveDependencyTasks(parentTask: Task, workspaceFolder: string, configurationService: IConfigurationService, taskService: ITaskService): Promise<Task[] | undefined> {
	if (!parentTask.configurationProperties?.dependsOn) {
		return undefined;
	}
	const dependencyTasks = await Promise.all(parentTask.configurationProperties.dependsOn.map(async (dep: ITaskDependency) => {
		const depId: string | undefined = typeof dep.task === 'string' ? dep.task : dep.task?._key;
		if (!depId) {
			return undefined;
		}
		return await getTaskForTool(depId, { taskLabel: depId }, workspaceFolder, configurationService, taskService);
	}));
	return dependencyTasks.filter((t: Task | undefined): t is Task => t !== undefined);
}

/**
 * Collects output, polling duration, and idle status for all terminals.
 */
export async function collectTerminalResults(
	terminals: ITerminalInstance[],
	task: Task,
	instantiationService: IInstantiationService,
	invocationContext: IToolInvocationContext,
	progress: ToolProgress,
	token: CancellationToken,
	disposableStore: DisposableStore,
	isActive?: () => Promise<boolean>,
	dependencyTasks?: Task[]
): Promise<Array<{
	name: string;
	output: string;
	resources?: ILinkLocation[];
	pollDurationMs: number;
	state: OutputMonitorState;
	inputToolManualAcceptCount: number;
	inputToolManualRejectCount: number;
	inputToolManualChars: number;
}>> {
	const results: Array<{ state: OutputMonitorState; name: string; output: string; resources?: ILinkLocation[]; pollDurationMs: number; inputToolManualAcceptCount: number; inputToolManualRejectCount: number; inputToolManualChars: number }> = [];
	if (token.isCancellationRequested) {
		return results;
	}
	for (const instance of terminals) {
		progress.report({ message: new MarkdownString(`Checking output for \`${instance.shellLaunchConfig.name ?? 'unknown'}\``) });
		const execution = {
			getOutput: () => getOutput(instance) ?? '',
			isActive,
			task,
			instance,
			dependencyTasks,
			sessionId: invocationContext.sessionId
		};
		const outputMonitor = disposableStore.add(instantiationService.createInstance(OutputMonitor, execution, taskProblemPollFn, invocationContext, token, task._label));
		await Event.toPromise(outputMonitor.onDidFinishCommand);
		const pollingResult = outputMonitor.pollingResult;
		results.push({
			name: instance.shellLaunchConfig.name ?? 'unknown',
			output: pollingResult?.output ?? '',
			pollDurationMs: pollingResult?.pollDurationMs ?? 0,
			resources: pollingResult?.resources,
			state: pollingResult?.state || OutputMonitorState.Idle,
			inputToolManualAcceptCount: outputMonitor.outputMonitorTelemetryCounters.inputToolManualAcceptCount ?? 0,
			inputToolManualRejectCount: outputMonitor.outputMonitorTelemetryCounters.inputToolManualRejectCount ?? 0,
			inputToolManualChars: outputMonitor.outputMonitorTelemetryCounters.inputToolManualChars ?? 0,
		});
	}
	return results;
}

export async function taskProblemPollFn(execution: IExecution, token: CancellationToken, taskService: ITaskService): Promise<IPollingResult | undefined> {
	if (token.isCancellationRequested) {
		return;
	}
	if (execution.task) {
		const data: Map<string, { resources: URI[]; markers: IMarkerData[] }> | undefined = taskService.getTaskProblems(execution.instance.instanceId);
		if (data) {
			// Problem matchers exist for this task
			const problemList: string[] = [];
			const resultResources: ILinkLocation[] = [];
			for (const [owner, { resources, markers }] of data.entries()) {
				for (let i = 0; i < markers.length; i++) {
					const uri: URI | undefined = resources[i];
					const marker = markers[i];
					resultResources.push({
						uri,
						range: marker.startLineNumber !== undefined && marker.startColumn !== undefined && marker.endLineNumber !== undefined && marker.endColumn !== undefined
							? new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn)
							: undefined
					});
					const label: string = uri ? uri.path.split('/').pop() ?? uri.toString() : '';
					const message = marker.message ?? '';
					problemList.push(`Problem: ${message} in ${label} coming from ${owner}`);
				}
			}
			if (problemList.length === 0) {
				return {
					state: OutputMonitorState.Idle,
					output: 'The task succeeded with no problems.',
				};
			}
			return {
				state: OutputMonitorState.Idle,
				output: problemList.join('\n'),
				resources: resultResources,
			};
		}
	}
	throw new Error('Polling failed');
}

export interface ILinkLocation { uri: URI; range?: Range }
