/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { timeout } from '../../../../../../../base/common/async.js';
import { localize } from '../../../../../../../nls.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { ToolDataSource } from '../../../../../chat/common/tools/languageModelToolsService.js';
import { ITaskService } from '../../../../../tasks/common/taskService.js';
import { ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { collectTerminalResults, resolveDependencyTasks, tasksMatch } from '../../taskHelpers.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { toolResultDetailsFromResponse, toolResultMessageFromResponse } from './taskHelpers.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
let CreateAndRunTaskTool = class CreateAndRunTaskTool {
    constructor(_tasksService, _telemetryService, _terminalService, _fileService, _configurationService, _instantiationService) {
        this._tasksService = _tasksService;
        this._telemetryService = _telemetryService;
        this._terminalService = _terminalService;
        this._fileService = _fileService;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const args = invocation.parameters;
        if (!invocation.context) {
            return { content: [{ kind: 'text', value: `No invocation context` }], toolResultMessage: `No invocation context` };
        }
        const tasksJsonUri = URI.file(args.workspaceFolder).with({ path: `${args.workspaceFolder}/.vscode/tasks.json` });
        const exists = await this._fileService.exists(tasksJsonUri);
        const newTask = {
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
        }
        else {
            // add to the existing tasks.json file
            const content = await this._fileService.readFile(tasksJsonUri);
            const tasksJson = JSON.parse(content.value.toString());
            tasksJson.tasks.push(newTask);
            await this._fileService.writeFile(tasksJsonUri, VSBuffer.fromString(JSON.stringify(tasksJson, null, '\t')));
            _progress.report({ message: 'Updated tasks.json file' });
        }
        _progress.report({ message: new MarkdownString(localize('copilotChat.fetchingTask', 'Resolving the task')) });
        let task;
        const start = Date.now();
        while (Date.now() - start < 5000 && !token.isCancellationRequested) {
            task = (await this._tasksService.tasks())?.find(t => t._label === args.task.label);
            if (task) {
                break;
            }
            await timeout(100);
        }
        if (!task) {
            return { content: [{ kind: 'text', value: `Task not found: ${args.task.label}` }], toolResultMessage: new MarkdownString(localize('copilotChat.taskNotFound', 'Task not found: `{0}`', args.task.label)) };
        }
        const preRunMarkersStore = new DisposableStore();
        let result;
        let terminalResults = [];
        try {
            const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
            const startMarkersByTerminalInstanceId = new Map();
            for (const terminal of this._terminalService.instances) {
                const marker = terminal.registerMarker();
                startMarkersByTerminalInstanceId.set(terminal.instanceId, marker);
                if (marker) {
                    preRunMarkersStore.add(marker);
                }
            }
            _progress.report({ message: new MarkdownString(localize('copilotChat.runningTask', 'Running task `{0}`', args.task.label)) });
            const raceResult = await Promise.race([this._tasksService.run(task, undefined, 5 /* TaskRunSource.ChatAgent */), timeout(3000)]);
            result = raceResult && typeof raceResult === 'object' ? raceResult : undefined;
            const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
            const terminals = resources?.map(resource => this._terminalService.instances.find(t => t.resource.path === resource?.path && t.resource.scheme === resource.scheme)).filter(Boolean);
            if (!terminals || terminals.length === 0) {
                return { content: [{ kind: 'text', value: `Task started but no terminal was found for: ${args.task.label}` }], toolResultMessage: new MarkdownString(localize('copilotChat.noTerminal', 'Task started but no terminal was found for: `{0}`', args.task.label)) };
            }
            const store = new DisposableStore();
            try {
                terminalResults = await collectTerminalResults(terminals, task, this._instantiationService, invocation.context, _progress, token, store, (terminalTask) => this._isTaskActive(terminalTask), dependencyTasks, this._tasksService, startMarkersByTerminalInstanceId);
            }
            finally {
                store.dispose();
            }
        }
        finally {
            preRunMarkersStore.dispose();
        }
        for (const r of terminalResults) {
            this._telemetryService.publicLog2?.('copilotChat.runTaskTool.createAndRunTask', {
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
    async _isTaskActive(task) {
        const busyTasks = await this._tasksService.getBusyTasks();
        return busyTasks?.some(t => tasksMatch(t, task)) ?? false;
    }
    async prepareToolInvocation(context, token) {
        const args = context.parameters;
        const task = args.task;
        const allTasks = await this._tasksService.tasks();
        if (allTasks?.find(t => t._label === task.label)) {
            return {
                invocationMessage: new MarkdownString(localize('taskExists', 'Task \`{0}\` already exists.', task.label)),
                pastTenseMessage: new MarkdownString(localize('taskExistsPast', 'Task \`{0}\` already exists.', task.label)),
                confirmationMessages: undefined
            };
        }
        const activeTasks = await this._tasksService.getActiveTasks();
        if (activeTasks.find(t => t._label === task.label)) {
            return {
                invocationMessage: new MarkdownString(localize('alreadyRunning', 'Task \`{0}\` is already running.', task.label)),
                pastTenseMessage: new MarkdownString(localize('alreadyRunning', 'Task \`{0}\` is already running.', task.label)),
                confirmationMessages: undefined
            };
        }
        return {
            invocationMessage: new MarkdownString(localize('createdTask', 'Created task \`{0}\`', task.label)),
            pastTenseMessage: new MarkdownString(localize('createdTaskPast', 'Created task \`{0}\`', task.label)),
            confirmationMessages: {
                title: localize('allowTaskCreationExecution', 'Allow task creation and execution?'),
                message: new MarkdownString(localize('createTask', 'A task \`{0}\` with command \`{1}\`{2} will be created.', task.label, task.command, task.args?.length ? ` and args \`${task.args.join(' ')}\`` : ''))
            }
        };
    }
};
CreateAndRunTaskTool = __decorate([
    __param(0, ITaskService),
    __param(1, ITelemetryService),
    __param(2, ITerminalService),
    __param(3, IFileService),
    __param(4, IConfigurationService),
    __param(5, IInstantiationService)
], CreateAndRunTaskTool);
export { CreateAndRunTaskTool };
export const CreateAndRunTaskToolData = {
    id: "create_and_run_task" /* TerminalToolId.CreateAndRunTask */,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlQW5kUnVuVGFza1Rvb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy90YXNrL2NyZWF0ZUFuZFJ1blRhc2tUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDaEcsT0FBTyxFQUF1SSxjQUFjLEVBQWdCLE1BQU0sK0RBQStELENBQUM7QUFDbFAsT0FBTyxFQUFFLFlBQVksRUFBc0IsTUFBTSw0Q0FBNEMsQ0FBQztBQUU5RixPQUFPLEVBQXFCLGdCQUFnQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDbEcsT0FBTyxFQUFFLHNCQUFzQixFQUFtQixzQkFBc0IsRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNuSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDakYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDZCQUE2QixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVB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