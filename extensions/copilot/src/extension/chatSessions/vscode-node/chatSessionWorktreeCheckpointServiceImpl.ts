/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';

import { Uri } from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IGitService, RepoContext } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IAgentSessionsWorkspace } from '../common/agentSessionsWorkspace';
import { IChatSessionMetadataStore } from '../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeCheckpointService } from '../common/chatSessionWorktreeCheckpointService';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { buildTempIndexEnv } from '../../../platform/git/vscode-node/utils';

const CHECKPOINT_REF_PREFIX = 'refs/sessions/';

function getCheckpointRef(sessionId: string, turnNumber: number): string {
	return `${CHECKPOINT_REF_PREFIX}${sessionId}/checkpoints/turn/${turnNumber}`;
}

export class ChatSessionWorktreeCheckpointService extends Disposable implements IChatSessionWorktreeCheckpointService {
	declare _serviceBrand: undefined;

	constructor(
		@IAgentSessionsWorkspace private readonly agentSessionsWorkspace: IAgentSessionsWorkspace,
		@IChatSessionMetadataStore private readonly metadataStore: IChatSessionMetadataStore,
		@IChatSessionWorkspaceFolderService private readonly workspaceFolderService: IChatSessionWorkspaceFolderService,
		@IChatSessionWorktreeService private readonly worktreeService: IChatSessionWorktreeService,
		@IGitService private readonly gitService: IGitService,
		@ILogService private readonly logService: ILogService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
	) {
		super();
	}

	async handleRequest(sessionId: string): Promise<void> {
		if (!this._getSessionCheckpointSupport()) {
			this.logService.trace('[ChatSessionWorktreeCheckpointService][handleRequest] Session does not support checkpoints, skipping baseline checkpoint creation');
			return;
		}

		const repositoryUri = await this._getSessionRepository(sessionId);
		const repository = repositoryUri ? await this.gitService.getRepository(repositoryUri) : undefined;

		if (!repository || !repository.headCommitHash) {
			this.logService.warn(`[ChatSessionWorktreeCheckpointService][handleRequest] No repository found for session ${sessionId}, skipping baseline checkpoint creation`);
			return;
		}

		// Initialize checkpoint state and capture baseline checkpoint
		const checkpointRef = await this._createCheckpoint(sessionId, repository, 0);
		if (!checkpointRef) {
			return;
		}

		// Update session metadata
		const worktreeProperties = await this.worktreeService.getWorktreeProperties(sessionId);
		if (!worktreeProperties || typeof worktreeProperties === 'string' || worktreeProperties.version === 1) {
			this.logService.trace(`[ChatSessionWorktreeCheckpointService][handleRequest] Session ${sessionId} does not use a git worktree, skipping checkpoint metadata update`);
			return;
		}

		await this.worktreeService.setWorktreeProperties(sessionId, {
			...worktreeProperties,
			firstCheckpointRef: checkpointRef,
			baseCheckpointRef: checkpointRef,
			lastCheckpointRef: checkpointRef
		});
	}

	async handleRequestCompleted(sessionId: string, requestId: string): Promise<void> {
		if (!this._getSessionCheckpointSupport()) {
			this.logService.trace('[ChatSessionWorktreeCheckpointService][handleRequestCompleted] Session does not support checkpoints, skipping post-turn checkpoint');
			return;
		}

		const repositoryUri = await this._getSessionRepository(sessionId);
		const repository = repositoryUri ? await this.gitService.getRepository(repositoryUri) : undefined;

		if (!repository || !repository.headCommitHash) {
			this.logService.warn(`[ChatSessionWorktreeCheckpointService][handleRequestCompleted] No repository found for session ${sessionId}, skipping post-turn checkpoint`);
			return;
		}

		const parentCheckpointRef = await this._getLatestCheckpointRef(sessionId);
		if (!parentCheckpointRef) {
			this.logService.warn(`[ChatSessionWorktreeCheckpointService][handleRequestCompleted] No existing checkpoint ref found for session ${sessionId} on request completion, skipping post-turn checkpoint`);
			return;
		}

		// Create checkpoint
		const currentTurn = parseInt(parentCheckpointRef.split('/').pop() ?? '0') + 1;
		const checkpointRef = await this._createCheckpoint(sessionId, repository, currentTurn, parentCheckpointRef);
		if (!checkpointRef) {
			return;
		}

		const worktreeProperties = await this.worktreeService.getWorktreeProperties(sessionId);
		if (worktreeProperties && typeof worktreeProperties !== 'string' && worktreeProperties.version === 2) {
			// Worktree isolation mode
			await this.worktreeService.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				changes: undefined,
				lastCheckpointRef: checkpointRef
			});
		}

		// Update request metadata with new checkpoint ref
		await this.metadataStore.updateRequestDetails(sessionId, [{ vscodeRequestId: requestId, checkpointRef }]);
	}

	private async _getSessionRepository(sessionId: string): Promise<Uri | undefined> {
		const worktreeProperties = await this.worktreeService.getWorktreeProperties(sessionId);
		if (worktreeProperties) {
			// Worktree isolation mode
			if (typeof worktreeProperties === 'string' || worktreeProperties.version === 1) {
				return undefined;
			}

			return Uri.file(worktreeProperties.worktreePath);
		}

		// Workspace isolation mode
		return this.workspaceFolderService.getSessionWorkspaceFolder(sessionId);
	}

	private async _getLatestCheckpointRef(sessionId: string): Promise<string | undefined> {
		const repositoryUri = await this._getSessionRepository(sessionId);
		const repository = repositoryUri ? await this.gitService.getRepository(repositoryUri) : undefined;
		if (!repository) {
			return undefined;
		}

		try {
			const refPattern = `${CHECKPOINT_REF_PREFIX}${sessionId}/checkpoints/turn/`;
			const refs = await this.gitService.exec(repository.rootUri, [
				'for-each-ref', '--sort=-committerdate', '--format=%(refname)', refPattern]);

			return refs ? refs.split('\n')[0] : undefined;
		} catch (error) {
			this.logService.error(`[ChatSessionWorktreeCheckpointService][_getLatestCheckpointRef] Failed to get latest checkpoint ref for session ${sessionId}: `, error);
			return undefined;
		}
	}

	private _getSessionCheckpointSupport(): boolean {
		return this.agentSessionsWorkspace.isAgentSessionsWorkspace;
	}

	async handleAdditionalWorktreesRequest(sessionId: string): Promise<void> {
		if (!this._getSessionCheckpointSupport()) {
			return;
		}

		const additionalProps = await this.worktreeService.getAdditionalWorktreeProperties(sessionId);
		for (const props of additionalProps) {
			if (typeof props === 'string' || props.version === 1) {
				continue;
			}
			const repoUri = Uri.file(props.worktreePath);
			const repository = await this.gitService.getRepository(repoUri);
			if (!repository || !repository.headCommitHash) {
				this.logService.warn(`[ChatSessionWorktreeCheckpointService][handleAdditionalWorktreesRequest] No repository found for additional worktree ${props.worktreePath}`);
				continue;
			}
			await this._createCheckpoint(sessionId, repository, 0);
		}
	}

	async handleAdditionalWorktreesRequestCompleted(sessionId: string, requestId: string): Promise<void> {
		if (!this._getSessionCheckpointSupport()) {
			return;
		}

		const additionalProps = await this.worktreeService.getAdditionalWorktreeProperties(sessionId);
		const additionalCheckpointRefs: { [folderPath: string]: string } = {};

		await Promise.allSettled(additionalProps.map(async (props) => {
			if (typeof props === 'string' || props.version === 1) {
				return;
			}
			const repoUri = Uri.file(props.worktreePath);
			const repository = await this.gitService.getRepository(repoUri);
			if (!repository || !repository.headCommitHash) {
				return;
			}

			const parentCheckpointRef = await this._getLatestCheckpointRef(sessionId);
			const currentTurn = parentCheckpointRef ? parseInt(parentCheckpointRef.split('/').pop() ?? '0') + 1 : 0;
			const checkpointRef = await this._createCheckpoint(sessionId, repository, currentTurn, parentCheckpointRef);
			if (checkpointRef) {
				additionalCheckpointRefs[props.repositoryPath] = checkpointRef;
			}
		}));

		if (Object.keys(additionalCheckpointRefs).length > 0) {
			await this.metadataStore.updateRequestDetails(sessionId, [{ vscodeRequestId: requestId, additionalCheckpointRefs }]);
		}
	}

	private async _createCheckpoint(sessionId: string, repository: RepoContext, turnNumber: number, parentCheckpointRef?: string): Promise<string | undefined> {
		const repositoryUri = repository.rootUri;
		const tmpDirName = `vscode-sessions-${sessionId}-${generateUuid()}`;
		const checkpointIndexFile = path.join(this.extensionContext.globalStorageUri.fsPath, tmpDirName, `checkpoint.index`);
		const env = buildTempIndexEnv(repository, checkpointIndexFile);

		try {
			// Create temp index file directory
			await fs.mkdir(path.dirname(checkpointIndexFile), { recursive: true });

			// Resolve parent checkpoint ref
			const parentCommitOid = parentCheckpointRef
				? await this.gitService.exec(repositoryUri, ['rev-parse', parentCheckpointRef])
				: undefined;

			// Populate temp index from previous checkpoint tree (or HEAD for the baseline)
			await this.gitService.exec(repositoryUri, ['read-tree', parentCommitOid ?? 'HEAD'], env);

			// Stage entire working directory into temp index
			await this.gitService.exec(repositoryUri, ['add', '-A', '--', '.'], env);

			// Write the temp index as a tree object
			const treeOid = await this.gitService.exec(repositoryUri, ['write-tree'], env);

			// Create a commit pointing to the tree, chained to the previous checkpoint
			const commitTreeArgs = ['commit-tree', treeOid, ...(parentCommitOid ? ['-p', parentCommitOid] : []), '-m', `Session ${sessionId} - checkpoint turn ${turnNumber}`];
			const commitOid = await this.gitService.exec(repositoryUri, commitTreeArgs);

			// Point a new ref at the commit
			const checkpointRef = getCheckpointRef(sessionId, turnNumber);
			await this.gitService.exec(repositoryUri, ['update-ref', checkpointRef, commitOid]);

			this.logService.trace(`[ChatSessionWorktreeCheckpointService][_createCheckpoint] Captured checkpoint turn ${turnNumber} for session ${sessionId} at ${checkpointRef}`);
			return checkpointRef;
		} catch (error) {
			this.logService.error(`[ChatSessionWorktreeCheckpointService][_createCheckpoint] Failed to capture checkpoint turn ${turnNumber} for session ${sessionId}: `, error);
			return undefined;
		} finally {
			try {
				await fs.rm(path.dirname(checkpointIndexFile), { recursive: true, force: true });
			} catch (error) {
				this.logService.error(`[ChatSessionWorktreeCheckpointService][_createCheckpoint] Error while cleaning up temp index file for session ${sessionId}: ${error}`);
			}
		}
	}
}
