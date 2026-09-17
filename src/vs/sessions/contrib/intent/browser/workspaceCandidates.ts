/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { getGitHubRemoteInfo } from '../../../../workbench/contrib/git/common/utils.js';
import { ISessionsRecentWorkspacesService } from '../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IWorkspaceCandidate, IWorkspaceIntent, sameIntentRepository } from '../common/sessionIntent.js';

export const MAX_WORKSPACE_CANDIDATES = 20;
const MAX_EXPLICIT_FOLDERS = 5;

export class WorkspaceCandidateResolver {
	constructor(
		@ISessionsRecentWorkspacesService private readonly recents: ISessionsRecentWorkspacesService,
		@ISessionsManagementService private readonly management: ISessionsManagementService,
		@IGitService private readonly gitService: IGitService,
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) { }

	async resolve(intent: IWorkspaceIntent, revision: number, token: CancellationToken): Promise<IWorkspaceCandidate[]> {
		const folders = new Map<string, { folder: URI; explicit: boolean }>();
		const add = (folder: URI, explicit = false) => {
			if (folder.scheme !== Schemas.file || folder.authority || folders.size >= MAX_WORKSPACE_CANDIDATES) {
				return;
			}
			const key = this.uriIdentityService.extUri.getComparisonKey(folder);
			if (!folders.has(key)) {
				folders.set(key, { folder, explicit });
			}
		};
		for (const folder of intent.folders?.slice(0, MAX_EXPLICIT_FOLDERS) ?? []) {
			add(folder, true);
		}
		for (const repository of this.gitService.repositories) {
			if (intent.repository && sameIntentRepository(intent.repository, getGitHubRemoteInfo(repository.state.get()))) {
				add(repository.rootUri);
			}
		}
		for (const recent of this.recents.getRecentWorkspaces(true, false)) {
			for (const folder of recent.workspace.folders) {
				add(folder.root);
			}
		}
		for (const session of this.management.getSessions().sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime()).slice(0, MAX_WORKSPACE_CANDIDATES)) {
			if (!session.isQuickChat?.get() && !session.worktreePending?.get()) {
				for (const folder of session.workspace.get()?.folders ?? []) {
					add(folder.root);
				}
			}
		}
		for (const repository of this.gitService.repositories) {
			add(repository.rootUri);
		}

		const candidates: IWorkspaceCandidate[] = [];
		for (const { folder, explicit } of folders.values()) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const candidate = await this.validate(folder, revision, explicit || !!intent.repository);
			candidates.push({
				...candidate,
				reason: candidate.validation !== 'verified' ? candidate.reason
					: explicit ? localize('intent.explicit', "Explicitly supplied local folder.")
						: sameIntentRepository(intent.repository, candidate.repository) ? localize('intent.remoteMatch', "Git remote matches the supplied repository.")
							: intent.repository ? localize('intent.notMatched', "Known local workspace; repository match has not been established.")
								: localize('intent.known', "Known local workspace; confirm whether it belongs to this task."),
			});
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return candidates.sort((a, b) => Number(sameIntentRepository(intent.repository, b.repository)) - Number(sameIntentRepository(intent.repository, a.repository)));
	}

	async validate(folder: URI, revision: number, resolveGit: boolean): Promise<IWorkspaceCandidate> {
		const base = {
			kind: 'local' as const, id: generateUuid(), revision, folder,
			worktree: 'unknown' as const,
			worktreeReason: localize('intent.gitUnknown', "Git metadata is not available. The host must verify worktree support."),
		};
		if (folder.scheme !== Schemas.file || folder.authority || !this.fileService.hasProvider(folder)) {
			return { ...base, validation: 'unavailable', reason: localize('intent.noFilesystem', "A local filesystem provider is not available for this folder.") };
		}
		try {
			const stat = await this.fileService.stat(folder);
			if (!stat.isDirectory) {
				return { ...base, validation: 'unavailable', reason: localize('intent.notDirectory', "This path is not a directory.") };
			}
			const repository = [...this.gitService.repositories].find(repository => this.uriIdentityService.extUri.isEqual(repository.rootUri, folder))
				?? (resolveGit ? await this.gitService.openRepository(folder) : undefined);
			const state = repository && this.uriIdentityService.extUri.isEqual(repository.rootUri, folder) ? repository.state.get() : undefined;
			return {
				...base, validation: 'verified', reason: localize('intent.verified', "Local directory verified."),
				repository: state ? getGitHubRemoteInfo(state) : undefined,
				worktree: state ? state.HEAD?.commit ? 'available' : 'unavailable' : 'unknown',
				worktreeReason: state ? state.HEAD?.commit
					? localize('intent.hasCommit', "Git checkout has a commit; worktree creation is rechecked by the host.")
					: localize('intent.noCommit', "This checkout has no usable commit for a worktree.") : base.worktreeReason,
			};
		} catch (error) {
			return {
				...base,
				validation: error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND ? 'missing' : 'error',
				reason: toErrorMessage(error),
			};
		}
	}
}
