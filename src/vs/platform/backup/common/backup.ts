/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IWorkspaceIdentifier } from '../../workspace/common/workspace.js';

export interface IBaseBackupInfo {
	remoteAuthority?: string;
}

export interface IWorkspaceBackupInfo extends IBaseBackupInfo {
	readonly workspace: IWorkspaceIdentifier;
}

export interface IFolderBackupInfo extends IBaseBackupInfo {
	readonly folderUri: URI;
}

export function isFolderBackupInfo(curr: IWorkspaceBackupInfo | IFolderBackupInfo): curr is IFolderBackupInfo {
	return curr?.hasOwnProperty('folderUri');
}

export function isWorkspaceBackupInfo(curr: IWorkspaceBackupInfo | IFolderBackupInfo): curr is IWorkspaceBackupInfo {
	return curr?.hasOwnProperty('workspace');
}
