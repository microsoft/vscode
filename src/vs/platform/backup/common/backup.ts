/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';

export interface IBackupWorkspacesFormat {
	folderWorkspaces: string[];
	emptyWorkspaces: string[];
}

export const IBackupMainService = createDecorator<IBackupMainService>('backupMainService');
export const IBackupService = createDecorator<IBackupService>('backupService');

export interface IBackupMainService extends IBackupService {
	_serviceBrand: any;

	getWorkspaceBackupPaths(): string[];
	getEmptyWorkspaceBackupPaths(): string[];

	registerWindowForBackupsSync(windowId: number, isEmptyWorkspace: boolean, backupFolder?: string, workspacePath?: string): void;
}

export interface IBackupService {
	_serviceBrand: any;

	getBackupPath(windowId: number): TPromise<string>;
}