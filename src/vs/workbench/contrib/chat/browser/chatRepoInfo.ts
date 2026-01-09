/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ISCMService } from '../../scm/common/scm.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IChatModel, IExportableRepoData, IExportableRepoDiff } from '../common/model/chatModel.js';
import { getRemotes } from '../../../../platform/extensionManagement/common/configRemotes.js';

/**
 * Captures repository information when the first message is sent in a chat session.
 */
export class ChatRepoInfoContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatRepoInfo';

	constructor(
		@IChatService private readonly chatService: IChatService,
		@ISCMService private readonly scmService: ISCMService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this.chatService.onDidSubmitRequest(async ({ chatSessionResource }) => {
			const model = this.chatService.getSession(chatSessionResource);
			if (!model || model.repoData) {
				return;
			}
			await this.captureAndSetRepoData(model);
		}));
	}

	private async captureAndSetRepoData(model: IChatModel): Promise<void> {
		try {
			const repoData = await this.captureRepoInfo();
			if (repoData) {
				model.setRepoData(repoData);
				if (!repoData.headCommitHash) {
					this.logService.warn('[ChatRepoInfo] Captured repo data without commit hash - git history may not be ready');
				}
			} else {
				this.logService.debug('[ChatRepoInfo] No SCM repository available for chat session');
			}
		} catch (error) {
			this.logService.warn('[ChatRepoInfo] Failed to capture repo info:', error);
		}
	}

	private async captureRepoInfo(): Promise<IExportableRepoData | undefined> {
		// Get the first SCM repository
		const repositories = [...this.scmService.repositories];
		if (repositories.length === 0) {
			return undefined;
		}

		const repository = repositories[0];
		const rootUri = repository.provider.rootUri;
		if (!rootUri) {
			return undefined;
		}

		let remoteUrl: string | undefined;
		try {
			const gitConfigUri = rootUri.with({ path: `${rootUri.path}/.git/config` });
			const exists = await this.fileService.exists(gitConfigUri);
			if (exists) {
				const content = await this.fileService.readFile(gitConfigUri);
				const remotes = getRemotes(content.value.toString());
				remoteUrl = remotes[0];
			}
		} catch (error) {
			this.logService.warn('[ChatRepoInfo] Failed to read git remote URL:', error);
		}

		let headCommitHash: string | undefined;
		const historyProvider = repository.provider.historyProvider?.get();
		if (historyProvider) {
			const historyItemRef = historyProvider.historyItemRef.get();
			headCommitHash = historyItemRef?.revision;
		}

		let repoType: 'github' | 'ado' = 'github';
		if (remoteUrl?.includes('dev.azure.com') || remoteUrl?.includes('visualstudio.com')) {
			repoType = 'ado';
		}

		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		const workspaceFileCount = workspaceFolders.length;

		const diffs: IExportableRepoDiff[] = [];
		let changedFileCount = 0;

		for (const group of repository.provider.groups) {
			for (const resource of group.resources) {
				changedFileCount++;
				diffs.push({
					uri: resource.sourceUri.toString(),
					originalUri: resource.multiDiffEditorOriginalUri?.toString() ?? resource.sourceUri.toString(),
					renameUri: undefined,
					status: group.label || group.id,
					diff: undefined
				});
			}
		}

		return {
			remoteUrl,
			repoType,
			headCommitHash,
			workspaceFileCount,
			changedFileCount,
			diffs
		};
	}
}
