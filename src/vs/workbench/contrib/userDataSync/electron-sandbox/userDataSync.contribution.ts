/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserDataSyncUtilService, SyncStatus } from 'vs/platform/userDataSync/common/userDataSync';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { UserDataSycnUtilServiceChannel } from 'vs/platform/userDataSync/common/userDataSyncIpc';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { INativeHostService } from 'vs/platform/native/common/native';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { CONTEXT_SYNC_STATE, DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR, IUserDataSyncWorkbenchService, SYNC_TITLE } from 'vs/workbench/services/userDataSync/common/userDataSync';
import { Schemas } from 'vs/base/common/network';

class UserDataSyncServicesContribution implements IWorkbenchContribution {

	constructor(
		@IUserDataSyncUtilService userDataSyncUtilService: IUserDataSyncUtilService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		sharedProcessService.registerChannel('userDataSyncUtil', new UserDataSycnUtilServiceChannel(userDataSyncUtilService));
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncServicesContribution, LifecyclePhase.Starting);

registerAction2(class OpenSyncBackupsFolder extends Action2 {
	constructor() {
		super({
			id: 'workbench.userData.actions.openSyncBackupsFolder',
			title: { value: localize('Open Backup folder', "Open Local Backups Folder"), original: 'Open Local Backups Folder' },
			category: { value: SYNC_TITLE, original: `Settings Sync` },
			menu: {
				id: MenuId.CommandPalette,
				when: CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized),
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const syncHome = accessor.get(IEnvironmentService).userDataSyncHome;
		const nativeHostService = accessor.get(INativeHostService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);
		if (await fileService.exists(syncHome)) {
			const folderStat = await fileService.resolve(syncHome);
			const item = folderStat.children && folderStat.children[0] ? folderStat.children[0].resource : syncHome;
			return nativeHostService.showItemInFolder(item.with({ scheme: Schemas.file }).fsPath);
		} else {
			notificationService.info(localize('no backups', "Local backups folder does not exist"));
		}
	}
});

registerAction2(class DownloadSyncActivityAction extends Action2 {
	constructor() {
		super(DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR);
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
		const notificationService = accessor.get(INotificationService);
		const hostService = accessor.get(INativeHostService);
		const folder = await userDataSyncWorkbenchService.downloadSyncActivity();
		if (folder) {
			notificationService.prompt(Severity.Info, localize('download sync activity complete', "Successfully downloaded Settings Sync activity."),
				[{
					label: localize('open', "Open Folder"),
					run: () => hostService.showItemInFolder(folder.fsPath)
				}]);
		}
	}
});
