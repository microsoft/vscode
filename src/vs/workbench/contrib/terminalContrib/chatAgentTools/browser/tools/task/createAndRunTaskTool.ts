/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { localize } from '../../../../../../../nls.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../../chat/common/tools/languageModelToolsService.js';
import { ITaskService, ITaskSummary, Task } from '../../../../../tasks/common/taskService.js';
import { TaskRunSource } from '../../../../../tasks/common/tasks.js';
import { ITerminalInstance, ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { collectTerminalResults, IConfiguredTask, resolveDependencyTasks, tasksMatch } from '../../taskHelpers.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { toolResultDetailsFromResponse, toolResultMessageFromResponse } from './taskHelpers.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { TaskToolEvent, TaskToolClassification } from './taskToolsTelemetry.js';
import { TerminalToolId } from '../toolIds.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { Schemas } from '../../../../../../../base/common/network.js';

interface ICreateAndRunTaskToolInput {
	workspaceFolder: string;
	task: {
		label: string;
		type: string;
		command: string;
		args?: string[];
		isBackground?: boolean;
		problemMatcher?: string[];
		group?: string;
	};
}

export class CreateAndRunTaskTool implements IToolImpl {

	constructor(
		@ITaskService private readonly _tasksService: ITaskService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IFileService private readonly _fileService: IFileService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as ICreateAndRunTaskToolInput;

		if (!invocation.context) {
			return { content: [{ kind: 'text', value: `No invocation context` }], toolResultMessage: `No invocation context` };
		}

		const workspaceFolder = this._resolveWorkspaceFolder(args.workspaceFolder, invocation.context.workingDirectory);
		if (!workspaceFolder) {
			return this._invalidWorkspaceFolderResult(args.workspaceFolder);
		}

		const existingTask = (await this._tasksService.tasks())?.find(task => task._label === args.task.label);
		if (existingTask) {
			return this._taskAlreadyExistsResult(args.task.label);
		}

		const activeTask = (await this._tasksService.getActiveTasks()).find(task => task._label === args.task.label);
		if (activeTask) {
			return this._taskAlreadyRunningResult(args.task.label);
		}

		const tasksJsonUri = URI.joinPath(workspaceFolder, '.vscode', 'tasks.json');
		const exists = await this._fileService.exists(tasksJsonUri);

		const newTask: IConfiguredTask = {
			label: args.task.label,
			type: args.task.type,
			command: args.task.command,
			args: args.task.args,
			isBackground: args.task.isBackground,
			problemMatcher: args.task.problemMatcher,
			group: args.task.group
		};

		const tasksJsonContent = JSON.stringify({
			version: '2.0.0',
			tasks: [newTask]
		}, null, '\t');
		if (!exists) {
			await this._fileService.createFile(tasksJsonUri, VSBuffer.fromString(tasksJsonContent), { overwrite: true });
			_progress.report({ message: 'Created tasks.json file' });
		} else {
			// add to the existing tasks.json file
			const content = await this._fileService.readFile(tasksJsonUri);
			const tasksJson = JSON.parse(content.value.toString());
			tasksJson.tasks.push(newTask);
			await this._fileService.writeFile(tasksJsonUri, VSBuffer.fromString(JSON.stringify(tasksJson, null, '\t')));
			_progress.report({ message: 'Updated tasks.json file' });
		}
		_progress.report({ message: new MarkdownString(localize('copilotChat.fetchingTask', 'Resolving the task')) });

		let task: Task | undefined;
		const start = Date.now();
		while (Date.now() - start < 5000 && !token.isCancellationRequested) {
			task = (await this._tasksService.tasks())?.find(task =>
				task._label === args.task.label
				&& !!task.getWorkspaceFolder()
				&& this._uriIdentityService.extUri.isEqual(task.getWorkspaceFolder()!.uri, workspaceFolder)
			);
			if (task) {
				break;
			}
			await timeout(100);
		}
		if (!task) {
			return { content: [{ kind: 'text', value: `Task not found: ${args.task.label}` }], toolResultMessage: new MarkdownString(localize('copilotChat.taskNotFound', 'Task not found: `{0}`', args.task.label)) };
		}

		const preRunMarkersStore = new DisposableStore();
		let result: ITaskSummary | undefined;
		let terminalResults: Awaited<ReturnType<typeof collectTerminalResults>> = [];
		try {
			const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
			const startMarkersByTerminalInstanceId = new Map<number, ReturnType<ITerminalInstance['registerMarker']>>();
			for (const terminal of this._terminalService.instances) {
				const marker = terminal.registerMarker();
				startMarkersByTerminalInstanceId.set(terminal.instanceId, marker);
				if (marker) {
					preRunMarkersStore.add(marker);
				}
			}

			_progress.report({ message: new MarkdownString(localize('copilotChat.runningTask', 'Running task `{0}`', args.task.label)) });
			const raceResult = await Promise.race([this._tasksService.run(task, undefined, TaskRunSource.ChatAgent), timeout(3000)]);
			result = raceResult && typeof raceResult === 'object' ? raceResult as ITaskSummary : undefined;

			const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
			const terminals = resources?.map(resource => this._terminalService.instances.find(t => t.resource.path === resource?.path && t.resource.scheme === resource.scheme)).filter(Boolean) as ITerminalInstance[];
			if (!terminals || terminals.length === 0) {
				return { content: [{ kind: 'text', value: `Task started but no terminal was found for: ${args.task.label}` }], toolResultMessage: new MarkdownString(localize('copilotChat.noTerminal', 'Task started but no terminal was found for: `{0}`', args.task.label)) };
			}
			const store = new DisposableStore();
			try {
				terminalResults = await collectTerminalResults(
					terminals,
					task,
					this._instantiationService,
					invocation.context!,
					_progress,
					token,
					store,
					(terminalTask) => this._isTaskActive(terminalTask),
					dependencyTasks,
					this._tasksService,
					startMarkersByTerminalInstanceId
				);
			} finally {
				store.dispose();
			}
		} finally {
			preRunMarkersStore.dispose();
		}
		for (const r of terminalResults) {
			this._telemetryService.publicLog2?.<TaskToolEvent, TaskToolClassification>('copilotChat.runTaskTool.createAndRunTask', {
				taskId: args.task.label,
				bufferLength: r.output.length ?? 0,
				pollDurationMs: r.pollDurationMs ?? 0,
				inputToolManualAcceptCount: r.inputToolManualAcceptCount ?? 0,
				inputToolManualRejectCount: r.inputToolManualRejectCount ?? 0,
				inputToolManualChars: r.inputToolManualChars ?? 0,
				inputToolManualShownCount: r.inputToolManualShownCount ?? 0,
				inputToolFreeFormInputCount: r.inputToolFreeFormInputCount ?? 0,
				inputToolFreeFormInputShownCount: r.inputToolFreeFormInputShownCount ?? 0
			});
		}

		const details = terminalResults.map(r => `Terminal: ${r.name}\nOutput:\n${r.output}`);
		const uniqueDetails = Array.from(new Set(details)).join('\n\n');
		const toolResultDetails = toolResultDetailsFromResponse(terminalResults);
		const toolResultMessage = toolResultMessageFromResponse(result, args.task.label, toolResultDetails, terminalResults, undefined, task.configurationProperties.isBackground);
		return {
			content: [{ kind: 'text', value: uniqueDetails }],
			toolResultMessage,
			toolResultDetails
		};
	}

	private async _isTaskActive(task: Task): Promise<boolean> {
		const busyTasks = await this._tasksService.getBusyTasks();
		return busyTasks?.some(t => tasksMatch(t, task)) ?? false;
	}

	private _resolveWorkspaceFolder(requestedWorkspaceFolder: string, workingDirectory: URI | undefined): URI | undefined {
		const requestedFileUri = URI.file(requestedWorkspaceFolder);
		const candidates = workingDirectory
			? [workingDirectory]
			: this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri);

		return candidates.find(candidate => candidate.scheme === Schemas.file
			? this._uriIdentityService.extUri.isEqual(candidate, requestedFileUri)
			: candidate.path === requestedFileUri.path);
	}

	private _invalidWorkspaceFolderResult(workspaceFolder: string): IToolResult {
		const message = localize('invalidWorkspaceFolder', "Cannot create a task outside the current workspace folder: {0}", workspaceFolder);
		return { content: [{ kind: 'text', value: message }], toolResultMessage: message };
	}

	private _taskAlreadyExistsResult(taskLabel: string): IToolResult {
		const message = localize('taskExists', "Task '{0}' already exists. Use the run task tool to run it.", taskLabel);
		return { content: [{ kind: 'text', value: message }], toolResultMessage: message };
	}

	private _taskAlreadyRunningResult(taskLabel: string): IToolResult {
		const message = localize('alreadyRunning', "Task '{0}' is already running.", taskLabel);
		return { content: [{ kind: 'text', value: message }], toolResultMessage: message };
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as ICreateAndRunTaskToolInput;
		const task = args.task;

		const workspaceFolder = this._resolveWorkspaceFolder(args.workspaceFolder, context.workingDirectory);
		if (!workspaceFolder) {
			const message = localize('invalidWorkspaceFolder', "Cannot create a task outside the current workspace folder: {0}", args.workspaceFolder);
			return {
				invocationMessage: message,
				pastTenseMessage: message
			};
		}

		const allTasks = await this._tasksService.tasks();
		if (allTasks?.find(t => t._label === task.label)) {
			return {
				invocationMessage: this._taskAlreadyExistsResult(task.label).toolResultMessage,
				pastTenseMessage: this._taskAlreadyExistsResult(task.label).toolResultMessage,
				confirmationMessages: undefined
			};
		}

		const activeTasks = await this._tasksService.getActiveTasks();
		if (activeTasks.find(t => t._label === task.label)) {
			return {
				invocationMessage: this._taskAlreadyRunningResult(task.label).toolResultMessage,
				pastTenseMessage: this._taskAlreadyRunningResult(task.label).toolResultMessage,
				confirmationMessages: undefined
			};
		}

		const confirmationMessage = new MarkdownString()
			.appendText(localize('createTask', "Task '{0}' will be created in '{1}' and run with this command:", task.label, workspaceFolder.fsPath))
			.appendCodeblock('shell', [task.command, ...(task.args ?? [])].join(' '));

		return {
			invocationMessage: new MarkdownString(localize('createdTask', 'Created task \`{0}\`', task.label)),
			pastTenseMessage: new MarkdownString(localize('createdTaskPast', 'Created task \`{0}\`', task.label)),
			confirmationMessages: {
				title: localize('allowTaskCreationExecution', 'Allow task creation and execution?'),
				message: confirmationMessage,
				allowAutoConfirm: false
			}
		};
	}
}

export const CreateAndRunTaskToolData: IToolData = {
	id: TerminalToolId.CreateAndRunTask,
	toolReferenceName: 'createAndRunTask',
	legacyToolReferenceFullNames: ['runTasks/createAndRunTask'],
	displayName: localize('createAndRunTask.displayName', 'Create and run Task'),
	modelDescription: 'Creates and runs a build, run, or custom task for the workspace by generating or adding to a tasks.json file based on the project structure (such as package.json or README.md). If the user asks to build, run, launch and they have no tasks.json file, use this tool. If they ask to create or add a task, use this tool.',
	userDescription: localize('createAndRunTask.userDescription', "Create and run a task in the workspace"),
	source: ToolDataSource.Internal,
	inputSchema: {
		'type': 'object',
		'properties': {
			'workspaceFolder': {
				'type': 'string',
				'description': 'The absolute path of the workspace folder where the tasks.json file will be created.'
			},
			'task': {
				'type': 'object',
				'description': 'The task to add to the new tasks.json file.',
				'properties': {
					'label': {
						'type': 'string',
						'description': 'The label of the task.'
					},
					'type': {
						'type': 'string',
						'description': `The type of the task. The only supported value is 'shell'.`,
						'enum': [
							'shell'
						]
					},
					'command': {
						'type': 'string',
						'description': 'The shell command to run for the task. Use this to specify commands for building or running the application.'
					},
					'args': {
						'type': 'array',
						'description': 'The arguments to pass to the command.',
						'items': {
							'type': 'string'
						}
					},
					'isBackground': {
						'type': 'boolean',
						'description': 'Whether the task runs in the background without blocking the UI or other tasks. Set to true for long-running processes like watch tasks or servers that should continue executing without requiring user attention. When false, the task will block the terminal until completion.'
					},
					'problemMatcher': {
						'type': 'array',
						'description': `The problem matcher to use to parse task output for errors and warnings. Can be a predefined matcher like '$tsc' (TypeScript), '$eslint - stylish', '$gcc', etc., or a custom pattern defined in tasks.json. This helps VS Code display errors in the Problems panel and enables quick navigation to error locations.`,
						'items': {
							'type': 'string'
						}
					},
					'group': {
						'type': 'string',
						'description': 'The group to which the task belongs.'
					}
				},
				'required': [
					'label',
					'type',
					'command'
				]
			}
		},
		'required': [
			'task',
			'workspaceFolder'
		]
	},
};
