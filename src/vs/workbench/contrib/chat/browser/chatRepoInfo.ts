/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ISCMService } from '../../scm/common/scm.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IChatModel, IExportableRepoData, IExportableRepoDiff } from '../common/model/chatModel.js';
import { getRemotes } from '../../../../platform/extensionManagement/common/configRemotes.js';

/**
 * Captures the current repository state from the first available SCM repository.
 * Returns undefined if no SCM repository is available.
 */
export async function captureRepoInfo(scmService: ISCMService, fileService: IFileService): Promise<IExportableRepoData | undefined> {
	const repositories = [...scmService.repositories];
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
		const exists = await fileService.exists(gitConfigUri);
		if (exists) {
			const content = await fileService.readFile(gitConfigUri);
			const remotes = getRemotes(content.value.toString());
			remoteUrl = remotes[0];
		}
	} catch {
		// Ignore errors reading git config
	}

	let branchName: string | undefined;
	let headCommitHash: string | undefined;
	const historyProvider = repository.provider.historyProvider?.get();
	if (historyProvider) {
		const historyItemRef = historyProvider.historyItemRef.get();
		branchName = historyItemRef?.name;
		headCommitHash = historyItemRef?.revision;
	}

	let repoType: 'github' | 'ado' | 'other' = 'other';
	if (remoteUrl) {
		if (remoteUrl.includes('github.com')) {
			repoType = 'github';
		} else if (remoteUrl.includes('dev.azure.com') || remoteUrl.includes('visualstudio.com')) {
			repoType = 'ado';
		}
	}

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
		branchName,
		headCommitHash,
		changedFileCount,
		diffs
	};
}

/**
 * Captures repository information for chat sessions.
 * - On session creation: captures initial repo state for fresh sessions
 * - On first message: updates repo state to reflect any changes since session creation
 * - On SCM repository added: captures repo state for sessions that were created before SCM was ready
 */
export class ChatRepoInfoContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatRepoInfo';

	private readonly _pendingSessions = new DisposableStore();

	constructor(
		@IChatService private readonly chatService: IChatService,
		@ISCMService private readonly scmService: ISCMService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this._pendingSessions);

		// Capture repo info when session is created (for export without sending messages)
		this._register(this.chatService.onDidCreateModel(async (model) => {
			if (model.repoData) {
				return;
			}
			await this.captureAndSetRepoData(model);

			// If SCM wasn't ready, wait for repositories to become available
			const repositories = [...this.scmService.repositories];
			if (!model.repoData && repositories.length === 0) {
				this.waitForScmAndCapture(model);
			}
		}));

		// Update repo info when first message is sent (to capture changes since session creation)
		this._register(this.chatService.onDidSubmitRequest(async ({ chatSessionResource }) => {
			const model = this.chatService.getSession(chatSessionResource);
			if (!model) {
				return;
			}
			await this.captureAndSetRepoData(model);
		}));
	}

	/**
	 * Wait for SCM repositories to become available and then capture repo data.
	 * This handles the case where a chat session is restored before the git extension
	 * has had a chance to register its repositories.
	 */
	private waitForScmAndCapture(model: IChatModel): void {
		const disposables = new DisposableStore();
		this._pendingSessions.add(disposables);

		disposables.add(this.scmService.onDidAddRepository(async () => {
			if (model.repoData) {
				disposables.dispose();
				return;
			}
			await this.captureAndSetRepoData(model);
			if (model.repoData) {
				disposables.dispose();
			}
		}));

		// Clean up when the model is disposed
		disposables.add(model.onDidDispose(() => {
			disposables.dispose();
		}));
	}

	private async captureAndSetRepoData(model: IChatModel): Promise<void> {
		try {
			const repoData = await captureRepoInfo(this.scmService, this.fileService);
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
}
