/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Uri from 'vs/base/common/uri';
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

	/**
	 * The set of active workspace backup paths being tracked for restoration.
	 */
	workspaceBackupPaths: string[];

	/**
	 * The set of active empty workspace backup paths being tracked for restoration.
	 */
	emptyWorkspaceBackupPaths: string[];

	registerWindowForBackups(windowId: number, isEmptyWorkspace: boolean, backupFolder?: string): void;

	/**
	 * Pushes workspace backup paths to be tracked for restoration.
	 *
	 * @param workspaces The workspaces to add.
	 */
	pushWorkspaceBackupPathsSync(workspaces: Uri[]): void;

	// TODO: Doc
	pushEmptyWorkspaceBackupWindowIdSync(vscodeWindowId: string): void;
}

export interface IBackupService {
	_serviceBrand: any;

	getBackupPath(windowId: number): TPromise<string>;
}