/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUserDataSyncUtilService, CONTEXT_SYNC_STATE, SyncStatus } from 'vs/platform/userDataSync/common/userDataSync';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { UserDataSycnUtilServiceChannel } from 'vs/platform/userDataSync/common/userDataSyncIpc';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IElectronService } from 'vs/platform/electron/node/electron';

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
			category: { value: localize('sync preferences', "Preferences Sync"), original: `Preferences Sync` },
			menu: {
				id: MenuId.CommandPalette,
				when: CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized),
			}
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const syncHome = accessor.get(IEnvironmentService).userDataSyncHome;
		const electronService = accessor.get(IElectronService);
		const folderStat = await accessor.get(IFileService).resolve(syncHome);
		const item = folderStat.children && folderStat.children[0] ? folderStat.children[0].resource : syncHome;
		return electronService.showItemInFolder(item.fsPath);
	}
});
