/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ISerializedWorkspace { id: string; configURIPath: string; remoteAuthority?: string; }

export interface ISerializedFolder { folderUri: string; remoteAuthority?: string; }

export interface IBackupWorkspacesFormat {
	rootURIWorkspaces: ISerializedWorkspace[];
	folderWorkspaceInfos: ISerializedFolder[];
	emptyWorkspaceInfos: IEmptyWindowBackupInfo[];
}

/** Deprecated since 1.64 */
export interface IDeprecatedBackupWorkspacesFormat {
	folderURIWorkspaces: string[]; // replaced by folderWorkspaceInfos
}

export interface IEmptyWindowBackupInfo {
	backupFolder: string;
	remoteAuthority?: string;
}

export function isEmptyWindowBackupInfo(obj: unknown): obj is IEmptyWindowBackupInfo {
	const candidate = obj as IEmptyWindowBackupInfo;
	return typeof candidate?.backupFolder === 'string';
}
