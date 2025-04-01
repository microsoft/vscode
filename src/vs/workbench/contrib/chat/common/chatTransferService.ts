/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { isChatTransferredWorkspace, areWorkspaceFoldersEmpty } from '../../../services/workspaces/common/workspaceUtils.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IChatTransferService = createDecorator<IChatTransferService>('chatTransferService');

export interface IChatTransferService {
	readonly _serviceBrand: undefined;

	checkAndSetWorkspaceTrust(): Promise<void>;
}

export class ChatTransferService implements IChatTransferService {
	_serviceBrand: undefined;

	constructor(
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService
	) { }

	async checkAndSetWorkspaceTrust(): Promise<void> {
		const workspace = this.workspaceService.getWorkspace();
		if (isChatTransferredWorkspace(workspace, this.storageService) && await areWorkspaceFoldersEmpty(workspace, this.fileService)) {
			await this.workspaceTrustManagementService.setWorkspaceTrust(true);
		}
	}
}
