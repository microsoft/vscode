/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { AgentHostAutoAttachPullRequestsConfigKey } from '../../common/agentHostSchema.js';
import { META_GIT_DATA_STATE, META_GIT_STATE, META_GITHUB_DATA_STATE, META_SOURCE_CONTROL_STATE } from '../../common/agentHostGitStateService.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { buildFolderChangesetOwnerUri } from '../../common/changesetUri.js';
import { SessionArtifactType, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, getAllSessionRelatedPullRequestUrls, getSessionRelatedPullRequestUrls, readFolderScopeGitState, readSessionGitHubData, readSessionGitHubState, readSessionGitHubStateInput, readSessionGitState, readSessionSourceControlState, SESSION_META_GITHUB_KEY, SessionSourceControlOutcome, withFolderScopeGitState, withInitialSessionPullRequest, withMostRecentRelatedSessionPullRequest, withMigratedSessionGitHubState, withMostRecentSessionPullRequest, withReplacedFolderGitHubState, withSessionGitHubState, withSessionGitState, SESSION_META_GITHUB_DATA_KEY, SessionStatus, type ISessionGitHubState, type ISessionGitState, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import type { IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostGitStateService } from '../../node/agentHostGitStateService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { CreatedPullRequest, IAgentHostOctoKitService } from '../../node/shared/agentHostOctoKitService.js';
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

const SESSION = 'mock:/session-1';
const WORKING_DIRECTORY = 'file:///wd';

type PullRequestArtifact = ISessionArtifact & { readonly link: string };

/** Reads the persisted GitHub state of the session folder. */
async function readPersistedSessionGitHubState(db: TestSessionDatabase): Promise<ISessionGitHubState | undefined> {
	const value = await db.getMetadata(META_GITHUB_DATA_STATE);
	return value ? readSessionGitHubState({ [SESSION_META_GITHUB_DATA_KEY]: JSON.parse(value) }, WORKING_DIRECTORY) : undefined;
}

function pullRequestArtifact(number: number, isArtifact = true): PullRequestArtifact {
	return {
		id: `pr-${number}`,
		type: SessionArtifactType.PullRequest,
		label: `Pull request ${number}`,
		isArtifact,
		link: `https://github.com/microsoft/vscode/pull/${number}`,
		isGitHub: true,
	};
}

suite('AgentHostGitStateService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('migrates legacy singular pull request metadata on read', () => {
		assert.deepStrictEqual(readSessionGitHubStateInput({
			[SESSION_META_GITHUB_KEY]: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1',
			}
		}), {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
		});
	});

	test('preserves stored pull request recency order while deduplicating', () => {
		assert.deepStrictEqual(readSessionGitHubStateInput({
			[SESSION_META_GITHUB_KEY]: {
				pullRequestUrls: [
					'https://github.com/microsoft/vscode/pull/3',
					'https://github.com/microsoft/vscode/pull/1',
					'https://github.com/microsoft/vscode/pull/2',
					'https://github.com/microsoft/vscode/pull/1/',
				],
			}
		}), {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/3',
				'https://github.com/microsoft/vscode/pull/1',
				'https://github.com/microsoft/vscode/pull/2',
			],
		});
	});

	test('keeps ten deduplicated pull requests in most-recent order', () => {
		let state: ISessionGitHubState | undefined;
		for (let number = 1; number <= 11; number++) {
			state = withMostRecentSessionPullRequest(state, `https://github.com/microsoft/vscode/pull/${number}`, `feature-${number}`);
		}
		state = withMostRecentSessionPullRequest(state, 'https://github.com/microsoft/vscode/pull/5/', 'feature-5');

		assert.deepStrictEqual(state, {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/5',
				'https://github.com/microsoft/vscode/pull/11',
				'https://github.com/microsoft/vscode/pull/10',
				'https://github.com/microsoft/vscode/pull/9',
				'https://github.com/microsoft/vscode/pull/8',
				'https://github.com/microsoft/vscode/pull/7',
				'https://github.com/microsoft/vscode/pull/6',
				'https://github.com/microsoft/vscode/pull/4',
				'https://github.com/microsoft/vscode/pull/3',
				'https://github.com/microsoft/vscode/pull/2',
			],
			pullRequestBranchName: 'feature-5',
		});
	});

	test('keeps pull request state scoped to its pull request', () => {
		const pullRequest = 'https://github.com/microsoft/vscode/pull/1';
		const state: ISessionGitHubState = {
			pullRequestUrls: [pullRequest],
			pullRequestState: 'merged',
			pullRequestStateUrl: pullRequest,
		};

		assert.deepStrictEqual({
			same: withMostRecentSessionPullRequest(state, `${pullRequest}/`, 'feature-1'),
			different: withMostRecentSessionPullRequest(state, 'https://github.com/microsoft/vscode/pull/2', 'feature-2'),
		}, {
			same: {
				pullRequestUrls: [pullRequest],
				pullRequestBranchName: 'feature-1',
				pullRequestState: 'merged',
				pullRequestStateUrl: pullRequest,
			},
			different: {
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2', pullRequest],
				pullRequestBranchName: 'feature-2',
			},
		});
	});

	test('promotes an initial pull request into the session', () => {
		const initial = 'https://github.com/microsoft/vscode/pull/1';
		const state = withMostRecentRelatedSessionPullRequest({
			pullRequestUrls: [initial],
			initialPullRequestUrls: [initial],
		}, initial, 'feature');

		assert.deepStrictEqual({
			state,
			related: getSessionRelatedPullRequestUrls(state),
		}, {
			state: {
				pullRequestUrls: [initial],
				associatedPullRequestUrls: [initial],
				pullRequestBranchName: 'feature',
				initialPullRequestUrls: [],
			},
			related: [initial],
		});
	});

	test('keeps checkout recency when combining discovered and associated pull requests', () => {
		const current = 'https://github.com/microsoft/vscode/pull/2';
		const referenced = 'https://github.com/microsoft/vscode/pull/1';

		assert.deepStrictEqual(getSessionRelatedPullRequestUrls({
			pullRequestUrls: [current, referenced],
			initialPullRequestUrls: [referenced],
			associatedPullRequestUrls: [referenced],
		}), [current, referenced]);
	});

	test('keeps the most recently discovered pull requests in the bounded baseline', () => {
		let state: ISessionGitHubState | undefined;
		for (let number = 1; number <= 11; number++) {
			state = { ...state, ...withInitialSessionPullRequest(state, `https://github.com/microsoft/vscode/pull/${number}`) };
		}

		assert.deepStrictEqual(state?.initialPullRequestUrls, [
			'https://github.com/microsoft/vscode/pull/11',
			'https://github.com/microsoft/vscode/pull/10',
			'https://github.com/microsoft/vscode/pull/9',
			'https://github.com/microsoft/vscode/pull/8',
			'https://github.com/microsoft/vscode/pull/7',
			'https://github.com/microsoft/vscode/pull/6',
			'https://github.com/microsoft/vscode/pull/5',
			'https://github.com/microsoft/vscode/pull/4',
			'https://github.com/microsoft/vscode/pull/3',
			'https://github.com/microsoft/vscode/pull/2',
		]);
	});

	function createHarness(options?: { octoKitService?: IAgentHostOctoKitService; authenticationService?: IAgentHostAuthenticationService; enterpriseUri?: string; autoAttachPullRequests?: boolean }) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const db = new TestSessionDatabase();
		const sessionDataService = createSessionDataService(db);
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, new NullLogService()));
		if (options?.autoAttachPullRequests !== undefined) {
			configurationService.updateRootConfig({ [AgentHostAutoAttachPullRequestsConfigKey]: options.autoAttachPullRequests });
		}

		const gitCalls: string[] = [];
		const gitBaseBranches: Array<string | undefined> = [];
		let gitResult: ISessionGitState | undefined;
		let gitResultPromise: Promise<ISessionGitState | undefined> | undefined;
		let gitError: Error | undefined;
		let headSha: string | undefined;
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getSessionGitState: async (workingDirectory: URI, baseBranchName?: string) => {
				gitCalls.push(workingDirectory.toString());
				gitBaseBranches.push(baseBranchName);
				if (gitError) {
					throw gitError;
				}
				return gitResultPromise ?? gitResult;
			},
			revParse: async () => headSha,
		};

		const pullRequestCalls: string[] = [];
		const pullRequestShaCalls: string[] = [];
		const pullRequestCandidateCalls: Array<readonly string[] | undefined> = [];
		const pullRequestsByBranch = new Map<string, CreatedPullRequest>();
		const pullRequestsBySha = new Map<string, CreatedPullRequest>();
		let onPullRequestLookup: ((branch: string) => Promise<void>) | undefined;
		const octoKitService = {
			findPullRequestByHeadBranch: async (_owner: string, _repo: string, branch: string, _token: string, _signal: AbortSignal, _headOwner?: string, allowedPullRequestUrls?: readonly string[]) => {
				pullRequestCalls.push(branch);
				pullRequestCandidateCalls.push(allowedPullRequestUrls ? [...allowedPullRequestUrls] : undefined);
				await onPullRequestLookup?.(branch);
				return pullRequestsByBranch.get(branch);
			},
			findPullRequestByHeadSha: async (_owner: string, _repo: string, sha: string) => {
				pullRequestShaCalls.push(sha);
				return pullRequestsBySha.get(sha);
			},
		} as unknown as IAgentHostOctoKitService;
		const authenticationService: IAgentHostAuthenticationService = {
			_serviceBrand: undefined,
			onDidChangeAuthToken: Event.None,
			getAuthToken: () => 'token',
		};

		const service = disposables.add(new AgentHostGitStateService(
			stateManager,
			gitService,
			options?.octoKitService ?? octoKitService,
			options?.authenticationService ?? authenticationService,
			createTestGitHubEndpointService(options?.enterpriseUri),
			new NullLogService(),
			sessionDataService,
			configurationService,
		));

		const runEvents: string[] = [];
		disposables.add(service.onDidRefreshSessionGitState(key => runEvents.push(key)));
		const gitHubStateEvents: string[] = [];
		disposables.add(service.onDidChangeSessionGitHubState(key => gitHubStateEvents.push(key)));

		return {
			stateManager,
			db,
			service,
			configurationService,
			gitCalls,
			gitBaseBranches,
			runEvents,
			gitHubStateEvents,
			pullRequestCalls,
			pullRequestShaCalls,
			pullRequestCandidateCalls,
			setGitResult: (state: ISessionGitState | undefined) => { gitResult = state; },
			setGitResultPromise: (promise: Promise<ISessionGitState | undefined> | undefined) => { gitResultPromise = promise; },
			setGitError: (error: Error) => { gitError = error; },
			setHeadSha: (sha: string | undefined) => { headSha = sha; },
			setPullRequest: (branch: string, pullRequest: CreatedPullRequest) => { pullRequestsByBranch.set(branch, pullRequest); },
			setPullRequestForSha: (sha: string, pullRequest: CreatedPullRequest) => { pullRequestsBySha.set(sha, pullRequest); },
			setOnPullRequestLookup: (fn: (branch: string) => Promise<void>) => { onPullRequestLookup = fn; },
		};
	}

	function seedSession(stateManager: AgentHostStateManager, options?: { workingDirectory?: string; project?: string; gitState?: ISessionGitState; gitHubState?: ISessionGitHubState; artifacts?: readonly ISessionArtifact[]; isolation?: 'folder' | 'worktree'; baseBranch?: string; createNewBranch?: boolean; createdAt?: number }): void {
		const summary: SessionSummary = {
			resource: SESSION,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date(options?.createdAt ?? 0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: options?.workingDirectory ? [options.workingDirectory] : undefined,
			project: options?.project ? { uri: options.project, displayName: 'Project' } : undefined,
		};
		// `restoreSession` materializes the session in `ready` lifecycle so the
		// persistence path (which skips `creating` sessions) actually runs.
		stateManager.restoreSession(summary, []);
		if (options?.isolation) {
			stateManager.setSessionConfig(SESSION, {
				schema: { type: 'object', properties: {} },
				values: {
					[SessionConfigKey.Isolation]: options.isolation,
					...(options.baseBranch ? { [SessionConfigKey.Branch]: options.baseBranch } : {}),
					...(options.createNewBranch !== undefined ? { [SessionConfigKey.WorktreeCreateNewBranch]: options.createNewBranch } : {}),
				},
			});
		}
		if (options?.gitState) {
			stateManager.setSessionMeta(SESSION, withSessionGitState(undefined, options.gitState));
		}
		if (options?.gitHubState) {
			stateManager.setSessionMeta(SESSION, withSessionGitHubState(stateManager.getSessionState(SESSION)?._meta, options.workingDirectory, options.gitHubState));
		}
		if (options?.artifacts) {
			stateManager.setSessionMeta(SESSION, withSessionArtifacts(stateManager.getSessionState(SESSION)?._meta, options.artifacts));
		}
	}

	test('seeds the materialized worktree branch while preserving known git state', () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState: {
				branchName: 'main',
				isDetachedHead: true,
				baseBranchName: 'main',
				hasGitRemote: true,
				hasGitHubRemote: true,
				upstreamBranchName: 'origin/main',
				incomingChanges: 1,
				outgoingChanges: 2,
				uncommittedChanges: 3,
				hasBaseBranchChanges: true,
				githubOwner: 'microsoft',
				githubHeadOwner: 'user',
				githubRepo: 'vscode',
			},
		});

		const materializedMeta = h.service.getMaterializedWorktreeMeta(SESSION, 'agents/feature');

		assert.deepStrictEqual(readSessionGitState(materializedMeta), {
			branchName: 'agents/feature',
			baseBranchName: 'main',
			hasGitRemote: true,
			hasGitHubRemote: true,
			githubOwner: 'microsoft',
			githubRepo: 'vscode',
		});
	});

	test('discards a refresh result when the session moved to another working directory', async () => {
		const h = createHarness();
		const repository = URI.file('/work/repo');
		const worktree = URI.file('/work/repo.worktrees/feature');
		seedSession(h.stateManager, {
			workingDirectory: repository.toString(),
			gitState: { branchName: 'agents/feature', baseBranchName: 'main' },
		});
		const deferredResult = new DeferredPromise<ISessionGitState | undefined>();
		h.setGitResultPromise(deferredResult.p);

		const refresh = h.service.refreshSessionGitState(SESSION, repository);
		while (h.gitCalls.length === 0) {
			await Promise.resolve();
		}
		h.stateManager.dispatchServerAction(SESSION, {
			type: ActionType.SessionWorkingDirectoryReplaced,
			directory: repository.toString(),
			replacement: worktree.toString(),
		});
		deferredResult.complete({ branchName: 'main', baseBranchName: 'main' });
		await refresh;

		assert.deepStrictEqual({
			gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
			runEvents: h.runEvents,
		}, {
			gitState: { branchName: 'agents/feature', baseBranchName: 'main' },
			runEvents: [],
		});
	});

	test('preserves merge provenance when a later pull request becomes the latest outcome', async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });

		await h.service.recordSessionMerge(SESSION, 'merge-commit');
		const afterMerge = readSessionSourceControlState(h.stateManager.getSessionState(SESSION)?._meta);
		const persistedAfterMerge = await h.db.getMetadata(META_SOURCE_CONTROL_STATE);

		await h.service.setSessionGitHubState(SESSION, {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequestUrls: ['https://github.com/microsoft/vscode/pull/42'],
			pullRequestBranchName: 'feature',
		});
		const afterPullRequest = readSessionSourceControlState(h.stateManager.getSessionState(SESSION)?._meta);
		const persistedAfterPullRequest = await h.db.getMetadata(META_SOURCE_CONTROL_STATE);

		assert.deepStrictEqual({
			afterMerge,
			persistedAfterMerge: persistedAfterMerge ? JSON.parse(persistedAfterMerge) : undefined,
			afterPullRequest,
			gitHubStateEvents: h.gitHubStateEvents,
			persistedAfterPullRequest: persistedAfterPullRequest ? JSON.parse(persistedAfterPullRequest) : undefined,
		}, {
			afterMerge: {
				merge: { commit: 'merge-commit' },
				latestOutcome: SessionSourceControlOutcome.Merge,
			},
			persistedAfterMerge: {
				merge: { commit: 'merge-commit' },
				latestOutcome: SessionSourceControlOutcome.Merge,
			},
			afterPullRequest: {
				merge: { commit: 'merge-commit' },
				latestOutcome: SessionSourceControlOutcome.PullRequest,
			},
			gitHubStateEvents: [SESSION],
			persistedAfterPullRequest: {
				merge: { commit: 'merge-commit' },
				latestOutcome: SessionSourceControlOutcome.PullRequest,
			},
		});
	});

	test('does nothing when no working directory can be resolved', async () => {
		const h = createHarness();
		seedSession(h.stateManager);

		await h.service.refreshSessionGitState(SESSION, undefined);

		assert.deepStrictEqual({
			gitCalls: h.gitCalls,
			runEvents: h.runEvents
		}, {
			gitCalls: [],
			runEvents: []
		});
	});

	test('clears default-chat Git state when no working directory can be resolved', async () => {
		const h = createHarness();
		const defaultChat = buildDefaultChatUri(SESSION);
		const previous: ISessionGitState = { branchName: 'stale-feature', baseBranchName: 'main' };
		seedSession(h.stateManager, { gitState: previous });
		await h.db.setMetadata(META_GIT_STATE, JSON.stringify(previous));

		await h.service.refreshSessionGitState(defaultChat, undefined);

		assert.deepStrictEqual({
			gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
			persisted: await h.db.getMetadata(META_GIT_STATE),
			runEvents: h.runEvents,
		}, {
			gitState: undefined,
			persisted: undefined,
			runEvents: [defaultChat],
		});
	});

	test('persists chat Git state by folder scope separately from the containing session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const chat = buildChatUri(SESSION, 'peer');
		const sessionGitState: ISessionGitState = { branchName: 'session-feature', baseBranchName: 'session-main' };
		const chatGitState: ISessionGitState = { branchName: 'chat-feature', baseBranchName: 'chat-main' };
		const scopeId = getWorkingDirectoryScopeId(['file:///chat']);
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState: sessionGitState,
		});
		h.stateManager.addChat(SESSION, chat, { workingDirectories: ['file:///chat'] });

		const before = h.service.getSessionGitState(chat);
		h.setGitResult(chatGitState);
		await h.service.refreshSessionGitState(chat, undefined);
		const afterRefresh = h.service.getSessionGitState(chat);
		const persistedAfterRefresh = await h.db.getMetadata(META_GIT_DATA_STATE);
		h.setGitResult(undefined);
		await h.service.refreshSessionGitState(chat, undefined);

		assert.deepStrictEqual({
			before,
			afterRefresh,
			afterUnavailable: h.service.getSessionGitState(chat),
			sessionGitState: h.service.getSessionGitState(SESSION),
			scopedState: readFolderScopeGitState(h.stateManager.getSessionState(SESSION)?._meta, scopeId),
			persistedAfterRefresh: persistedAfterRefresh ? JSON.parse(persistedAfterRefresh) : undefined,
			persistedAfterUnavailable: JSON.parse((await h.db.getMetadata(META_GIT_DATA_STATE))!),
			runEvents: h.runEvents,
		}, {
			before: undefined,
			afterRefresh: chatGitState,
			afterUnavailable: undefined,
			sessionGitState,
			scopedState: undefined,
			persistedAfterRefresh: { [scopeId]: chatGitState },
			persistedAfterUnavailable: {},
			runEvents: [chat, chat],
		});
	}));

	test('reads restored folder-scoped Git state before refreshing a peer chat', () => {
		const h = createHarness();
		const chat = buildChatUri(SESSION, 'peer');
		const sameFolderChat = buildChatUri(SESSION, 'same-folder-peer');
		const otherFolderChat = buildChatUri(SESSION, 'other-folder-peer');
		const cachedGitState: ISessionGitState = { branchName: 'cached-feature', baseBranchName: 'main' };
		const scopeId = getWorkingDirectoryScopeId(['file:///chat']);
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		h.stateManager.addChat(SESSION, chat, { workingDirectories: ['file:///chat'] });
		h.stateManager.addChat(SESSION, sameFolderChat, { workingDirectories: ['file:///chat'] });
		h.stateManager.addChat(SESSION, otherFolderChat, { workingDirectories: ['file:///other'] });
		h.stateManager.setSessionMeta(SESSION, withFolderScopeGitState(h.stateManager.getSessionState(SESSION)?._meta, scopeId, cachedGitState));

		assert.deepStrictEqual({
			peer: h.service.getSessionGitState(chat),
			sameFolderPeer: h.service.getSessionGitState(sameFolderChat),
			otherFolderPeer: h.service.getSessionGitState(otherFolderChat),
			session: h.service.getSessionGitState(SESSION),
			gitCalls: h.gitCalls,
		}, {
			peer: cachedGitState,
			sameFolderPeer: cachedGitState,
			otherFolderPeer: undefined,
			session: undefined,
			gitCalls: [],
		});
	});

	test('keeps the default chat on session Git state when a same-folder peer has scoped state', () => {
		const h = createHarness();
		const defaultChat = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		const sessionGitState: ISessionGitState = { branchName: 'session-feature', baseBranchName: 'main' };
		const peerGitState: ISessionGitState = { branchName: 'peer-feature', baseBranchName: 'release' };
		const scopeId = getWorkingDirectoryScopeId([WORKING_DIRECTORY]);
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: sessionGitState });
		h.stateManager.addChat(SESSION, peer);
		h.stateManager.setSessionMeta(SESSION, withFolderScopeGitState(h.stateManager.getSessionState(SESSION)?._meta, scopeId, peerGitState));

		assert.deepStrictEqual({
			defaultChat: h.service.getSessionGitState(defaultChat),
			peer: h.service.getSessionGitState(peer),
			session: h.service.getSessionGitState(SESSION),
		}, {
			defaultChat: sessionGitState,
			peer: peerGitState,
			session: sessionGitState,
		});
	});

	test('keeps separate GitHub state and pull requests for a chat in another folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const chat = buildChatUri(SESSION, 'peer');
		const sameScopeChat = buildChatUri(SESSION, 'same-scope');
		const sessionGitHubState: ISessionGitHubState = { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'session-feature' };
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState: { branchName: 'session-feature', baseBranchName: 'main' },
			gitHubState: sessionGitHubState,
		});
		h.stateManager.addChat(SESSION, chat, { workingDirectories: ['file:///other'] });
		h.stateManager.addChat(SESSION, sameScopeChat, { workingDirectories: [WORKING_DIRECTORY] });
		h.setGitResult({ branchName: 'chat-feature', baseBranchName: 'main', hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'tools' });
		h.setPullRequest('chat-feature', { url: 'https://github.com/contoso/tools/pull/7', number: 7 });

		await h.service.refreshSessionGitState(chat, undefined);

		const folderKey = getWorkingDirectoryKey('file:///other');
		const meta = h.stateManager.getSessionState(SESSION)?._meta;
		assert.deepStrictEqual({
			chat: h.service.getGitHubState(chat),
			sameScopeChat: h.service.getGitHubState(sameScopeChat),
			session: readSessionGitHubState(meta, WORKING_DIRECTORY),
			folders: Object.fromEntries(readSessionGitHubData(meta)),
			persisted: JSON.parse(await h.db.getMetadata(META_GITHUB_DATA_STATE) ?? 'null'),
			allPullRequests: getAllSessionRelatedPullRequestUrls(meta),
			pullRequestCalls: h.pullRequestCalls,
		}, {
			chat: { owner: 'contoso', repo: 'tools', pullRequestUrls: ['https://github.com/contoso/tools/pull/7'], pullRequestBranchName: 'chat-feature' },
			sameScopeChat: sessionGitHubState,
			session: sessionGitHubState,
			folders: { [getWorkingDirectoryKey(WORKING_DIRECTORY)]: sessionGitHubState, [folderKey]: { owner: 'contoso', repo: 'tools', pullRequestUrls: ['https://github.com/contoso/tools/pull/7'], pullRequestBranchName: 'chat-feature' } },
			persisted: { [getWorkingDirectoryKey(WORKING_DIRECTORY)]: sessionGitHubState, [folderKey]: { owner: 'contoso', repo: 'tools', pullRequestUrls: ['https://github.com/contoso/tools/pull/7'], pullRequestBranchName: 'chat-feature' } },
			allPullRequests: ['https://github.com/microsoft/vscode/pull/1', 'https://github.com/contoso/tools/pull/7'],
			pullRequestCalls: ['chat-feature'],
		});
	}));

	test('attaches a peer-folder pull request using the peer folder branch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const peer = buildChatUri(SESSION, 'peer');
		const peerFolder = 'file:///peer';
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState: { branchName: 'session-feature', baseBranchName: 'main' },
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
		});
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [peerFolder] });
		h.setGitResult({ branchName: 'peer-feature', baseBranchName: 'main', githubOwner: 'contoso', githubRepo: 'tools' });
		h.setPullRequest('peer-feature', { url: 'https://github.com/contoso/tools/pull/9', number: 9 });

		await h.service.attachSessionGitHubPullRequest(peer, URI.parse(peerFolder));

		assert.deepStrictEqual({
			pullRequestCalls: h.pullRequestCalls,
			peerGitState: h.service.getSessionGitState(peer),
			peerGitHubState: h.service.getGitHubState(peer),
		}, {
			pullRequestCalls: ['peer-feature'],
			peerGitState: { branchName: 'peer-feature', baseBranchName: 'main', githubOwner: 'contoso', githubRepo: 'tools' },
			peerGitHubState: {
				owner: 'contoso',
				repo: 'tools',
				pullRequestUrls: ['https://github.com/contoso/tools/pull/9'],
				pullRequestBranchName: 'peer-feature',
			},
		});
	}));

	test('keeps a pre-existing other-folder pull request out of the related set', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const peer = buildChatUri(SESSION, 'peer');
		const peerFolder = 'file:///peer';
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			createdAt: 600_000,
		});
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [peerFolder] });
		h.setGitResult({ branchName: 'peer-feature', baseBranchName: 'main', githubOwner: 'contoso', githubRepo: 'tools' });
		h.setPullRequest('peer-feature', { url: 'https://github.com/contoso/tools/pull/9', number: 9, createdAt: 1_000 });

		await h.service.attachSessionGitHubPullRequest(peer, URI.parse(peerFolder));

		const github = h.service.getGitHubState(peer);
		assert.deepStrictEqual({
			github,
			related: [...getSessionRelatedPullRequestUrls(github)],
		}, {
			github: {
				owner: 'contoso',
				repo: 'tools',
				pullRequestUrls: ['https://github.com/contoso/tools/pull/9'],
				initialPullRequestUrls: ['https://github.com/contoso/tools/pull/9'],
				pullRequestBranchName: 'peer-feature',
			},
			related: [],
		});
	}));

	test('migrates the original single-folder state to the session folder', () => {
		const legacy: ISessionGitHubState = { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'] };
		const existing: ISessionGitHubState = { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2'] };
		const legacyMeta = { [SESSION_META_GITHUB_KEY]: legacy, other: true };
		const sessionFolderKey = getWorkingDirectoryKey(WORKING_DIRECTORY);

		assert.deepStrictEqual({
			migrated: withMigratedSessionGitHubState(legacyMeta, WORKING_DIRECTORY),
			persistedLegacy: withMigratedSessionGitHubState({ other: true }, WORKING_DIRECTORY, legacy),
			keepsFolderState: withMigratedSessionGitHubState(withSessionGitHubState(legacyMeta, WORKING_DIRECTORY, existing), WORKING_DIRECTORY),
			withoutFolder: withMigratedSessionGitHubState(legacyMeta, undefined),
		}, {
			migrated: { other: true, [SESSION_META_GITHUB_DATA_KEY]: { [sessionFolderKey]: legacy } },
			persistedLegacy: { other: true, [SESSION_META_GITHUB_DATA_KEY]: { [sessionFolderKey]: legacy } },
			keepsFolderState: { other: true, [SESSION_META_GITHUB_DATA_KEY]: { [sessionFolderKey]: existing } },
			withoutFolder: { other: true },
		});
	});

	test('moves the GitHub state of a folder whose checkout moved', () => {
		const moved: ISessionGitHubState = { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'] };
		const other: ISessionGitHubState = { owner: 'contoso', repo: 'tools' };
		const meta = withSessionGitHubState(withSessionGitHubState(undefined, 'file:///repo', moved), 'file:///other', other);

		assert.deepStrictEqual({
			moved: Object.fromEntries(readSessionGitHubData(withReplacedFolderGitHubState(meta, 'file:///repo', 'file:///worktree'))),
			unknownFolder: withReplacedFolderGitHubState(meta, 'file:///missing', 'file:///worktree'),
		}, {
			moved: { [getWorkingDirectoryKey('file:///other')]: other, [getWorkingDirectoryKey('file:///worktree')]: moved },
			unknownFolder: meta,
		});
	});

	test('never records state for a folder changeset owner that no longer matches a chat', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitHubState: { owner: 'microsoft', repo: 'vscode' } });
		const staleOwner = buildFolderChangesetOwnerUri(SESSION, getWorkingDirectoryScopeId(['file:///removed']));

		await h.service.setSessionGitHubState(staleOwner, { pullRequestUrls: ['https://github.com/contoso/tools/pull/9'] });

		const meta = h.stateManager.getSessionState(SESSION)?._meta;
		assert.deepStrictEqual({
			read: h.service.getGitHubState(staleOwner),
			session: readSessionGitHubState(meta, WORKING_DIRECTORY),
			folders: Object.fromEntries(readSessionGitHubData(meta)),
		}, {
			read: undefined,
			session: { owner: 'microsoft', repo: 'vscode' },
			folders: { [getWorkingDirectoryKey(WORKING_DIRECTORY)]: { owner: 'microsoft', repo: 'vscode' } },
		});
	}));

	test('persists concurrent updates of different folders without losing either', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		const firstChat = buildChatUri(SESSION, 'first');
		const secondChat = buildChatUri(SESSION, 'second');
		h.stateManager.addChat(SESSION, firstChat, { workingDirectories: ['file:///first'] });
		h.stateManager.addChat(SESSION, secondChat, { workingDirectories: ['file:///second'] });

		await Promise.all([
			h.service.setSessionGitHubState(firstChat, { owner: 'contoso', repo: 'first' }),
			h.service.setSessionGitHubState(secondChat, { owner: 'contoso', repo: 'second' }),
		]);

		assert.deepStrictEqual(JSON.parse(await h.db.getMetadata(META_GITHUB_DATA_STATE) ?? 'null'), {
			[getWorkingDirectoryKey('file:///first')]: { owner: 'contoso', repo: 'first' },
			[getWorkingDirectoryKey('file:///second')]: { owner: 'contoso', repo: 'second' },
		});
	}));

	test('clears chat Git state when the chat is removed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const chat = buildChatUri(SESSION, 'peer');
		const chatGitState: ISessionGitState = { branchName: 'chat-feature', baseBranchName: 'chat-main' };
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		h.stateManager.addChat(SESSION, chat, { workingDirectories: ['file:///chat'] });
		h.setGitResult(chatGitState);
		await h.service.refreshSessionGitState(chat, undefined);

		h.stateManager.removeChat(SESSION, chat);

		assert.strictEqual(h.service.getSessionGitState(chat), undefined);
	}));

	test('uses the selected worktree base branch when refreshing git state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			isolation: 'worktree',
			baseBranch: 'release',
		});
		h.setGitResult({ branchName: 'agents/session', baseBranchName: 'release' });

		await h.service.refreshSessionGitState(SESSION, undefined);

		assert.deepStrictEqual(h.gitBaseBranches, ['release']);
	}));

	test('uses the persisted base branch when the selected branch is checked out directly', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			project: 'file:///repo',
			isolation: 'worktree',
			baseBranch: 'feature/pr',
			createNewBranch: false,
		});
		await h.db.setMetadata(META_DIFF_BASE_BRANCH, 'origin/main');
		h.setGitResult({ branchName: 'feature/pr', baseBranchName: 'main' });

		await h.service.refreshSessionGitState(SESSION, undefined);

		assert.deepStrictEqual(h.gitBaseBranches, ['main']);
	}));

	test('uses the persisted worktree base branch for an adopted linked worktree', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			project: 'file:///repo',
			isolation: 'folder',
			gitState: { branchName: 'agents/session', baseBranchName: 'main' },
		});
		await h.db.setMetadata(META_DIFF_BASE_BRANCH, 'origin/release');
		h.setGitResult({ branchName: 'agents/session', baseBranchName: 'release' });

		await h.service.refreshSessionGitState(SESSION, undefined);

		assert.deepStrictEqual(h.gitBaseBranches, ['release']);
	}));

	test('refreshes git state in memory while a session is creating', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			h.stateManager.createSession({
				resource: SESSION,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date(0).toISOString(),
				modifiedAt: new Date(0).toISOString(),
				workingDirectories: ['file:///original'],
			}, { emitNotification: false });
			const next: ISessionGitState = { branchName: 'feature', uncommittedChanges: 1 };
			h.setGitResult(next);

			await h.service.refreshSessionGitState(SESSION, URI.parse('file:///explicit'));

			assert.deepStrictEqual({
				gitCalls: h.gitCalls,
				gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
				persistedGit: await h.db.getMetadata(META_GIT_STATE),
				runEvents: h.runEvents,
			}, {
				gitCalls: ['file:///explicit'],
				gitState: next,
				persistedGit: undefined,
				runEvents: [SESSION],
			});
		});
	});

	test('resolves the working directory from the session summary when none is provided', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
			h.setGitResult({ branchName: 'feature' });

			await h.service.refreshSessionGitState(SESSION, undefined);

			assert.deepStrictEqual(h.gitCalls, [WORKING_DIRECTORY]);
		});
	});

	test('prefers an explicitly provided working directory over the session summary', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
			h.setGitResult({ branchName: 'feature' });

			await h.service.refreshSessionGitState(SESSION, URI.parse('file:///explicit'));

			assert.deepStrictEqual(h.gitCalls, ['file:///explicit']);
		});
	});

	test('unchanged git state still fires the run-refresh event', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', uncommittedChanges: 1 };
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState });
			h.setGitResult(gitState);

			await h.service.refreshSessionGitState(SESSION, undefined);

			assert.deepStrictEqual(h.runEvents, [SESSION]);
		});
	});

	test('unchanged git state backfills missing GitHub state', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = {
				branchName: 'feature',
				githubOwner: 'microsoft',
				githubRepo: 'vscode',
			};
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState });
			h.setGitResult(gitState);

			await h.service.refreshSessionGitState(SESSION, undefined);

			assert.deepStrictEqual({
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
				persistedGitHub: await readPersistedSessionGitHubState(h.db),
			}, {
				github: { owner: 'microsoft', repo: 'vscode' },
				persistedGitHub: { owner: 'microsoft', repo: 'vscode' },
			});
		});
	});

	test('changed git state updates the session meta and fires the run-refresh event', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
			const next: ISessionGitState = { branchName: 'feature', baseBranchName: 'main', uncommittedChanges: 2 };
			h.setGitResult(next);

			await h.service.refreshSessionGitState(SESSION, undefined);

			assert.deepStrictEqual({
				gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
				runEvents: h.runEvents,
			}, {
				gitState: next,
				runEvents: [SESSION],
			});
		});
	});

	test('persists git state and derives GitHub state when git reports a GitHub repo', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
			const next: ISessionGitState = { branchName: 'feature', githubOwner: 'microsoft', githubRepo: 'vscode' };
			h.setGitResult(next);

			await h.service.refreshSessionGitState(SESSION, undefined);

			assert.deepStrictEqual({
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
				persistedGit: await h.db.getMetadata(META_GIT_STATE),
			}, {
				github: { owner: 'microsoft', repo: 'vscode' },
				persistedGit: JSON.stringify(next),
			});
		});
	});

	test('preserves pull request attachment when a later refresh replaces its queued refresh', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const calls: { owner: string; repo: string; branch: string; headOwner: string | undefined }[] = [];
			const octoKitService = {
				findPullRequestByHeadBranch: async (owner: string, repo: string, branch: string, _token: string, _signal: AbortSignal, headOwner?: string) => {
					calls.push({ owner, repo, branch, headOwner });
					return { url: 'https://github.com/microsoft/vscode/pull/1', number: 1 };
				},
			} as unknown as IAgentHostOctoKitService;
			const authenticationService: IAgentHostAuthenticationService = {
				_serviceBrand: undefined,
				onDidChangeAuthToken: Event.None,
				getAuthToken: () => 'token',
			};
			const h = createHarness({ octoKitService, authenticationService });
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState: {
					branchName: 'feature',
					baseBranchName: 'main',
					githubOwner: 'microsoft',
					githubRepo: 'vscode',
				},
			});
			h.setGitResult({
				branchName: 'feature',
				baseBranchName: 'main',
				upstreamBranchName: 'fork/feature',
				githubOwner: 'microsoft',
				githubHeadOwner: 'fork-owner',
				githubRepo: 'vscode',
			});

			await Promise.all([
				h.service.refreshSessionGitState(SESSION, URI.parse(WORKING_DIRECTORY)),
				h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY)),
				h.service.refreshSessionGitState(SESSION, URI.parse(WORKING_DIRECTORY)),
			]);

			assert.deepStrictEqual({
				gitCalls: h.gitCalls.length,
				calls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				gitCalls: 2,
				calls: [{ owner: 'microsoft', repo: 'vscode', branch: 'feature', headOwner: 'fork-owner' }],
				github: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
					pullRequestBranchName: 'feature',
				},
			});
		});
	});

	test('looks a pull request up by the upstream branch rather than the local branch name', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = {
				branchName: 'local-name',
				baseBranchName: 'main',
				upstreamBranchName: 'origin/remote-name',
				githubHeadOwner: 'microsoft',
			};
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
			});
			h.setGitResult(gitState);
			h.setPullRequest('remote-name', { url: 'https://github.com/microsoft/vscode/pull/1', number: 1 });

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				pullRequestShaCalls: h.pullRequestShaCalls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCalls: ['remote-name'],
				pullRequestShaCalls: [],
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'local-name' },
			});
		});
	});

	test('uses a PR artifact as the only GitHub lookup candidate when automatic attachment is disabled', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness({ autoAttachPullRequests: false });
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
				artifacts: [pullRequestArtifact(2)],
			});
			h.setGitResult(gitState);
			h.setPullRequest('feature', { url: 'https://github.com/microsoft/vscode/pull/2', number: 2, state: 'open' });

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCandidateCalls: h.pullRequestCandidateCalls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCandidateCalls: [['https://github.com/microsoft/vscode/pull/2']],
				github: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2'],
					pullRequestBranchName: 'feature',
				},
			});
		});
	});

	test('applies restricted PR state when candidate lookup fails', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness({
				autoAttachPullRequests: false,
				octoKitService: {
					findPullRequestByHeadBranch: async () => { throw new Error('GitHub unavailable'); },
				} as unknown as IAgentHostOctoKitService,
			});
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
					pullRequestBranchName: 'feature',
				},
				artifacts: [pullRequestArtifact(2)],
			});
			h.setGitResult(gitState);

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual(readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY), {
				owner: 'microsoft',
				repo: 'vscode',
			});
		});
	});

	test('reconciles an existing automatically discovered PR when the setting is disabled', async () => {
		const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState,
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
				pullRequestBranchName: 'feature',
			},
		});
		const reconciled = Event.toPromise(h.service.onDidChangeSessionGitHubState);

		h.configurationService.updateRootConfig({ [AgentHostAutoAttachPullRequestsConfigKey]: false });
		await reconciled;

		assert.deepStrictEqual(readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY), {
			owner: 'microsoft',
			repo: 'vscode',
		});
	});

	test('looks a fork pull request up by the local branch name when git inferred the fork head owner from the push remote', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = {
				branchName: 'feature/alt-click-close-other-tabs',
				baseBranchName: 'main',
				githubHeadOwner: 'jadefr',
			};
			const calls: Array<{ branch: string; headOwner: string | undefined }> = [];
			const h = createHarness({
				octoKitService: {
					findPullRequestByHeadBranch: async (_owner: string, _repo: string, branch: string, _token: string, _signal: AbortSignal, headOwner?: string) => {
						calls.push({ branch, headOwner });
						return {
							url: 'https://github.com/microsoft/vscode/pull/328975',
							number: 328975,
						};
					},
				} as unknown as IAgentHostOctoKitService,
			});
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
			});
			h.setGitResult(gitState);

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCalls: calls,
				pullRequestShaCalls: h.pullRequestShaCalls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCalls: [{ branch: 'feature/alt-click-close-other-tabs', headOwner: 'jadefr' }],
				pullRequestShaCalls: [],
				github: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: ['https://github.com/microsoft/vscode/pull/328975'],
					pullRequestBranchName: 'feature/alt-click-close-other-tabs',
				},
			});
		});
	});

	test('falls back to the commit at HEAD when the branch name matches no pull request', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			// A branch checked out from a pull request head: no upstream, and a
			// name that does not exist on the remote.
			const gitState: ISessionGitState = { branchName: 'local-only', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
			});
			h.setGitResult(gitState);
			h.setHeadSha('1ce2c20d3dcb593273f604b077240543d494e276');
			h.setPullRequestForSha('1ce2c20d3dcb593273f604b077240543d494e276', { url: 'https://github.com/microsoft/vscode/pull/2', number: 2 });

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				pullRequestShaCalls: h.pullRequestShaCalls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCalls: ['local-only'],
				pullRequestShaCalls: ['1ce2c20d3dcb593273f604b077240543d494e276'],
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2'], pullRequestBranchName: 'local-only' },
			});
		});
	});

	test('ignores an upstream branch that does not resolve to a GitHub remote', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = {
				branchName: 'local-name',
				baseBranchName: 'main',
				upstreamBranchName: 'gitlab/remote-name',
			};
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
			});
			h.setGitResult(gitState);

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual(h.pullRequestCalls, ['local-name']);
		});
	});

	test('keeps a pre-existing folder-session pull request out of the related set', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
				isolation: 'folder',
				createdAt: 600_000,
			});
			h.setGitResult(gitState);
			h.setPullRequest('feature', {
				url: 'https://github.com/microsoft/vscode/pull/1',
				number: 1,
				createdAt: 1_000,
			});

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);
			assert.deepStrictEqual({
				github,
				related: [...getSessionRelatedPullRequestUrls(github)],
				persistedGitHub: await readPersistedSessionGitHubState(h.db),
			}, {
				github: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
					initialPullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
					pullRequestBranchName: 'feature',
				},
				related: [],
				persistedGitHub: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
					initialPullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
					pullRequestBranchName: 'feature',
				},
			});
		});
	});

	test('uses folder isolation that resolves while a pull request lookup is in flight', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const pullRequestUrl = 'https://github.com/microsoft/vscode/pull/1';
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
				createdAt: 600_000,
			});
			h.setGitResult(gitState);
			h.setPullRequest('feature', { url: pullRequestUrl, number: 1, createdAt: 1_000 });
			h.setOnPullRequestLookup(async () => {
				h.stateManager.setSessionConfig(SESSION, {
					schema: { type: 'object', properties: {} },
					values: { [SessionConfigKey.Isolation]: 'folder' },
				});
			});

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);
			assert.deepStrictEqual({
				github,
				related: [...getSessionRelatedPullRequestUrls(github)],
			}, {
				github: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: [pullRequestUrl],
					initialPullRequestUrls: [pullRequestUrl],
					pullRequestBranchName: 'feature',
				},
				related: [],
			});
		});
	});

	test('relates a pull request created after a folder session began', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
				isolation: 'folder',
				createdAt: 600_000,
			});
			h.setGitResult(gitState);

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
			h.setPullRequest('feature', {
				url: 'https://github.com/microsoft/vscode/pull/2',
				number: 2,
				createdAt: 600_500,
			});
			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);
			assert.deepStrictEqual({
				github,
				related: [...getSessionRelatedPullRequestUrls(github)],
			}, {
				github: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2'],
					initialPullRequestUrls: [],
					pullRequestBranchName: 'feature',
				},
				related: ['https://github.com/microsoft/vscode/pull/2'],
			});
		});
	});

	test('keeps worktree pull request behavior unchanged', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
				isolation: 'worktree',
				createdAt: 2_000,
			});
			h.setGitResult(gitState);
			h.setPullRequest('feature', {
				url: 'https://github.com/microsoft/vscode/pull/1',
				number: 1,
				createdAt: 1_000,
			});

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);
			assert.deepStrictEqual({
				github,
				related: [...getSessionRelatedPullRequestUrls(github)],
			}, {
				github: {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
					pullRequestBranchName: 'feature',
				},
				related: ['https://github.com/microsoft/vscode/pull/1'],
			});
		});
	});

	test('round-trips an empty folder-session baseline through persisted metadata', () => {
		const persisted = JSON.parse(JSON.stringify({ initialPullRequestUrls: [] }));

		assert.deepStrictEqual(readSessionGitHubStateInput({ [SESSION_META_GITHUB_KEY]: persisted }), {
			initialPullRequestUrls: [],
		});
	});

	test('swallows git errors and fires no events', async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		h.setGitError(new Error('git command failed'));

		await h.service.refreshSessionGitState(SESSION, undefined);

		assert.deepStrictEqual({
			runEvents: h.runEvents
		}, {
			runEvents: []
		});
	});

	test('coalesces concurrent refreshes for the same session', async () => {
		await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
			h.setGitResult({ branchName: 'feature' });

			// Three concurrent refreshes collapse via the throttler: the first
			// runs immediately and the last queued one runs after it settles;
			// the middle request is dropped.
			await Promise.all([
				h.service.refreshSessionGitState(SESSION, undefined),
				h.service.refreshSessionGitState(SESSION, undefined),
				h.service.refreshSessionGitState(SESSION, undefined),
			]);

			assert.strictEqual(h.gitCalls.length, 2);
		});
	});

	test('stops looking for a pull request once one is known for the current branch', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
			});
			h.setGitResult(gitState);
			h.setPullRequest('feature', { url: 'https://github.com/microsoft/vscode/pull/1', number: 1 });

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCalls: ['feature'],
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature' },
			});
		});
	});

	test('keeps the known pull request but resumes looking after the branch changed', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const nextGitState: ISessionGitState = { branchName: 'feature-2', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState: { branchName: 'feature', baseBranchName: 'main' },
				gitHubState: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature' },
			});
			h.stateManager.setSessionMeta(SESSION, withSessionGitState(h.stateManager.getSessionState(SESSION)?._meta, nextGitState));
			h.setGitResult(nextGitState);

			// No pull request exists for the new branch yet
			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
			const githubBeforePullRequestExists = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);

			h.setPullRequest('feature-2', { url: 'https://github.com/microsoft/vscode/pull/2', number: 2 });
			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				githubBeforePullRequestExists,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
				persistedGitHub: await readPersistedSessionGitHubState(h.db),
			}, {
				pullRequestCalls: ['feature-2', 'feature-2'],
				githubBeforePullRequestExists: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature' },
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2', 'https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature-2' },
				persistedGitHub: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2', 'https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature-2' },
			});
		});

		test('preserves GitHub state updated while a pull request lookup is in flight', async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
				const h = createHarness();
				seedSession(h.stateManager, {
					workingDirectory: WORKING_DIRECTORY,
					gitState,
					gitHubState: { owner: 'microsoft', repo: 'vscode' },
				});
				h.setGitResult(gitState);
				h.setPullRequest('feature', { url: 'https://github.com/microsoft/vscode/pull/1', number: 1 });
				h.setOnPullRequestLookup(async () => {
					const currentState = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);
					await h.service.setSessionGitHubState(SESSION, withMostRecentSessionPullRequest(currentState, 'https://github.com/microsoft/vscode/pull/2', 'feature-2'));
				});

				await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

				assert.deepStrictEqual(readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY), {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: [
						'https://github.com/microsoft/vscode/pull/1',
						'https://github.com/microsoft/vscode/pull/2',
					],
					pullRequestBranchName: 'feature',
				});
			});
		});
	});

	test('verifies a pull request that predates branch tracking against the current branch', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'] },
			});
			h.setGitResult(gitState);
			h.setPullRequest('feature', { url: 'https://github.com/microsoft/vscode/pull/1', number: 1 });

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCalls: ['feature'],
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature' },
			});
		});
	});

	test('does not bind a pull request that predates branch tracking to a branch without one', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature-2', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'] },
			});
			h.setGitResult(gitState);

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCalls: ['feature-2', 'feature-2'],
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'] },
			});
		});
	});

	test('discards a pull request lookup whose branch is no longer checked out', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
			});
			h.setGitResult(gitState);
			h.setPullRequest('feature', { url: 'https://github.com/microsoft/vscode/pull/1', number: 1 });
			// The working copy moves to another branch while the lookup is in flight.
			h.setOnPullRequestLookup(async () => {
				h.stateManager.setSessionMeta(SESSION, withSessionGitState(h.stateManager.getSessionState(SESSION)?._meta, { branchName: 'feature-2', baseBranchName: 'main' }));
			});

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCalls: ['feature'],
				github: { owner: 'microsoft', repo: 'vscode' },
			});
		});

		test('does not capture an empty baseline for a stale branch lookup', async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
				const h = createHarness();
				seedSession(h.stateManager, {
					workingDirectory: WORKING_DIRECTORY,
					gitState,
					gitHubState: { owner: 'microsoft', repo: 'vscode' },
					isolation: 'folder',
				});
				h.setGitResult(gitState);
				h.setOnPullRequestLookup(async () => {
					h.stateManager.setSessionMeta(SESSION, withSessionGitState(h.stateManager.getSessionState(SESSION)?._meta, { branchName: 'feature-2', baseBranchName: 'main' }));
				});

				await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

				assert.deepStrictEqual(readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY), {
					owner: 'microsoft',
					repo: 'vscode',
				});
			});
		});
	});

	test('looks for a pull request before reporting a refresh that observed a branch change', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState: { branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' },
				gitHubState: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature' },
			});
			h.setGitResult({ branchName: 'feature-2', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
			h.setPullRequest('feature-2', { url: 'https://github.com/microsoft/vscode/pull/2', number: 2 });

			// The GitHub state is captured when the refresh is reported so the
			// event carries the pull request of the newly checked out branch.
			let githubOnRefreshEvent: ISessionGitHubState | undefined;
			disposables.add(h.service.onDidRefreshSessionGitState(() => {
				githubOnRefreshEvent = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);
			}));

			await h.service.refreshSessionGitState(SESSION, undefined);

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				githubOnRefreshEvent,
			}, {
				pullRequestCalls: ['feature-2'],
				githubOnRefreshEvent: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2', 'https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature-2' },
			});
		});
	});
});
