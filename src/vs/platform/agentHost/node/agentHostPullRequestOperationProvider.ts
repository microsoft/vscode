/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationRegistry } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { ChangesetOperationScope, ChangesetOperationStatus, hasSessionPullRequestForBranch, readSessionGitHubState, SessionLifecycle, withMostRecentRelatedSessionPullRequest, type ChangesetOperation } from '../common/state/sessionState.js';
import { AgentHostPullRequestOperationHandler, type PullRequestCreatedEvent } from './agentHostPullRequestOperationHandler.js';
import { AgentHostPullRequestLifecycleOperationHandler } from './agentHostPullRequestLifecycleOperationHandler.js';
import { IAgentHostPullRequestStatusService } from './agentHostPullRequestStatusService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema, readAgentMergeSessionState } from '../common/agentMerge.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { ActionType } from '../common/state/sessionActions.js';

export class AgentHostPullRequestOperationContribution extends Disposable implements IChangesetOperationContribution {

	private _registry: IChangesetOperationRegistry | undefined;

	/** Last advertised operation ids per session, so only changes are logged. */
	private readonly _lastAdvertisedOperations = new Map<string, string>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@IAgentHostPullRequestStatusService private readonly _pullRequestStatusService: IAgentHostPullRequestStatusService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._stateManager.onDidRemoveSession(sessionKey => this._lastAdvertisedOperations.delete(sessionKey)));
	}

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		this._registry = registry;
		const store = new DisposableStore();
		const getSessionState = (sessionKey: string) => this._stateManager.getSessionState(sessionKey);
		const resolveBaseBranchName = (sessionKey: string) => this._gitStateService.resolveSessionBaseBranchName(sessionKey);
		const onCreated = (event: PullRequestCreatedEvent) => this._onPullRequestCreated(event);
		const createPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, undefined, false, getSessionState, resolveBaseBranchName, onCreated);
		const createDraftPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, true, undefined, false, getSessionState, resolveBaseBranchName, onCreated);
		const createAutoMergePrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, 'MERGE', false, getSessionState, resolveBaseBranchName, onCreated);
		const createAutoSquashPrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, 'SQUASH', false, getSessionState, resolveBaseBranchName, onCreated);
		const createAutoRebasePrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, 'REBASE', false, getSessionState, resolveBaseBranchName, onCreated);
		const createAgentMergePrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, false, undefined, true, getSessionState, resolveBaseBranchName, onCreated);
		const createDraftAgentMergePrHandler = this._instantiationService.createInstance(AgentHostPullRequestOperationHandler, true, undefined, true, getSessionState, resolveBaseBranchName, onCreated);
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR, createPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR, createDraftPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_MERGE, createAutoMergePrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_SQUASH, createAutoSquashPrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_REBASE, createAutoRebasePrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AGENT_MERGE, createAgentMergePrHandler));
		store.add(registry.registerChangesetOperationHandler(AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR_AGENT_MERGE, createDraftAgentMergePrHandler));

		for (const [operationId, action] of [
			[AgentHostPullRequestLifecycleOperationHandler.OPERATION_MARK_READY, 'mark-ready'],
			[AgentHostPullRequestLifecycleOperationHandler.OPERATION_MARK_READY_WITH_AGENT_MERGE, 'mark-ready'],
			[AgentHostPullRequestLifecycleOperationHandler.OPERATION_MERGE, 'merge'],
			[AgentHostPullRequestLifecycleOperationHandler.OPERATION_ENABLE_AUTO_MERGE, 'enable-auto-merge'],
			[AgentHostPullRequestLifecycleOperationHandler.OPERATION_DISABLE_AUTO_MERGE, 'disable-auto-merge'],
		] as const) {
			store.add(registry.registerChangesetOperationHandler(operationId, this._instantiationService.createInstance(AgentHostPullRequestLifecycleOperationHandler, action)));
		}

		store.add(this._pullRequestStatusService.onDidChangePullRequestStatus(sessionKey => registry.onDidChangeOperations(sessionKey)));
		store.add(this._stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionConfigChanged) {
				registry.onDidChangeOperations(envelope.channel);
			}
		}));
		let agentMergeEnabled = this._isAgentMergeEnabled();
		store.add(this._configurationService.onDidRootConfigChange(() => {
			const nextAgentMergeEnabled = this._isAgentMergeEnabled();
			if (agentMergeEnabled === nextAgentMergeEnabled) {
				return;
			}
			agentMergeEnabled = nextAgentMergeEnabled;
			for (const sessionKey of this._stateManager.getSessionUris()) {
				registry.onDidChangeOperations(sessionKey);
			}
		}));
		store.add({ dispose: () => { this._registry = undefined; } });
		return store;
	}

	getOperations(context: IChangesetOperationContext): ChangesetOperation[] | undefined {
		const operations = this._computeOperations(context);
		this._logAdvertisedOperations(context.sessionKey, operations);
		return operations;
	}

	private _computeOperations({ sessionKey, gitState, gitHubState }: IChangesetOperationContext): ChangesetOperation[] | undefined {
		// New Session
		const state = this._stateManager.getSessionState(sessionKey);
		if (state?.lifecycle === SessionLifecycle.Creating) {
			return undefined;
		}

		// Folder session that has outgoing changes
		const isFolderSession = state?.config?.values[SessionConfigKey.Isolation] === 'folder';
		if (isFolderSession && gitState?.outgoingChanges && gitState.outgoingChanges > 0) {
			return undefined;
		}

		// Pull request already exists for the currently checked out branch
		if (hasSessionPullRequestForBranch(gitHubState, gitState?.branchName)) {
			return this._getPullRequestLifecycleOperations(sessionKey);
		}

		const hasBranchChanges = gitState?.hasBaseBranchChanges ?? (gitState?.outgoingChanges ?? 0) > 0;
		const uncommittedChanges = gitState?.uncommittedChanges ?? 0;
		const hasChanges = hasBranchChanges || uncommittedChanges > 0;
		if (!gitState?.hasGitHubRemote || !hasChanges) {
			return undefined;
		}

		const agentMergeEnabled = this._isAgentMergeEnabled();
		return [{
			id: 'create-pr',
			label: localize('agentHost.changeset.createPR', "Create PR"),
			icon: 'git-pull-request-create',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-pr-auto-merge',
			label: localize('agentHost.changeset.createPRAutoMerge', "Create PR (Auto-Merge)"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-pr-auto-squash',
			label: localize('agentHost.changeset.createPRAutoSquash', "Create PR (Auto-Squash)"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		{
			id: 'create-pr-auto-rebase',
			label: localize('agentHost.changeset.createPRAutoRebase', "Create PR (Auto-Rebase)"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		...(agentMergeEnabled ? [{
			id: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AGENT_MERGE,
			label: localize('agentHost.changeset.createPRAgentMerge', "Create PR & Agent Merge"),
			icon: 'git-merge',
			group: 'pull-request',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		}] : []),
		{
			id: 'create-draft-pr',
			label: localize('agentHost.changeset.createDraftPR', "Create Draft PR"),
			icon: 'git-pull-request-draft',
			group: 'pull-request_draft',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		},
		...(agentMergeEnabled ? [{
			id: AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR_AGENT_MERGE,
			label: localize('agentHost.changeset.createDraftPRAgentMerge', "Create Draft PR & Agent Merge"),
			icon: 'git-merge',
			group: 'pull-request_draft',
			scopes: [ChangesetOperationScope.Changeset],
			status: ChangesetOperationStatus.Idle,
		}] : []),
		] satisfies ChangesetOperation[];
	}

	private _isAgentMergeEnabled(): boolean {
		return this._configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.Enabled) === true;
	}

	/**
	 * Operations for a branch that already has a pull request.
	 *
	 * The order matters: the client renders the first operation as the primary
	 * button and the rest as dropdown entries, so the state's headline action
	 * comes first. Auto-merge is driven purely off GitHub's own capability
	 * flags — `viewerCanEnableAutoMerge` is already false for a pull request
	 * that can simply be merged — which keeps the three states falling out
	 * without duplicating GitHub's rules here.
	 *
	 * Returns `undefined` while the pull request state has not resolved yet, so
	 * the button bar stays hidden rather than flashing the wrong action, and
	 * once the pull request is merged or closed, when nothing is left to do.
	 */
	private _getPullRequestLifecycleOperations(sessionKey: string): ChangesetOperation[] | undefined {
		const status = this._pullRequestStatusService.getPullRequestStatus(sessionKey);
		if (!status) {
			this._logService.trace(`[AgentHostPullRequestOperationContribution] No pull request operations: session=${sessionKey}, reason=pull request state has not resolved yet`);
			return undefined;
		}
		if (status.state !== 'open') {
			this._logService.trace(`[AgentHostPullRequestOperationContribution] No pull request operations: session=${sessionKey}, reason=pull request is ${status.state}`);
			return undefined;
		}

		const operations: ChangesetOperation[] = [];
		if (status.draft) {
			const agentMergeRunning = this._isAgentMergeRunning(sessionKey);
			const operationId = agentMergeRunning && status.agentMergeReadyForReview !== true
				? AgentHostPullRequestLifecycleOperationHandler.OPERATION_MARK_READY_WITH_AGENT_MERGE
				: AgentHostPullRequestLifecycleOperationHandler.OPERATION_MARK_READY;
			operations.push({
				id: operationId,
				label: localize('agentHost.changeset.markReady', "Mark Ready"),
				description: localize('agentHost.changeset.markReady.description', "Take the pull request out of draft so it can be reviewed and merged."),
				icon: 'git-pull-request',
				group: 'pull-request',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			});
		}
		if (status.mergeReady) {
			operations.push({
				id: AgentHostPullRequestLifecycleOperationHandler.OPERATION_MERGE,
				label: localize('agentHost.changeset.mergePR', "Merge"),
				description: localize('agentHost.changeset.mergePR.description', "Merge the pull request using the configured merge method."),
				icon: 'git-merge',
				group: 'pull-request',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			});
		}
		if (status.autoMergeEnabled) {
			operations.push({
				id: AgentHostPullRequestLifecycleOperationHandler.OPERATION_DISABLE_AUTO_MERGE,
				label: localize('agentHost.changeset.disableAutoMerge', "Disable Auto Merge"),
				description: localize('agentHost.changeset.disableAutoMerge.description', "Stop GitHub from merging the pull request automatically once it is ready."),
				icon: 'git-merge',
				group: 'pull-request',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			});
		} else if (status.viewerCanEnableAutoMerge) {
			operations.push({
				id: AgentHostPullRequestLifecycleOperationHandler.OPERATION_ENABLE_AUTO_MERGE,
				label: localize('agentHost.changeset.enableAutoMerge', "Enable Auto Merge"),
				description: localize('agentHost.changeset.enableAutoMerge.description', "Let GitHub merge the pull request automatically once all requirements pass."),
				icon: 'git-merge',
				group: 'pull-request',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			});
		}

		if (operations.length === 0) {
			this._logService.trace(`[AgentHostPullRequestOperationContribution] No pull request operations: session=${sessionKey}, reason=the pull request is open but is not draft, not mergeable, and auto-merge is unavailable`);
			return undefined;
		}
		return operations;
	}

	private _isAgentMergeRunning(sessionKey: string): boolean {
		return this._isAgentMergeEnabled()
			&& readAgentMergeSessionState(this._stateManager.getSessionState(sessionKey)?.config?.values)?.enabled === true;
	}

	/**
	 * Logs the advertised operations whenever the set changes for a session.
	 * `getOperations` is recomputed on every git/GitHub state change and once
	 * per changeset, so only transitions are logged — the steady state would
	 * otherwise drown out everything else.
	 */
	private _logAdvertisedOperations(sessionKey: string, operations: readonly ChangesetOperation[] | undefined): void {
		const advertised = operations?.map(operation => operation.id).join(', ') ?? 'none';
		if (this._lastAdvertisedOperations.get(sessionKey) === advertised) {
			return;
		}
		this._lastAdvertisedOperations.set(sessionKey, advertised);
		// The first id is what the client renders as the primary button, so it
		// is called out separately from the rest of the dropdown.
		const primary = operations?.[0]?.id ?? 'none';
		this._logService.info(`[AgentHostPullRequestOperationContribution] Advertised operations changed: session=${sessionKey}, primary=${primary}, operations=[${advertised}]`);
	}

	private _onPullRequestCreated(event: PullRequestCreatedEvent): void {
		const sessionKey = event.sessionKey;

		this._registry?.onDidChangeOperations(sessionKey);
		this._registry?.refreshSessionGitState(sessionKey);

		const gitHubState = readSessionGitHubState(this._stateManager.getSessionState(sessionKey)?._meta);
		this._gitStateService.setSessionGitHubState(sessionKey, withMostRecentRelatedSessionPullRequest(gitHubState, event.pullRequestUrl, event.branchName));
	}
}
