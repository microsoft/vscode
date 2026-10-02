/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { AgentHostAutoAttachPullRequestsConfigKey } from '../../common/agentHostSchema.js';
import { AgentHostAutoAttachPullRequestsSettingId } from '../../common/agentService.js';
import { CopilotCliVSCodeAssignmentContextKey } from '../../common/copilotCliConfig.js';
import { TestExperimentTriggerTelemetryService } from '../../../telemetry/test/common/experimentTriggerTestUtils.js';
import { META_GIT_DATA_STATE, META_GIT_STATE, META_GITHUB_DATA_STATE, META_PENDING_RECORDED_PULL_REQUESTS, META_SOURCE_CONTROL_STATE } from '../../common/agentHostGitStateService.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { buildFolderChangesetOwnerUri } from '../../common/changesetUri.js';
import { readSessionArtifacts, SessionArtifactType, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { ArtifactServerToolName } from '../../common/serverToolNames.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, getAllSessionRelatedPullRequestUrls, getSessionRelatedPullRequestUrls, readFolderScopeGitState, readSessionGitHubData, readSessionGitHubState, readSessionGitHubStateInput, readSessionGitState, readSessionSourceControlState, SESSION_META_GITHUB_KEY, SessionSourceControlOutcome, withFolderScopeGitState, withInitialSessionPullRequest, withMostRecentRelatedSessionPullRequest, withMigratedSessionGitHubState, withMostRecentSessionPullRequest, withReplacedFolderGitHubState, withSessionGitHubState, withSessionGitState, SESSION_META_GITHUB_DATA_KEY, SessionStatus, type ISessionGitHubState, type ISessionGitState, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import type { IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostGitStateService } from '../../node/agentHostGitStateService.js';
import { resolveAgentMergeOwningChat, resolveGitHubStateFolder } from '../../node/agentHostBranchChangesetScope.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createArtifactServerToolGroup } from '../../node/shared/artifactServerTools.js';
import { GitHubPullRequestLookup, GitHubPullRequestLookupOptions, GitHubRepositoryRef } from '../../../github/common/githubQueryService.js';
import { IGitHubQuery } from '../../../github/common/githubQueryServiceImpl.js';
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { createTestGitHubClient, createTestGitHubService, createTestPullRequest } from './testGitHubService.js';

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

function pullRequestArtifactForChat(number: number, chat: string, isArtifact = true): PullRequestArtifact {
	return { ...pullRequestArtifact(number, isArtifact), chat };
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

	function createHarness(options?: { query?: IGitHubQuery; authenticationService?: IAgentHostAuthenticationService; enterpriseUri?: string; autoAttachPullRequests?: boolean; telemetryService?: ITelemetryService; database?: TestSessionDatabase }) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const db = options?.database ?? new TestSessionDatabase();
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
		const pullRequestsByBranch = new Map<string, GitHubPullRequestLookup>();
		const pullRequestsBySha = new Map<string, GitHubPullRequestLookup>();
		let onPullRequestLookup: ((branch: string) => Promise<void>) | undefined;
		const query = new class extends mock<IGitHubQuery>() {
			override async findPullRequestByHeadBranch(_ref: GitHubRepositoryRef, branch: string, _headOwner: string | undefined, _signal: AbortSignal, options?: GitHubPullRequestLookupOptions) {
				const allowedPullRequestUrls = options?.allowedPullRequestUrls;
				pullRequestCalls.push(branch);
				pullRequestCandidateCalls.push(allowedPullRequestUrls ? [...allowedPullRequestUrls] : undefined);
				await onPullRequestLookup?.(branch);
				return pullRequestsByBranch.get(branch);
			}
			override async findPullRequestByHeadSha(_ref: GitHubRepositoryRef, sha: string) {
				pullRequestShaCalls.push(sha);
				return pullRequestsBySha.get(sha);
			}
		}();
		const authenticationService: IAgentHostAuthenticationService = {
			_serviceBrand: undefined,
			onDidChangeAuthToken: Event.None,
			getAuthAccount: () => undefined,
			getAuthToken: () => 'token',
		};

		const service = disposables.add(new AgentHostGitStateService(
			stateManager,
			gitService,
			createTestGitHubService(createTestGitHubClient({ query: options?.query ?? query })),
			options?.authenticationService ?? authenticationService,
			createTestGitHubEndpointService(options?.enterpriseUri),
			new NullLogService(),
			sessionDataService,
			configurationService,
			options?.telemetryService ?? NullTelemetryService,
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
			setPullRequest: (branch: string, pullRequest: GitHubPullRequestLookup) => { pullRequestsByBranch.set(branch, pullRequest); },
			setPullRequestForSha: (sha: string, pullRequest: GitHubPullRequestLookup) => { pullRequestsBySha.set(sha, pullRequest); },
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

	test('isolated main-chat Git state does not replace the aggregate original folder branch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		const worktree = 'file:///wd.worktrees/isolated';
		const main = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [WORKING_DIRECTORY] });
		await h.service.setFolderGitState(SESSION, [worktree], { branchName: 'isolated' });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: worktree });
		h.stateManager.dispatchServerAction(main, { type: ActionType.ChatWorkingDirectorySet, directory: worktree });
		h.setGitResult({ branchName: 'isolated', uncommittedChanges: 1 });
		await h.service.refreshSessionGitState(main, URI.parse(worktree));
		h.setGitResult({ branchName: 'main', uncommittedChanges: 2 });
		await h.service.refreshSessionGitState(SESSION, undefined);
		assert.deepStrictEqual({
			aggregate: readSessionGitState(h.stateManager.getSessionSummary(SESSION)?._meta),
			chat: h.service.getSessionGitState(main),
			peer: h.service.getSessionGitState(peer),
			queriedDirectories: h.gitCalls,
			sessionFolder: resolveGitHubStateFolder(h.stateManager, SESSION).workingDirectory,
			mainIsSessionFolder: resolveGitHubStateFolder(h.stateManager, main).isSessionFolder,
			peerIsSessionFolder: resolveGitHubStateFolder(h.stateManager, peer).isSessionFolder,
			mergeOwner: resolveAgentMergeOwningChat(h.stateManager, SESSION, getWorkingDirectoryKey(WORKING_DIRECTORY), undefined),
			persistedAggregate: JSON.parse((await h.db.getMetadata(META_GIT_STATE))!),
			persisted: JSON.parse((await h.db.getMetadata(META_GIT_DATA_STATE))!)[getWorkingDirectoryScopeId([worktree])],
		}, {
			aggregate: { branchName: 'main', uncommittedChanges: 2 },
			chat: { branchName: 'isolated', uncommittedChanges: 1 },
			peer: { branchName: 'main', uncommittedChanges: 2 },
			queriedDirectories: [worktree, WORKING_DIRECTORY],
			sessionFolder: WORKING_DIRECTORY,
			mainIsSessionFolder: false,
			peerIsSessionFolder: true,
			mergeOwner: peer,
			persistedAggregate: { branchName: 'main', uncommittedChanges: 2 },
			persisted: { branchName: 'isolated', uncommittedChanges: 1 },
		});
	}));

	test('single-chat workspace replacement refreshes the worktree while retaining repository identity', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, project: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		const worktree = 'file:///wd.worktrees/isolated';
		const main = buildDefaultChatUri(SESSION);
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectoryReplaced, directory: WORKING_DIRECTORY, replacement: worktree });
		h.stateManager.dispatchServerAction(main, { type: ActionType.ChatWorkingDirectorySet, directory: worktree });
		h.setGitResult({ branchName: 'isolated' });
		await h.service.refreshSessionGitState(SESSION, undefined);
		await h.service.refreshSessionGitState(main, undefined);
		assert.deepStrictEqual({
			project: h.stateManager.getSessionSummary(SESSION)?.project?.uri,
			session: h.service.getSessionGitState(SESSION),
			chat: h.service.getSessionGitState(main),
			directories: h.gitCalls,
			mainIsSessionFolder: resolveGitHubStateFolder(h.stateManager, main).isSessionFolder,
		}, {
			project: WORKING_DIRECTORY, session: { branchName: 'isolated' }, chat: { branchName: 'isolated' },
			directories: [worktree, worktree], mainIsSessionFolder: true,
		});
	}));

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
				defaultBranchName: 'main',
				defaultRemoteBranchName: 'origin/main',
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
			defaultBranchName: 'main',
			defaultRemoteBranchName: 'origin/main',
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
			afterUnavailable: chatGitState,
			sessionGitState,
			scopedState: chatGitState,
			persistedAfterRefresh: { [scopeId]: chatGitState },
			persistedAfterUnavailable: { [scopeId]: chatGitState },
			runEvents: [chat, chat],
		});
	}));

	test('keeps default-chat Git state when the Git probe fails', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const defaultChat = buildDefaultChatUri(SESSION);
		const previous: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: previous });
		await h.db.setMetadata(META_GIT_STATE, JSON.stringify(previous));
		h.setGitResult(undefined);

		await h.service.refreshSessionGitState(defaultChat, undefined);

		assert.deepStrictEqual({
			chatGitState: h.service.getSessionGitState(defaultChat),
			sessionGitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
			persisted: JSON.parse((await h.db.getMetadata(META_GIT_STATE))!),
			runEvents: h.runEvents,
		}, {
			chatGitState: previous,
			sessionGitState: previous,
			persisted: previous,
			runEvents: [defaultChat],
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
		h.setPullRequest('chat-feature', createTestPullRequest(7, { url: 'https://github.com/contoso/tools/pull/7' }));

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
		h.setPullRequest('peer-feature', createTestPullRequest(9, { url: 'https://github.com/contoso/tools/pull/9' }));

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
		h.setPullRequest('peer-feature', createTestPullRequest(9, { url: 'https://github.com/contoso/tools/pull/9', createdAt: new Date(1_000).toISOString() }));

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

	test('associates a recorded PR only with the invoking chat folder when its head branch matches', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const peer = buildChatUri(SESSION, 'peer');
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitHubState: { owner: 'contoso', repo: 'main' },
			artifacts: [pullRequestArtifactForChat(1, peer), pullRequestArtifactForChat(2, peer)],
		});
		const peerDirectory = 'file:///peer';
		const pullRequestUrl = 'https://github.com/microsoft/vscode/pull/1';
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [peerDirectory] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequest(1, { url: pullRequestUrl }));

		const wrongPullRequest = await h.service.associateRecordedPullRequest(peer, 'https://github.com/microsoft/vscode/pull/2');
		const wrongSession = await h.service.associateRecordedPullRequest(buildChatUri('mock:/other', 'peer'), pullRequestUrl);
		h.setGitResult({ branchName: 'other', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		const wrongBranch = await h.service.associateRecordedPullRequest(peer, pullRequestUrl);
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'contoso', githubRepo: 'tools' });
		const wrongRepository = await h.service.associateRecordedPullRequest(peer, pullRequestUrl);
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		const associated = await h.service.associateRecordedPullRequest(peer, pullRequestUrl);
		const alreadyAssociated = await h.service.associateRecordedPullRequest(peer, pullRequestUrl);
		const persisted = JSON.parse(await h.db.getMetadata(META_GITHUB_DATA_STATE) ?? '{}');

		assert.deepStrictEqual({
			wrongPullRequest,
			wrongSession,
			wrongBranch,
			wrongRepository,
			associated,
			alreadyAssociated,
			lookups: h.pullRequestCandidateCalls,
			mainFolder: h.service.getGitHubState(SESSION),
			peerFolder: h.service.getGitHubState(peer),
			persistedPeer: persisted[getWorkingDirectoryKey(peerDirectory)],
		}, {
			wrongPullRequest: false,
			wrongSession: false,
			wrongBranch: false,
			wrongRepository: false,
			associated: true,
			alreadyAssociated: true,
			lookups: [['https://github.com/microsoft/vscode/pull/2'], [pullRequestUrl], [pullRequestUrl]],
			mainFolder: { owner: 'contoso', repo: 'main' },
			peerFolder: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: [pullRequestUrl],
				pullRequestBranchName: 'feature',
				associatedPullRequestUrls: [pullRequestUrl],
			},
			persistedPeer: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: [pullRequestUrl],
				pullRequestBranchName: 'feature',
				associatedPullRequestUrls: [pullRequestUrl],
			},
		});
	}));

	test('recording a PR from a peer chat updates only its folder when automatic attachment is off', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitHubState: { owner: 'contoso', repo: 'main' } });
		const peer = buildChatUri(SESSION, 'peer');
		const peerDirectory = 'file:///peer';
		const url = 'https://github.com/microsoft/vscode/pull/1';
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [peerDirectory] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequest(1, { url }));
		const group = createArtifactServerToolGroup({
			isEnabled: () => true,
			persist: () => { },
			associatePullRequest: (chat, pullRequestUrl) => h.service.associateRecordedPullRequest(chat, pullRequestUrl),
		});

		await group.execute(h.stateManager, { sessionUri: SESSION, chatUri: peer }, ArtifactServerToolName.AddArtifactOrReference, {
			items: [{ type: 'pullRequest', label: 'Feature PR', isArtifact: true, link: url }],
		});

		assert.deepStrictEqual({
			artifacts: readSessionArtifacts(h.stateManager.getSessionState(SESSION)?._meta).map(({ id: _id, ...artifact }) => artifact),
			mainFolder: h.service.getGitHubState(SESSION),
			peerFolder: h.service.getGitHubState(peer),
		}, {
			artifacts: [{ chat: peer, type: SessionArtifactType.PullRequest, label: 'Feature PR', isArtifact: true, link: url, isGitHub: true }],
			mainFolder: { owner: 'contoso', repo: 'main' },
			peerFolder: {
				owner: 'microsoft', repo: 'vscode',
				pullRequestUrls: [url], pullRequestBranchName: 'feature', associatedPullRequestUrls: [url],
			},
		});
	}));

	test('reconciles a pending peer PR after a session is restored without automatic attachment', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const url = 'https://github.com/microsoft/vscode/pull/1';
		const peer = buildChatUri(SESSION, 'peer');
		const workingDirectory = 'file:///peer';
		const artifact = pullRequestArtifactForChat(1, peer);
		const first = createHarness({ autoAttachPullRequests: false });
		seedSession(first.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [artifact] });
		first.stateManager.addChat(SESSION, peer, { workingDirectories: [workingDirectory] });
		await first.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		first.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });

		const associatedBeforeRestore = await first.service.associateRecordedPullRequest(peer, url);
		const pendingBeforeRestore = JSON.parse(await first.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS) ?? '[]');

		const restored = createHarness({ autoAttachPullRequests: false, database: first.db });
		seedSession(restored.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [artifact] });
		restored.stateManager.addChat(SESSION, peer, { workingDirectories: [workingDirectory] });
		await restored.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		restored.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		restored.setPullRequest('feature', createTestPullRequest(1, { url }));

		await restored.service.reconcilePendingRecordedPullRequests(SESSION, true);

		assert.deepStrictEqual({
			associatedBeforeRestore,
			pendingBeforeRestore,
			restoredPeer: restored.service.getGitHubState(peer),
			pendingAfterRestore: await first.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
			lookups: restored.pullRequestCandidateCalls,
		}, {
			associatedBeforeRestore: false,
			pendingBeforeRestore: [{
				chat: peer,
				folderKey: getWorkingDirectoryKey(workingDirectory),
				workingDirectory,
				url, owner: 'microsoft', repo: 'vscode', branchName: 'feature',
			}],
			restoredPeer: {
				owner: 'microsoft', repo: 'vscode',
				pullRequestUrls: [url], pullRequestBranchName: 'feature', associatedPullRequestUrls: [url],
			},
			pendingAfterRestore: undefined,
			lookups: [[url]],
		});
	}));

	test('keeps a recorded PR pending after a temporary GitHub failure and retries for its folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const peer = buildChatUri(SESSION, 'peer');
		const url = pullRequestArtifact(1).link;
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [pullRequestArtifactForChat(1, peer)] });
		h.stateManager.addChat(SESSION, peer, { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequest(1, { url }));
		let failOnce = true;
		h.setOnPullRequestLookup(async () => {
			if (failOnce) {
				failOnce = false;
				throw new Error('GitHub unavailable');
			}
		});

		const recorded = await h.service.associateRecordedPullRequests(peer, [url]);
		const pendingAfterFailure = JSON.parse(await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS) ?? '[]');
		await h.service.reconcilePendingRecordedPullRequests(peer);

		assert.deepStrictEqual({
			recorded,
			pendingAfterFailure,
			afterRetry: h.service.getGitHubState(peer),
			pendingAfterRetry: await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
			lookups: h.pullRequestCandidateCalls,
		}, {
			recorded: { associated: undefined, pending: [url], unmatched: [] },
			pendingAfterFailure: [{ chat: peer, folderKey: getWorkingDirectoryKey('file:///peer'), workingDirectory: 'file:///peer', url, owner: 'microsoft', repo: 'vscode', branchName: 'feature' }],
			afterRetry: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: [url], pullRequestBranchName: 'feature', associatedPullRequestUrls: [url] },
			pendingAfterRetry: undefined,
			lookups: [[url], [url]],
		});
	}));

	test('retries a pending peer PR when that chat Git state refreshes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const peer = buildChatUri(SESSION, 'peer');
		const url = 'https://github.com/microsoft/vscode/pull/1';
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [pullRequestArtifactForChat(1, peer)] });
		h.stateManager.addChat(SESSION, peer, { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		await h.service.associateRecordedPullRequest(peer, url);
		h.setPullRequest('feature', createTestPullRequest(1, { url }));
		const associated = Event.toPromise(h.service.onDidChangeSessionGitHubState);

		await h.service.refreshSessionGitState(peer, URI.parse('file:///peer'));
		await associated;

		assert.deepStrictEqual({
			peer: h.service.getGitHubState(peer),
			main: h.service.getGitHubState(SESSION),
			pending: await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
		}, {
			peer: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: [url], pullRequestBranchName: 'feature', associatedPullRequestUrls: [url] },
			main: undefined,
			pending: undefined,
		});
	}));

	test('verifies recorded PRs in one batch and drops the pending intent when the artifact is removed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const peer = buildChatUri(SESSION, 'peer');
		const urls = [pullRequestArtifact(1).link, pullRequestArtifact(2).link];
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [pullRequestArtifactForChat(1, peer), pullRequestArtifactForChat(2, peer)] });
		h.stateManager.addChat(SESSION, peer, { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		const before = await h.service.associateRecordedPullRequests(peer, urls);
		h.setPullRequest('feature', createTestPullRequest(1, { url: urls[0] }));

		await h.service.reconcilePendingRecordedPullRequests(SESSION);
		const beforePeerRefresh = h.service.getGitHubState(peer);
		await h.service.reconcilePendingRecordedPullRequests(peer);
		const after = h.service.getGitHubState(peer);
		h.stateManager.setSessionMeta(SESSION, withSessionArtifacts(h.stateManager.getSessionState(SESSION)?._meta, []));
		await h.service.reconcilePendingRecordedPullRequests(peer);

		assert.deepStrictEqual({
			before,
			beforePeerRefresh,
			lookups: h.pullRequestCandidateCalls,
			after,
			pending: await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
		}, {
			before: { associated: undefined, pending: urls, unmatched: [] },
			beforePeerRefresh: { owner: 'microsoft', repo: 'vscode' },
			lookups: [urls, urls],
			after: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: [urls[0]], pullRequestBranchName: 'feature', associatedPullRequestUrls: [urls[0]] },
			pending: undefined,
		});
	}));

	test('reconciles pending PRs independently for chats sharing a folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const defaultChat = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		const urls = [pullRequestArtifact(1).link, pullRequestArtifact(2).link];
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			artifacts: [pullRequestArtifactForChat(1, defaultChat), pullRequestArtifactForChat(2, peer)],
		});
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [WORKING_DIRECTORY] });
		await h.service.setSessionGitHubState(defaultChat, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequest(2, { url: urls[1] }));

		const defaultResult = await h.service.associateRecordedPullRequests(defaultChat, [urls[0]]);
		const peerResult = await h.service.associateRecordedPullRequests(peer, [urls[1]]);

		assert.deepStrictEqual({
			defaultResult,
			peerResult,
			gitHubState: h.service.getGitHubState(peer),
			pending: await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
			lookups: h.pullRequestCandidateCalls,
		}, {
			defaultResult: { associated: undefined, pending: [urls[0]], unmatched: [] },
			peerResult: { associated: urls[1], pending: [], unmatched: [] },
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: [urls[1]],
				pullRequestBranchName: 'feature',
				associatedPullRequestUrls: [urls[1]],
			},
			pending: JSON.stringify([{
				chat: defaultChat,
				folderKey: getWorkingDirectoryKey(WORKING_DIRECTORY),
				workingDirectory: WORKING_DIRECTORY,
				url: urls[0],
				owner: 'microsoft',
				repo: 'vscode',
				branchName: 'feature',
			}]),
			lookups: [[urls[0]], [urls[0]], [urls[1]]],
		});
	}));

	test('reports the invoking chat association when another chat PR resolves first', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const defaultChat = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		const urls = [pullRequestArtifact(1).link, pullRequestArtifact(2).link];
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			artifacts: [pullRequestArtifactForChat(1, defaultChat), pullRequestArtifactForChat(2, peer)],
		});
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [WORKING_DIRECTORY] });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		await h.db.setMetadata(META_PENDING_RECORDED_PULL_REQUESTS, JSON.stringify([
			{
				chat: defaultChat,
				folderKey: getWorkingDirectoryKey(WORKING_DIRECTORY),
				workingDirectory: WORKING_DIRECTORY,
				url: urls[0],
				owner: 'microsoft',
				repo: 'vscode',
				branchName: 'feature',
			},
			{
				chat: peer,
				folderKey: getWorkingDirectoryKey(WORKING_DIRECTORY),
				workingDirectory: WORKING_DIRECTORY,
				url: urls[1],
				owner: 'microsoft',
				repo: 'vscode',
				branchName: 'feature',
			},
		]));
		let lookup = 0;
		h.setOnPullRequestLookup(async () => {
			const number = ++lookup;
			h.setPullRequest('feature', createTestPullRequest(number, { url: urls[number - 1] }));
		});

		const result = await h.service.associateRecordedPullRequests(peer, [urls[1]]);

		assert.deepStrictEqual({
			result,
			folderState: h.service.getGitHubState(peer),
			pending: await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
		}, {
			result: { associated: urls[1], pending: [], unmatched: [] },
			folderState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: [urls[1], urls[0]],
				pullRequestBranchName: 'feature',
				associatedPullRequestUrls: [urls[1], urls[0]],
			},
			pending: undefined,
		});
	}));

	test('keeps duplicate pending PR URLs independent across chats sharing a folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const defaultChat = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		const url = pullRequestArtifact(1).link;
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			artifacts: [pullRequestArtifactForChat(1, defaultChat), pullRequestArtifactForChat(1, peer)],
		});
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [WORKING_DIRECTORY] });
		await h.service.setSessionGitHubState(defaultChat, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });

		await h.service.associateRecordedPullRequests(defaultChat, [url]);
		await h.service.associateRecordedPullRequests(peer, [url]);

		assert.deepStrictEqual(JSON.parse(await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS) ?? '[]'), [
			{
				chat: defaultChat,
				folderKey: getWorkingDirectoryKey(WORKING_DIRECTORY),
				workingDirectory: WORKING_DIRECTORY,
				url,
				owner: 'microsoft',
				repo: 'vscode',
				branchName: 'feature',
			},
			{
				chat: peer,
				folderKey: getWorkingDirectoryKey(WORKING_DIRECTORY),
				workingDirectory: WORKING_DIRECTORY,
				url,
				owner: 'microsoft',
				repo: 'vscode',
				branchName: 'feature',
			},
		]);
	}));

	test('invalidates a pending PR when the chat switches to another branch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const peer = buildChatUri(SESSION, 'peer');
		const url = pullRequestArtifact(1).link;
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [pullRequestArtifactForChat(1, peer)] });
		h.stateManager.addChat(SESSION, peer, { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		await h.service.associateRecordedPullRequests(peer, [url]);
		h.setGitResult({ branchName: 'other', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('other', createTestPullRequest(1, { url }));

		await h.service.reconcilePendingRecordedPullRequests(peer);

		assert.deepStrictEqual({
			peer: h.service.getGitHubState(peer),
			pending: await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
			lookups: h.pullRequestCandidateCalls,
		}, {
			peer: { owner: 'microsoft', repo: 'vscode' },
			pending: undefined,
			lookups: [[url]],
		});
	}));

	test('does not associate a recorded PR after the chat switches branches during verification', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const peer = buildChatUri(SESSION, 'peer');
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [pullRequestArtifactForChat(1, peer)] });
		h.stateManager.addChat(SESSION, peer, { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequest(1));
		h.setOnPullRequestLookup(async () => h.setGitResult({ branchName: 'other', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' }));

		const associated = await h.service.associateRecordedPullRequest(peer, 'https://github.com/microsoft/vscode/pull/1');

		assert.deepStrictEqual({ associated, peerFolder: h.service.getGitHubState(peer) }, {
			associated: false,
			peerFolder: { owner: 'microsoft', repo: 'vscode' },
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

	test('uses folder-scoped base branches after moving only the main chat to another workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			project: 'file:///repo-a',
			isolation: 'worktree',
			baseBranch: 'release-A',
			gitState: { branchName: 'agents/original', baseBranchName: 'release-A' },
		});
		const main = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		const replacement = 'file:///repo-b';
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [WORKING_DIRECTORY] });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: replacement });
		h.stateManager.dispatchServerAction(main, { type: ActionType.ChatWorkingDirectorySet, directory: replacement });
		await h.service.setFolderGitState(SESSION, [replacement], { branchName: 'feature-b', baseBranchName: 'main' });
		await h.db.setMetadata(META_DIFF_BASE_BRANCH, 'origin/release-A');

		const resolved = await Promise.all([main, peer, SESSION].map(key => h.service.resolveSessionBaseBranchName(key)));
		await h.service.refreshSessionGitState(main, undefined);
		await h.service.refreshSessionGitState(peer, undefined);
		await h.service.refreshSessionGitState(SESSION, undefined);

		assert.deepStrictEqual({
			resolved,
			directories: h.gitCalls,
			baseBranches: h.gitBaseBranches,
		}, {
			resolved: ['main', 'release-A', 'release-A'],
			directories: [replacement, WORKING_DIRECTORY, WORKING_DIRECTORY],
			baseBranches: ['main', 'release-A', 'release-A'],
		});
	}));

	test('uses the destination base after clearing a moved peer baseline without changing its sibling', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			project: 'file:///repo-a',
			isolation: 'worktree',
			baseBranch: 'release-A',
		});
		const main = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		const replacement = 'file:///repo-b';
		h.stateManager.addChat(SESSION, peer, { workingDirectories: [replacement] });
		await h.service.setFolderGitState(SESSION, [replacement], { branchName: 'feature-b', baseBranchName: 'main' });
		await h.db.setMetadata(META_DIFF_BASE_BRANCH, '');

		assert.deepStrictEqual(await Promise.all([peer, main].map(key => h.service.resolveSessionBaseBranchName(key))), ['main', 'release-A']);
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
			const query = new class extends mock<IGitHubQuery>() {
				override async findPullRequestByHeadBranch({ owner, repo }: GitHubRepositoryRef, branch: string, headOwner: string | undefined) {
					calls.push({ owner, repo, branch, headOwner });
					return createTestPullRequest(1);
				}
			}();
			const authenticationService: IAgentHostAuthenticationService = {
				_serviceBrand: undefined,
				onDidChangeAuthToken: Event.None,
				getAuthAccount: () => undefined,
				getAuthToken: () => 'token',
			};
			const h = createHarness({ query, authenticationService });
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
			h.setPullRequest('remote-name', createTestPullRequest(1));

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
			h.setPullRequest('feature', createTestPullRequest(2, { state: 'open' }));

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

	test('reports the automatic attachment experiment trigger where the modes diverge, in both modes', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const repository: ISessionGitHubState = { owner: 'microsoft', repo: 'vscode' };
			const currentPullRequest = 'https://github.com/microsoft/vscode/pull/2';
			const cases = {
				'feature branch': { gitState: { branchName: 'feature', baseBranchName: 'main' }, gitHubState: repository },
				'feature branch with an explicitly associated PR': { gitState: { branchName: 'feature', baseBranchName: 'main' }, gitHubState: { ...repository, pullRequestUrls: [currentPullRequest], associatedPullRequestUrls: [currentPullRequest], pullRequestBranchName: 'feature' } },
				'feature branch with an automatically attached PR': { gitState: { branchName: 'feature', baseBranchName: 'main' }, gitHubState: { ...repository, pullRequestUrls: [currentPullRequest], pullRequestBranchName: 'feature' } },
				'base branch with an automatically attached PR': { gitState: { branchName: 'main', baseBranchName: 'main' }, gitHubState: { ...repository, pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature' } },
				'base branch': { gitState: { branchName: 'main', baseBranchName: 'main' }, gitHubState: repository },
			} satisfies Record<string, { gitState: ISessionGitState; gitHubState: ISessionGitHubState }>;
			const triggers: Record<string, readonly string[]> = {};
			for (const autoAttachPullRequests of [true, false]) {
				for (const [name, { gitState, gitHubState }] of Object.entries(cases)) {
					const telemetryService = new TestExperimentTriggerTelemetryService();
					const h = createHarness({ autoAttachPullRequests, telemetryService });
					h.configurationService.publishRootTransientValues({ [CopilotCliVSCodeAssignmentContextKey]: 'assignment-context' });
					seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState, gitHubState });
					h.setGitResult(gitState);

					await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
					triggers[`${autoAttachPullRequests ? 'automatic' : 'restricted'} ${name}`] = telemetryService.triggers;
				}
			}

			const trigger = [`config.${AgentHostAutoAttachPullRequestsSettingId}`];
			// An explicitly associated PR of the current branch is kept, unresolved, in both modes.
			assert.deepStrictEqual(triggers, {
				'automatic feature branch': trigger,
				'automatic feature branch with an explicitly associated PR': [],
				'automatic feature branch with an automatically attached PR': trigger,
				'automatic base branch with an automatically attached PR': trigger,
				'automatic base branch': [],
				'restricted feature branch': trigger,
				'restricted feature branch with an explicitly associated PR': [],
				'restricted feature branch with an automatically attached PR': trigger,
				'restricted base branch with an automatically attached PR': trigger,
				'restricted base branch': [],
			});
		});
	});

	test('holds the automatic attachment experiment trigger until the assignment context arrives', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness({ telemetryService });
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState, gitHubState: { owner: 'microsoft', repo: 'vscode' } });
			h.setGitResult(gitState);

			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
			const beforeContext = [...telemetryService.triggers];
			h.configurationService.publishRootTransientValues({ [CopilotCliVSCodeAssignmentContextKey]: 'assignment-context' });
			await Promise.resolve();

			assert.deepStrictEqual({ beforeContext, afterContext: telemetryService.triggers }, {
				beforeContext: [],
				afterContext: [`config.${AgentHostAutoAttachPullRequestsSettingId}`],
			});
		});
	});

	test('reports the automatic attachment experiment trigger for peer-folder lookups only while the branch has no PR', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const peerGitState: ISessionGitState = { branchName: 'peer-feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' };
			const triggers: Record<string, readonly string[]> = {};
			for (const autoAttachPullRequests of [true, false]) {
				for (const [name, peerGitHubState] of Object.entries({
					'without a PR': { owner: 'microsoft', repo: 'vscode' },
					'with its PR': { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2'], pullRequestBranchName: 'peer-feature' },
				} satisfies Record<string, ISessionGitHubState>)) {
					const telemetryService = new TestExperimentTriggerTelemetryService();
					const h = createHarness({ autoAttachPullRequests, telemetryService });
					h.configurationService.publishRootTransientValues({ [CopilotCliVSCodeAssignmentContextKey]: 'assignment-context' });
					const peer = buildChatUri(SESSION, 'peer');
					const peerFolder = 'file:///peer';
					seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main', baseBranchName: 'main' }, gitHubState: { owner: 'microsoft', repo: 'vscode' } });
					h.stateManager.addChat(SESSION, peer, { workingDirectories: [peerFolder] });
					await h.service.setSessionGitHubState(peer, peerGitHubState);
					h.setGitResult(peerGitState);

					await h.service.attachSessionGitHubPullRequest(peer, URI.parse(peerFolder));
					triggers[`${autoAttachPullRequests ? 'automatic' : 'restricted'} ${name}`] = telemetryService.triggers;
				}
			}

			const trigger = [`config.${AgentHostAutoAttachPullRequestsSettingId}`];
			assert.deepStrictEqual(triggers, {
				'automatic without a PR': trigger,
				'automatic with its PR': [],
				'restricted without a PR': trigger,
				'restricted with its PR': [],
			});
		});
	});

	test('a peer-folder lookup keeps the peer PR when automatic attachment is disabled', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const sessionGitState: ISessionGitState = { branchName: 'session-feature', baseBranchName: 'main' };
			const peerGitState: ISessionGitState = { branchName: 'peer-feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' };
			const sessionGitHubState: ISessionGitHubState = { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'session-feature' };
			const peerGitHubState: ISessionGitHubState = {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2'],
				associatedPullRequestUrls: ['https://github.com/microsoft/vscode/pull/2'],
				pullRequestBranchName: 'peer-feature',
			};
			const h = createHarness({ autoAttachPullRequests: false });
			const peer = buildChatUri(SESSION, 'peer');
			const peerFolder = 'file:///peer';
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState: sessionGitState,
				gitHubState: sessionGitHubState,
				artifacts: [pullRequestArtifact(1), pullRequestArtifact(2)],
			});
			h.stateManager.addChat(SESSION, peer, { workingDirectories: [peerFolder] });
			await h.service.setSessionGitHubState(peer, peerGitHubState);
			h.setGitResult(peerGitState);
			h.setPullRequest('session-feature', createTestPullRequest(1, { state: 'closed' }));

			await h.service.attachSessionGitHubPullRequest(peer, URI.parse(peerFolder));

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				peer: h.service.getGitHubState(peer),
				session: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCalls: [],
				peer: peerGitHubState,
				session: sessionGitHubState,
			});
		});
	});

	test('applies restricted PR state when candidate lookup fails', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
			const h = createHarness({
				autoAttachPullRequests: false,
				query: new class extends mock<IGitHubQuery>() {
					override async findPullRequestByHeadBranch(): Promise<never> { throw new Error('GitHub unavailable'); }
				}(),
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
				query: new class extends mock<IGitHubQuery>() {
					override async findPullRequestByHeadBranch(_ref: GitHubRepositoryRef, branch: string, headOwner: string | undefined) {
						calls.push({ branch, headOwner });
						return createTestPullRequest(328975);
					}
				}(),
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
			h.setPullRequestForSha('1ce2c20d3dcb593273f604b077240543d494e276', createTestPullRequest(2));

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
			h.setPullRequest('feature', createTestPullRequest(1, { createdAt: new Date(1_000).toISOString() }));

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
			h.setPullRequest('feature', createTestPullRequest(1, { url: pullRequestUrl, createdAt: new Date(1_000).toISOString() }));
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
			h.setPullRequest('feature', createTestPullRequest(2, { createdAt: new Date(600_500).toISOString() }));
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
			h.setPullRequest('feature', createTestPullRequest(1, { createdAt: new Date(1_000).toISOString() }));

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
			h.setPullRequest('feature', createTestPullRequest(1));

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

			h.setPullRequest('feature-2', createTestPullRequest(2));
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
				h.setPullRequest('feature', createTestPullRequest(1));
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
			h.setPullRequest('feature', createTestPullRequest(1));

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
			h.setPullRequest('feature', createTestPullRequest(1));
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
			h.setPullRequest('feature-2', createTestPullRequest(2));

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
