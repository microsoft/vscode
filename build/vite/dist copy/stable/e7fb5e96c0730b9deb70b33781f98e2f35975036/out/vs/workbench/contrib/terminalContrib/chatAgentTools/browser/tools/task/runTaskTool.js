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
import { ITaskService, TasksAvailableContext } from '../../../../../tasks/common/taskService.js';
import { ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { collectTerminalResults, getTaskDefinition, getTaskForTool, resolveDependencyTasks, tasksMatch } from '../../taskHelpers.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { toolResultDetailsFromResponse, toolResultMessageFromResponse } from './taskHelpers.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
let RunTaskTool = class RunTaskTool {
    constructor(_tasksService, _telemetryService, _terminalService, _configurationService, _instantiationService) {
        this._tasksService = _tasksService;
        this._telemetryService = _telemetryService;
        this._terminalService = _terminalService;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const args = invocation.parameters;
        if (!invocation.context) {
            return { content: [{ kind: 'text', value: `No invocation context` }], toolResultMessage: `No invocation context` };
        }
        const taskDefinition = getTaskDefinition(args.id);
        const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
        if (!task) {
            return { content: [{ kind: 'text', value: `Task not found: ${args.id}` }], toolResultMessage: new MarkdownString(localize('chat.taskNotFound', 'Task not found: \`{0}\`', args.id)) };
        }
        const taskLabel = task._label;
        const activeTasks = await this._tasksService.getActiveTasks();
        if (activeTasks.includes(task)) {
            return { content: [{ kind: 'text', value: `The task ${taskLabel} is already running.` }], toolResultMessage: new MarkdownString(localize('chat.taskAlreadyRunning', 'The task \`{0}\` is already running.', taskLabel)) };
        }
        const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
        const startMarkersByTerminalInstanceId = new Map();
        const startMarkersDisposableStore = new DisposableStore();
        for (const terminal of this._terminalService.instances) {
            const marker = terminal.registerMarker();
            startMarkersByTerminalInstanceId.set(terminal.instanceId, marker);
            if (marker) {
                startMarkersDisposableStore.add(marker);
            }
        }
        try {
            const raceResult = await Promise.race([this._tasksService.run(task, undefined, 5 /* TaskRunSource.ChatAgent */), timeout(3000)]);
            const result = raceResult && typeof raceResult === 'object' ? raceResult : undefined;
            const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
            if (!resources || resources.length === 0) {
                return { content: [{ kind: 'text', value: `Task started but no terminal was found for: ${taskLabel}` }], toolResultMessage: new MarkdownString(localize('chat.noTerminal', 'Task started but no terminal was found for: \`{0}\`', taskLabel)) };
            }
            const terminals = this._terminalService.instances.filter(t => resources.some(r => r.path === t.resource.path && r.scheme === t.resource.scheme));
            if (terminals.length === 0) {
                return { content: [{ kind: 'text', value: `Task started but no terminal was found for: ${taskLabel}` }], toolResultMessage: new MarkdownString(localize('chat.noTerminal', 'Task started but no terminal was found for: \`{0}\`', taskLabel)) };
            }
            const store = new DisposableStore();
            let terminalResults = [];
            try {
                terminalResults = await collectTerminalResults(terminals, task, this._instantiationService, invocation.context, _progress, token, store, (terminalTask) => this._isTaskActive(terminalTask), dependencyTasks, this._tasksService, startMarkersByTerminalInstanceId);
            }
            finally {
                store.dispose();
            }
            for (const r of terminalResults) {
                this._telemetryService.publicLog2?.('copilotChat.runTaskTool.run', {
                    taskId: args.id,
                    bufferLength: r.output.length ?? 0,
                    pollDurationMs: r.pollDurationMs ?? 0,
                    inputToolManualAcceptCount: r.inputToolManualAcceptCount ?? 0,
                    inputToolManualRejectCount: r.inputToolManualRejectCount ?? 0,
                    inputToolManualChars: r.inputToolManualChars ?? 0,
                    inputToolManualShownCount: r.inputToolManualShownCount ?? 0,
                    inputToolFreeFormInputShownCount: r.inputToolFreeFormInputShownCount ?? 0,
                    inputToolFreeFormInputCount: r.inputToolFreeFormInputCount ?? 0
                });
            }
            const details = terminalResults.map(r => `Terminal: ${r.name}\nOutput:\n${r.output}`);
            const uniqueDetails = Array.from(new Set(details)).join('\n\n');
            const toolResultDetails = toolResultDetailsFromResponse(terminalResults);
            const toolResultMessage = toolResultMessageFromResponse(result, taskLabel, toolResultDetails, terminalResults, undefined, task.configurationProperties.isBackground);
            return {
                content: [{ kind: 'text', value: uniqueDetails }],
                toolResultMessage,
                toolResultDetails
            };
        }
        finally {
            startMarkersDisposableStore.dispose();
        }
    }
    async _isTaskActive(task) {
        const busyTasks = await this._tasksService.getBusyTasks();
        return busyTasks?.some(t => tasksMatch(t, task)) ?? false;
    }
    async prepareToolInvocation(context, token) {
        const args = context.parameters;
        const taskDefinition = getTaskDefinition(args.id);
        const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
        if (!task) {
            return { invocationMessage: new MarkdownString(localize('chat.taskNotFound', 'Task not found: \`{0}\`', args.id)) };
        }
        const taskLabel = task._label;
        const activeTasks = await this._tasksService.getActiveTasks();
        if (task && activeTasks.includes(task)) {
            return { invocationMessage: new MarkdownString(localize('chat.taskAlreadyActive', 'The task is already running.')) };
        }
        if (await this._isTaskActive(task)) {
            return {
                invocationMessage: new MarkdownString(localize('chat.taskIsAlreadyRunning', '\`{0}\` is already running.', taskLabel)),
                pastTenseMessage: new MarkdownString(localize('chat.taskWasAlreadyRunning', '\`{0}\` was already running.', taskLabel)),
                confirmationMessages: undefined
            };
        }
        return {
            invocationMessage: new MarkdownString(localize('chat.runningTask', 'Running \`{0}\`', taskLabel)),
            pastTenseMessage: new MarkdownString(task?.configurationProperties.isBackground
                ? localize('chat.startedTask', 'Started \`{0}\`', taskLabel)
                : localize('chat.ranTask', 'Ran \`{0}\`', taskLabel)),
            confirmationMessages: task
                ? { title: localize('chat.allowTaskRunTitle', 'Allow task run?'), message: localize('chat.allowTaskRunMsg', 'Allow to run the task \`{0}\`?', taskLabel) }
                : undefined
        };
    }
};
RunTaskTool = __decorate([
    __param(0, ITaskService),
    __param(1, ITelemetryService),
    __param(2, ITerminalService),
    __param(3, IConfigurationService),
    __param(4, IInstantiationService)
], RunTaskTool);
export { RunTaskTool };
export const RunTaskToolData = {
    id: "run_task" /* TerminalToolId.RunTask */,
    toolReferenceName: 'runTask',
    legacyToolReferenceFullNames: ['runTasks/runTask'],
    displayName: localize('runInTerminalTool.displayName', 'Run Task'),
    modelDescription: `Runs a VS Code task.\n\n- If you see that an appropriate task exists for building or running code, prefer to use this tool to run the task instead of using the ${"run_in_terminal" /* TerminalToolId.RunInTerminal */} tool.\n- Make sure that any appropriate build or watch task is running before trying to run tests or execute code.\n- If the user asks to run a task, use this tool to do so.`,
    userDescription: localize('runInTerminalTool.userDescription', 'Run tasks in the workspace'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuVGFza1Rvb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy90YXNrL3J1blRhc2tUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUVwRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDaEcsT0FBTyxFQUF1SSxjQUFjLEVBQWdCLE1BQU0sK0RBQStELENBQUM7QUFDbFAsT0FBTyxFQUFFLFlBQVksRUFBc0IscUJBQXFCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUVySCxPQUFPLEVBQXFCLGdCQUFnQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDbEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxzQkFBc0IsRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNySSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDakYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ2hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQVN6RSxJQUFNLFdBQVcsR0FB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