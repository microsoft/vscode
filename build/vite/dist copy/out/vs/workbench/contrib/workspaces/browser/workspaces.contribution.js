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
import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { hasWorkspaceFileExtension, IWorkspaceContextService, WORKSPACE_SUFFIX } from '../../../../platform/workspace/common/workspace.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService, NeverShowAgainScope, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { isEqual, joinPath } from '../../../../base/common/resources.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isVirtualWorkspace } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ActiveEditorContext, ResourceContextKey, TemporaryWorkspaceContext } from '../../../common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { TEXT_FILE_EDITOR_ID } from '../../files/common/files.js';
/**
 * A workbench contribution that will look for `.code-workspace` files in the root of the
 * workspace folder and open a notification to suggest to open one of the workspaces.
 */
let WorkspacesFinderContribution = class WorkspacesFinderContribution extends Disposable {
    constructor(contextService, notificationService, fileService, quickInputService, hostService, storageService) {
        super();
        this.contextService = contextService;
        this.notificationService = notificationService;
        this.fileService = fileService;
        this.quickInputService = quickInputService;
        this.hostService = hostService;
        this.storageService = storageService;
        this.findWorkspaces();
    }
    async findWorkspaces() {
        const folder = this.contextService.getWorkspace().folders[0];
        if (!folder || this.contextService.getWorkbenchState() !== 2 /* WorkbenchState.FOLDER */ || isVirtualWorkspace(this.contextService.getWorkspace())) {
            return; // require a single (non virtual) root folder
        }
        const rootFileNames = (await this.fileService.resolve(folder.uri)).children?.map(child => child.name);
        if (Array.isArray(rootFileNames)) {
            const workspaceFiles = rootFileNames.filter(hasWorkspaceFileExtension);
            if (workspaceFiles.length > 0) {
                this.doHandleWorkspaceFiles(folder.uri, workspaceFiles);
            }
        }
    }
    doHandleWorkspaceFiles(folder, workspaces) {
        const neverShowAgain = { id: 'workspaces.dontPromptToOpen', scope: NeverShowAgainScope.WORKSPACE, isSecondary: true };
        // Prompt to open one workspace
        if (workspaces.length === 1) {
            const workspaceFile = workspaces[0];
            this.notificationService.prompt(Severity.Info, localize({
                key: 'foundWorkspace',
                comment: ['{Locked="]({1})"}']
            }, "This folder contains a workspace file '{0}'. Do you want to open it? [Learn more]({1}) about workspace files.", workspaceFile, 'https://go.microsoft.com/fwlink/?linkid=2025315'), [{
                    label: localize('openWorkspace', "Open Workspace"),
                    run: () => this.hostService.openWindow([{ workspaceUri: joinPath(folder, workspaceFile) }])
                }], {
                neverShowAgain,
                priority: !this.storageService.isNew(1 /* StorageScope.WORKSPACE */) ? NotificationPriority.SILENT : NotificationPriority.OPTIONAL // https://github.com/microsoft/vscode/issues/125315
            });
        }
        // Prompt to select a workspace from many
        else if (workspaces.length > 1) {
            this.notificationService.prompt(Severity.Info, localize({
                key: 'foundWorkspaces',
                comment: ['{Locked="]({0})"}']
            }, "This folder contains multiple workspace files. Do you want to open one? [Learn more]({0}) about workspace files.", 'https://go.microsoft.com/fwlink/?linkid=2025315'), [{
                    label: localize('selectWorkspace', "Select Workspace"),
                    run: () => {
                        this.quickInputService.pick(workspaces.map(workspace => ({ label: workspace })), { placeHolder: localize('selectToOpen', "Select a workspace to open") }).then(pick => {
                            if (pick) {
                                this.hostService.openWindow([{ workspaceUri: joinPath(folder, pick.label) }]);
                            }
                        });
                    }
                }], {
                neverShowAgain,
                priority: !this.storageService.isNew(1 /* StorageScope.WORKSPACE */) ? NotificationPriority.SILENT : NotificationPriority.OPTIONAL // https://github.com/microsoft/vscode/issues/125315
            });
        }
    }
};
WorkspacesFinderContribution = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, INotificationService),
    __param(2, IFileService),
    __param(3, IQuickInputService),
    __param(4, IHostService),
    __param(5, IStorageService)
], WorkspacesFinderContribution);
export { WorkspacesFinderContribution };
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspacesFinderContribution, 4 /* LifecyclePhase.Eventually */);
// Render "Open Workspace" button in *.code-workspace files
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.openWorkspaceFromEditor',
            title: localize2('openWorkspace', "Open Workspace"),
            f1: false,
            menu: {
                id: MenuId.EditorContent,
                when: ContextKeyExpr.and(ResourceContextKey.Extension.isEqualTo(WORKSPACE_SUFFIX), ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID), TemporaryWorkspaceContext.toNegated())
            }
        });
    }
    async run(accessor, uri) {
        const hostService = accessor.get(IHostService);
        const contextService = accessor.get(IWorkspaceContextService);
        const notificationService = accessor.get(INotificationService);
        if (contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */) {
            const workspaceConfiguration = contextService.getWorkspace().configuration;
            if (workspaceConfiguration && isEqual(workspaceConfiguration, uri)) {
                notificationService.info(localize('alreadyOpen', "This workspace is already open."));
                return; // workspace already opened
            }
        }
        return hostService.openWindow([{ workspaceUri: uri }]);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlcy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93b3Jrc3BhY2VzL2Jyb3dzZXIvd29ya3NwYWNlcy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsSUFBSSxtQkFBbUIsRUFBMkQsTUFBTSxrQ0FBa0MsQ0FBQztBQUU5SSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsd0JBQXdCLEVBQWtCLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDM0osT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQTBCLG9CQUFvQixFQUFFLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRTdLLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxrQkFBa0IsRUFBa0IsTUFBTSxzREFBc0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZUFBZSxFQUFnQixNQUFNLGdEQUFnRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFN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