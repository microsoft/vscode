/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBaseBackupInfo } from 'vs/platform/backup/common/backup';

export interface IEmptyWindowBackupInfo extends IBaseBackupInfo {
	readonly backupFolder: string;
}

export function isEmptyWindowBackupInfo(obj: unknown): obj is IEmptyWindowBackupInfo {
	const candidate = obj as IEmptyWindowBackupInfo | undefined;

	return typeof candidate?.backupFolder === 'string';
}

export interface ISerializedWorkspace {
	readonly id: string;
	readonly configURIPath: string;
	readonly remoteAuthority?: string;
}

export interface ISerializedFolder {
	readonly folderUri: string;
	readonly remoteAuthority?: string;
}

export interface ISerializedEmptyWindow extends IEmptyWindowBackupInfo { }

export interface IBackupWorkspaces {
	readonly rootURIWorkspaces: ISerializedWorkspace[];
	readonly folderWorkspaceInfos: ISerializedFolder[];
	readonly emptyWorkspaceInfos: ISerializedEmptyWindow[];
}
