/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import type { IChangesetOperationContext, IChangesetOperationContribution, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitService, IRefQuery, META_DIFF_BASE_BRANCH, resolveDefaultBaseBranchRef } from '../common/agentHostGitService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentHostSessionStateStore, SessionStateMirrorFlush } from '../common/agentHostSessionStateStore.js';
import { isMultiRootSession } from '../common/agentHostWorkingDirectories.js';
import { ChangesetKind, parseChangesetUri } from '../common/changesetUri.js';
import { createBaseBranchCandidatesResult, LIST_BASE_BRANCHES_OPERATION_ID, readSetBaseBranchMeta, SET_BASE_BRANCH_OPERATION_ID } from '../common/meta/agentBaseBranchOperationMeta.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../common/state/protocol/channels-changeset/commands.js';
import { JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';
import { ChangesetOperationScope, ChangesetOperationStatus, type ChangesetOperation } from '../common/state/sessionState.js';
import { resolveBranchChangesetScopeForSource, resolveChangesetOwnerScope, resolveGitHubStateFolder, type IBranchChangesetScope } from './agentHostBranchChangesetScope.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

const branchQuery: IRefQuery = { pattern: ['refs/heads', 'refs/remotes'], sort: 'committerdate' };

export class AgentHostBaseBranchOperationContribution extends Disposable implements IChangesetOperationContribution {

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		const store = new DisposableStore();
		store.add(registry.registerChangesetOperationHandler(LIST_BASE_BRANCHES_OPERATION_ID, { changesGitState: false, invoke: params => this._listBaseBranches(params) }));
		// The Git state of the changeset's owner names the base, so the operation service refreshes it after a base is recorded.
		store.add(registry.registerChangesetOperationHandler(SET_BASE_BRANCH_OPERATION_ID, { changesGitState: true, invoke: params => this._setBaseBranch(params) }));
		return store;
	}

	getOperations({ sessionKey, ownerKey, changesetUri, changesetKind }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		if (changesetKind !== ChangesetKind.Branch) {
			return undefined;
		}
		const scope = resolveChangesetOwnerScope(this._stateManager, ownerKey ?? parseChangesetUri(changesetUri)?.ownerUri ?? sessionKey);
		// The diff of a multi-root scope compares every repository against one base, but only the first folder's branches are listed and validated.
		// Like `AgentHostChangesetService._getBranchBaseBranch`, it also ignores the recorded base of a default chat outside the session folder.
		if (scope.workingDirectories.length === 0
			|| isMultiRootSession(scope.workingDirectories)
			|| (this._chatOwnership.isRegisteredDefaultChat(scope.sourceUri) && !resolveGitHubStateFolder(this._stateManager, scope.sourceUri).isSessionFolder)) {
			return undefined;
		}

		return [{
			id: LIST_BASE_BRANCHES_OPERATION_ID,
			label: localize('agentHost.changeset.listBaseBranches', "List Base Branches"),
			description: localize('agentHost.changeset.listBaseBranches.description', "List the branches that Branch Changes can compare against."),
			group: 'base-branch',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		}, {
			id: SET_BASE_BRANCH_OPERATION_ID,
			label: localize('agentHost.changeset.setBaseBranch', "Change Base Branch"),
			description: localize('agentHost.changeset.setBaseBranch.description', "Compare Branch Changes against another branch."),
			group: 'base-branch',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		}] satisfies ChangesetOperation[];
	}

	private async _listBaseBranches(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		const { repositoryRoot } = await this._resolveRepository(params);
		const [branches, defaultRef] = await Promise.all([
			this._gitService.getBranches(repositoryRoot, branchQuery),
			resolveDefaultBaseBranchRef(this._gitService, repositoryRoot, undefined),
		]);
		const refs = branches.map(branch => branch.ref);
		return createBaseBranchCandidatesResult({ refs, ...(defaultRef !== undefined && refs.includes(defaultRef) ? { defaultRef } : {}) });
	}

	private async _setBaseBranch(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
		const ref = readSetBaseBranchMeta(params);
		if (!ref) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.setBaseBranch.missing', "Select a base branch."));
		}
		const { scope, repositoryRoot } = await this._resolveRepository(params);
		const branches = await this._gitService.getBranches(repositoryRoot, branchQuery);
		if (!branches.some(branch => branch.ref === ref)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, localize('agentHost.changeset.setBaseBranch.invalid', "Branch Changes cannot compare against '{0}'.", ref));
		}

		// The same target a new session records its base in (`AgentService._resolveWorkingDirectoryBeforeSend`).
		const session = URI.parse(scope.sessionUri);
		const target = this._chatOwnership.isDefaultChat(scope.sessionUri, scope.sourceUri) ? session : URI.parse(scope.sourceUri);
		this._logService.info(`[AgentHostBaseBranchOperationContribution] Setting the base branch of ${scope.ownerUri} to ${ref}`);
		await this._sessionStateStore.writeMetadata(session, target, { [META_DIFF_BASE_BRANCH]: ref }, SessionStateMirrorFlush.Immediate);

		// Other chats in the folder can keep a Git state of their own, whose `baseBranchRef` would name the old base.
		for (const chat of this._getOtherChatsInScope(scope)) {
			void this._gitStateService.refreshSessionGitState(chat, undefined, { immediate: true });
		}
		return {};
	}

	private async _resolveRepository(params: InvokeChangesetOperationParams): Promise<{ readonly scope: IBranchChangesetScope; readonly repositoryRoot: URI }> {
		const parsed = parseChangesetUri(params.channel);
		if (parsed?.kind !== ChangesetKind.Branch) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a branch changeset URI: ${params.channel}`);
		}
		const scope = resolveChangesetOwnerScope(this._stateManager, parsed.ownerUri);
		const workingDirectory = scope.workingDirectories[0];
		const repositoryRoot = workingDirectory !== undefined ? await this._gitService.getRepositoryRoot(URI.parse(workingDirectory)) : undefined;
		if (!repositoryRoot) {
			throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Changeset owner has no Git repository: ${parsed.ownerUri}`);
		}
		return { scope, repositoryRoot };
	}

	private _getOtherChatsInScope(scope: IBranchChangesetScope): string[] {
		const defaultChat = this._stateManager.getDefaultChat(scope.sessionUri);
		const chats = new Set([
			...(defaultChat !== undefined ? [defaultChat] : []),
			...this._stateManager.getSessionState(scope.sessionUri)?.chats.map(chat => chat.resource) ?? [],
		]);
		chats.delete(scope.sourceUri);
		return [...chats].filter(chat => resolveBranchChangesetScopeForSource(this._stateManager, chat).ownerUri === scope.ownerUri);
	}
}
