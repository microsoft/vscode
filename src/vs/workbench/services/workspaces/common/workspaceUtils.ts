/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { IWorkspace } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';

export function isChatTransferedWorkspace(workspace: IWorkspace, storageService: IStorageService): boolean {
	const toWorkspace: { toWorkspace: URI }[] = storageService.getObject('chat.workspaceTransfer', StorageScope.PROFILE, []).map((item: any) => ({ toWorkspace: URI.parse(item.toWorkspace) }));
	const workspaceUri = workspace.folders[0]?.uri;
	const thisWorkspace = workspaceUri.toString();
	return toWorkspace.some(item => URI.revive(item.toWorkspace).toString() === thisWorkspace);
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
