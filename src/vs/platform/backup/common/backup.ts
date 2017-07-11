/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IBackupWorkspacesFormat {
	rootWorkspaces: string[];
	folderWorkspaces: string[];
	emptyWorkspaces: string[];
}

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');

export interface IBackupMainService {
	_serviceBrand: any;

	getWorkspaceBackupPaths(): string[];
	getFolderBackupPaths(): string[];
	getEmptyWindowBackupPaths(): string[];

	registerWorkspaceBackupSync(workspaceConfigPath: string): string;
	registerFolderBackupSync(folderPath: string): string;
	registerEmptyWindowBackupSync(backupFolder?: string): string;
}