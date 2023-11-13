/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IBaseBackupInfo, IFolderBackupInfo, IWorkspaceBackupInfo } from 'vs/platform/backup/common/backup';

export interface IEmptyWindowBackupInfo extends IBaseBackupInfo {
	readonly backupFolder: string;
}

export function isEmptyWindowBackupInfo(obj: unknown): obj is IEmptyWindowBackupInfo {
	const candidate = obj as IEmptyWindowBackupInfo | undefined;

	return typeof candidate?.backupFolder === 'string';
}

export interface ISerializedWorkspaceBackupInfo {
	readonly id: string;
	readonly configURIPath: string;
	remoteAuthority?: string;
}

export function deserializeWorkspaceInfos(serializedBackupWorkspaces: ISerializedBackupWorkspaces): IWorkspaceBackupInfo[] {
	let workspaceBackupInfos: IWorkspaceBackupInfo[] = [];
	try {
		if (Array.isArray(serializedBackupWorkspaces.workspaces)) {
			workspaceBackupInfos = serializedBackupWorkspaces.workspaces.map(workspace => (
				{
					workspace: {
						id: workspace.id,
						configPath: URI.parse(workspace.configURIPath)
					},
					remoteAuthority: workspace.remoteAuthority
				}
			));
		}
	} catch (e) {
		// ignore URI parsing exceptions
	}

	return workspaceBackupInfos;
}

export interface ISerializedFolderBackupInfo {
	readonly folderUri: string;
	remoteAuthority?: string;
}

export function deserializeFolderInfos(serializedBackupWorkspaces: ISerializedBackupWorkspaces): IFolderBackupInfo[] {
	let folderBackupInfos: IFolderBackupInfo[] = [];
	try {
		if (Array.isArray(serializedBackupWorkspaces.folders)) {
			folderBackupInfos = serializedBackupWorkspaces.folders.map(folder => (
				{
					folderUri: URI.parse(folder.folderUri),
					remoteAuthority: folder.remoteAuthority
				}
			));
		}
	} catch (e) {
		// ignore URI parsing exceptions
	}

	return folderBackupInfos;
}

export interface ISerializedEmptyWindowBackupInfo extends IEmptyWindowBackupInfo { }

export interface ILegacySerializedBackupWorkspaces {
	readonly rootURIWorkspaces: ISerializedWorkspaceBackupInfo[];
	readonly folderWorkspaceInfos: ISerializedFolderBackupInfo[];
	readonly emptyWorkspaceInfos: ISerializedEmptyWindowBackupInfo[];
}

export interface ISerializedBackupWorkspaces {
	readonly workspaces: ISerializedWorkspaceBackupInfo[];
	readonly folders: ISerializedFolderBackupInfo[];
	readonly emptyWindows: ISerializedEmptyWindowBackupInfo[];
}
