/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';

export interface IBackupWorkspacesFormat {
	rootWorkspaces: IWorkspaceIdentifier[];
	folderURIWorkspaces: string[];
	emptyWorkspaceInfos: IEmptyWindowBackupInfo[];

	// deprecated
	folderWorkspaces?: string[]; // use folderURIWorkspaces instead
	emptyWorkspaces?: string[];
}

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');

export interface IEmptyWindowBackupInfo {
	backupFolder: string;
	remoteAuthority?: string;
}

export interface IBackupMainService {
	_serviceBrand: any;

	isHotExitEnabled(): boolean;

	getWorkspaceBackups(): IWorkspaceIdentifier[];
	getFolderBackupPaths(): URI[];
	getEmptyWindowBackupPaths(): IEmptyWindowBackupInfo[];

	registerWorkspaceBackupSync(workspace: IWorkspaceIdentifier, migrateFrom?: string): string;
	registerFolderBackupSync(folderUri: URI): string;
	registerEmptyWindowBackupSync(backupInfo: IEmptyWindowBackupInfo): string;

	unregisterWorkspaceBackupSync(workspace: IWorkspaceIdentifier): void;
	unregisterFolderBackupSync(folderUri: URI): void;
	unregisterEmptyWindowBackupSync(backupFolder: string): void;
}