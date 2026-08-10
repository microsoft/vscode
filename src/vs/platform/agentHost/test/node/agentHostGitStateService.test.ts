/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import type { IAgentService } from '../../common/agentService.js';
import { readSessionGitHubState, readSessionGitState, SESSION_META_GITHUB_KEY, withMostRecentSessionPullRequest, withSessionGitHubState, withSessionGitState, SessionStatus, type ISessionGitHubState, type ISessionGitState, type SessionSummary } from '../../common/state/sessionState.js';
import { META_GIT_STATE, META_GITHUB_STATE } from '../../common/agentHostGitStateService.js';
import { AgentHostGitStateService } from '../../node/agentHostGitStateService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { CreatedPullRequest, IAgentHostOctoKitService } from '../../node/shared/agentHostOctoKitService.js';
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';

const SESSION = 'mock:/session-1';
const WORKING_DIRECTORY = 'file:///wd';

suite('AgentHostGitStateService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('migrates legacy singular pull request metadata on read', () => {
		assert.deepStrictEqual(readSessionGitHubState({
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
		assert.deepStrictEqual(readSessionGitHubState({
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

	function createHarness(options?: { octoKitService?: IAgentHostOctoKitService; agentService?: IAgentService }) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const db = new TestSessionDatabase();
		const sessionDataService = createSessionDataService(db);

		const gitCalls: string[] = [];
		let gitResult: ISessionGitState | undefined;
		let gitError: Error | undefined;
		let headSha: string | undefined;
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getSessionGitState: async (workingDirectory: URI) => {
				gitCalls.push(workingDirectory.toString());
				if (gitError) {
					throw gitError;
				}
				return gitResult;
			},
			revParse: async () => headSha,
		};

		const pullRequestCalls: string[] = [];
		const pullRequestShaCalls: string[] = [];
		const pullRequestsByBranch = new Map<string, CreatedPullRequest>();
		const pullRequestsBySha = new Map<string, CreatedPullRequest>();
		let onPullRequestLookup: ((branch: string) => Promise<void>) | undefined;
		const octoKitService = {
			findPullRequestByHeadBranch: async (_owner: string, _repo: string, branch: string) => {
				pullRequestCalls.push(branch);
				await onPullRequestLookup?.(branch);
				return pullRequestsByBranch.get(branch);
			},
			findPullRequestByHeadSha: async (_owner: string, _repo: string, sha: string) => {
				pullRequestShaCalls.push(sha);
				return pullRequestsBySha.get(sha);
			},
		} as unknown as IAgentHostOctoKitService;
		const agentService = { getAuthToken: () => 'token' } as unknown as IAgentService;

		const service = disposables.add(new AgentHostGitStateService(
			stateManager,
			gitService,
			options?.octoKitService ?? octoKitService,
			options?.agentService ?? agentService,
			createTestGitHubEndpointService(),
			new NullLogService(),
			sessionDataService,
		));

		const runEvents: string[] = [];
		disposables.add(service.onDidRefreshSessionGitState(key => runEvents.push(key)));

		return {
			stateManager,
			db,
			service,
			gitCalls,
			runEvents,
			pullRequestCalls,
			pullRequestShaCalls,
			setGitResult: (state: ISessionGitState | undefined) => { gitResult = state; },
			setGitError: (error: Error) => { gitError = error; },
			setHeadSha: (sha: string | undefined) => { headSha = sha; },
			setPullRequest: (branch: string, pullRequest: CreatedPullRequest) => { pullRequestsByBranch.set(branch, pullRequest); },
			setPullRequestForSha: (sha: string, pullRequest: CreatedPullRequest) => { pullRequestsBySha.set(sha, pullRequest); },
			setOnPullRequestLookup: (fn: (branch: string) => Promise<void>) => { onPullRequestLookup = fn; },
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
		if (options?.gitState) {
			stateManager.setSessionMeta(SESSION, withSessionGitState(undefined, options.gitState));
		}
		if (options?.gitHubState) {
			stateManager.setSessionMeta(SESSION, withSessionGitHubState(stateManager.getSessionState(SESSION)?._meta, options.gitHubState));
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

	test('preserves pull request attachment when a later refresh replaces its queued refresh', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const calls: { owner: string; repo: string; branch: string; headOwner: string | undefined }[] = [];
			const octoKitService = {
				findPullRequestByHeadBranch: async (owner: string, repo: string, branch: string, _token: string, _signal: AbortSignal, headOwner?: string) => {
					calls.push({ owner, repo, branch, headOwner });
					return { url: 'https://github.com/microsoft/vscode/pull/1', number: 1 };
				},
			} as unknown as IAgentHostOctoKitService;
			const agentService = { getAuthToken: () => 'token' } as unknown as IAgentService;
			const h = createHarness({ octoKitService, agentService });
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
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
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
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
			}, {
				pullRequestCalls: ['remote-name'],
				pullRequestShaCalls: [],
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'], pullRequestBranchName: 'local-name' },
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
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
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

	test('accumulates the GitHub issues referenced across user messages', async () => {
		const h = createHarness();
		seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });

		await h.service.attachSessionGitHubIssues(SESSION, 'Fix https://github.com/microsoft/vscode/issues/1 please');
		await h.service.attachSessionGitHubIssues(SESSION, 'Also microsoft/vscode#1 and octo/repo#2, but not #3');
		await h.service.attachSessionGitHubIssues(SESSION, 'Nothing to see here');

		assert.deepStrictEqual({
			github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
			persistedGitHub: await h.db.getMetadata(META_GITHUB_STATE),
		}, {
			github: {
				issueUrls: [
					'https://github.com/microsoft/vscode/issues/1',
					'https://github.com/octo/repo/issues/2',
				]
			},
			persistedGitHub: JSON.stringify({
				issueUrls: [
					'https://github.com/microsoft/vscode/issues/1',
					'https://github.com/octo/repo/issues/2',
				]
			}),
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
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
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
			const githubBeforePullRequestExists = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);

			h.setPullRequest('feature-2', { url: 'https://github.com/microsoft/vscode/pull/2', number: 2 });
			await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

			assert.deepStrictEqual({
				pullRequestCalls: h.pullRequestCalls,
				githubBeforePullRequestExists,
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
				persistedGitHub: JSON.parse((await h.db.getMetadata(META_GITHUB_STATE))!),
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
					await h.service.attachSessionGitHubIssues(SESSION, 'See microsoft/vscode#42');
					const currentState = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
					await h.service.setSessionGitHubState(SESSION, withMostRecentSessionPullRequest(currentState, 'https://github.com/microsoft/vscode/pull/2', 'feature-2'));
				});

				await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));

				assert.deepStrictEqual(readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta), {
					owner: 'microsoft',
					repo: 'vscode',
					pullRequestUrls: [
						'https://github.com/microsoft/vscode/pull/1',
						'https://github.com/microsoft/vscode/pull/2',
					],
					issueUrls: ['https://github.com/microsoft/vscode/issues/42'],
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
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
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
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
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
				github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
			}, {
				pullRequestCalls: ['feature'],
				github: { owner: 'microsoft', repo: 'vscode' },
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
				githubOnRefreshEvent = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
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
