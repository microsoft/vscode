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
import * as nls from '../../../../nls.js';
import * as semver from '../../../../base/common/semver/semver.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ExecutionEngine } from '../common/tasks.js';
import { AbstractTaskService } from '../browser/abstractTaskService.js';
import { ITaskService } from '../common/taskService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { TerminalTaskSystem } from '../browser/terminalTaskSystem.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { ITerminalGroupService, ITerminalService } from '../../terminal/browser/terminal.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { ITerminalProfileResolverService } from '../../terminal/common/terminal.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { IChatAgentService } from '../../chat/common/participants/chatAgents.js';
import { IHostService } from '../../../services/host/browser/host.js';
let TaskService = class TaskService extends AbstractTaskService {
    constructor(configurationService, markerService, outputService, paneCompositeService, viewsService, commandService, editorService, fileService, contextService, telemetryService, textFileService, lifecycleService, modelService, extensionService, quickInputService, configurationResolverService, terminalService, terminalGroupService, storageService, progressService, openerService, dialogService, notificationService, contextKeyService, environmentService, terminalProfileResolverService, pathService, textModelResolverService, preferencesService, viewDescriptorService, workspaceTrustRequestService, workspaceTrustManagementService, logService, themeService, instantiationService, remoteAgentService, accessibilitySignalService, _chatService, _chatAgentService, _hostService) {
        super(configurationService, markerService, outputService, paneCompositeService, viewsService, commandService, editorService, fileService, contextService, telemetryService, textFileService, modelService, extensionService, quickInputService, configurationResolverService, terminalService, terminalGroupService, storageService, progressService, openerService, dialogService, notificationService, contextKeyService, environmentService, terminalProfileResolverService, pathService, textModelResolverService, preferencesService, viewDescriptorService, workspaceTrustRequestService, workspaceTrustManagementService, logService, themeService, lifecycleService, remoteAgentService, instantiationService, _chatService, _chatAgentService, _hostService);
        this._register(lifecycleService.onBeforeShutdown(event => event.veto(this.beforeShutdown(), 'veto.tasks')));
    }
    _getTaskSystem() {
        if (this._taskSystem) {
            return this._taskSystem;
        }
        const taskSystem = this._createTerminalTaskSystem();
        this._taskSystem = taskSystem;
        this._taskSystemListeners =
            [
                this._taskSystem.onDidStateChange((event) => {
                    this._taskRunningState.set(this._taskSystem.isActiveSync());
                    this._onDidStateChange.fire(event);
                })
            ];
        return this._taskSystem;
    }
    _computeLegacyConfiguration(workspaceFolder) {
        const { config, hasParseErrors } = this._getConfiguration(workspaceFolder);
        if (hasParseErrors) {
            return Promise.resolve({ workspaceFolder: workspaceFolder, hasErrors: true, config: undefined });
        }
        if (config) {
            return Promise.resolve({ workspaceFolder, config, hasErrors: false });
        }
        else {
            return Promise.resolve({ workspaceFolder: workspaceFolder, hasErrors: true, config: undefined });
        }
    }
    _versionAndEngineCompatible(filter) {
        const range = filter && filter.version ? filter.version : undefined;
        const engine = this.executionEngine;
        return (range === undefined) || ((semver.satisfies('0.1.0', range) && engine === ExecutionEngine.Process) || (semver.satisfies('2.0.0', range) && engine === ExecutionEngine.Terminal));
    }
    beforeShutdown() {
        if (!this._taskSystem) {
            return false;
        }
        if (!this._taskSystem.isActiveSync()) {
            return false;
        }
        // The terminal service kills all terminal on shutdown. So there
        // is nothing we can do to prevent this here.
        if (this._taskSystem instanceof TerminalTaskSystem) {
            return false;
        }
        let terminatePromise;
        if (this._taskSystem.canAutoTerminate()) {
            terminatePromise = Promise.resolve({ confirmed: true });
        }
        else {
            terminatePromise = this._dialogService.confirm({
                message: nls.localize('TaskSystem.runningTask', 'There is a task running. Do you want to terminate it?'),
                primaryButton: nls.localize({ key: 'TaskSystem.terminateTask', comment: ['&& denotes a mnemonic'] }, "&&Terminate Task")
            });
        }
        return terminatePromise.then(res => {
            if (res.confirmed) {
                return this._taskSystem.terminateAll().then((responses) => {
                    let success = true;
                    let code = undefined;
                    for (const response of responses) {
                        success = success && response.success;
                        // We only have a code in the old output runner which only has one task
                        // So we can use the first code.
                        if (code === undefined && response.code !== undefined) {
                            code = response.code;
                        }
                    }
                    if (success) {
                        this._taskSystem = undefined;
                        this._disposeTaskSystemListeners();
                        return false; // no veto
                    }
                    else if (code && code === 3 /* TerminateResponseCode.ProcessNotFound */) {
                        return this._dialogService.confirm({
                            message: nls.localize('TaskSystem.noProcess', 'The launched task doesn\'t exist anymore. If the task spawned background processes exiting VS Code might result in orphaned processes. To avoid this start the last background process with a wait flag.'),
                            primaryButton: nls.localize({ key: 'TaskSystem.exitAnyways', comment: ['&& denotes a mnemonic'] }, "&&Exit Anyways"),
                            type: 'info'
                        }).then(res => !res.confirmed);
                    }
                    return true; // veto
                }, (err) => {
                    return true; // veto
                });
            }
            return true; // veto
        });
    }
};
TaskService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IMarkerService),
    __param(2, IOutputService),
    __param(3, IPaneCompositePartService),
    __param(4, IViewsService),
    __param(5, ICommandService),
    __param(6, IEditorService),
    __param(7, IFileService),
    __param(8, IWorkspaceContextService),
    __param(9, ITelemetryService),
    __param(10, ITextFileService),
    __param(11, ILifecycleService),
    __param(12, IModelService),
    __param(13, IExtensionService),
    __param(14, IQuickInputService),
    __param(15, IConfigurationResolverService),
    __param(16, ITerminalService),
    __param(17, ITerminalGroupService),
    __param(18, IStorageService),
    __param(19, IProgressService),
    __param(20, IOpenerService),
    __param(21, IDialogService),
    __param(22, INotificationService),
    __param(23, IContextKeyService),
    __param(24, IWorkbenchEnvironmentService),
    __param(25, ITerminalProfileResolverService),
    __param(26, IPathService),
    __param(27, ITextModelService),
    __param(28, IPreferencesService),
    __param(29, IViewDescriptorService),
    __param(30, IWorkspaceTrustRequestService),
    __param(31, IWorkspaceTrustManagementService),
    __param(32, ILogService),
    __param(33, IThemeService),
    __param(34, IInstantiationService),
    __param(35, IRemoteAgentService),
    __param(36, IAccessibilitySignalService),
    __param(37, IChatService),
    __param(38, IChatAgentService),
    __param(39, IHostService)
], TaskService);
export { TaskService };
registerSingleton(ITaskService, TaskService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YXNrcy9lbGVjdHJvbi1icm93c2VyL3Rhc2tTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxLQUFLLE1BQU0sTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRSxPQUFPLEVBQW9CLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFaEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXJELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hFLE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNyRSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDdEUsT0FBTyxFQUF1QixjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVyRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdD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