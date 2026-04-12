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
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { ToolDataSource } from '../../../../../chat/common/tools/languageModelToolsService.js';
import { ITaskService, TasksAvailableContext } from '../../../../../tasks/common/taskService.js';
import { ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { collectTerminalResults, getTaskDefinition, getTaskForTool, resolveDependencyTasks, tasksMatch } from '../../taskHelpers.js';
import { toolResultDetailsFromResponse, toolResultMessageFromResponse } from './taskHelpers.js';
export const GetTaskOutputToolData = {
    id: "get_task_output" /* TerminalToolId.GetTaskOutput */,
    toolReferenceName: 'getTaskOutput',
    legacyToolReferenceFullNames: ['runTasks/getTaskOutput'],
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
let GetTaskOutputTool = class GetTaskOutputTool extends Disposable {
    constructor(_tasksService, _terminalService, _configurationService, _instantiationService, _telemetryService) {
        super();
        this._tasksService = _tasksService;
        this._terminalService = _terminalService;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._telemetryService = _telemetryService;
    }
    async prepareToolInvocation(context, token) {
        const args = context.parameters;
        const taskDefinition = getTaskDefinition(args.id);
        const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
        if (!task) {
            return { invocationMessage: new MarkdownString(localize('copilotChat.taskNotFound', 'Task not found: \`{0}\`', args.id)) };
        }
        const taskLabel = task._label;
        const activeTasks = await this._tasksService.getActiveTasks();
        if (activeTasks.includes(task)) {
            return { invocationMessage: new MarkdownString(localize('copilotChat.taskAlreadyRunning', 'The task \`{0}\` is already running.', taskLabel)) };
        }
        return {
            invocationMessage: new MarkdownString(localize('copilotChat.checkingTerminalOutput', 'Checking output for task \`{0}\`', taskLabel)),
            pastTenseMessage: new MarkdownString(localize('copilotChat.checkedTerminalOutput', 'Checked output for task \`{0}\`', taskLabel)),
        };
    }
    async invoke(invocation, _countTokens, _progress, token) {
        const args = invocation.parameters;
        const taskDefinition = getTaskDefinition(args.id);
        const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
        if (!task) {
            return { content: [{ kind: 'text', value: `Task not found: ${args.id}` }], toolResultMessage: new MarkdownString(localize('copilotChat.taskNotFound', 'Task not found: \`{0}\`', args.id)) };
        }
        const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
        const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
        const taskLabel = task._label;
        const terminals = resources?.map(resource => this._terminalService.instances.find(t => t.resource.path === resource?.path && t.resource.scheme === resource.scheme)).filter(t => !!t);
        if (!terminals || terminals.length === 0) {
            return { content: [{ kind: 'text', value: `Terminal not found for task ${taskLabel}` }], toolResultMessage: new MarkdownString(localize('copilotChat.terminalNotFound', 'Terminal not found for task \`{0}\`', taskLabel)) };
        }
        const startMarkersByTerminalInstanceId = task.configurationProperties.isBackground
            ? new Map()
            : undefined;
        if (startMarkersByTerminalInstanceId) {
            // Background/watch tasks should read their current buffer when queried after start.
            for (const terminal of terminals) {
                startMarkersByTerminalInstanceId.set(terminal.instanceId, undefined);
            }
        }
        const store = new DisposableStore();
        try {
            const terminalResults = await collectTerminalResults(terminals, task, this._instantiationService, invocation.context, _progress, token, store, (terminalTask) => this._isTaskActive(terminalTask), dependencyTasks, this._tasksService, startMarkersByTerminalInstanceId);
            for (const r of terminalResults) {
                this._telemetryService.publicLog2?.('copilotChat.getTaskOutputTool.get', {
                    taskId: args.id,
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
            const toolResultMessage = toolResultMessageFromResponse(undefined, taskLabel, toolResultDetails, terminalResults, true, task.configurationProperties.isBackground);
            return {
                content: [{ kind: 'text', value: uniqueDetails }],
                toolResultMessage,
                toolResultDetails
            };
        }
        finally {
            store.dispose();
        }
    }
    async _isTaskActive(task) {
        const busyTasks = await this._tasksService.getBusyTasks();
        return busyTasks?.some(t => tasksMatch(t, task)) ?? false;
    }
};
GetTaskOutputTool = __decorate([
    __param(0, ITaskService),
    __param(1, ITerminalService),
    __param(2, IConfigurationService),
    __param(3, IInstantiationService),
    __param(4, ITelemetryService)
], GetTaskOutputTool);
export { GetTaskOutputTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0VGFza091dHB1dFRvb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy90YXNrL2dldFRhc2tPdXRwdXRUb29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsY0FBYyxFQUE2TCxNQUFNLCtEQUErRCxDQUFDO0FBQzFSLE9BQU8sRUFBRSxZQUFZLEVBQVEscUJBQXFCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxFQUFFLHNCQUFzQixFQUFFLFVBQVUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3JJLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBSWhHLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFjO0lBQy9DLEVBQUUsc0RBQThCO0lBQ2hDLGlCQUFpQixFQUFFLGVBQWU7SUFDbEMsNEJBQTRC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