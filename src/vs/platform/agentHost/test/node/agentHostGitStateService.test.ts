/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { deriveGitHubEndpoints, gitHubCopilotResource, gitHubRepoResource } from '../../common/githubEndpoints.js';
import type { IAgentService } from '../../common/agentService.js';
import { readSessionGitHubState, readSessionGitState, withSessionGitHubState, withSessionGitState, SessionStatus, type ISessionGitHubState, type ISessionGitState, type SessionSummary } from '../../common/state/sessionState.js';
import { META_GIT_STATE } from '../../common/agentHostGitStateService.js';
import { AgentHostGitStateService } from '../../node/agentHostGitStateService.js';
import type { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostGitHubApiError, type CreatedPullRequest, type IAgentHostOctoKitService } from '../../node/shared/agentHostOctoKitService.js';
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';
import type { INotification } from '../../common/state/sessionActions.js';

const SESSION = 'mock:/session-1';
const WORKING_DIRECTORY = 'file:///wd';

suite('AgentHostGitStateService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestAgentHostGitStateService extends AgentHostGitStateService {
		protected override _pullRequestLookupRetryDelay(): number {
			return 0;
		}
	}

	function createHarness() {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const db = new TestSessionDatabase();
		const sessionDataService = createSessionDataService(db);

		const gitCalls: string[] = [];
		let gitResult: ISessionGitState | undefined;
		let gitError: Error | undefined;
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getSessionGitState: async (workingDirectory: URI) => {
				gitCalls.push(workingDirectory.toString());
				if (gitError) {
					throw gitError;
				}
				return gitResult;
			},
		};

		const authTokens = new Map<string, string>();
		const agentService = new class extends mock<IAgentService>() {
			override getAuthToken(request: { resource: string }): string | undefined {
				return authTokens.get(request.resource);
			}
		}();
		let enterpriseUri: string | undefined;
		const endpointChangeEmitter = disposables.add(new Emitter<void>());
		const endpointService: IAgentHostGitHubEndpointService = {
			_serviceBrand: undefined,
			onDidChange: endpointChangeEmitter.event,
			getApiBaseUri: () => deriveGitHubEndpoints(enterpriseUri).apiBaseUri,
			getGraphQlUri: () => deriveGitHubEndpoints(enterpriseUri).graphQlUri,
			getEnterpriseHost: () => deriveGitHubEndpoints(enterpriseUri).enterpriseHost,
			getEnterpriseUri: () => enterpriseUri,
			getCopilotResource: () => gitHubCopilotResource(deriveGitHubEndpoints(enterpriseUri)),
			getRepoResource: () => gitHubRepoResource(deriveGitHubEndpoints(enterpriseUri)),
		};
		const pullRequestCalls: Array<{ owner: string; repo: string; branch: string; token: string; apiBaseUri: string | undefined }> = [];
		let pullRequestResults: Array<CreatedPullRequest | Error | undefined> = [];
		let beforePullRequestResult: (() => void) | undefined;
		const octoKitService: IAgentHostOctoKitService = {
			_serviceBrand: undefined,
			async createPullRequest() {
				throw new Error('Unexpected createPullRequest call');
			},
			async findPullRequestByHeadBranch(owner, repo, branch, token, _signal, apiBaseUri) {
				pullRequestCalls.push({ owner, repo, branch, token, apiBaseUri });
				const result = pullRequestResults.shift();
				beforePullRequestResult?.();
				if (result instanceof Error) {
					throw result;
				}
				return result;
			},
			async enablePullRequestAutoMerge() {
				throw new Error('Unexpected enablePullRequestAutoMerge call');
			},
		};
		const service = disposables.add(new TestAgentHostGitStateService(
			stateManager,
			gitService,
			octoKitService,
			agentService,
			endpointService,
			new NullLogService(),
			sessionDataService,
		));

		const runEvents: string[] = [];
		const notifications: INotification[] = [];
		disposables.add(service.onDidRefreshSessionGitState(key => runEvents.push(key)));
		disposables.add(stateManager.onDidEmitNotification(notification => notifications.push(notification)));

		return {
			stateManager,
			db,
			service,
			gitCalls,
			runEvents,
			pullRequestCalls,
			notifications,
			setGitResult: (state: ISessionGitState | undefined) => { gitResult = state; },
			setGitError: (error: Error) => { gitError = error; },
			setAuthToken: (token: string | undefined) => {
				const resource = endpointService.getRepoResource().resource;
				if (token === undefined) {
					authTokens.delete(resource);
				} else {
					authTokens.set(resource, token);
				}
			},
			setEnterpriseUri: (uri: string | undefined, fire = true) => {
				enterpriseUri = uri;
				if (fire) {
					endpointChangeEmitter.fire();
				}
			},
			setBeforePullRequestResult: (callback: (() => void) | undefined) => { beforePullRequestResult = callback; },
			setPullRequestResults: (...results: Array<CreatedPullRequest | Error | undefined>) => { pullRequestResults = results; },
		};
	}

	function seedSession(stateManager: AgentHostStateManager, options?: { workingDirectory?: string; gitState?: ISessionGitState; gitHubState?: ISessionGitHubState }): void {
		const summary: SessionSummary = {
			resource: SESSION,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: options?.workingDirectory ? [options.workingDirectory] : undefined,
		};
		// `restoreSession` materializes the session in `ready` lifecycle so the
		// persistence path (which skips `creating` sessions) actually runs.
		stateManager.restoreSession(summary, []);
		let metadata = options?.gitState ? withSessionGitState(undefined, options.gitState) : undefined;
		if (options?.gitHubState) {
			metadata = withSessionGitHubState(metadata, options.gitHubState);
		}
		if (metadata) {
			stateManager.setSessionMeta(SESSION, metadata);
		}
	}

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
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
				persistedGit: await h.db.getMetadata(META_GIT_STATE),
			}, {
				github: { owner: 'microsoft', repo: 'vscode' },
				persistedGit: JSON.stringify(next),
			});
		});
	});

	test('circuit-breaks a rejected token and retries pending sessions after token replacement', async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState: { branchName: 'feature', baseBranchName: 'main' },
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
		});
		h.setAuthToken('rejected-token');
		h.setPullRequestResults(new AgentHostGitHubApiError('Bad credentials', 401, undefined));

		await h.service.attachSessionGitHubPullRequest(SESSION);
		await h.service.attachSessionGitHubPullRequest(SESSION);
		const rejectedBeforeReplacement = h.service.isAuthenticationTokenRejected('https://api.github.com/repos', 'rejected-token');

		h.setAuthToken('fresh-token');
		h.setPullRequestResults({ number: 42, url: 'https://github.com/microsoft/vscode/pull/42' });
		await h.service.handleAuthenticationTokenUpdated('https://api.github.com/repos');

		assert.deepStrictEqual({
			pullRequestCalls: h.pullRequestCalls,
			authRequired: h.notifications.filter(notification => notification.type === 'auth/required'),
			gitHubState: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
			rejectedBeforeReplacement,
			rejectedAfterReplacement: h.service.isAuthenticationTokenRejected('https://api.github.com/repos', 'fresh-token'),
		}, {
			pullRequestCalls: [
				{ owner: 'microsoft', repo: 'vscode', branch: 'feature', token: 'rejected-token', apiBaseUri: 'https://api.github.com' },
				{ owner: 'microsoft', repo: 'vscode', branch: 'feature', token: 'fresh-token', apiBaseUri: 'https://api.github.com' },
			],
			authRequired: [{
				type: 'auth/required',
				channel: 'ahp-root://',
				resource: 'https://api.github.com/repos',
				reason: 'expired',
			}],
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrl: 'https://github.com/microsoft/vscode/pull/42',
			},
			rejectedBeforeReplacement: true,
			rejectedAfterReplacement: false,
		});
	});

	test('keeps each lookup bound to one GitHub endpoint snapshot', async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState: { branchName: 'feature', baseBranchName: 'main' },
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
		});
		h.setAuthToken('github-token');
		h.setPullRequestResults(new AgentHostGitHubApiError('Bad credentials', 401, undefined));
		h.setBeforePullRequestResult(() => {
			h.setBeforePullRequestResult(undefined);
			h.setEnterpriseUri('https://ghe.example.com', false);
		});

		await h.service.attachSessionGitHubPullRequest(SESSION);

		const enterpriseEndpoints = deriveGitHubEndpoints('https://ghe.example.com');
		const enterpriseResource = gitHubRepoResource(enterpriseEndpoints).resource;
		h.setAuthToken('enterprise-token');
		h.setPullRequestResults({ number: 42, url: 'https://ghe.example.com/microsoft/vscode/pull/42' });
		await h.service.handleAuthenticationTokenUpdated(enterpriseResource);

		assert.deepStrictEqual({
			pullRequestCalls: h.pullRequestCalls,
			gitHubState: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
		}, {
			pullRequestCalls: [
				{ owner: 'microsoft', repo: 'vscode', branch: 'feature', token: 'github-token', apiBaseUri: 'https://api.github.com' },
				{ owner: 'microsoft', repo: 'vscode', branch: 'feature', token: 'enterprise-token', apiBaseUri: 'https://ghe.example.com/api/v3' },
			],
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrl: 'https://ghe.example.com/microsoft/vscode/pull/42',
			},
		});
	});

	test('retries when the new endpoint token arrives before the old lookup settles', async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState: { branchName: 'feature', baseBranchName: 'main' },
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
		});
		h.setAuthToken('github-token');
		h.setPullRequestResults(
			new AgentHostGitHubApiError('Bad credentials', 401, undefined),
			{ number: 42, url: 'https://ghe.example.com/microsoft/vscode/pull/42' },
		);
		h.setBeforePullRequestResult(() => {
			h.setBeforePullRequestResult(undefined);
			h.setEnterpriseUri('https://ghe.example.com');
			h.setAuthToken('enterprise-token');
			void h.service.handleAuthenticationTokenUpdated(
				gitHubRepoResource(deriveGitHubEndpoints('https://ghe.example.com')).resource,
			);
		});

		await h.service.attachSessionGitHubPullRequest(SESSION);
		await h.service.attachSessionGitHubPullRequest(SESSION);

		assert.deepStrictEqual({
			pullRequestCalls: h.pullRequestCalls,
			gitHubState: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
		}, {
			pullRequestCalls: [
				{ owner: 'microsoft', repo: 'vscode', branch: 'feature', token: 'github-token', apiBaseUri: 'https://api.github.com' },
				{ owner: 'microsoft', repo: 'vscode', branch: 'feature', token: 'enterprise-token', apiBaseUri: 'https://ghe.example.com/api/v3' },
			],
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrl: 'https://ghe.example.com/microsoft/vscode/pull/42',
			},
		});
	});

	test('ignores a stale 401 after a newer token is accepted', async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState: { branchName: 'feature', baseBranchName: 'main' },
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
		});
		h.setAuthToken('old-token');
		h.setPullRequestResults(
			new AgentHostGitHubApiError('Bad credentials', 401, undefined),
			{ number: 42, url: 'https://github.com/microsoft/vscode/pull/42' },
		);
		h.setBeforePullRequestResult(() => {
			h.setBeforePullRequestResult(undefined);
			h.setAuthToken('new-token');
		});

		await h.service.attachSessionGitHubPullRequest(SESSION);
		await h.service.attachSessionGitHubPullRequest(SESSION);

		assert.deepStrictEqual({
			pullRequestCalls: h.pullRequestCalls,
			authRequired: h.notifications.filter(notification => notification.type === 'auth/required'),
			gitHubState: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
		}, {
			pullRequestCalls: [
				{ owner: 'microsoft', repo: 'vscode', branch: 'feature', token: 'old-token', apiBaseUri: 'https://api.github.com' },
				{ owner: 'microsoft', repo: 'vscode', branch: 'feature', token: 'new-token', apiBaseUri: 'https://api.github.com' },
			],
			authRequired: [],
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrl: 'https://github.com/microsoft/vscode/pull/42',
			},
		});
	});

	test('retries transient pull request lookup failures at most three times', async () => {
		const h = createHarness();
		seedSession(h.stateManager, {
			workingDirectory: WORKING_DIRECTORY,
			gitState: { branchName: 'feature', baseBranchName: 'main' },
			gitHubState: { owner: 'microsoft', repo: 'vscode' },
		});
		h.setAuthToken('fresh-token');
		h.setPullRequestResults(
			new AgentHostGitHubApiError('Secondary rate limit', 403, 0),
			new AgentHostGitHubApiError('Unavailable', 503, undefined),
			{ number: 42, url: 'https://github.com/microsoft/vscode/pull/42' },
		);

		await h.service.attachSessionGitHubPullRequest(SESSION);

		assert.deepStrictEqual({
			attempts: h.pullRequestCalls.length,
			gitHubState: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
		}, {
			attempts: 3,
			gitHubState: {
				owner: 'microsoft',
				repo: 'vscode',
				pullRequestUrl: 'https://github.com/microsoft/vscode/pull/42',
			},
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
});
