/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEmptyWindowBackupInfo } from 'vs/platform/backup/node/backup';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IFolderBackupInfo, IWorkspaceBackupInfo } from 'vs/platform/backup/common/backup';

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');

export interface IBackupMainService {

	readonly _serviceBrand: undefined;

	isHotExitEnabled(): boolean;

	getEmptyWindowBackups(): IEmptyWindowBackupInfo[];

	registerWorkspaceBackup(workspaceInfo: IWorkspaceBackupInfo, migrateFrom?: string): string;
	registerFolderBackup(folderInfo: IFolderBackupInfo): string;
	registerEmptyWindowBackup(emptyWindowInfo: IEmptyWindowBackupInfo): string;

	/**
	 * All folders or workspaces that are known to have
	 * backups stored. This call is long running because
	 * it checks for each backup location if any backups
	 * are stored.
	 */
	getDirtyWorkspaces(): Promise<Array<IWorkspaceBackupInfo | IFolderBackupInfo>>;
}
