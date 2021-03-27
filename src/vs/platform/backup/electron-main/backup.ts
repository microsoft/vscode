/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { IEmptyWindowBackupInfo } from 'vs/platform/backup/node/backup';

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');

export interface IWorkspaceBackupInfo {
	workspace: IWorkspaceIdentifier;
	remoteAuthority?: string;
}

export interface IBackupMainService {
	_serviceBrand: undefined;

	isHotExitEnabled(): boolean;

	getWorkspaceBackups(): IWorkspaceBackupInfo[];
	getFolderBackupPaths(): URI[];
	getEmptyWindowBackupPaths(): IEmptyWindowBackupInfo[];

	registerWorkspaceBackupSync(workspace: IWorkspaceBackupInfo, migrateFrom?: string): string;
	registerFolderBackupSync(folderUri: URI): string;
	registerEmptyWindowBackupSync(backupFolder?: string, remoteAuthority?: string): string;

	unregisterWorkspaceBackupSync(workspace: IWorkspaceIdentifier): void;
	unregisterFolderBackupSync(folderUri: URI): void;
	unregisterEmptyWindowBackupSync(backupFolder: string): void;
}
