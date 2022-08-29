/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export interface IWorkspaceBackupInfo {
	readonly workspace: IWorkspaceIdentifier;
	readonly remoteAuthority?: string;
}

export interface IFolderBackupInfo {
	readonly folderUri: URI;
	readonly remoteAuthority?: string;
}

export function isFolderBackupInfo(curr: IWorkspaceBackupInfo | IFolderBackupInfo): curr is IFolderBackupInfo {
	return curr && curr.hasOwnProperty('folderUri');
}

export function isWorkspaceBackupInfo(curr: IWorkspaceBackupInfo | IFolderBackupInfo): curr is IWorkspaceBackupInfo {
	return curr && curr.hasOwnProperty('workspace');
}
