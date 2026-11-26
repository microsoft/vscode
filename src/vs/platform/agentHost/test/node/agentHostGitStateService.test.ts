/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { constObservable } from '../../../../base/common/observable.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IFileService } from '../../../files/common/files.js';
import { RepositoryRef } from '../../../github/common/client/types.js';
import { IPullRequestsClient, ListPullRequestsOptions, PullRequestSummary } from '../../../github/common/core/pullRequests.js';
import { GitHubRequestError } from '../../../github/common/githubTypes.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { TestExperimentTriggerTelemetryService } from '../../../telemetry/test/common/experimentTriggerTestUtils.js';
import { GITHUB_REPO_PROTECTED_RESOURCE, type IAgent, type IAgentHostAuthTokenRequest } from '../../common/agent.js';
import { isAuthRequiredError, type IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { META_GITHUB_DATA_STATE, META_GIT_DATA_STATE, META_GIT_STATE, META_PENDING_RECORDED_PULL_REQUESTS, META_SOURCE_CONTROL_STATE } from '../../common/agentHostGitStateService.js';
import { AgentHostAutoAttachPullRequestsConfigKey } from '../../common/agentHostSchema.js';
import { SessionStateMirrorFlush, sessionStatePatch } from '../../common/agentHostSessionStateStore.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { AgentHostAutoAttachPullRequestsSettingId } from '../../common/agentService.js';
import { buildFolderChangesetOwnerUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { CopilotCliVSCodeAssignmentContextKey } from '../../common/copilotCliConfig.js';
import { ArtifactServerToolName } from '../../common/serverToolNames.js';
import { SessionArtifactType, readSessionArtifacts, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import type { ISessionDataService } from '../../common/sessionDataService.js';
import { ChangesetOperationTargetKind } from '../../common/state/protocol/channels-changeset/commands.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { SESSION_META_GITHUB_DATA_KEY, SESSION_META_GITHUB_KEY, SessionSourceControlOutcome, SessionStatus, buildChatUri, buildDefaultChatUri, buildSubagentSessionUri, getAllSessionRelatedPullRequestUrls, getSessionRelatedPullRequestUrls, readFolderScopeGitState, readSessionGitHubData, readSessionGitHubState, readSessionGitHubStateInput, readSessionGitState, readSessionSourceControlState, withFolderScopeGitState, withInitialSessionPullRequest, withMigratedSessionGitHubState, withMostRecentRelatedSessionPullRequest, withMostRecentSessionPullRequest, withReplacedFolderGitHubState, withSessionGitHubState, withSessionGitState, readFolderGitHubState, withSessionMultiRootMetadata, type ISessionGitHubState, type ISessionGitState } from '../../common/state/sessionState.js';
import { readSessionNonRepositoryFolders } from '../../common/meta/agentSessionNonRepositoryFoldersMeta.js';
import { readSessionRepositories } from '../../common/meta/agentSessionRepositoriesMeta.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostAuthenticationScope } from '../../node/agentHostAuthenticationScope.js';
import { AgentHostAuthenticationService, type IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { getFolderOnlyAgentMergeRoots, resolveAgentMergeOwningChat, resolveGitHubStateFolder } from '../../node/agentHostBranchChangesetScope.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostDiscardChangesOperationHandler } from '../../node/agentHostDiscardChangesOperationHandler.js';
import { AgentHostFileEditCoordinator } from '../../node/agentHostFileEditCoordinator.js';
import { AgentHostFileEditRevert } from '../../node/agentHostFileEditRevert.js';
import { AgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { AgentHostGitStateService } from '../../node/agentHostGitStateService.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { createArtifactServerToolGroup } from '../../node/shared/artifactServerTools.js';
import { TestSessionDatabase, createNoopChangesetService, createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestSessionStateStore } from './chatMetadataTestHelpers.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { InProcessDiffComputeService } from './inProcessDiffComputeService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { createTestGitHubService, createTestPullRequestSummary } from './testGitHubService.js';

const SESSION = 'mock:/session-1';
const WORKING_DIRECTORY = 'file:///wd';

type PullRequestArtifact = ISessionArtifact & { readonly link: string };

/** Reads the persisted GitHub state of the session folder. */
async function readPersistedSessionGitHubState(db: TestSessionDatabase, whenMirrored: () => Promise<void>): Promise<ISessionGitHubState | undefined> {
	await whenMirrored();
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

	function createHarness(options?: { query?: IPullRequestsClient; authenticationService?: IAgentHostAuthenticationService; realCredentials?: boolean; enterpriseUri?: string; autoAttachPullRequests?: boolean; telemetryService?: ITelemetryService; database?: TestSessionDatabase; chatDatabases?: ReadonlyMap<string, TestSessionDatabase> }) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const db = options?.database ?? new TestSessionDatabase();
		const baseSessionDataService = createSessionDataService(db);
		// Peer chats own their database in production; route those URIs to their own test database.
		const dataServiceFor = (session: URI) => {
			const chatDatabase = options?.chatDatabases?.get(session.toString());
			return chatDatabase ? createSessionDataService(chatDatabase) : baseSessionDataService;
		};
		const sessionDataService: ISessionDataService = {
			...baseSessionDataService,
			openDatabase: session => dataServiceFor(session).openDatabase(session),
			tryOpenDatabase: session => dataServiceFor(session).tryOpenDatabase(session),
		};
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
		const gitResultsByFolder = new Map<string, ISessionGitState | undefined | Promise<ISessionGitState | undefined>>();
		const gitService: { -readonly [K in keyof IAgentHostGitService]: IAgentHostGitService[K] } = {
			...createNoopGitService(),
			getSessionGitState: async (workingDirectory: URI, baseBranchName?: string) => {
				gitCalls.push(workingDirectory.toString());
				gitBaseBranches.push(baseBranchName);
				if (gitError) {
					throw gitError;
				}
				if (gitResultsByFolder.has(workingDirectory.toString())) {
					return gitResultsByFolder.get(workingDirectory.toString());
				}
				return gitResultPromise ?? gitResult;
			},
			revParse: async () => headSha,
		};
		const statusLogs: string[] = [];
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override info(message: string) { statusLogs.push(message); }
			override error(message: string) { errors.push(message); }
		}();

		const pullRequestCalls: string[] = [];
		const pullRequestShaCalls: string[] = [];
		const pullRequestPageSizes: Array<number | undefined> = [];
		const pullRequestsByBranch = new Map<string, PullRequestSummary>();
		const pullRequestsBySha = new Map<string, PullRequestSummary>();
		let onPullRequestLookup: ((branch: string) => Promise<void>) | undefined;
		const query = new class extends mock<IPullRequestsClient>() {
			override async list(_repository: RepositoryRef, _signal: CancellationToken, options?: ListPullRequestsOptions) {
				const head = options?.query?.head;
				assert.ok(head);
				const branch = head.slice(head.indexOf(':') + 1);
				pullRequestCalls.push(branch);
				pullRequestPageSizes.push(options?.query?.per_page);
				await onPullRequestLookup?.(branch);
				const pullRequest = pullRequestsByBranch.get(branch);
				return pullRequest ? [pullRequest] : [];
			}
			override async listForCommit(_repository: RepositoryRef, sha: string) {
				pullRequestShaCalls.push(sha);
				const pullRequest = pullRequestsBySha.get(sha);
				return pullRequest ? [{ ...pullRequest, head: { ...pullRequest.head, sha: sha } }] : [];
			}
		}();
		const authenticationService = options?.authenticationService ?? disposables.add(options?.realCredentials
			? new AgentHostAuthenticationService(logService)
			: new class extends AgentHostAuthenticationService {
				override getAuthToken(request: Parameters<IAgentHostAuthenticationService['getAuthToken']>[0], source?: IAgentHostCredentialSource) {
					return source ? source.getCredential(request)?.token : 'token';
				}
			}(logService));
		const repositoryCalls: string[] = [];
		const apiService = createTestGitHubService(undefined, undefined, { pullRequests: options?.query ?? query });
		const endpointService = createTestGitHubEndpointService(options?.enterpriseUri);
		const gitHubService = options?.realCredentials
			? disposables.add(new class extends AgentHostGitHubService {
				override acquireRepositoryApiClient(cancellationToken: CancellationToken, _source?: IAgentHostCredentialSource, session?: string) {
					repositoryCalls.push(session ?? 'legacy');
					return apiService.acquireRepositoryApiClient(cancellationToken);
				}
			}({ fetch: async () => { throw new Error('Unexpected GitHub network request'); } }, authenticationService, endpointService, logService, NullTelemetryService))
			: apiService;

		const centralDatabase = disposables.add(new AgentHostDatabase(':memory:'));
		const stateStore = createTestSessionStateStore(centralDatabase, sessionDataService);
		const service = disposables.add(new AgentHostGitStateService(
			stateManager,
			gitService,
			gitHubService,
			authenticationService,
			endpointService,
			logService,
			configurationService,
			options?.telemetryService ?? NullTelemetryService,
			createTestChatOwnershipService(stateManager),
			stateStore,
		));

		const runEvents: string[] = [];
		disposables.add(service.onDidRefreshSessionGitState(key => runEvents.push(key)));
		const gitHubStateEvents: string[] = [];
		disposables.add(service.onDidChangeSessionGitHubState(key => gitHubStateEvents.push(key)));

		return {
			stateManager,
			db,
			centralDatabase,
			stateStore,
			whenStateStoreIdle: async () => {
				// Queued writers may only reach the store after earlier async steps, so drain repeatedly.
				for (let i = 0; i < 5; i++) {
					await stateStore.whenIdle(undefined);
				}
			},
			service,
			configurationService,
			authenticationService,
			gitService,
			repositoryCalls,
			statusLogs,
			errors,
			gitCalls,
			gitBaseBranches,
			runEvents,
			gitHubStateEvents,
			pullRequestCalls,
			pullRequestShaCalls,
			pullRequestPageSizes,
			setGitResult: (state: ISessionGitState | undefined) => { gitResult = state; },
			setGitResultForFolder: (folder: string, state: ISessionGitState | undefined | Promise<ISessionGitState | undefined>) => { gitResultsByFolder.set(folder, state); },
			setGitResultPromise: (promise: Promise<ISessionGitState | undefined> | undefined) => { gitResultPromise = promise; },
			setGitError: (error: Error) => { gitError = error; },
			setHeadSha: (sha: string | undefined) => { headSha = sha; },
			setPullRequest: (branch: string, pullRequest: PullRequestSummary) => { pullRequestsByBranch.set(branch, pullRequest); },
			setPullRequestForSha: (sha: string, pullRequest: PullRequestSummary) => { pullRequestsBySha.set(sha, pullRequest); },
			setOnPullRequestLookup: (fn: (branch: string) => Promise<void>) => { onPullRequestLookup = fn; },
		};
	}

	function seedSession(stateManager: AgentHostStateManager, options?: { workingDirectory?: string; project?: string; gitState?: ISessionGitState; gitHubState?: ISessionGitHubState; artifacts?: readonly ISessionArtifact[]; isolation?: 'folder' | 'worktree'; baseBranch?: string; pullRequestUrl?: string; createdAt?: number }): void {
		const summary = {
			resource: SESSION,
			defaultChat: buildDefaultChatUri(SESSION),
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
		stateManager.restoreSession(summary, [], creationTimeChatStorageResource);
		if (options?.isolation) {
			stateManager.setSessionConfig(SESSION, {
				schema: { type: 'object', properties: {} },
				values: {
					[SessionConfigKey.Isolation]: options.isolation,
					...(options.baseBranch ? { [SessionConfigKey.Branch]: options.baseBranch } : {}),
					...(options.pullRequestUrl !== undefined ? { [SessionConfigKey.PullRequestUrl]: options.pullRequestUrl } : {}),
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

	for (const unavailable of ['restored', 'disconnected'] as const) {
		test(`refreshes local Git state and preserves associations with a ${unavailable} sponsor`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const authentication = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
			const h = createHarness({ realCredentials: true, autoAttachPullRequests: false, authenticationService: authentication });
			const principal = { apiOrigin: 'https://api.github.com', userId: '101' };
			const gitHubState = { owner: 'microsoft', repo: 'vscode', pullRequestUrls: [pullRequestArtifact(1).link], pullRequestBranchName: 'old' };
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'old', uncommittedChanges: 0 }, gitHubState });
			const provider = new class extends mock<IAgent>() {
				override getProtectedResources() { return [GITHUB_REPO_PROTECTED_RESOURCE]; }
				override async authenticate() { return true; }
			}();
			await authentication.authenticate({ resource: GITHUB_REPO_PROTECTED_RESOURCE.resource, scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported, token: 'legacy-token' }, [provider]);
			if (unavailable === 'restored') {
				h.authenticationService.restoreSessionCredentialPrincipal(SESSION, principal);
			} else {
				const scope = disposables.add(new AgentHostAuthenticationScope(async params => params, () => { }, principal));
				await scope.authenticate({ resource: GITHUB_REPO_PROTECTED_RESOURCE.resource, scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported, token: 'scoped-token' }, [GITHUB_REPO_PROTECTED_RESOURCE.resource]);
				h.authenticationService.bindSessionCredentials(SESSION, scope);
				scope.dispose();
			}
			const gitState = { branchName: 'new', uncommittedChanges: 2, githubOwner: 'microsoft', githubRepo: 'vscode' };
			h.setGitResult(gitState);
			await h.service.attachSessionGitHubPullRequest(SESSION);
			await h.service.refreshSessionGitState(SESSION);
			assert.deepStrictEqual({
				gitState: h.service.getSessionGitState(SESSION),
				gitHubState: h.service.getGitHubState(SESSION),
				repositoryCalls: h.repositoryCalls,
				gitCalls: h.gitCalls,
				statusLogs: h.statusLogs,
				errors: h.errors,
			}, {
				gitState,
				gitHubState,
				repositoryCalls: [],
				gitCalls: [WORKING_DIRECTORY, WORKING_DIRECTORY],
				statusLogs: [`[AgentHostGitStateService] GitHub lookup skipped for isolated session: sponsor unavailable, key=${SESSION}`],
				errors: [],
			});
		}));
	}

	test('discards tracked changes successfully after the sponsor disconnects', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ realCredentials: true });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		const scope = disposables.add(new AgentHostAuthenticationScope(async params => params, () => { }, { apiOrigin: 'https://api.github.com', userId: '101' }));
		h.authenticationService.bindSessionCredentials(SESSION, scope);
		scope.dispose();
		h.setGitResult({ branchName: 'feature', uncommittedChanges: 0 });
		const resource = URI.parse(`${WORKING_DIRECTORY}/tracked.ts`);
		const channel = buildUncommittedChangesetUri(SESSION);
		h.stateManager.registerChangeset(channel);
		h.stateManager.dispatchServerAction(channel, {
			type: ActionType.ChangesetFileSet,
			file: { id: resource.toString(), edit: { after: { uri: resource.toString(), content: { uri: resource.toString() } } } },
		});
		const refreshed = Event.toPromise(Event.filter(h.service.onDidRefreshSessionGitState, key => key === SESSION));
		const restored: string[] = [];
		const discardFileService = new class extends mock<IFileService>() { }();
		const handler = new AgentHostDiscardChangesOperationHandler(
			key => h.stateManager.getSessionState(key),
			new AgentHostFileEditRevert(discardFileService, new InProcessDiffComputeService()),
			{
				...h.gitService,
				getRepositoryRoot: async () => URI.parse(WORKING_DIRECTORY),
				getUntrackedPaths: async () => [],
				restore: async (_directory, paths) => { restored.push(...paths); },
			},
			discardFileService,
			new NullLogService(), h.stateManager,
			createNoopChangesetService(),
			new InProcessDiffComputeService(), disposables.add(new AgentHostFileEditCoordinator()),
		);
		const result = await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: { kind: ChangesetOperationTargetKind.Resource, resource: `${WORKING_DIRECTORY}/tracked.ts` },
		}, CancellationToken.None);
		// The changeset operation service refreshes the owner's Git state after a discard.
		await h.service.refreshSessionGitState(SESSION, undefined, { force: true, immediate: true });
		await refreshed;
		assert.deepStrictEqual({
			restored,
			success: typeof result.message === 'object' && result.message.markdown.includes('Discarded changes'),
			gitState: h.service.getSessionGitState(SESSION),
			repositoryCalls: h.repositoryCalls,
		}, {
			restored: [URI.file('/wd/tracked.ts').fsPath], success: true,
			gitState: { branchName: 'feature', uncommittedChanges: 0 }, repositoryCalls: [],
		});
	}));

	test('rejects an explicit unavailable sponsor instead of refreshing with legacy credentials', async () => {
		const h = createHarness({ realCredentials: true });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		const scope = disposables.add(new AgentHostAuthenticationScope(async params => params, () => { }, { apiOrigin: 'https://api.github.com', userId: '101' }));
		scope.dispose();
		await assert.rejects(h.service.refreshSessionGitState(SESSION, scope), isAuthRequiredError);
		assert.deepStrictEqual({ gitCalls: h.gitCalls, repositoryCalls: h.repositoryCalls }, { gitCalls: [], repositoryCalls: [] });
	});

	test('does not suppress non-authentication errors from a background sponsor', async () => {
		const h = createHarness({ realCredentials: true });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		const error = new Error('Credential invariant failed');
		h.authenticationService.bindSessionCredentials(SESSION, {
			principal: { apiOrigin: 'https://api.github.com', userId: '101' },
			getCredential: () => { throw error; },
		});
		await assert.rejects(h.service.refreshSessionGitState(SESSION), result => result === error);
		assert.deepStrictEqual({ gitCalls: h.gitCalls, statusLogs: h.statusLogs, errors: h.errors }, {
			gitCalls: [], statusLogs: [], errors: [`[AgentHostGitStateService] Failed to capture credentials for ${SESSION}`],
		});
	});

	test('preserves legacy GitHub enrichment without a credential principal', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const tokenSessions: (string | undefined)[] = [];
		const authentication = disposables.add(new class extends AgentHostAuthenticationService {
			override getAuthToken(request: IAgentHostAuthTokenRequest) {
				tokenSessions.push(request.session);
				return 'legacy-token';
			}
		}(new NullLogService()));
		const h = createHarness({ realCredentials: true, authenticationService: authentication, autoAttachPullRequests: true });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequestSummary(1));
		await h.service.refreshSessionGitState(SESSION);
		assert.deepStrictEqual({ urls: h.service.getGitHubState(SESSION)?.pullRequestUrls, repositoryCalls: h.repositoryCalls, statusLogs: h.statusLogs, tokenSessions }, {
			urls: [pullRequestArtifact(1).link], repositoryCalls: ['legacy'], statusLogs: [], tokenSessions: [SESSION],
		});
	}));

	test('logs sponsor unavailability once per transition rather than on every refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ realCredentials: true });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		h.setGitResult({ branchName: 'feature', uncommittedChanges: 1 });
		const principal = { apiOrigin: 'https://api.github.com', userId: '101' };
		h.authenticationService.restoreSessionCredentialPrincipal(SESSION, principal);
		await h.service.refreshSessionGitState(SESSION);
		await h.service.refreshSessionGitState(SESSION);
		const scope = disposables.add(new AgentHostAuthenticationScope(async params => params, () => { }, principal));
		await scope.authenticate({ resource: GITHUB_REPO_PROTECTED_RESOURCE.resource, scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported, token: 'live-token' }, [GITHUB_REPO_PROTECTED_RESOURCE.resource]);
		h.authenticationService.bindSessionCredentials(SESSION, scope);
		await h.service.refreshSessionGitState(SESSION);
		scope.dispose();
		await h.service.refreshSessionGitState(SESSION);
		assert.deepStrictEqual(h.statusLogs, [
			`[AgentHostGitStateService] GitHub lookup skipped for isolated session: sponsor unavailable, key=${SESSION}`,
			`[AgentHostGitStateService] GitHub lookup skipped for isolated session: sponsor unavailable, key=${SESSION}`,
		]);
	}));

	test('an unavailable chat does not block a live chat recorded pull request association', async () => {
		const h = createHarness({ realCredentials: true, autoAttachPullRequests: false });
		const defaultChat = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		const principal = { apiOrigin: 'https://api.github.com', userId: '101' };
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			artifacts: [pullRequestArtifactForChat(1, defaultChat), pullRequestArtifactForChat(2, peer)],
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
		});
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, defaultChat), { workingDirectories: [WORKING_DIRECTORY] });
		h.authenticationService.restoreSessionCredentialPrincipal(SESSION, principal, defaultChat);
		const scope = disposables.add(new AgentHostAuthenticationScope(async params => params, () => { }, principal));
		await scope.authenticate({ resource: GITHUB_REPO_PROTECTED_RESOURCE.resource, scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported, token: 'live-token' }, [GITHUB_REPO_PROTECTED_RESOURCE.resource]);
		h.authenticationService.bindSessionCredentials(SESSION, scope, peer);
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequestSummary(2));
		const entries = [defaultChat, peer].map((chat, index) => ({
			chat, folderKey: getWorkingDirectoryKey(WORKING_DIRECTORY), workingDirectory: WORKING_DIRECTORY,
			url: pullRequestArtifact(index + 1).link, owner: 'microsoft', repo: 'vscode', branchName: 'feature',
		}));
		await h.db.setMetadata(META_PENDING_RECORDED_PULL_REQUESTS, JSON.stringify(entries));
		await h.service.reconcilePendingRecordedPullRequests(SESSION);
		assert.deepStrictEqual({
			urls: h.service.getGitHubState(peer)?.associatedPullRequestUrls,
			pending: JSON.parse(await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS) ?? '[]'),
			repositoryCalls: h.repositoryCalls,
		}, {
			urls: [pullRequestArtifact(2).link], pending: [entries[0]], repositoryCalls: [peer],
		});
	});

	test('isolated main-chat Git state does not replace the aggregate original folder branch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		const worktree = 'file:///wd.worktrees/isolated';
		const main = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [WORKING_DIRECTORY] });
		await h.service.setFolderGitState(SESSION, [worktree], { branchName: 'isolated' });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: worktree });
		h.stateManager.dispatchServerAction(main, { type: ActionType.ChatWorkingDirectorySet, directory: worktree });
		h.setGitResult({ branchName: 'isolated', uncommittedChanges: 1 });
		await h.service.refreshSessionGitState(main);
		h.setGitResult({ branchName: 'main', uncommittedChanges: 2 });
		await h.service.refreshSessionGitState(SESSION);
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
		await h.service.refreshSessionGitState(SESSION);
		await h.service.refreshSessionGitState(main);
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
		const gitLookupStarted = new DeferredPromise<void>();
		const getSessionGitState = h.gitService.getSessionGitState;
		h.gitService.getSessionGitState = (directory, baseBranch) => {
			gitLookupStarted.complete();
			return getSessionGitState(directory, baseBranch);
		};

		const refresh = h.service.refreshSessionGitState(SESSION);
		await gitLookupStarted.p;
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
		await h.whenStateStoreIdle();
		const persistedAfterMerge = await h.db.getMetadata(META_SOURCE_CONTROL_STATE);

		await h.service.setSessionGitHubState(SESSION, {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequestUrls: ['https://github.com/microsoft/vscode/pull/42'],
			pullRequestBranchName: 'feature',
		});
		const afterPullRequest = readSessionSourceControlState(h.stateManager.getSessionState(SESSION)?._meta);
		// The session.db copy is a coalesced mirror of the committed central value.
		await h.whenStateStoreIdle();
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

		await h.service.refreshSessionGitState(SESSION);

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

		await h.service.refreshSessionGitState(defaultChat);

		assert.deepStrictEqual({
			gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
			persisted: await h.db.getMetadata(META_GIT_STATE),
			runEvents: h.runEvents,
		}, {
			gitState: undefined,
			persisted: undefined,
			// The session whose state the default chat cleared is announced too
			runEvents: [defaultChat, SESSION],
		});
	});

	test('deletes an owned Git key from central state and its mirror', async () => {
		const h = createHarness();
		const defaultChat = buildDefaultChatUri(SESSION);
		const previous: ISessionGitState = { branchName: 'stale-feature', baseBranchName: 'main' };
		seedSession(h.stateManager, { gitState: previous });
		await h.stateStore.writeMetadata(URI.parse(SESSION), URI.parse(SESSION), { [META_GIT_STATE]: JSON.stringify(previous) }, SessionStateMirrorFlush.Immediate);
		await h.stateStore.load(URI.parse(SESSION));
		const before = JSON.parse(h.stateStore.legacyMetadata(URI.parse(SESSION), [META_GIT_STATE]).values[META_GIT_STATE]!);

		await h.service.refreshSessionGitState(defaultChat);
		await h.whenStateStoreIdle();

		assert.deepStrictEqual({
			before,
			central: h.stateStore.legacyMetadata(URI.parse(SESSION), [META_GIT_STATE]).values[META_GIT_STATE],
			mirror: await h.db.getMetadata(META_GIT_STATE),
		}, {
			before: previous,
			central: undefined,
			mirror: undefined,
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
		h.stateManager.addChat(SESSION, chat, creationTimeChatStorageResource(SESSION, chat, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///chat'] });

		const before = h.service.getSessionGitState(chat);
		h.setGitResult(chatGitState);
		await h.service.refreshSessionGitState(chat);
		const afterRefresh = h.service.getSessionGitState(chat);
		// The session.db copy is a coalesced mirror of the committed central value.
		const persistedAfterRefresh = await h.whenStateStoreIdle().then(() => h.db.getMetadata(META_GIT_DATA_STATE));
		h.setGitResult(undefined);
		await h.service.refreshSessionGitState(chat);

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
			// An inconclusive probe observes nothing new.
			runEvents: [chat],
		});
	}));

	test('announces a refresh only when it observed a change, is the first, or is forced', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		const state: ISessionGitState = { branchName: 'feature', baseBranchName: 'main', uncommittedChanges: 1 };
		h.setGitResult(state);
		const announced: Record<string, number> = {};
		const record = async (step: string, refresh: () => Promise<void>) => {
			const before = h.runEvents.length;
			await refresh();
			announced[step] = h.runEvents.length - before;
		};

		await record('first', () => h.service.refreshSessionGitState(SESSION));
		await record('unchanged', () => h.service.refreshSessionGitState(SESSION));
		await record('unchangedAgain', () => h.service.refreshSessionGitState(SESSION));
		h.setGitResult({ ...state, uncommittedChanges: 2 });
		await record('changed', () => h.service.refreshSessionGitState(SESSION));
		await record('forced', () => h.service.refreshSessionGitState(SESSION, undefined, { force: true }));
		h.setGitResult(undefined);
		await record('inconclusive', () => h.service.refreshSessionGitState(SESSION));
		await record('forcedInconclusive', () => h.service.refreshSessionGitState(SESSION, undefined, { force: true }));
		await record('afterForced', () => h.service.refreshSessionGitState(SESSION));

		assert.deepStrictEqual(announced, { first: 1, unchanged: 0, unchangedAgain: 0, changed: 1, forced: 1, inconclusive: 0, forcedInconclusive: 1, afterForced: 0 });
	}));

	test('a forced refresh queued behind an unforced one is still announced', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main' });
		await h.service.refreshSessionGitState(SESSION);
		const before = h.runEvents.length;

		await Promise.all([
			h.service.refreshSessionGitState(SESSION, undefined, { force: true }),
			h.service.refreshSessionGitState(SESSION),
		]);

		assert.strictEqual(h.runEvents.length - before, 1);
	}));

	test('chats of one folder refreshing together share one read of its Git state; forced refreshes share a read only with each other', async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		const addChats = (prefix: string) => Array.from({ length: 12 }, (_, index) => {
			const chat = buildChatUri(SESSION, `${prefix}-${index}`);
			h.stateManager.addChat(SESSION, chat, creationTimeChatStorageResource(SESSION, chat, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///shared'] });
			return chat;
		});
		const overlapping = addChats('overlapping');
		const forced = addChats('forced');
		// Reading Git takes a while, so the chats' refreshes overlap. Each refresh resolves once its read published, without waiting out the cooldown that follows.
		const realTimeout = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
		const read = new DeferredPromise<ISessionGitState | undefined>();
		h.setGitResultPromise(read.p);

		const refreshes = overlapping.map(chat => h.service.refreshSessionGitState(chat));
		await realTimeout(50);
		await read.complete({ branchName: 'feature', baseBranchName: 'main' });
		await realTimeout(50);
		const sharedReads = h.gitCalls.length;
		h.setGitResultPromise(undefined);
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main' });
		refreshes.push(...forced.map(chat => h.service.refreshSessionGitState(chat, undefined, { force: true })));
		await realTimeout(50);
		const forcedReads = h.gitCalls.length - sharedReads;

		await Promise.all(refreshes);
		assert.deepStrictEqual({ sharedReads, forcedReads }, { sharedReads: 1, forcedReads: 1 });
	});

	/**
	 * Seeds a session whose Git state reads take 1000 ms each and return `gitState`. Virtual time runs ahead to the
	 * next timer while a refresh waits for real I/O, so measured refreshes must not wait for any: the session is
	 * loaded into the state store, so reading its base branch does not query the database, and already has
	 * `gitState`, so a read writes nothing.
	 */
	async function seedSessionWithSlowGitReads(h: ReturnType<typeof createHarness>, gitState: ISessionGitState, workingDirectory = WORKING_DIRECTORY): Promise<void> {
		seedSession(h.stateManager, { workingDirectory, gitState });
		await h.stateStore.load(URI.parse(SESSION));
		h.setGitResult(gitState);
		const read = h.gitService.getSessionGitState;
		h.gitService.getSessionGitState = async (directory, baseBranch) => {
			// The result set when the read started.
			const state = read(directory, baseBranch);
			await timeout(1000);
			return state;
		};
	}

	/** Returns how many milliseconds the caller of `refresh` waits for it. */
	async function measure(refresh: () => Promise<void>): Promise<number> {
		const start = Date.now();
		await refresh();
		return Date.now() - start;
	}

	test('an awaited refresh waits for the rest of the cooldown and its read, but not for the cooldown after it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		await seedSessionWithSlowGitReads(h, { branchName: 'feature', baseBranchName: 'main' });
		const refresh = () => h.service.refreshSessionGitState(SESSION);

		const a = await measure(refresh);
		const b = await measure(refresh);
		await timeout(3000);
		const [c, d] = await Promise.all([measure(refresh), measure(refresh)]);

		// Each read takes 1000 ms and is followed by a 5000 ms cooldown: `a` reads an idle key, `b` waits out the
		// whole cooldown after `a`'s read, and `c` and `d` share a read after the 2000 ms left of the next cooldown.
		assert.deepStrictEqual({ a, b, c, d, reads: h.gitCalls.length }, { a: 1000, b: 6000, c: 3000, d: 3000, reads: 3 });
	}));

	test('an immediate refresh skips the cooldown but waits for a running read and restarts the cooldown', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		await seedSessionWithSlowGitReads(h, { branchName: 'feature', baseBranchName: 'main' });
		const background = () => h.service.refreshSessionGitState(SESSION);
		const immediate = () => h.service.refreshSessionGitState(SESSION, undefined, { immediate: true });

		const first = await measure(background);
		const immediateAfterRead = await measure(immediate);
		const backgroundAfterImmediate = measure(background);
		// That background refresh reads from 5000 ms to 6000 ms after it was called.
		await timeout(5500);
		const immediateDuringRead = await measure(immediate);

		assert.deepStrictEqual({
			first,
			immediateAfterRead,
			backgroundAfterImmediate: await backgroundAfterImmediate,
			immediateDuringRead,
			reads: h.gitCalls.length,
		}, {
			first: 1000,
			immediateAfterRead: 1000,
			// The cooldown after the immediate read, then a read.
			backgroundAfterImmediate: 6000,
			// The rest of the running read, then a read of its own.
			immediateDuringRead: 500 + 1000,
			reads: 4,
		});
	}));

	test('a refresh whose result was dropped because the session moved does not delay the next refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const repository = URI.file('/work/repo');
		const worktree = URI.file('/work/repo.worktrees/feature');
		const gitState: ISessionGitState = { branchName: 'agents/feature', baseBranchName: 'main' };
		await seedSessionWithSlowGitReads(h, gitState, repository.toString());
		h.setGitResult({ branchName: 'main', baseBranchName: 'main' });

		const dropped = measure(() => h.service.refreshSessionGitState(SESSION));
		await timeout(500);
		h.stateManager.dispatchServerAction(SESSION, {
			type: ActionType.SessionWorkingDirectoryReplaced,
			directory: repository.toString(),
			replacement: worktree.toString(),
		});
		const droppedCost = await dropped;
		h.setGitResult(gitState);
		const movedCost = await measure(() => h.service.refreshSessionGitState(SESSION));

		assert.deepStrictEqual({
			dropped: droppedCost,
			moved: movedCost,
			gitCalls: h.gitCalls,
			gitState: h.service.getSessionGitState(SESSION),
		}, {
			dropped: 1000,
			moved: 1000,
			gitCalls: [repository.toString(), worktree.toString()],
			gitState,
		});
	}));

	test('a refresh queued during the cooldown reads the directory its key moved to before the read started', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const repository = URI.file('/work/repo').toString();
		const worktree = URI.file('/work/repo.worktrees/feature').toString();
		await seedSessionWithSlowGitReads(h, { branchName: 'main', baseBranchName: 'main' }, repository);
		const start = Date.now();
		const reads: { readonly directory: string; readonly startedAt: number }[] = [];
		const read = h.gitService.getSessionGitState;
		h.gitService.getSessionGitState = (directory, baseBranch) => {
			reads.push({ directory: directory.toString(), startedAt: Date.now() - start });
			return read(directory, baseBranch);
		};
		await h.service.refreshSessionGitState(SESSION);

		// Queued while the first read cools down; the session moves before the queued read starts.
		const queued = h.service.refreshSessionGitState(SESSION);
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectoryReplaced, directory: repository, replacement: worktree });
		const moved: ISessionGitState = { branchName: 'agents/feature', baseBranchName: 'main' };
		h.setGitResult(moved);
		await queued;

		assert.deepStrictEqual({
			reads,
			gitState: h.service.getSessionGitState(SESSION),
			runEvents: h.runEvents,
		}, {
			// The queued read starts once the first read (1000 ms) and its cooldown (5000 ms) are over.
			reads: [{ directory: repository, startedAt: 0 }, { directory: worktree, startedAt: 6000 }],
			gitState: moved,
			runEvents: [SESSION, SESSION],
		});
	}));

	test('a background refresh merged with an operation refresh keeps the credentials the operation passed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const authentication = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
		const h = createHarness({ realCredentials: true, autoAttachPullRequests: true, authenticationService: authentication });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		// The background refresh could look up with the legacy token, so only the merge decides which credentials are used.
		const provider = new class extends mock<IAgent>() {
			override getProtectedResources() { return [GITHUB_REPO_PROTECTED_RESOURCE]; }
			override async authenticate() { return true; }
		}();
		await authentication.authenticate({ resource: GITHUB_REPO_PROTECTED_RESOURCE.resource, scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported, token: 'legacy-token' }, [provider]);
		const operationSource: IAgentHostCredentialSource = {
			principal: { apiOrigin: 'https://api.github.com', userId: '101' },
			getCredential: request => ({ resource: request.resource, token: 'operation-token', expiresAt: undefined, revision: 1 }),
		};
		const firstRead = new DeferredPromise<ISessionGitState | undefined>();
		h.setGitResultPromise(firstRead.p);
		const firstReadStarted = new DeferredPromise<void>();
		const read = h.gitService.getSessionGitState;
		h.gitService.getSessionGitState = (directory, baseBranch) => {
			firstReadStarted.complete();
			return read(directory, baseBranch);
		};

		const running = h.service.refreshSessionGitState(SESSION);
		await firstReadStarted.p;
		// The next read sees a new branch of a GitHub repository, so it looks up the branch's pull request.
		h.setGitResultPromise(undefined);
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		const operation = h.service.refreshSessionGitState(SESSION, operationSource);
		const background = h.service.refreshSessionGitState(SESSION);
		firstRead.complete({ branchName: 'main', baseBranchName: 'main' });
		await Promise.all([running, operation, background]);

		// A lookup with the operation's credentials is recorded with the session key, and one without credentials as 'legacy'.
		assert.deepStrictEqual({ reads: h.gitCalls.length, repositoryCalls: h.repositoryCalls }, { reads: 2, repositoryCalls: [SESSION] });
	}));

	test('disposing the service resolves a refresh waiting for the cooldown without reading', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		await seedSessionWithSlowGitReads(h, { branchName: 'feature', baseBranchName: 'main' });
		await h.service.refreshSessionGitState(SESSION);

		const waiting = measure(() => h.service.refreshSessionGitState(SESSION));
		await timeout(1000);
		h.service.dispose();
		const waited = await waiting;
		// Past the cooldown, which no longer starts the waiting read.
		await timeout(10_000);

		assert.deepStrictEqual({ waited, reads: h.gitCalls.length }, { waited: 1000, reads: 1 });
	}));

	test('keeps default-chat Git state when the Git probe fails', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const defaultChat = buildDefaultChatUri(SESSION);
		const previous: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: previous });
		await h.db.setMetadata(META_GIT_STATE, JSON.stringify(previous));
		h.setGitResult(undefined);

		await h.service.refreshSessionGitState(defaultChat);

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
		h.stateManager.addChat(SESSION, chat, creationTimeChatStorageResource(SESSION, chat, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///chat'] });
		h.stateManager.addChat(SESSION, sameFolderChat, creationTimeChatStorageResource(SESSION, sameFolderChat, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///chat'] });
		h.stateManager.addChat(SESSION, otherFolderChat, creationTimeChatStorageResource(SESSION, otherFolderChat, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///other'] });
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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)));
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
		h.stateManager.addChat(SESSION, chat, creationTimeChatStorageResource(SESSION, chat, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///other'] });
		h.stateManager.addChat(SESSION, sameScopeChat, creationTimeChatStorageResource(SESSION, sameScopeChat, buildDefaultChatUri(SESSION)), { workingDirectories: [WORKING_DIRECTORY] });
		h.setGitResult({ branchName: 'chat-feature', baseBranchName: 'main', hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'tools' });
		h.setPullRequest('chat-feature', createTestPullRequestSummary(7, { html_url: 'https://github.com/contoso/tools/pull/7' }));

		await h.service.refreshSessionGitState(chat);

		const folderKey = getWorkingDirectoryKey('file:///other');
		const meta = h.stateManager.getSessionState(SESSION)?._meta;
		assert.deepStrictEqual({
			chat: h.service.getGitHubState(chat),
			sameScopeChat: h.service.getGitHubState(sameScopeChat),
			session: readSessionGitHubState(meta, WORKING_DIRECTORY),
			folders: Object.fromEntries(readSessionGitHubData(meta)),
			persisted: JSON.parse(await h.whenStateStoreIdle().then(() => h.db.getMetadata(META_GITHUB_DATA_STATE)) ?? 'null'),
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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [peerFolder] });
		h.setGitResult({ branchName: 'peer-feature', baseBranchName: 'main', githubOwner: 'contoso', githubRepo: 'tools' });
		h.setPullRequest('peer-feature', createTestPullRequestSummary(9, { html_url: 'https://github.com/contoso/tools/pull/9' }));

		await h.service.attachSessionGitHubPullRequest(peer);

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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [peerFolder] });
		h.setGitResult({ branchName: 'peer-feature', baseBranchName: 'main', githubOwner: 'contoso', githubRepo: 'tools' });
		h.setPullRequest('peer-feature', createTestPullRequestSummary(9, { html_url: 'https://github.com/contoso/tools/pull/9', created_at: new Date(1_000).toISOString() }));

		await h.service.attachSessionGitHubPullRequest(peer);

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
		h.stateManager.addChat(SESSION, firstChat, creationTimeChatStorageResource(SESSION, firstChat, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///first'] });
		h.stateManager.addChat(SESSION, secondChat, creationTimeChatStorageResource(SESSION, secondChat, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///second'] });

		await Promise.all([
			h.service.setSessionGitHubState(firstChat, { owner: 'contoso', repo: 'first' }),
			h.service.setSessionGitHubState(secondChat, { owner: 'contoso', repo: 'second' }),
		]);

		assert.deepStrictEqual(JSON.parse(await h.whenStateStoreIdle().then(() => h.db.getMetadata(META_GITHUB_DATA_STATE)) ?? 'null'), {
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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [peerDirectory] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequestSummary(1, { html_url: pullRequestUrl }));

		const wrongPullRequest = await h.service.associateRecordedPullRequest(peer, 'https://github.com/microsoft/vscode/pull/2');
		const wrongSession = await h.service.associateRecordedPullRequest(buildChatUri('mock:/other', 'peer'), pullRequestUrl);
		h.setGitResult({ branchName: 'other', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		const wrongBranch = await h.service.associateRecordedPullRequest(peer, pullRequestUrl);
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'contoso', githubRepo: 'tools' });
		const wrongRepository = await h.service.associateRecordedPullRequest(peer, pullRequestUrl);
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		const associated = await h.service.associateRecordedPullRequest(peer, pullRequestUrl);
		const alreadyAssociated = await h.service.associateRecordedPullRequest(peer, pullRequestUrl);
		const persisted = JSON.parse(await h.whenStateStoreIdle().then(() => h.db.getMetadata(META_GITHUB_DATA_STATE)) ?? '{}');

		assert.deepStrictEqual({
			wrongPullRequest,
			wrongSession,
			wrongBranch,
			wrongRepository,
			associated,
			alreadyAssociated,
			pageSizes: h.pullRequestPageSizes,
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
			pageSizes: [100, 100, 100],
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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [peerDirectory] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequestSummary(1, { url }));
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
			artifacts: [{ chat: peer, type: SessionArtifactType.PullRequest, label: 'Feature PR', isArtifact: true, link: url, isGitHub: true, origin: { chat: peer } }],
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
		first.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [workingDirectory] });
		await first.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		first.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });

		const associatedBeforeRestore = await first.service.associateRecordedPullRequest(peer, url);
		const pendingBeforeRestore = JSON.parse(await first.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS) ?? '[]');

		const restored = createHarness({ autoAttachPullRequests: false, database: first.db });
		seedSession(restored.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [artifact] });
		restored.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [workingDirectory] });
		await restored.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		restored.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		restored.setPullRequest('feature', createTestPullRequestSummary(1, { url }));

		await restored.service.reconcilePendingRecordedPullRequests(SESSION, true);

		assert.deepStrictEqual({
			associatedBeforeRestore,
			pendingBeforeRestore,
			restoredPeer: restored.service.getGitHubState(peer),
			pendingAfterRestore: await first.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
			pageSizes: restored.pullRequestPageSizes,
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
			pageSizes: [100],
		});
	}));

	test('keeps a recorded PR pending after a temporary GitHub failure and retries for its folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const peer = buildChatUri(SESSION, 'peer');
		const url = pullRequestArtifact(1).link;
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [pullRequestArtifactForChat(1, peer)] });
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequestSummary(1, { url }));
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
			pageSizes: h.pullRequestPageSizes,
		}, {
			recorded: { associated: undefined, pending: [url], unmatched: [] },
			pendingAfterFailure: [{ chat: peer, folderKey: getWorkingDirectoryKey('file:///peer'), workingDirectory: 'file:///peer', url, owner: 'microsoft', repo: 'vscode', branchName: 'feature' }],
			afterRetry: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: [url], pullRequestBranchName: 'feature', associatedPullRequestUrls: [url] },
			pendingAfterRetry: undefined,
			pageSizes: [100, 100],
		});
	}));

	test('retries a pending peer PR when that chat Git state refreshes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const peer = buildChatUri(SESSION, 'peer');
		const url = 'https://github.com/microsoft/vscode/pull/1';
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [pullRequestArtifactForChat(1, peer)] });
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		await h.service.associateRecordedPullRequest(peer, url);
		h.setPullRequest('feature', createTestPullRequestSummary(1, { url }));
		const associated = Event.toPromise(h.service.onDidChangeSessionGitHubState);

		await h.service.refreshSessionGitState(peer);
		await associated;
		await h.whenStateStoreIdle();

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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		const before = await h.service.associateRecordedPullRequests(peer, urls);
		h.setPullRequest('feature', createTestPullRequestSummary(1, { html_url: urls[0] }));

		await h.service.reconcilePendingRecordedPullRequests(SESSION);
		const beforePeerRefresh = h.service.getGitHubState(peer);
		await h.service.reconcilePendingRecordedPullRequests(peer);
		const after = h.service.getGitHubState(peer);
		h.stateManager.setSessionMeta(SESSION, withSessionArtifacts(h.stateManager.getSessionState(SESSION)?._meta, []));
		await h.service.reconcilePendingRecordedPullRequests(peer);

		assert.deepStrictEqual({
			before,
			beforePeerRefresh,
			pageSizes: h.pullRequestPageSizes,
			after,
			pending: await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
		}, {
			before: { associated: undefined, pending: urls, unmatched: [] },
			beforePeerRefresh: { owner: 'microsoft', repo: 'vscode' },
			pageSizes: [100, 100],
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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [WORKING_DIRECTORY] });
		await h.service.setSessionGitHubState(defaultChat, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequestSummary(2, { html_url: urls[1] }));

		const defaultResult = await h.service.associateRecordedPullRequests(defaultChat, [urls[0]]);
		const peerResult = await h.service.associateRecordedPullRequests(peer, [urls[1]]);

		assert.deepStrictEqual({
			defaultResult,
			peerResult,
			gitHubState: h.service.getGitHubState(peer),
			pending: await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
			pageSizes: h.pullRequestPageSizes,
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
			pageSizes: [100, 100, 100],
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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [WORKING_DIRECTORY] });
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
			h.setPullRequest('feature', createTestPullRequestSummary(number, { html_url: urls[number - 1] }));
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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [WORKING_DIRECTORY] });
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
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		await h.service.associateRecordedPullRequests(peer, [url]);
		h.setGitResult({ branchName: 'other', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('other', createTestPullRequestSummary(1, { url }));

		await h.service.reconcilePendingRecordedPullRequests(peer);

		assert.deepStrictEqual({
			peer: h.service.getGitHubState(peer),
			pending: await h.db.getMetadata(META_PENDING_RECORDED_PULL_REQUESTS),
			pageSizes: h.pullRequestPageSizes,
		}, {
			peer: { owner: 'microsoft', repo: 'vscode' },
			pending: undefined,
			pageSizes: [100],
		});
	}));

	test('does not associate a recorded PR after the chat switches branches during verification', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness({ autoAttachPullRequests: false });
		const peer = buildChatUri(SESSION, 'peer');
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, artifacts: [pullRequestArtifactForChat(1, peer)] });
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///peer'] });
		await h.service.setSessionGitHubState(peer, { owner: 'microsoft', repo: 'vscode' });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', githubOwner: 'microsoft', githubRepo: 'vscode' });
		h.setPullRequest('feature', createTestPullRequestSummary(1));
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
		h.stateManager.addChat(SESSION, chat, creationTimeChatStorageResource(SESSION, chat, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///chat'] });
		h.setGitResult(chatGitState);
		await h.service.refreshSessionGitState(chat);

		h.stateManager.removeChat(SESSION, chat);

		assert.strictEqual(h.service.getSessionGitState(chat), undefined);
	}));

	test('uses the persisted base branch rather than the configured start branch when refreshing git state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			project: 'file:///repo',
			isolation: 'worktree',
			baseBranch: 'release',
		});
		await h.db.setMetadata(META_DIFF_BASE_BRANCH, 'origin/main');
		h.setGitResult({ branchName: 'agents/session', baseBranchName: 'main' });

		await h.service.refreshSessionGitState(SESSION);

		assert.deepStrictEqual(h.gitBaseBranches, ['origin/main']);
	}));

	for (const project of [undefined, WORKING_DIRECTORY]) {
		test(`folder sessions prefer their persisted base with project ${project ?? 'unset'}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				project,
				isolation: 'folder',
				gitState: { branchName: 'feature', baseBranchName: 'main', baseBranchRef: 'refs/remotes/origin/main' },
			});
			await h.db.setMetadata(META_DIFF_BASE_BRANCH, 'origin/release');
			h.setGitResult({ branchName: 'feature', baseBranchName: 'release' });

			await h.service.refreshSessionGitState(SESSION);

			assert.deepStrictEqual(h.gitBaseBranches, ['origin/release']);
		}));
	}

	test('existing folder sessions without a persisted base fall back to the base branch ref of their Git state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, isolation: 'folder', gitState: { branchName: 'feature', baseBranchName: 'main', baseBranchRef: 'refs/remotes/origin/main' } });
		h.setGitResult({ branchName: 'feature', baseBranchName: 'main', baseBranchRef: 'refs/remotes/origin/main' });

		await h.service.refreshSessionGitState(SESSION);

		assert.deepStrictEqual({
			baseBranches: h.gitBaseBranches,
			persisted: await h.db.getMetadata(META_DIFF_BASE_BRANCH),
		}, { baseBranches: ['refs/remotes/origin/main'], persisted: undefined });
	}));

	test('uses folder-scoped base branches after moving only the main chat to another workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			project: 'file:///repo-a',
			isolation: 'worktree',
			baseBranch: 'release-A',
			gitState: { branchName: 'agents/original', baseBranchName: 'release-A', baseBranchRef: 'refs/remotes/origin/release-A' },
		});
		const main = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		const replacement = 'file:///repo-b';
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [WORKING_DIRECTORY] });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: replacement });
		h.stateManager.dispatchServerAction(main, { type: ActionType.ChatWorkingDirectorySet, directory: replacement });
		await h.service.setFolderGitState(SESSION, [replacement], { branchName: 'feature-b', baseBranchName: 'main', baseBranchRef: 'refs/remotes/origin/main' });
		await h.db.setMetadata(META_DIFF_BASE_BRANCH, 'origin/release-A');

		const resolved = await Promise.all([main, peer, SESSION].map(key => h.service.resolveSessionBaseBranchRef(key)));
		await h.service.refreshSessionGitState(main);
		await h.service.refreshSessionGitState(peer);
		await h.service.refreshSessionGitState(SESSION);

		assert.deepStrictEqual({
			resolved,
			directories: h.gitCalls,
			baseBranches: h.gitBaseBranches,
		}, {
			resolved: ['refs/remotes/origin/main', 'refs/remotes/origin/release-A', 'refs/remotes/origin/release-A'],
			directories: [replacement, WORKING_DIRECTORY, WORKING_DIRECTORY],
			baseBranches: ['refs/remotes/origin/main', 'refs/remotes/origin/release-A', 'refs/remotes/origin/release-A'],
		});
	}));

	test('resolving a peer chat\'s base branch reads its folder scope from its session and never imports the chat as a session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, project: 'file:///repo', gitState: { branchName: 'feature', baseBranchName: 'main' } });
		const peer = buildChatUri(SESSION, 'peer');
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: ['file:///peer'] });
		const session = URI.parse(SESSION);
		await h.stateStore.write(session, sessionStatePatch({ chats: [{ chat: peer, isDefault: false, fields: { workingDirectories: ['file:///peer'] } }] }), SessionStateMirrorFlush.Immediate);
		await h.stateStore.writeMetadata(session, URI.parse(peer), { [META_DIFF_BASE_BRANCH]: 'origin/peer-base' }, SessionStateMirrorFlush.Immediate);
		await h.stateStore.writeMetadata(session, session, { [META_DIFF_BASE_BRANCH]: 'origin/session-base' }, SessionStateMirrorFlush.Immediate);

		const resolved = await Promise.all([peer, SESSION].map(key => h.service.resolveSessionBaseBranchRef(key)));
		await h.service.refreshSessionGitState(peer);
		await h.service.associateRecordedPullRequests(peer, ['https://github.com/microsoft/vscode/pull/7']);
		await h.whenStateStoreIdle();

		assert.deepStrictEqual({
			resolved,
			chatRecord: h.stateStore.peek(URI.parse(peer)),
			chatState: await h.centralDatabase.readSessionState(peer),
			load: await h.stateStore.load(URI.parse(peer)).then(() => 'loaded', (error: Error) => error.message),
		}, {
			resolved: ['origin/peer-base', 'origin/session-base'],
			chatRecord: undefined,
			chatState: undefined,
			load: `${peer} is a chat, not a session`,
		});
	}));

	test('resolves peer chats of a legacy-catalog session that share the session folder to the base recorded for it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'feature', baseBranchName: 'main', baseBranchRef: 'refs/remotes/origin/main' } });
		const inheritingPeer = buildChatUri(SESSION, 'inheriting');
		const sameFolderPeer = buildChatUri(SESSION, 'same-folder');
		h.stateManager.addChat(SESSION, inheritingPeer, creationTimeChatStorageResource(SESSION, inheritingPeer, buildDefaultChatUri(SESSION)));
		h.stateManager.addChat(SESSION, sameFolderPeer, creationTimeChatStorageResource(SESSION, sameFolderPeer, buildDefaultChatUri(SESSION)), { workingDirectories: [WORKING_DIRECTORY] });
		const session = URI.parse(SESSION);
		await h.stateStore.write(session, sessionStatePatch({
			chats: [
				{ chat: inheritingPeer, isDefault: false, fields: {} },
				{ chat: sameFolderPeer, isDefault: false, fields: { workingDirectories: [WORKING_DIRECTORY] } },
			],
		}), SessionStateMirrorFlush.Immediate);
		// Where the base branch operation records a new base of the session folder's Branch Changes.
		await h.stateStore.writeMetadata(session, session, { [META_DIFF_BASE_BRANCH]: 'refs/heads/release' }, SessionStateMirrorFlush.Immediate);
		h.setGitResult({ branchName: 'feature', baseBranchName: 'release', baseBranchRef: 'refs/heads/release' });

		const resolved = await Promise.all([inheritingPeer, sameFolderPeer, buildDefaultChatUri(SESSION), SESSION].map(key => h.service.resolveSessionBaseBranchRef(key)));
		await h.service.refreshSessionGitState(inheritingPeer, undefined);

		assert.deepStrictEqual({ authority: h.stateStore.peek(session)?.authority, resolved, baseBranches: h.gitBaseBranches }, {
			authority: 1,
			resolved: ['refs/heads/release', 'refs/heads/release', 'refs/heads/release', 'refs/heads/release'],
			baseBranches: ['refs/heads/release'],
		});
	}));

	test('uses the destination base after clearing a moved peer baseline without changing its sibling', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const main = buildDefaultChatUri(SESSION);
		const peer = buildChatUri(SESSION, 'peer');
		const peerDb = new TestSessionDatabase();
		const h = createHarness({ chatDatabases: new Map([[peer, peerDb]]) });
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			project: 'file:///repo-a',
			isolation: 'worktree',
			baseBranch: 'release-A',
		});
		// Recorded at worktree creation, before the session's state is first written (and imported).
		await h.db.setMetadata(META_DIFF_BASE_BRANCH, 'origin/release-A');
		const replacement = 'file:///repo-b';
		h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [replacement] });
		await h.service.setFolderGitState(SESSION, [replacement], { branchName: 'feature-b', baseBranchName: 'main', baseBranchRef: 'refs/remotes/origin/main' });
		await peerDb.setMetadata(META_DIFF_BASE_BRANCH, '');

		assert.deepStrictEqual(await Promise.all([peer, main].map(key => h.service.resolveSessionBaseBranchRef(key))), ['refs/remotes/origin/main', 'origin/release-A']);
	}));

	test('uses the persisted pull request base branch for a pull request session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			project: 'file:///repo',
			isolation: 'worktree',
			baseBranch: 'feature/pr',
			pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1',
		});
		await h.db.setMetadata(META_DIFF_BASE_BRANCH, 'origin/main');
		h.setGitResult({ branchName: 'feature/pr', baseBranchName: 'main' });

		await h.service.refreshSessionGitState(SESSION);

		assert.deepStrictEqual(h.gitBaseBranches, ['origin/main']);
	}));

	test('uses the persisted base branch when a worktree checked out its configured branch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		// Pull request sessions created before `pullRequestUrl` existed configured the head branch itself.
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			project: 'file:///repo',
			isolation: 'worktree',
			baseBranch: 'feature/pr',
			gitState: { branchName: 'feature/pr', baseBranchName: 'feature/pr' },
		});
		await h.db.setMetadata(META_DIFF_BASE_BRANCH, 'origin/main');
		h.setGitResult({ branchName: 'feature/pr', baseBranchName: 'main' });

		await h.service.refreshSessionGitState(SESSION);

		assert.deepStrictEqual(h.gitBaseBranches, ['origin/main']);
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

		await h.service.refreshSessionGitState(SESSION);

		assert.deepStrictEqual(h.gitBaseBranches, ['origin/release']);
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
				defaultChat: buildDefaultChatUri(SESSION),
			}, { emitNotification: false });
			const next: ISessionGitState = { branchName: 'feature', uncommittedChanges: 1 };
			h.setGitResult(next);

			await h.service.refreshSessionGitState(SESSION);

			assert.deepStrictEqual({
				gitCalls: h.gitCalls,
				gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
				persistedGit: await h.db.getMetadata(META_GIT_STATE),
				runEvents: h.runEvents,
			}, {
				gitCalls: ['file:///original'],
				gitState: next,
				persistedGit: undefined,
				runEvents: [SESSION],
			});
		});
	});

	test('resolves the working directory from the session summary', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
			h.setGitResult({ branchName: 'feature' });

			await h.service.refreshSessionGitState(SESSION);

			assert.deepStrictEqual(h.gitCalls, [WORKING_DIRECTORY]);
		});
	});

	/** Restores a subagent session of {@link SESSION} without a working directory of its own. */
	function restoreSubagentSession(stateManager: AgentHostStateManager): string {
		const subagent = buildSubagentSessionUri(SESSION, 'tool-1');
		stateManager.restoreSession({
			resource: subagent,
			defaultChat: buildDefaultChatUri(subagent),
			provider: 'mock',
			title: 'Subagent',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		}, [], creationTimeChatStorageResource);
		return subagent;
	}

	test('refreshes a subagent session without a working directory of its own from its parent session\'s', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		const subagent = restoreSubagentSession(h.stateManager);
		const gitState: ISessionGitState = { branchName: 'feature', baseBranchName: 'main' };
		h.setGitResult(gitState);

		await h.service.refreshSessionGitState(subagent);

		assert.deepStrictEqual({
			gitCalls: h.gitCalls,
			gitState: h.service.getSessionGitState(subagent),
			runEvents: h.runEvents,
		}, {
			gitCalls: [WORKING_DIRECTORY],
			gitState,
			runEvents: [subagent],
		});
	}));

	test('refreshes a subagent from the worktree its parent session\'s default chat works in, not its parent\'s summary folder', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		const worktree = 'file:///wd.worktrees/isolated';
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: worktree });
		h.stateManager.dispatchServerAction(buildDefaultChatUri(SESSION), { type: ActionType.ChatWorkingDirectorySet, directory: worktree });
		const subagent = restoreSubagentSession(h.stateManager);
		const gitState: ISessionGitState = { branchName: 'isolated', baseBranchName: 'main' };
		h.setGitResult(gitState);

		await h.service.refreshSessionGitState(subagent);

		assert.deepStrictEqual({
			parentSummaryFolder: h.stateManager.getSessionSummary(SESSION)?.workingDirectories?.[0],
			gitCalls: h.gitCalls,
			gitState: h.service.getSessionGitState(subagent),
		}, {
			parentSummaryFolder: WORKING_DIRECTORY,
			gitCalls: [worktree],
			gitState,
		});
	}));

	test('refreshes a chat whose state is not restored yet from the folder its catalog entry records', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
		const chat = buildChatUri(SESSION, 'restored');
		const worktree = 'file:///wd.worktrees/restored';
		h.stateManager.registerRestoredChatSummary(SESSION, chat, { storageResource: creationTimeChatStorageResource(SESSION, chat, buildDefaultChatUri(SESSION)), workingDirectories: [worktree] });
		const gitState: ISessionGitState = { branchName: 'restored', baseBranchName: 'main' };
		h.setGitResult(gitState);

		await h.service.refreshSessionGitState(chat);

		assert.deepStrictEqual({ gitCalls: h.gitCalls, gitState: h.service.getSessionGitState(chat) }, { gitCalls: [worktree], gitState });
	}));

	test('unchanged git state still fires the run-refresh event', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const gitState: ISessionGitState = { branchName: 'feature', uncommittedChanges: 1 };
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState });
			h.setGitResult(gitState);

			await h.service.refreshSessionGitState(SESSION);

			assert.deepStrictEqual(h.runEvents, [SESSION]);
		});
	});

	test('a default chat refresh that changes the session\'s Git state also announces the session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'feature', uncommittedChanges: 0 } });
		const gitState: ISessionGitState = { branchName: 'feature', uncommittedChanges: 1 };
		h.setGitResult(gitState);

		await h.service.refreshSessionGitState(buildDefaultChatUri(SESSION));

		assert.deepStrictEqual({ runEvents: h.runEvents, sessionGitState: h.service.getSessionGitState(SESSION) }, {
			runEvents: [buildDefaultChatUri(SESSION), SESSION],
			sessionGitState: gitState,
		});
	}));

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

			await h.service.refreshSessionGitState(SESSION);

			assert.deepStrictEqual({
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
				persistedGitHub: await readPersistedSessionGitHubState(h.db, h.whenStateStoreIdle),
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

			await h.service.refreshSessionGitState(SESSION);

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

			await h.service.refreshSessionGitState(SESSION);

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
			const query = new class extends mock<IPullRequestsClient>() {
				override async list({ owner, repo }: RepositoryRef, _signal: CancellationToken, options?: ListPullRequestsOptions) {
					const head = options?.query?.head;
					assert.ok(head);
					const separator = head.indexOf(':');
					const headOwner = head.slice(0, separator);
					const branch = head.slice(separator + 1);
					calls.push({ owner, repo, branch, headOwner });
					return [createTestPullRequestSummary(1)];
				}
			}();
			const authenticationService = new class extends mock<IAgentHostAuthenticationService>() {
				override readonly onDidChangeAuthToken = Event.None;
				override getAuthAccountId() { return undefined; }
				override getAuthToken() { return 'token'; }
			}();
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
				h.service.refreshSessionGitState(SESSION),
				h.service.attachSessionGitHubPullRequest(SESSION),
				h.service.refreshSessionGitState(SESSION),
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
			h.setPullRequest('remote-name', createTestPullRequestSummary(1));

			await h.service.attachSessionGitHubPullRequest(SESSION);

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
			h.setPullRequest('feature', createTestPullRequestSummary(2, { state: 'open' }));

			await h.service.attachSessionGitHubPullRequest(SESSION);

			assert.deepStrictEqual({
				pullRequestPageSizes: h.pullRequestPageSizes,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestPageSizes: [100],
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

					await h.service.attachSessionGitHubPullRequest(SESSION);
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

			await h.service.attachSessionGitHubPullRequest(SESSION);
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
					h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [peerFolder] });
					await h.service.setSessionGitHubState(peer, peerGitHubState);
					h.setGitResult(peerGitState);

					await h.service.attachSessionGitHubPullRequest(peer);
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
			h.stateManager.addChat(SESSION, peer, creationTimeChatStorageResource(SESSION, peer, buildDefaultChatUri(SESSION)), { workingDirectories: [peerFolder] });
			await h.service.setSessionGitHubState(peer, peerGitHubState);
			h.setGitResult(peerGitState);
			h.setPullRequest('session-feature', createTestPullRequestSummary(1, { state: 'closed' }));

			await h.service.attachSessionGitHubPullRequest(peer);

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
				query: new class extends mock<IPullRequestsClient>() {
					override async list(): Promise<never> { throw new Error('GitHub unavailable'); }
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

			await h.service.attachSessionGitHubPullRequest(SESSION);

			assert.deepStrictEqual(readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY), {
				owner: 'microsoft',
				repo: 'vscode',
			});
		});
	});

	for (const autoAttachPullRequests of [false, true]) {
		test(`returns a pull request lookup GitHub refused for single sign-on, with its authorization page (${autoAttachPullRequests ? 'automatic' : 'restricted'} association)`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const gitState: ISessionGitState = { branchName: 'local/pr-2', baseBranchName: 'main' };
				const ssoAuthorizationUrl = 'https://github.com/orgs/microsoft/sso?authorization_request=abc';
				const refusal = new GitHubRequestError('GitHub API request failed: GET repos/microsoft/vscode/pulls - 403 Forbidden - Resource protected by organization SAML enforcement.', 'authorization', 403, undefined, undefined, 'Forbidden', { ssoAuthorizationUrl });
				const h = createHarness({
					autoAttachPullRequests,
					query: new class extends mock<IPullRequestsClient>() {
						override async list(): Promise<never> { throw refusal; }
					}(),
				});
				seedSession(h.stateManager, {
					workingDirectory: WORKING_DIRECTORY,
					gitState,
					gitHubState: { owner: 'microsoft', repo: 'vscode' },
					artifacts: [pullRequestArtifact(2)],
				});
				h.setGitResult(gitState);

				assert.deepStrictEqual(await h.service.attachSessionGitHubPullRequest(SESSION), {
					kind: 'authorization', message: refusal.message, ssoAuthorizationUrl,
				});
			});
		});
	}

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
				query: new class extends mock<IPullRequestsClient>() {
					override async list(_repository: RepositoryRef, _signal: CancellationToken, options?: ListPullRequestsOptions) {
						const head = options?.query?.head;
						assert.ok(head);
						const separator = head.indexOf(':');
						const headOwner = head.slice(0, separator);
						const branch = head.slice(separator + 1);
						calls.push({ branch, headOwner });
						return [createTestPullRequestSummary(328975)];
					}
				}(),
			});
			seedSession(h.stateManager, {
				workingDirectory: WORKING_DIRECTORY,
				gitState,
				gitHubState: { owner: 'microsoft', repo: 'vscode' },
			});
			h.setGitResult(gitState);

			await h.service.attachSessionGitHubPullRequest(SESSION);

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
			h.setPullRequestForSha('1ce2c20d3dcb593273f604b077240543d494e276', createTestPullRequestSummary(2));

			await h.service.attachSessionGitHubPullRequest(SESSION);

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

			await h.service.attachSessionGitHubPullRequest(SESSION);

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
			h.setPullRequest('feature', createTestPullRequestSummary(1, { created_at: new Date(1_000).toISOString() }));

			await h.service.attachSessionGitHubPullRequest(SESSION);

			const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);
			assert.deepStrictEqual({
				github,
				related: [...getSessionRelatedPullRequestUrls(github)],
				persistedGitHub: await readPersistedSessionGitHubState(h.db, h.whenStateStoreIdle),
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
			h.setPullRequest('feature', createTestPullRequestSummary(1, { html_url: pullRequestUrl, created_at: new Date(1_000).toISOString() }));
			h.setOnPullRequestLookup(async () => {
				h.stateManager.setSessionConfig(SESSION, {
					schema: { type: 'object', properties: {} },
					values: { [SessionConfigKey.Isolation]: 'folder' },
				});
			});

			await h.service.attachSessionGitHubPullRequest(SESSION);

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

			await h.service.attachSessionGitHubPullRequest(SESSION);
			h.setPullRequest('feature', createTestPullRequestSummary(2, { created_at: new Date(600_500).toISOString() }));
			await h.service.attachSessionGitHubPullRequest(SESSION);

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
			h.setPullRequest('feature', createTestPullRequestSummary(1, { created_at: new Date(1_000).toISOString() }));

			await h.service.attachSessionGitHubPullRequest(SESSION);

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

		await h.service.refreshSessionGitState(SESSION);

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

			// Three concurrent refreshes take two reads: the first starts right
			// away, and the other two merge into one read that starts after
			// the first read's cooldown.
			await Promise.all([
				h.service.refreshSessionGitState(SESSION),
				h.service.refreshSessionGitState(SESSION),
				h.service.refreshSessionGitState(SESSION),
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
			h.setPullRequest('feature', createTestPullRequestSummary(1));

			await h.service.attachSessionGitHubPullRequest(SESSION);
			await h.service.attachSessionGitHubPullRequest(SESSION);

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
			await h.service.attachSessionGitHubPullRequest(SESSION);
			const githubBeforePullRequestExists = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);

			h.setPullRequest('feature-2', createTestPullRequestSummary(2));
			await h.service.attachSessionGitHubPullRequest(SESSION);

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				githubBeforePullRequestExists,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
				persistedGitHub: await readPersistedSessionGitHubState(h.db, h.whenStateStoreIdle),
			}, {
				pullRequestCalls: ['feature-2', 'feature-2'],
				githubBeforePullRequestExists: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature' },
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2', 'https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature-2' },
				persistedGitHub: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2', 'https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature-2' },
			});
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
			h.setPullRequest('feature', createTestPullRequestSummary(1));
			h.setOnPullRequestLookup(async () => {
				const currentState = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);
				await h.service.setSessionGitHubState(SESSION, withMostRecentSessionPullRequest(currentState, 'https://github.com/microsoft/vscode/pull/2', 'feature-2'));
			});

			await h.service.attachSessionGitHubPullRequest(SESSION);

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
			h.setPullRequest('feature', createTestPullRequestSummary(1));

			await h.service.attachSessionGitHubPullRequest(SESSION);

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

			await h.service.attachSessionGitHubPullRequest(SESSION);
			await h.service.attachSessionGitHubPullRequest(SESSION);

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
			h.setPullRequest('feature', createTestPullRequestSummary(1));
			// The working copy moves to another branch while the lookup is in flight.
			h.setOnPullRequestLookup(async () => {
				h.stateManager.setSessionMeta(SESSION, withSessionGitState(h.stateManager.getSessionState(SESSION)?._meta, { branchName: 'feature-2', baseBranchName: 'main' }));
			});

			await h.service.attachSessionGitHubPullRequest(SESSION);

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY),
			}, {
				pullRequestCalls: ['feature'],
				github: { owner: 'microsoft', repo: 'vscode' },
			});
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

			await h.service.attachSessionGitHubPullRequest(SESSION);

			assert.deepStrictEqual(readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY), {
				owner: 'microsoft',
				repo: 'vscode',
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
			h.setPullRequest('feature-2', createTestPullRequestSummary(2));

			// The GitHub state is captured when the refresh is reported so the
			// event carries the pull request of the newly checked out branch.
			let githubOnRefreshEvent: ISessionGitHubState | undefined;
			disposables.add(h.service.onDidRefreshSessionGitState(() => {
				githubOnRefreshEvent = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta, WORKING_DIRECTORY);
			}));

			await h.service.refreshSessionGitState(SESSION);

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				githubOnRefreshEvent,
			}, {
				pullRequestCalls: ['feature-2'],
				githubOnRefreshEvent: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/2', 'https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'feature-2' },
			});
		});
	});

	test('records the Git and GitHub state and the pull request of each other folder of a session', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const otherFolder = 'file:///api';
		const notGit = 'file:///notes';
		const sessionGitState: ISessionGitState = { branchName: 'app-feature', baseBranchName: 'main', hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'app' };
		const otherGitState: ISessionGitState = { branchName: 'api-feature', baseBranchName: 'master', upstreamBranchName: 'origin/api-feature', hasGitRemote: true, hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'api' };
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: sessionGitState });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: otherFolder });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: notGit });
		h.setGitResult(sessionGitState);
		h.setGitResultForFolder(otherFolder, otherGitState);
		h.setGitResultForFolder(notGit, undefined);
		// Git answers that the folder is not a repository
		h.gitService.hasGitRoot = folder => constObservable(folder.toString() === notGit ? false : undefined);
		h.setPullRequest('api-feature', createTestPullRequestSummary(12, { html_url: 'https://github.com/contoso/api/pull/12' }));

		await h.service.refreshSessionGitState(SESSION, undefined);
		// The pull request of the other folder is looked up after the refresh
		await timeout(1_000);

		const meta = h.stateManager.getSessionState(SESSION)?._meta;
		assert.deepStrictEqual({
			session: h.service.getSessionGitState(SESSION),
			otherFolder: readFolderScopeGitState(meta, getWorkingDirectoryScopeId([otherFolder])),
			notGit: readFolderScopeGitState(meta, getWorkingDirectoryScopeId([notGit])),
			otherFolderGitHub: readFolderGitHubState(meta, getWorkingDirectoryKey(otherFolder)),
			nonRepositoryFolders: readSessionNonRepositoryFolders(meta),
			persistedGitData: JSON.parse(await h.whenStateStoreIdle().then(() => h.db.getMetadata(META_GIT_DATA_STATE)) ?? 'null'),
			pullRequestCalls: h.pullRequestCalls,
			runEvents: h.runEvents,
		}, {
			session: sessionGitState,
			otherFolder: otherGitState,
			notGit: undefined,
			otherFolderGitHub: { owner: 'contoso', repo: 'api', pullRequestUrls: ['https://github.com/contoso/api/pull/12'], pullRequestBranchName: 'api-feature' },
			nonRepositoryFolders: [getWorkingDirectoryKey(notGit)],
			persistedGitData: { [getWorkingDirectoryScopeId([otherFolder])]: otherGitState },
			pullRequestCalls: ['api-feature'],
			runEvents: [SESSION],
		});
	}));

	test('a session removed while its other folders are read gets no metadata written', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///work/vscode.worktrees/other' });
		const reads = new DeferredPromise<ISessionGitState | undefined>();
		h.setGitResultPromise(reads.p);
		const metaWrites: string[] = [];
		disposables.add(h.stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionMetaChanged) {
				metaWrites.push(envelope.channel);
			}
		}));

		const refresh = h.service.refreshSessionGitState(SESSION, undefined);
		await timeout(1_000);
		h.stateManager.removeSession(SESSION);
		await reads.complete({ branchName: 'main' });
		await refresh;

		assert.deepStrictEqual(metaWrites, []);
	}));

	test('finds the repositories in the immediate subfolders of a folder that is not one, each with its own Git state, at most 16', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const read = async (found: readonly string[]) => {
			const h = createHarness();
			const limits: number[] = [];
			h.gitService.getRepositoryRoot = async folder => folder.toString() === WORKING_DIRECTORY ? undefined : folder;
			h.gitService.findRepositories = async (_folder, limit) => {
				limits.push(limit);
				return found.slice(0, limit).map(root => URI.parse(root));
			};
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
			h.setGitResultForFolder('file:///wd/app', { branchName: 'app-feature' });
			h.setGitResultForFolder('file:///wd/lib', { branchName: 'lib-main' });
			await h.service.refreshSessionGitState(SESSION, undefined);
			// Discovery runs after the refresh
			await timeout(1_000);
			const meta = h.stateManager.getSessionState(SESSION)?._meta;
			return {
				limits,
				repositories: readSessionRepositories(meta)?.[getWorkingDirectoryKey(WORKING_DIRECTORY)]?.length,
				branches: found.slice(0, 2).map(root => readFolderScopeGitState(meta, getWorkingDirectoryScopeId([root]))?.branchName),
			};
		};

		assert.deepStrictEqual({
			found: await read(['file:///wd/app', 'file:///wd/lib']),
			// No nested repository: each folder is its own repository, and nothing is recorded
			none: await read([]),
			capped: (await read(Array.from({ length: 20 }, (_, index) => `file:///wd/repo${index}`))).repositories,
		}, {
			found: { limits: [16], repositories: 2, branches: ['app-feature', 'lib-main'] },
			none: { limits: [16], repositories: undefined, branches: [] },
			capped: 16,
		});
	}));

	test('a folder in a repository is that repository: its subfolders are not looked into, also below the repository\'s root or for two folders of one repository', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const sub = 'file:///repo/sub';
		const other = 'file:///repo/other';
		let scans = 0;
		h.gitService.getRepositoryRoot = async folder => folder.path.startsWith('/repo') ? URI.parse('file:///repo') : undefined;
		h.gitService.findRepositories = async () => {
			scans++;
			return [URI.parse('file:///repo/sub/nested')];
		};
		h.setGitResult({ branchName: 'main' });
		seedSession(h.stateManager, { workingDirectory: sub, gitState: { branchName: 'main' } });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: other });

		await h.service.refreshSessionGitState(SESSION, undefined);
		await timeout(1_000);
		await h.service.refreshSessionGitState(SESSION, undefined, { force: true });
		await timeout(1_000);

		assert.deepStrictEqual({ scans, repositories: readSessionRepositories(h.stateManager.getSessionState(SESSION)?._meta) }, { scans: 0, repositories: undefined });
	}));

	test('a scan that finishes after the session\'s folders changed records nothing, and the latest folders are found once it settles', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		const firstScan = new DeferredPromise<void>();
		const scans: string[] = [];
		h.gitService.findRepositories = async folder => {
			scans.push(folder.toString());
			if (scans.length === 1) {
				await firstScan.p;
			}
			return [URI.parse(`${folder.toString()}/found${scans.length}`)];
		};
		const repositories = () => Object.values(readSessionRepositories(h.stateManager.getSessionState(SESSION)?._meta) ?? {}).flat().map(entry => entry.root);

		await h.service.refreshSessionGitState(SESSION, undefined);
		// The folders change while the first scan runs, which refreshes the session as a change does
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///other' });
		await h.service.refreshSessionGitState(SESSION, undefined);
		const whileScanning = repositories();
		await firstScan.complete();
		await timeout(1_000);

		assert.deepStrictEqual({ whileScanning, scans, after: repositories() }, {
			whileScanning: [],
			// The first scan's result is not recorded; the folders of the second are found without another refresh
			scans: [WORKING_DIRECTORY, WORKING_DIRECTORY, 'file:///other'],
			after: [`${WORKING_DIRECTORY}/found2`, 'file:///other/found3'],
		});
	}));

	test('a repository gone from disk drops out of the session\'s repositories with the Git and GitHub state discovery recorded for it, but a root that became a session folder keeps its state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const docs = 'file:///wd/docs';
		const tools = 'file:///wd/tools';
		let onDisk = [docs, tools];
		let scans = 0;
		h.gitService.getRepositoryRoot = async folder => onDisk.includes(folder.toString()) ? folder : undefined;
		h.gitService.findRepositories = async () => {
			scans++;
			return onDisk.map(root => URI.parse(root));
		};
		h.setGitResultForFolder(docs, { branchName: 'docs-main', githubOwner: 'contoso', githubRepo: 'docs' });
		h.setGitResultForFolder(tools, { branchName: 'tools-main' });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		const read = () => {
			const meta = h.stateManager.getSessionState(SESSION)?._meta;
			return {
				repositories: readSessionRepositories(meta)?.[getWorkingDirectoryKey(WORKING_DIRECTORY)]?.map(repository => repository.root),
				docs: [readFolderScopeGitState(meta, getWorkingDirectoryScopeId([docs]))?.branchName, readFolderGitHubState(meta, getWorkingDirectoryKey(docs))?.repo],
				tools: readFolderScopeGitState(meta, getWorkingDirectoryScopeId([tools]))?.branchName,
			};
		};

		const refresh = async () => {
			await h.service.refreshSessionGitState(SESSION, undefined);
			await timeout(5_000);
		};
		await refresh();
		const before = read();
		// docs leaves the disk, without any change to the session's folders: a refresh notices, the next scans again
		onDisk = [tools];
		h.setGitResultForFolder(docs, undefined);
		await refresh();
		const noticed = scans;
		await refresh();
		const docsGone = read();
		// tools becomes a folder of the session, then leaves the scan's results: its state is the folder's now
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: tools });
		onDisk = [];
		await refresh();

		assert.deepStrictEqual({ before, noticed, docsGone, toolsFolder: read(), scans }, {
			before: { repositories: [docs, tools], docs: ['docs-main', 'docs'], tools: 'tools-main' },
			noticed: 1,
			docsGone: { repositories: [tools], docs: [undefined, undefined], tools: 'tools-main' },
			// No nested repository is left, so nothing is recorded
			toolsFolder: { repositories: undefined, docs: [undefined, undefined], tools: 'tools-main' },
			// The last discovery scans both folders, neither of which is in a repository then
			scans: 4,
		});
	}));

	test('the repositories are found again on a forced refresh and when the folders change, not on an ordinary refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		let scans = 0;
		h.gitService.findRepositories = async () => {
			scans++;
			return [URI.parse('file:///wd/docs')];
		};
		h.setGitResultForFolder('file:///wd/docs', { branchName: 'docs-main' });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		const refresh = async (force: boolean) => {
			await h.service.refreshSessionGitState(SESSION, undefined, { force });
			await timeout(1_000);
			return scans;
		};

		assert.deepStrictEqual({
			first: await refresh(false),
			ordinary: await refresh(false),
			// As after a Git operation or a turn, which may have created a repository
			forced: await refresh(true),
			folderAdded: await (async () => {
				h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///other' });
				return refresh(false);
			})(),
			docsBranch: readFolderScopeGitState(h.stateManager.getSessionState(SESSION)?._meta, getWorkingDirectoryScopeId(['file:///wd/docs']))?.branchName,
			// One scan for each folder that is not in a repository: both, once the folder is added
		}, { first: 1, ordinary: 1, forced: 2, folderAdded: 4, docsBranch: 'docs-main' });
	}));

	test('a forced refresh asks Git again whether a folder is in a repository before looking into its subfolders, also another folder a chat works in', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const transitions = async (target: string) => {
			const h = createHarness();
			// Git's cached answer, which only a fresh lookup or a retry of a cached negative replaces
			let isRepository = true;
			const cached = new Map<string, URI | undefined>();
			h.gitService.getRepositoryRoot = async (folder, options) => {
				const key = folder.toString();
				if (options?.fresh || (options?.refreshIfNone && !cached.get(key)) || !cached.has(key)) {
					cached.set(key, isRepository || key !== target ? folder : undefined);
				}
				return cached.get(key);
			};
			h.gitService.hasGitRoot = folder => constObservable(cached.has(folder.toString()) ? !!cached.get(folder.toString()) : undefined);
			let scans = 0;
			const child = `${target}/app`;
			h.gitService.findRepositories = async folder => {
				scans++;
				return folder.toString() === target ? [URI.parse(child)] : [];
			};
			h.setGitResultForFolder(child, { branchName: 'app-main' });
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
			if (target !== WORKING_DIRECTORY) {
				h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: target });
				// The chat refreshes its folder, so the refresh of the session's other folders leaves it out
				const chat = buildChatUri(SESSION, 'peer');
				h.stateManager.addChat(SESSION, chat, creationTimeChatStorageResource(SESSION, chat, buildDefaultChatUri(SESSION)), { workingDirectories: [target] });
			}
			const refresh = async (force: boolean) => {
				await h.service.refreshSessionGitState(SESSION, undefined, { force });
				await timeout(1_000);
				await h.service.refreshSessionGitState(SESSION, undefined);
				await timeout(1_000);
				return { scans, repositories: readSessionRepositories(h.stateManager.getSessionState(SESSION)?._meta)?.[getWorkingDirectoryKey(target)]?.map(entry => entry.root) };
			};

			const inRepository = await refresh(false);
			// The folder's .git is removed, leaving the checkout in its subfolder
			isRepository = false;
			const repositoryRemoved = await refresh(true);
			// git init in the folder again
			isRepository = true;
			const repositoryCreated = await refresh(true);
			return { inRepository, repositoryRemoved, repositoryCreated };
		};

		const expected = (target: string) => ({
			inRepository: { scans: 0, repositories: undefined },
			repositoryRemoved: { scans: 1, repositories: [`${target}/app`] },
			repositoryCreated: { scans: 1, repositories: undefined },
		});
		assert.deepStrictEqual({
			first: await transitions(WORKING_DIRECTORY),
			chatFolder: await transitions('file:///other'),
		}, {
			first: expected(WORKING_DIRECTORY),
			chatFolder: expected('file:///other'),
		});
	}));

	test('a forced refresh during a scan of the same folders scans them once more after it, an ordinary one does not', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		let gate: DeferredPromise<void> | undefined;
		let onDisk: string[] = [];
		let scans = 0;
		h.gitService.findRepositories = async () => {
			scans++;
			// The folder is read before the scan finishes
			const found = onDisk.map(root => URI.parse(root));
			await gate?.p;
			return found;
		};
		h.setGitResultForFolder('file:///wd/app', { branchName: 'app-main' });
		const repositories = () => Object.values(readSessionRepositories(h.stateManager.getSessionState(SESSION)?._meta) ?? {}).flat().map(entry => entry.root);
		const scanWhile = async (force: boolean) => {
			gate = new DeferredPromise<void>();
			await h.service.refreshSessionGitState(SESSION, undefined, { force: true });
			// A turn creates a checkout, then refreshes the session while the scan runs
			onDisk = ['file:///wd/app'];
			await h.service.refreshSessionGitState(SESSION, undefined, { force });
			const settled = gate;
			gate = undefined;
			await settled.complete();
			await timeout(1_000);
			const result = { scans, repositories: repositories() };
			onDisk = [];
			scans = 0;
			return result;
		};

		assert.deepStrictEqual({ ordinary: await scanWhile(false), forced: await scanWhile(true) }, {
			ordinary: { scans: 1, repositories: [] },
			forced: { scans: 2, repositories: ['file:///wd/app'] },
		});
	}));

	test('discovery finds no more repositories than each refresh reads, so each is read and one that is gone is noticed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const other = 'file:///other';
		let onDisk = Array.from({ length: 20 }, (_, index) => `file:///wd/repo${String(index).padStart(2, '0')}`);
		const limits: number[] = [];
		h.gitService.getRepositoryRoot = async folder => onDisk.includes(folder.toString()) ? folder : undefined;
		h.gitService.findRepositories = async (folder, limit) => {
			limits.push(limit);
			return folder.toString() === WORKING_DIRECTORY ? onDisk.slice(0, limit).map(root => URI.parse(root)) : [];
		};
		for (const root of onDisk) {
			h.setGitResultForFolder(root, { branchName: `${root.slice(-6)}-main` });
		}
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		// Another folder, not a repository either: it takes one of the reads
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: other });
		const read = () => {
			const meta = h.stateManager.getSessionState(SESSION)?._meta;
			const roots = readSessionRepositories(meta)?.[getWorkingDirectoryKey(WORKING_DIRECTORY)]?.map(entry => entry.root) ?? [];
			return { count: roots.length, unread: roots.filter(root => !readFolderScopeGitState(meta, getWorkingDirectoryScopeId([root]))), last: roots.at(-1) };
		};
		const refresh = async () => {
			await h.service.refreshSessionGitState(SESSION, undefined);
			await timeout(5_000);
		};

		await refresh();
		await refresh();
		const atCap = read();
		// The last repository found is removed from disk
		const removed = 'file:///wd/repo14';
		onDisk = onDisk.filter(root => root !== removed);
		h.setGitResultForFolder(removed, undefined);
		await refresh();
		await refresh();

		assert.deepStrictEqual({ limits: [...new Set(limits)], atCap, afterRemoval: read() }, {
			limits: [15],
			atCap: { count: 15, unread: [], last: removed },
			afterRemoval: { count: 15, unread: [], last: 'file:///wd/repo15' },
		});
	}));

	test('a folder whose GitHub remote changes on the same branch drops the previous repository\'s pull request and looks up its pull request again', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const api = 'file:///api';
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: api });
		h.setGitResult({ branchName: 'main' });
		h.setGitResultForFolder(api, { branchName: 'feature', baseBranchName: 'main', hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'api' });
		h.setPullRequest('feature', createTestPullRequestSummary(12, { html_url: 'https://github.com/contoso/api/pull/12' }));
		await h.service.refreshSessionGitState(SESSION, undefined);
		await timeout(1_000);
		const before = readFolderGitHubState(h.stateManager.getSessionState(SESSION)?._meta, getWorkingDirectoryKey(api));

		// Same branch, another repository: its pull request is not the previous one's
		h.setGitResultForFolder(api, { branchName: 'feature', baseBranchName: 'main', hasGitHubRemote: true, githubOwner: 'fabrikam', githubRepo: 'api' });
		h.setPullRequest('feature', createTestPullRequestSummary(30, { html_url: 'https://github.com/fabrikam/api/pull/30' }));
		await timeout(5_000);
		await h.service.refreshSessionGitState(SESSION, undefined);
		await timeout(1_000);

		assert.deepStrictEqual({ before, after: readFolderGitHubState(h.stateManager.getSessionState(SESSION)?._meta, getWorkingDirectoryKey(api)), lookups: h.pullRequestCalls }, {
			before: { owner: 'contoso', repo: 'api', pullRequestUrls: ['https://github.com/contoso/api/pull/12'], pullRequestBranchName: 'feature' },
			after: { owner: 'fabrikam', repo: 'api', pullRequestUrls: ['https://github.com/fabrikam/api/pull/30'], pullRequestBranchName: 'feature' },
			lookups: ['feature', 'feature'],
		});
	}));

	test('a folder-only scope reads, refreshes and looks up its own pull request through its changeset owner, and gets a chat covering it; the first folder and chat folders are unchanged', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const api = 'file:///api';
		const web = 'file:///web';
		const sessionGitState: ISessionGitState = { branchName: 'main', baseBranchName: 'main', hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'app' };
		const apiGitState: ISessionGitState = { branchName: 'api-feature', baseBranchName: 'main', hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'api' };
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: sessionGitState });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: api });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: web });
		// A chat working in `web` first makes it that chat's folder; it also works in `api`, which stays folder-only.
		const webChat = buildChatUri(SESSION, 'web');
		h.stateManager.addChat(SESSION, webChat, creationTimeChatStorageResource(SESSION, webChat, buildDefaultChatUri(SESSION)), { workingDirectories: [web, api] });
		h.setGitResult(sessionGitState);
		h.setGitResultForFolder(api, apiGitState);
		h.setGitResultForFolder(web, { branchName: 'web-feature' });
		h.setPullRequest('api-feature', createTestPullRequestSummary(12, { html_url: 'https://github.com/contoso/api/pull/12' }));
		const apiOwner = buildFolderChangesetOwnerUri(SESSION, getWorkingDirectoryScopeId([api]));
		const before = h.service.getSessionGitState(apiOwner);

		await h.service.attachSessionGitHubPullRequest(apiOwner);

		assert.deepStrictEqual({
			roots: [...getFolderOnlyAgentMergeRoots(h.stateManager, SESSION).values()],
			before,
			apiGitState: h.service.getSessionGitState(apiOwner),
			apiPullRequests: readFolderGitHubState(h.stateManager.getSessionState(SESSION)?._meta, getWorkingDirectoryKey(api))?.pullRequestUrls,
			sessionGitState: h.service.getSessionGitState(SESSION),
			apiOwningChat: resolveAgentMergeOwningChat(h.stateManager, SESSION, getWorkingDirectoryKey(api), undefined),
			apiRecordedOwningChat: resolveAgentMergeOwningChat(h.stateManager, SESSION, getWorkingDirectoryKey(api), webChat),
			firstFolderOwningChat: resolveAgentMergeOwningChat(h.stateManager, SESSION, getWorkingDirectoryKey(WORKING_DIRECTORY), webChat),
			webOwningChat: resolveAgentMergeOwningChat(h.stateManager, SESSION, getWorkingDirectoryKey(web), undefined),
			pullRequestCalls: h.pullRequestCalls,
		}, {
			roots: [api],
			before: undefined,
			apiGitState,
			apiPullRequests: ['https://github.com/contoso/api/pull/12'],
			sessionGitState,
			apiOwningChat: buildDefaultChatUri(SESSION),
			apiRecordedOwningChat: webChat,
			firstFolderOwningChat: buildDefaultChatUri(SESSION),
			webOwningChat: webChat,
			pullRequestCalls: ['api-feature'],
		});
	}));

	test('a pull request found for another folder of the session is recorded for that folder only, never as the session\'s latest outcome', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const api = 'file:///api';
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: api });
		await h.service.recordSessionMerge(SESSION, 'abc123');
		h.setGitResult({ branchName: 'main' });
		h.setGitResultForFolder(api, { branchName: 'feature', baseBranchName: 'main', hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'api' });
		h.setPullRequest('feature', createTestPullRequestSummary(12, { html_url: 'https://github.com/contoso/api/pull/12' }));

		await h.service.refreshSessionGitState(SESSION, undefined);
		await timeout(1_000);

		const meta = h.stateManager.getSessionState(SESSION)?._meta;
		assert.deepStrictEqual({
			sourceControl: readSessionSourceControlState(meta),
			api: readFolderGitHubState(meta, getWorkingDirectoryKey(api))?.pullRequestUrls,
		}, {
			sourceControl: { merge: { commit: 'abc123' }, latestOutcome: SessionSourceControlOutcome.Merge },
			api: ['https://github.com/contoso/api/pull/12'],
		});
	}));

	test('another folder loses the state recorded for it once Git says it is not a repository, or its remotes are read and none is on GitHub, but not after a read that could not tell', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const run = async (next: { readonly gitState: ISessionGitState | undefined; readonly hasGitRoot: boolean | undefined }) => {
			const h = createHarness();
			const api = 'file:///api';
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
			h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: api });
			h.setGitResult({ branchName: 'main' });
			h.setGitResultForFolder(api, { branchName: 'feature', baseBranchName: 'main', hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'api' });
			h.setPullRequest('feature', createTestPullRequestSummary(12, { html_url: 'https://github.com/contoso/api/pull/12' }));
			await h.service.refreshSessionGitState(SESSION, undefined);
			await timeout(1_000);

			h.setGitResultForFolder(api, next.gitState);
			// As the Git service: the root cached while the folder was a repository answers until a lookup reads the disk,
			// which drops it when Git says the folder is not a repository and keeps it when Git cannot be asked
			let cached = true;
			h.gitService.getRepositoryRoot = async (folder, options) => {
				if (folder.toString() !== api || next.hasGitRoot === true) {
					return folder;
				}
				if (options?.fresh && next.hasGitRoot === false) {
					cached = false;
				}
				return cached && !options?.fresh ? folder : undefined;
			};
			h.gitService.hasGitRoot = folder => constObservable(folder.toString() !== api || next.hasGitRoot === true || (next.hasGitRoot === undefined ? cached || undefined : false));
			await timeout(5_000);
			await h.service.refreshSessionGitState(SESSION, undefined);
			await timeout(1_000);
			const meta = h.stateManager.getSessionState(SESSION)?._meta;
			return {
				branch: readFolderScopeGitState(meta, getWorkingDirectoryScopeId([api]))?.branchName,
				gitHub: readFolderGitHubState(meta, getWorkingDirectoryKey(api))?.repo,
			};
		};

		assert.deepStrictEqual({
			notRepository: await run({ gitState: undefined, hasGitRoot: false }),
			unreadable: await run({ gitState: undefined, hasGitRoot: undefined }),
			noGitHubRemote: await run({ gitState: { branchName: 'feature', baseBranchName: 'main', hasGitRemote: true, hasGitHubRemote: false }, hasGitRoot: true }),
			remotesUnread: await run({ gitState: { branchName: 'feature', baseBranchName: 'main' }, hasGitRoot: true }),
		}, {
			notRepository: { branch: undefined, gitHub: undefined },
			unreadable: { branch: 'feature', gitHub: 'api' },
			noGitHubRemote: { branch: 'feature', gitHub: undefined },
			remotesUnread: { branch: 'feature', gitHub: 'api' },
		});
	}));

	test('records the Git state of every folder of any session of several folders, whatever created it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const read = async (setUp: (h: ReturnType<typeof createHarness>) => void) => {
			const h = createHarness();
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
			setUp(h);
			h.setGitResult({ branchName: 'main' });
			h.setGitResultForFolder('file:///api', { branchName: 'api-feature', baseBranchName: 'main' });
			await h.service.refreshSessionGitState(SESSION, undefined);
			return { gitCalls: [...h.gitCalls].sort(), apiBranch: readFolderScopeGitState(h.stateManager.getSessionState(SESSION)?._meta, getWorkingDirectoryScopeId(['file:///api']))?.branchName };
		};

		assert.deepStrictEqual({
			singleFolder: await read(() => { }),
			// Created in several folders, without a workspace configuration
			severalFolders: await read(h => h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///api' })),
			// A chat added a folder: the session gains it too
			chatAddedFolder: await read(h => {
				h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///api' });
				h.stateManager.dispatchServerAction(buildDefaultChatUri(SESSION), { type: ActionType.ChatWorkingDirectorySet, directory: WORKING_DIRECTORY });
				h.stateManager.dispatchServerAction(buildDefaultChatUri(SESSION), { type: ActionType.ChatWorkingDirectorySet, directory: 'file:///api' });
			}),
			editorWindowWorkspace: await read(h => {
				h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///api' });
				h.stateManager.setSessionMeta(SESSION, withSessionMultiRootMetadata(h.stateManager.getSessionState(SESSION)?._meta, { workspaceFile: 'file:///editor.code-workspace' }));
			}),
		}, {
			singleFolder: { gitCalls: [WORKING_DIRECTORY], apiBranch: undefined },
			severalFolders: { gitCalls: ['file:///api', WORKING_DIRECTORY], apiBranch: 'api-feature' },
			chatAddedFolder: { gitCalls: ['file:///api', WORKING_DIRECTORY], apiBranch: 'api-feature' },
			editorWindowWorkspace: { gitCalls: ['file:///api', WORKING_DIRECTORY], apiBranch: 'api-feature' },
		});
	}));

	test('a discovery that never finishes does not hold the refresh of the session\'s Git state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		h.gitService.findRepositories = () => new Promise(() => { });
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		h.setGitResult({ branchName: 'feature' });

		await h.service.refreshSessionGitState(SESSION, undefined);

		assert.deepStrictEqual({ gitState: h.service.getSessionGitState(SESSION), runEvents: h.runEvents }, { gitState: { branchName: 'feature' }, runEvents: [SESSION] });
	}));

	test('a folder that leaves the session loses the Git and GitHub state recorded for it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const api = 'file:///api';
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: api });
		h.setGitResult({ branchName: 'main' });
		h.setGitResultForFolder(api, { branchName: 'feature', hasGitHubRemote: true, githubOwner: 'contoso', githubRepo: 'api' });
		const read = () => {
			const meta = h.stateManager.getSessionState(SESSION)?._meta;
			return [readFolderScopeGitState(meta, getWorkingDirectoryScopeId([api]))?.branchName, readFolderGitHubState(meta, getWorkingDirectoryKey(api))?.repo];
		};

		await h.service.refreshSessionGitState(SESSION, undefined);
		const before = read();
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectoryRemoved, directory: api });
		await timeout(5_000);
		await h.service.refreshSessionGitState(SESSION, undefined);

		assert.deepStrictEqual({ before, after: read() }, { before: ['feature', 'api'], after: [undefined, undefined] });
	}));

	test('records the folders that are not Git repositories, forgets one that becomes one, and leaves a folder Git could not be asked about as it was', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const notes = 'file:///notes';
		const unreadable = 'file:///unreadable';
		const transient = 'file:///transient';
		h.gitService.getRepositoryRoot = async folder => {
			if (folder.toString() === unreadable) {
				throw new Error('git failed');
			}
			// As the real service does when Git fails other than with "not a git repository": no root, and unknown
			return undefined;
		};
		// Only Git's "not a git repository" answer is a known one
		h.gitService.hasGitRoot = folder => constObservable(folder.toString() === notes ? false : undefined);
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		for (const folder of [notes, unreadable, transient]) {
			h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: folder });
			h.setGitResultForFolder(folder, undefined);
		}
		h.setGitResult({ branchName: 'main' });

		await h.service.refreshSessionGitState(SESSION, undefined);
		const before = readSessionNonRepositoryFolders(h.stateManager.getSessionState(SESSION)?._meta);
		h.setGitResultForFolder(notes, { branchName: 'notes-main' });
		await timeout(5_000);
		await h.service.refreshSessionGitState(SESSION, undefined);

		assert.deepStrictEqual({ before, after: readSessionNonRepositoryFolders(h.stateManager.getSessionState(SESSION)?._meta) }, {
			before: [getWorkingDirectoryKey(notes)],
			after: [],
		});
	}));

	test('a forced refresh looks again at a folder known not to be a repository, bypassing its cached answer', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const notes = 'file:///notes';
		const lookups: Array<{ readonly folder: string; readonly refreshIfNone: boolean }> = [];
		h.gitService.getRepositoryRoot = async (folder, options) => {
			lookups.push({ folder: folder.toString(), refreshIfNone: !!options?.refreshIfNone });
			return undefined;
		};
		h.gitService.hasGitRoot = folder => constObservable(folder.toString() === notes ? false : undefined);
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: notes });
		h.setGitResult({ branchName: 'main' });
		h.setGitResultForFolder(notes, undefined);

		await h.service.refreshSessionGitState(SESSION, undefined);
		lookups.length = 0;
		await timeout(5_000);
		await h.service.refreshSessionGitState(SESSION, undefined, { force: true });

		assert.deepStrictEqual(lookups.filter(lookup => lookup.folder === notes && lookup.refreshIfNone).length, 1);
	}));

	test('folders known not to be repositories are not looked up again by an ordinary refresh, and once each by a forced one', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const folders = Array.from({ length: 16 }, (_, index) => `file:///notes${index}`);
		// As the Git service: answers are cached; a lookup runs Git when nothing is cached, when it reads the disk
		// (`fresh`), or for a cached negative with `refreshIfNone`
		const cache = new Map<string, boolean>();
		let probes = 0;
		h.gitService.getRepositoryRoot = async (folder, options) => {
			const key = folder.toString();
			if (!folders.includes(key)) {
				return folder;
			}
			if (cache.has(key) && !options?.fresh && !(options?.refreshIfNone && cache.get(key) === false)) {
				return undefined;
			}
			probes++;
			cache.set(key, false);
			return undefined;
		};
		h.gitService.hasGitRoot = folder => constObservable(cache.get(folder.toString()));
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
		for (const folder of folders) {
			h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: folder });
			h.setGitResultForFolder(folder, undefined);
		}
		h.setGitResult({ branchName: 'main' });
		const refresh = async (force: boolean) => {
			const before = probes;
			await timeout(5_000);
			await h.service.refreshSessionGitState(SESSION, undefined, { force });
			return probes - before;
		};

		assert.deepStrictEqual({ first: await refresh(false), ordinary: await refresh(false), forced: await refresh(true), ordinaryAgain: await refresh(false) }, {
			first: 16,
			ordinary: 0,
			forced: 16,
			ordinaryAgain: 0,
		});
	}));

	test('repositories found under drive letters of different case are one repository', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		h.gitService.findRepositories = async () => [URI.parse('file:///C%3A/wd/docs'), URI.parse('file:///c%3A/wd/docs')];
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });

		await h.service.refreshSessionGitState(SESSION, undefined);
		await timeout(1_000);

		assert.deepStrictEqual(readSessionRepositories(h.stateManager.getSessionState(SESSION)?._meta)?.[getWorkingDirectoryKey(WORKING_DIRECTORY)], [{ root: 'file:///c%3A/wd/docs', kind: 'nested' }]);
	}));

	test('a repository found in one folder that is another folder\'s own repository is that folder\'s', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const h = createHarness();
		const work = 'file:///work';
		const lib = 'file:///work/lib';
		const src = 'file:///work/lib/src';
		h.gitService.getRepositoryRoot = async folder => folder.toString() === src ? URI.parse(lib) : undefined;
		h.gitService.findRepositories = async () => [URI.parse(lib)];
		h.setGitResult({ branchName: 'main' });
		seedSession(h.stateManager, { workingDirectory: work, gitState: { branchName: 'main' } });
		h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: src });

		await h.service.refreshSessionGitState(SESSION, undefined);
		await timeout(1_000);

		const repositories = readSessionRepositories(h.stateManager.getSessionState(SESSION)?._meta);
		// lib is src's own repository, so it is not nested in work, which then has none
		assert.deepStrictEqual({ repositories, libScopeRead: h.gitCalls.includes(lib) }, { repositories: undefined, libScopeRead: false });
	}));

	test('a repository read that finishes after the folders changed records nothing, even before the next refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const read = async (change: (h: ReturnType<typeof createHarness>) => void) => {
			const h = createHarness();
			const docs = 'file:///wd/docs';
			const docsRead = new DeferredPromise<ISessionGitState | undefined>();
			h.gitService.findRepositories = async () => [URI.parse(docs)];
			h.setGitResultForFolder(docs, docsRead.p);
			seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState: { branchName: 'main' } });
			await h.service.refreshSessionGitState(SESSION, undefined);
			await timeout(1_000);
			change(h);
			// No refresh between the change and the end of the read
			await docsRead.complete({ branchName: 'docs-main', githubOwner: 'contoso', githubRepo: 'docs' });
			await timeout(1_000);
			const meta = h.stateManager.getSessionState(SESSION)?._meta;
			return [readFolderScopeGitState(meta, getWorkingDirectoryScopeId([docs])), readFolderGitHubState(meta, getWorkingDirectoryKey(docs)), h.pullRequestCalls.length];
		};

		assert.deepStrictEqual(await read(h => h.stateManager.dispatchServerAction(SESSION, { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///other' })), [undefined, undefined, 0]);
	}));
});
