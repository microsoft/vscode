/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';

export interface ISerializedWorkspace { id: string; configURIPath: string; remoteAuthority?: string; }

export interface IBackupWorkspacesFormat {
	rootURIWorkspaces: ISerializedWorkspace[];
	folderURIWorkspaces: string[];
	emptyWorkspaceInfos: IEmptyWindowBackupInfo[];

	// deprecated
	folderWorkspaces?: string[]; // use folderURIWorkspaces instead
	emptyWorkspaces?: string[];
	rootWorkspaces?: { id: string, configPath: string }[]; // use rootURIWorkspaces instead
}

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');

export interface IEmptyWindowBackupInfo {
	backupFolder: string;
	remoteAuthority?: string;
}

export interface IWorkspaceBackupInfo {
	workspace: IWorkspaceIdentifier;
	remoteAuthority?: string;
}

export interface IBackupMainService {
	_serviceBrand: any;

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