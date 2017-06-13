/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IBackupWorkspacesFormat {
	folderWorkspaces: string[];
	emptyWorkspaces: string[];
}

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');

export interface IBackupMainService {
	_serviceBrand: any;

	getWorkspaceBackupPaths(): string[];
	getEmptyWorkspaceBackupPaths(): string[];

	registerWindowForBackupsSync(windowId: number, isEmptyWorkspace: boolean, backupFolder?: string, workspacePath?: string): string;
}