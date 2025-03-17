/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { IWorkspace } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';

export function isChatTransferredWorkspace(workspace: IWorkspace, storageService: IStorageService): boolean {
	const workspaceUri = workspace.folders[0]?.uri;
	if (!workspaceUri) {
		return false;
	}
	const chatWorkspaceTransfer = storageService.getObject('chat.workspaceTransfer', StorageScope.PROFILE, []);
	const toWorkspace: { toWorkspace: URI }[] = chatWorkspaceTransfer.map((item: any) => {
		return { toWorkspace: URI.from(item.toWorkspace) };
	});
	return toWorkspace.some(item => item.toWorkspace.toString() === workspaceUri.toString());
}

export async function areWorkspaceFoldersEmpty(workspace: IWorkspace, fileService: IFileService): Promise<boolean> {
	for (const folder of workspace.folders) {
		const folderStat = await fileService.resolve(folder.uri);
		if (folderStat.children && folderStat.children.length > 0) {
			return false;
		}
	}
	return true;
}
