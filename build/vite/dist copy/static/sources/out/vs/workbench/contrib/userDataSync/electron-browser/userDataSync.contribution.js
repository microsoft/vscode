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
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IUserDataSyncUtilService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { CONTEXT_SYNC_STATE, DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR, IUserDataSyncWorkbenchService, SYNC_TITLE } from '../../../services/userDataSync/common/userDataSync.js';
import { Schemas } from '../../../../base/common/network.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
let UserDataSyncServicesContribution = class UserDataSyncServicesContribution extends Disposable {
    static { this.ID = 'workbench.contrib.userDataSyncServices'; }
    constructor(userDataSyncUtilService, sharedProcessService) {
        super();
        sharedProcessService.registerChannel('userDataSyncUtil', ProxyChannel.fromService(userDataSyncUtilService, this._store));
    }
};
UserDataSyncServicesContribution = __decorate([
    __param(0, IUserDataSyncUtilService),
    __param(1, ISharedProcessService)
], UserDataSyncServicesContribution);
registerWorkbenchContribution2(UserDataSyncServicesContribution.ID, UserDataSyncServicesContribution, 1 /* WorkbenchPhase.BlockStartup */);
registerAction2(class OpenSyncBackupsFolder extends Action2 {
    constructor() {
        super({
            id: 'workbench.userData.actions.openSyncBackupsFolder',
            title: localize2('Open Backup folder', "Open Local Backups Folder"),
            category: SYNC_TITLE,
            menu: {
                id: MenuId.CommandPalette,
                when: CONTEXT_SYNC_STATE.notEqualsTo("uninitialized" /* SyncStatus.Uninitialized */),
            }
        });
    }
    async run(accessor) {
        const syncHome = accessor.get(IEnvironmentService).userDataSyncHome;
        const nativeHostService = accessor.get(INativeHostService);
        const fileService = accessor.get(IFileService);
        const notificationService = accessor.get(INotificationService);
        if (await fileService.exists(syncHome)) {
            const folderStat = await fileService.resolve(syncHome);
            const item = folderStat.children && folderStat.children[0] ? folderStat.children[0].resource : syncHome;
            return nativeHostService.showItemInFolder(item.with({ scheme: Schemas.file }).fsPath);
        }
        else {
            notificationService.info(localize('no backups', "Local backups folder does not exist"));
        }
    }
});
registerAction2(class DownloadSyncActivityAction extends Action2 {
    constructor() {
        super(DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR);
    }
    async run(accessor) {
        const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
        const notificationService = accessor.get(INotificationService);
        const hostService = accessor.get(INativeHostService);
        const folder = await userDataSyncWorkbenchService.downloadSyncActivity();
        if (folder) {
            notificationService.prompt(Severity.Info, localize('download sync activity complete', "Successfully downloaded Settings Sync activity."), [{
                    label: localize('open', "Open Folder"),
                    run: () => hostService.showItemInFolder(folder.fsPath)
                }]);
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhU3luYy9lbGVjdHJvbi1icm93c2VyL3VzZXJEYXRhU3luYy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUEwQyw4QkFBOEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFILE9BQU8sRUFBRSx3QkFBd0IsRUFBYyxNQUFNLDBEQUEwRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFekQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsbUNBQW1DLEVBQUUsNkJBQTZCLEVBQUUsVUFBVSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDM0ssT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUs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