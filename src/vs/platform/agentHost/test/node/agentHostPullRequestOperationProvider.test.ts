/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestSessionStateStore } from './chatMetadataTestHelpers.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import assert from 'assert';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { AgentHostPullRequestOperationContribution } from '../../node/agentHostPullRequestOperationProvider.js';
import { AgentHostPullRequestLifecycleOperationHandler } from '../../node/agentHostPullRequestLifecycleOperationHandler.js';
import type { IAgentHostPullRequestStatus, IAgentHostPullRequestStatusService } from '../../node/agentHostPullRequestStatusService.js';
import { buildChatUri, buildDefaultChatUri, SessionStatus, type ISessionGitHubState, type ISessionGitState } from '../../common/state/sessionState.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { buildFolderChangesetOwnerUri, ChangesetKind } from '../../common/changesetUri.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { mock } from '../../../../base/test/common/mock.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentMergeConfigKey } from '../../common/agentMerge.js';
import { PREPARE_PULL_REQUEST_OPERATION_ID } from '../../common/meta/agentPullRequestOperationMeta.js';
import { AgentHostPullRequestOperationHandler } from '../../node/agentHostPullRequestOperationHandler.js';
import type { IChangesetOperationHandler } from '../../common/agentHostChangesetOperationService.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../../common/state/protocol/channels-changeset/commands.js';
import { createNullSessionDataService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { parseSessionArtifacts, readSessionArtifacts, SessionArtifactType, stringifySessionArtifacts, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { SESSION_ARTIFACTS_KEY } from '../../node/shared/persistSessionMetadata.js';
import { AgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { CapturingTelemetryService } from '../common/capturingTelemetryService.js';

const nullGitStateService = new class implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;
	readonly onDidRefreshSessionGitState = Event.None;
	readonly onDidChangeSessionGitHubState = Event.None;
	async refreshSessionGitState(): Promise<void> { }
	getMaterializedWorktreeMeta(): undefined { return undefined; }
	async setFolderGitState(): Promise<void> { }
	async resolveSessionBaseBranchName(): Promise<string | undefined> { return undefined; }
	async getSessionGitHubState(): Promise<ISessionGitHubState | undefined> { return undefined; }
	async setSessionGitHubState(): Promise<void> { }
	async recordSessionMerge(): Promise<void> { }
	async attachSessionGitHubPullRequest(): Promise<void> { }
};

function createStatusService(status?: IAgentHostPullRequestStatus, onDidChangePullRequestStatus = Event.None): IAgentHostPullRequestStatusService {
	return {
		_serviceBrand: undefined,
		onDidChangePullRequestStatus,
		getPullRequestStatus: () => status,
		markPullRequestMerged: () => { },
		refresh: async () => { },
		resolveForLifecycle: async () => status,
		dispose: () => { },
	};
}

function openPullRequest(overrides?: Partial<IAgentHostPullRequestStatus>): IAgentHostPullRequestStatus {
	return {
		pullRequestId: 'PR_1',
		number: 1,
		url: 'https://github.com/microsoft/vscode/pull/1',
		headSha: 'sha1',
		state: 'open',
		draft: false,
		mergeReady: false,
		viewerCanEnableAutoMerge: false,
		autoMergeEnabled: false,
		allowedMergeMethods: ['SQUASH'],
		...overrides,
	};
}

const githubBranchWithUncommittedChanges: ISessionGitState = {
	hasGitHubRemote: true,
	branchName: 'feature/test',
	uncommittedChanges: 1,
	outgoingChanges: 0,
};

const pullRequestForBranch: ISessionGitHubState = {
	pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
	pullRequestBranchName: 'feature/test',
};

suite('AgentHostPullRequestOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createContribution(status?: IAgentHostPullRequestStatus, isolation?: 'folder' | 'worktree', onDidChangePullRequestStatus = Event.None, agentMergeEnabled = false, sessionAgentMergeEnabled = false, instantiationService?: InstantiationService): AgentHostPullRequestOperationContribution {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		if (isolation || sessionAgentMergeEnabled) {
			const session = {
				resource: 'agent:/session',
				defaultChat: buildDefaultChatUri('agent:/session'),
				provider: 'copilot',
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: new Date(1).toISOString(),
				modifiedAt: new Date(1).toISOString(),
				workingDirectories: ['file:///repo'],
			};
			stateManager.restoreSession(session, [], creationTimeChatStorageResource);
			stateManager.setSessionConfig('agent:/session', {
				schema: { type: 'object', properties: {} },
				values: {
					...(isolation ? { [SessionConfigKey.Isolation]: isolation } : {}),
					...(sessionAgentMergeEnabled ? { [SessionConfigKey.AgentMerge]: { enabled: true } } : {}),
				},
			});
		}
		const configurationService = new class extends mock<IAgentConfigurationService>() {
			override readonly onDidRootConfigChange = Event.None;
			override getRootValue(_schema: never, key: string) {
				return (key === AgentMergeConfigKey.Enabled ? agentMergeEnabled : undefined) as never;
			}
		}();
		return disposables.add(new AgentHostPullRequestOperationContribution(
			stateManager,
			instantiationService ?? disposables.add(new InstantiationService()),
			nullGitStateService,
			createStatusService(status, onDidChangePullRequestStatus),
			configurationService,
			createTestSessionStateStore(disposables.add(new AgentHostDatabase(':memory:')), createNullSessionDataService()),
			new NullLogService(),
			new AgentHostTelemetryReporter(NullTelemetryService),
		));
	}

	test('records a pull request created through the session action as an artifact whose origin is the creating chat unless it has one', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: 'agent:/session',
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: ['file:///repo'],
			defaultChat: buildDefaultChatUri('agent:/session'),
		});
		const chat = buildDefaultChatUri('agent:/session');
		const database = new TestSessionDatabase();
		const existing = (number: number, isArtifact: boolean, origin?: ISessionArtifact['origin']): ISessionArtifact => ({
			id: `existing-${number}`, type: SessionArtifactType.PullRequest, label: `PR ${number}`, isArtifact,
			link: `https://github.com/microsoft/vscode/pull/${number}`, isGitHub: true, ...(origin ? { origin } : {}),
		});
		const agentOrigin = { chat, turnId: 'agent-turn' };
		const before = [existing(123, false), existing(125, true), existing(126, true, agentOrigin)];
		stateManager.setSessionMeta('agent:/session', withSessionArtifacts(undefined, before));
		await database.setMetadata(SESSION_ARTIFACTS_KEY, stringifySessionArtifacts(before));
		const telemetry = new CapturingTelemetryService();
		const contribution = disposables.add(new AgentHostPullRequestOperationContribution(
			stateManager,
			disposables.add(new InstantiationService()),
			nullGitStateService,
			createStatusService(),
			new class extends mock<IAgentConfigurationService>() { }(),
			createTestSessionStateStore(disposables.add(new AgentHostDatabase(':memory:')), createSessionDataService(database)),
			new NullLogService(),
			new AgentHostTelemetryReporter(telemetry),
		));

		const record = (number: number, title?: string) => contribution.recordCreatedPullRequest({
			sessionKey: 'agent:/session',
			ownerUri: 'agent:/session',
			pullRequestUrl: `https://github.com/microsoft/vscode/pull/${number}`,
			pullRequestNumber: number,
			...(title ? { pullRequestTitle: title } : {}),
			branchName: 'feature/test',
		});
		const ids = [await record(123, 'Improve archive nudges'), await record(124), await record(123, 'Improve archive nudges'), await record(125), await record(126)];

		const liveArtifacts = readSessionArtifacts(stateManager.getSessionState('agent:/session')?._meta);
		const persistedArtifacts = parseSessionArtifacts(await database.getMetadata(SESSION_ARTIFACTS_KEY)).artifacts;
		const recorded = { provider: 'copilot', agentSessionId: 'session', turnId: undefined, toolCallId: undefined, source: 'createPullRequestAction', kind: SessionArtifactType.PullRequest, category: 'artifact', isGitHub: true, batchSize: 1 };
		const entry = (number: number, label: string, origin: ISessionArtifact['origin']) => ({
			chat, type: SessionArtifactType.PullRequest, label, isArtifact: true, link: `https://github.com/microsoft/vscode/pull/${number}`, isGitHub: true, origin,
		});
		// A promoted reference and a repeat recording without an origin get the creating chat; an existing origin is kept.
		const expected = [entry(123, 'Improve archive nudges', { chat }), entry(125, 'PR 125', { chat }), entry(126, 'PR 126', agentOrigin), entry(124, '', { chat })];
		assert.deepStrictEqual({
			ids: ids.map(id => id === ids[1] ? 'new' : id),
			live: liveArtifacts.map(({ id: _id, ...artifact }) => artifact),
			persisted: persistedArtifacts.map(({ id: _id, ...artifact }) => artifact),
			recorded: telemetry.events.filter(event => event.eventName === 'agentHost.artifactRecorded').map(event => event.data),
		}, {
			ids: ['existing-123', 'new', 'existing-123', 'existing-125', 'existing-126'],
			live: expected,
			persisted: expected,
			recorded: [
				{ ...recorded, outcome: 'promoted' },
				{ ...recorded, outcome: 'added' },
				{ ...recorded, outcome: 'alreadyRecorded' },
				{ ...recorded, outcome: 'alreadyRecorded' },
				{ ...recorded, outcome: 'alreadyRecorded' },
			],
		});
	});

	test('records a pull request created from another folder in that folder and offers that pull request\'s lifecycle operations there', async () => {
		const sessionKey = 'agent:/session';
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.restoreSession({
			resource: sessionKey,
			defaultChat: buildDefaultChatUri(sessionKey),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: ['file:///repo'],
		}, [], creationTimeChatStorageResource);
		const peerChat = buildChatUri(sessionKey, 'peer');
		stateManager.addChat(sessionKey, peerChat, creationTimeChatStorageResource(sessionKey, peerChat, buildDefaultChatUri(sessionKey)), { workingDirectories: ['file:///other'] });
		const peerScopeOwner = buildFolderChangesetOwnerUri(sessionKey, getWorkingDirectoryScopeId(['file:///other']));
		const defaultScopeOwner = buildFolderChangesetOwnerUri(sessionKey, getWorkingDirectoryScopeId(['file:///repo']));
		const recordedGitHubStates: [string, ISessionGitHubState][] = [];
		const gitStateService: IAgentHostGitStateService = {
			_serviceBrand: undefined,
			onDidRefreshSessionGitState: Event.None,
			onDidChangeSessionGitHubState: Event.None,
			refreshSessionGitState: async () => { },
			getMaterializedWorktreeMeta: () => undefined,
			setFolderGitState: async () => { },
			resolveSessionBaseBranchName: async () => undefined,
			setSessionGitHubState: async (key, state) => { recordedGitHubStates.push([key, state]); },
			recordSessionMerge: async () => { },
			attachSessionGitHubPullRequest: async () => { },
		};
		const contribution = disposables.add(new AgentHostPullRequestOperationContribution(
			stateManager,
			disposables.add(new InstantiationService()),
			gitStateService,
			// Only the other folder's pull request is mergeable.
			{ ...createStatusService(), getPullRequestStatus: key => key === peerScopeOwner ? openPullRequest({ mergeReady: true }) : openPullRequest({ draft: true }) },
			new class extends mock<IAgentConfigurationService>() {
				override readonly onDidRootConfigChange = Event.None;
				override getRootValue() { return undefined as never; }
			}(),
			createTestSessionStateStore(disposables.add(new AgentHostDatabase(':memory:')), createSessionDataService(new TestSessionDatabase())),
			new NullLogService(),
			new AgentHostTelemetryReporter(NullTelemetryService),
		));

		await contribution.recordCreatedPullRequest({
			sessionKey,
			ownerUri: peerScopeOwner,
			pullRequestUrl: 'https://github.com/contoso/tools/pull/7',
			pullRequestNumber: 7,
			pullRequestTitle: 'Tools change',
			branchName: 'feature/tools',
		});
		const operationsFor = (ownerKey: string) => contribution.getOperations({ sessionKey, ownerKey, gitState: githubBranchWithUncommittedChanges, gitHubState: pullRequestForBranch, changesetKind: ChangesetKind.Branch, changesetUri: '' })?.map(operation => operation.id);

		assert.deepStrictEqual({
			artifacts: readSessionArtifacts(stateManager.getSessionState(sessionKey)?._meta).map(({ id: _id, ...artifact }) => artifact),
			recordedGitHubStates,
			defaultScopeOperations: operationsFor(defaultScopeOwner),
			peerScopeOperations: operationsFor(peerScopeOwner),
		}, {
			artifacts: [{ chat: peerChat, type: SessionArtifactType.PullRequest, label: 'Tools change', isArtifact: true, link: 'https://github.com/contoso/tools/pull/7', isGitHub: true, origin: { chat: peerChat } }],
			recordedGitHubStates: [[peerScopeOwner, { pullRequestUrls: ['https://github.com/contoso/tools/pull/7'], associatedPullRequestUrls: ['https://github.com/contoso/tools/pull/7'], pullRequestBranchName: 'feature/tools' }]],
			defaultScopeOperations: ['pr-mark-ready'],
			peerScopeOperations: ['pr-merge'],
		});
	});

	test('records a created PR under the initiating chat when chats share a folder', async () => {
		const sessionKey = 'agent:/session';
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.restoreSession({
			resource: sessionKey,
			defaultChat: buildDefaultChatUri(sessionKey),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: ['file:///repo'],
		}, [], creationTimeChatStorageResource);
		const peerChat = buildChatUri(sessionKey, 'peer');
		stateManager.addChat(sessionKey, peerChat, creationTimeChatStorageResource(sessionKey, peerChat, buildDefaultChatUri(sessionKey)), { workingDirectories: ['file:///repo'] });
		const sharedFolderOwner = buildFolderChangesetOwnerUri(sessionKey, getWorkingDirectoryScopeId(['file:///repo']));
		const contribution = disposables.add(new AgentHostPullRequestOperationContribution(
			stateManager,
			disposables.add(new InstantiationService()),
			nullGitStateService,
			createStatusService(),
			new class extends mock<IAgentConfigurationService>() {
				override readonly onDidRootConfigChange = Event.None;
				override getRootValue() { return undefined as never; }
			}(),
			createTestSessionStateStore(disposables.add(new AgentHostDatabase(':memory:')), createSessionDataService(new TestSessionDatabase())),
			new NullLogService(),
			new AgentHostTelemetryReporter(NullTelemetryService),
		));

		await contribution.recordCreatedPullRequest({
			sessionKey,
			ownerUri: sharedFolderOwner,
			conversationChat: peerChat,
			pullRequestUrl: 'https://github.com/microsoft/vscode/pull/8',
			pullRequestNumber: 8,
			pullRequestTitle: 'Peer chat PR',
			branchName: 'feature/peer',
		});

		assert.deepStrictEqual(readSessionArtifacts(stateManager.getSessionState(sessionKey)?._meta).map(({ id: _id, ...artifact }) => artifact), [
			{
				chat: peerChat,
				type: SessionArtifactType.PullRequest,
				label: 'Peer chat PR',
				isArtifact: true,
				link: 'https://github.com/microsoft/vscode/pull/8',
				isGitHub: true,
				origin: { chat: peerChat },
			},
		]);
	});

	test('advertises PR operations for GitHub branches with uncommitted changes', () => {
		const provider = createContribution();

		const operations = provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, changesetKind: ChangesetKind.Session, changesetUri: '' });

		assert.deepStrictEqual(operations?.map(op => op.id), ['create-pr', PREPARE_PULL_REQUEST_OPERATION_ID]);
	});

	test('advertises only creation and preparation even when Agent Merge is enabled', () => {
		const provider = createContribution(undefined, undefined, Event.None, true);

		const operations = provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, changesetKind: ChangesetKind.Session, changesetUri: '' });

		assert.deepStrictEqual(operations?.map(({ id, label }) => ({ id, label })), [
			{ id: 'create-pr', label: 'Create PR' },
			{ id: PREPARE_PULL_REQUEST_OPERATION_ID, label: 'Prepare PR' },
		]);
	});

	test('registers preparation separately from creation and preserves legacy handlers', async () => {
		const calls: { params: InvokeChangesetOperationParams; token: CancellationToken }[] = [];
		const handler = new class extends mock<AgentHostPullRequestOperationHandler>() {
			override async prepare(params: InvokeChangesetOperationParams, token: CancellationToken): Promise<InvokeChangesetOperationResult> {
				calls.push({ params, token });
				return {};
			}
			override async invoke(): Promise<InvokeChangesetOperationResult> {
				throw new Error('Preparation must not invoke creation');
			}
		}();
		const instantiationService = disposables.add(new InstantiationService());
		sinon.stub(instantiationService, 'createInstance').returns(handler);
		const provider = createContribution(undefined, undefined, Event.None, false, false, instantiationService);
		const handlers = new Map<string, IChangesetOperationHandler>();
		disposables.add(provider.registerHandlers({
			registerChangesetOperationHandler: (id, operationHandler) => {
				handlers.set(id, operationHandler);
				return toDisposable(() => handlers.delete(id));
			},
			onDidChangeOperations: () => { },
			refreshSessionGitState: async () => { },
		}));
		const params = { channel: 'agent:/session/changeset/default', operationId: PREPARE_PULL_REQUEST_OPERATION_ID };

		const result = await handlers.get(PREPARE_PULL_REQUEST_OPERATION_ID)!.invoke(params, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			calls,
			operationIds: [...handlers.keys()],
		}, {
			result: {},
			calls: [{ params, token: CancellationToken.None }],
			operationIds: [
				'create-pr', PREPARE_PULL_REQUEST_OPERATION_ID, 'create-draft-pr',
				'create-pr-auto-merge', 'create-pr-auto-squash', 'create-pr-auto-rebase',
				'create-pr-agent-merge', 'create-draft-pr-agent-merge',
				'pr-mark-ready', 'pr-mark-ready-with-agent-merge', 'pr-merge',
				'pr-enable-auto-merge', 'pr-disable-auto-merge',
			],
		});
	});

	test('advertises PR operations for folder sessions only while outgoing changes cannot be synced', () => {
		const provider = createContribution(undefined, 'folder');
		const operationIdsFor = (upstreamBranchName: string | undefined) => provider.getOperations({
			sessionKey: 'agent:/session',
			gitState: { ...githubBranchWithUncommittedChanges, uncommittedChanges: 0, outgoingChanges: 2, upstreamBranchName },
			changesetKind: ChangesetKind.Branch,
			changesetUri: '',
		})?.map(op => op.id);

		assert.deepStrictEqual({
			withUpstream: operationIdsFor('origin/feature/test'),
			withoutUpstream: operationIdsFor(undefined),
		}, {
			withUpstream: undefined,
			withoutUpstream: ['create-pr', PREPARE_PULL_REQUEST_OPERATION_ID],
		});
	});

	test('does not advertise PR operations without GitHub branch changes', () => {
		const provider = createContribution();

		const actual = [
			provider.getOperations({ sessionKey: 'agent:/session', gitState: { ...githubBranchWithUncommittedChanges, hasGitHubRemote: false }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
			provider.getOperations({ sessionKey: 'agent:/session', gitState: { ...githubBranchWithUncommittedChanges, uncommittedChanges: 0, outgoingChanges: 0 }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
			provider.getOperations({ sessionKey: 'agent:/session', gitState: { ...githubBranchWithUncommittedChanges, uncommittedChanges: 0, outgoingChanges: 2, hasBaseBranchChanges: false }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
		];

		assert.deepStrictEqual(actual, [undefined, undefined, undefined]);
	});

	test('advertises PR operations again for a branch whose pull request is unknown', () => {
		const provider = createContribution();

		const actual = [
			provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, gitHubState: pullRequestForBranch, changesetKind: ChangesetKind.Session, changesetUri: '' }),
			provider.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, gitHubState: { ...pullRequestForBranch, pullRequestBranchName: 'feature/other' }, changesetKind: ChangesetKind.Session, changesetUri: '' }),
		];

		assert.deepStrictEqual(actual.map(operations => operations?.map(op => op.id)), [undefined, ['create-pr', PREPARE_PULL_REQUEST_OPERATION_ID]]);
	});

	test('advertises lifecycle operations for a pull request on the current branch', () => {
		const operationsFor = (status?: IAgentHostPullRequestStatus, agentMergeEnabled = false) => createContribution(status, undefined, Event.None, agentMergeEnabled, agentMergeEnabled)
			.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, gitHubState: pullRequestForBranch, changesetKind: ChangesetKind.Session, changesetUri: '' })
			?.map(op => op.id);

		assert.deepStrictEqual({
			unresolved: operationsFor(undefined),
			merged: operationsFor(openPullRequest({ state: 'merged' })),
			draft: operationsFor(openPullRequest({ draft: true, viewerCanEnableAutoMerge: true })),
			agentMergeDraftWaiting: operationsFor(openPullRequest({ draft: true, agentMergeReadyForReview: false }), true),
			agentMergeDraftUnknown: operationsFor(openPullRequest({ draft: true }), true),
			agentMergeDraftReady: operationsFor(openPullRequest({ draft: true, agentMergeReadyForReview: true }), true),
			mergeable: operationsFor(openPullRequest({ mergeReady: true })),
			blocked: operationsFor(openPullRequest({ viewerCanEnableAutoMerge: true })),
			autoMerging: operationsFor(openPullRequest({ autoMergeEnabled: true })),
			noAutoMerge: operationsFor(openPullRequest()),
		}, {
			unresolved: undefined,
			merged: undefined,
			draft: ['pr-mark-ready', 'pr-enable-auto-merge'],
			agentMergeDraftWaiting: ['pr-mark-ready-with-agent-merge'],
			agentMergeDraftUnknown: ['pr-mark-ready-with-agent-merge'],
			agentMergeDraftReady: ['pr-mark-ready'],
			mergeable: ['pr-merge'],
			blocked: ['pr-enable-auto-merge'],
			autoMerging: ['pr-disable-auto-merge'],
			noAutoMerge: undefined,
		});
	});

	test('uses the same label for the Agent Merge Mark Ready operation', () => {
		const operations = createContribution(openPullRequest({ draft: true, agentMergeReadyForReview: false }), undefined, Event.None, true, true)
			.getOperations({ sessionKey: 'agent:/session', gitState: githubBranchWithUncommittedChanges, gitHubState: pullRequestForBranch, changesetKind: ChangesetKind.Session, changesetUri: '' });

		assert.deepStrictEqual(operations?.map(({ id, label }) => ({ id, label })), [{
			id: AgentHostPullRequestLifecycleOperationHandler.OPERATION_MARK_READY_WITH_AGENT_MERGE,
			label: 'Mark Ready',
		}]);
	});

});
