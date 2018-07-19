/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import URI from 'vs/base/common/uri';

export interface IBackupWorkspacesFormat {
	rootWorkspaces: IWorkspaceIdentifier[];
	folderURIWorkspaces: string[];
	emptyWorkspaces: string[];

	// deprecated
	folderWorkspaces?: string[]; // use folderURIWorkspaces instead
}

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');

export interface IBackupMainService {
	_serviceBrand: any;

	isHotExitEnabled(): boolean;

	getWorkspaceBackups(): IWorkspaceIdentifier[];
	getFolderBackupPaths(): URI[];
	getEmptyWindowBackupPaths(): string[];

	registerWorkspaceBackupSync(workspace: IWorkspaceIdentifier, migrateFrom?: string): string;
	registerFolderBackupSync(folderUri: URI): string;
	registerEmptyWindowBackupSync(backupFolder?: string): string;

	unregisterWorkspaceBackupSync(workspace: IWorkspaceIdentifier): void;
	unregisterFolderBackupSync(folderUri: URI): void;
	unregisterEmptyWindowBackupSync(backupFolder: string): void;
}