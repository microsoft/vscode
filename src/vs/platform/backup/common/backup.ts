/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspace } from "vs/platform/workspaces/common/workspaces";

export interface IBackupWorkspacesFormat {
	rootWorkspaces: IWorkspace[];
	folderWorkspaces: string[];
	emptyWorkspaces: string[];
}

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');

export interface IBackupMainService {
	_serviceBrand: any;

	getWorkspaceBackups(): IWorkspace[];
	getFolderBackupPaths(): string[];
	getEmptyWindowBackupPaths(): string[];

	registerWorkspaceBackupSync(workspace: IWorkspace): string;
	registerFolderBackupSync(folderPath: string): string;
	registerEmptyWindowBackupSync(backupFolder?: string): string;
}