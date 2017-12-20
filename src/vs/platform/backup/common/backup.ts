/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export interface IBackupWorkspacesFormat {
	rootWorkspaces: IWorkspaceIdentifier[];
	folderWorkspaces: string[];
	emptyWorkspaces: string[];
}

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');

export interface IBackupMainService {
	_serviceBrand: any;

	isHotExitEnabled(): boolean;

	getWorkspaceBackups(): IWorkspaceIdentifier[];
	getFolderBackupPaths(): string[];
	getEmptyWindowBackupPaths(): string[];

	registerWorkspaceBackupSync(workspace: IWorkspaceIdentifier, migrateFrom?: string): string;
	registerFolderBackupSync(folderPath: string): string;
	registerEmptyWindowBackupSync(backupFolder?: string): string;
}