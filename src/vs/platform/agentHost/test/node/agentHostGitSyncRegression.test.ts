/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import { mkdtempSync, realpathSync } from 'fs';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { Schemas } from '../../../../base/common/network.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { Branch, GitRefType, IAgentHostGitService, IRemoteBranch } from '../../common/agentHostGitService.js';
import { AgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostGitStateService } from '../../node/agentHostGitStateService.js';
import { AgentHostSyncOperationContribution } from '../../node/agentHostSyncOperationProvider.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import type { IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { Event } from '../../../../base/common/event.js';
import { buildUncommittedChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import { buildDefaultChatUri, ChangesetOperationScope, ChangesetOperationStatus, SessionStatus, type ISessionGitState } from '../../common/state/sessionState.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { createTestGitHubClient, createTestGitHubService } from './testGitHubService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

const SESSION = 'agent:/session-sync-test';
const WORKING_DIRECTORY = 'file:///workspace';

class LoggingTestLogService extends NullLogService {
	readonly warnings: string[] = [];
	readonly traces: string[] = [];

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push(message + (args.length ? ' ' + args.join(' ') : ''));
	}

	override trace(message: string): void {
		this.traces.push(message);
	}
}

async function rmDirWithRetry(path: string | undefined): Promise<void> {
	if (!path) {
		return;
	}
	try {
		await rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	} catch {
		// best-effort cleanup
	}
}

suite('AgentHostGitSyncRegression', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createMockHarness(options?: { logService?: LoggingTestLogService }) {
		const logService = options?.logService ?? new LoggingTestLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const db = new TestSessionDatabase();
		const sessionDataService = createSessionDataService(db);
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));

		const fetchCalls: Array<{ workingDirectory: URI; branch: IRemoteBranch }> = [];
		const branchMap = new Map<string, Branch>();
		let gitResult: ISessionGitState | undefined;
		let fetchError: Error | undefined;
		let onFetch: ((branch: IRemoteBranch) => void) | undefined;
		const gitCalls: string[] = [];

		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getSessionGitState: async (workingDirectory: URI) => {
				gitCalls.push(workingDirectory.toString());
				return gitResult;
			},
			getBranch: async (_workingDirectory: URI, name: string) => branchMap.get(name),
			fetch: async (workingDirectory: URI, branch: IRemoteBranch) => {
				fetchCalls.push({ workingDirectory, branch });
				if (fetchError) {
					throw fetchError;
				}
				onFetch?.(branch);
			},
		};

		const authenticationService: IAgentHostAuthenticationService = {
			_serviceBrand: undefined,
			onDidChangeAuthToken: Event.None,
			getAuthAccount: () => undefined,
			getAuthToken: () => 'token',
		};

		const service = disposables.add(new AgentHostGitStateService(
			stateManager,
			gitService,
			createTestGitHubService(createTestGitHubClient({})),
			authenticationService,
			createTestGitHubEndpointService(),
			logService,
			sessionDataService,
			configurationService,
			NullTelemetryService,
			createTestChatOwnershipService(stateManager),
		));

		const instantiationService = disposables.add(new InstantiationService());
		const syncContribution = disposables.add(new AgentHostSyncOperationContribution(
			stateManager,
			instantiationService,
		));

		const runEvents: string[] = [];
		disposables.add(service.onDidRefreshSessionGitState(key => runEvents.push(key)));

		stateManager.createSession({
			resource: SESSION,
			provider: 'copilot',
			title: 'Sync Test Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: [WORKING_DIRECTORY],
			defaultChat: buildDefaultChatUri(SESSION),
		});

		return {
			stateManager,
			service,
			syncContribution,
			fetchCalls,
			gitCalls,
			runEvents,
			logService,
			setBranch: (name: string, branch: Branch) => { branchMap.set(name, branch); },
			setFetchError: (error: Error | undefined) => { fetchError = error; },
			setOnFetch: (fn: (branch: IRemoteBranch) => void) => { onFetch = fn; },
			setGitResult: (state: ISessionGitState | undefined) => { gitResult = state; },
		};
	}

	// 1. A new session starts on a branch whose remote-tracking reference is stale
	test('1. new session starts on branch whose remote-tracking reference is stale and detects incoming changes', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createMockHarness();
			h.setBranch('main', {
				kind: GitRefType.Head,
				name: 'main',
				ref: 'refs/heads/main',
				upstream: {
					name: 'origin/main',
					remote: 'origin',
					ref: 'refs/remotes/origin/main',
				},
			});

			const initialStaleState: ISessionGitState = {
				hasGitRemote: true,
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				incomingChanges: 0,
				outgoingChanges: 0,
			};
			const updatedRemoteState: ISessionGitState = {
				hasGitRemote: true,
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				incomingChanges: 1,
				outgoingChanges: 0,
			};

			h.setGitResult(initialStaleState);
			h.setOnFetch(() => {
				h.setGitResult(updatedRemoteState);
			});

			await h.service.refreshSessionGitState(SESSION, undefined);

			// Expected fetch was triggered for the remote tracking branch
			assert.strictEqual(h.fetchCalls.length, 1);
			assert.deepStrictEqual(h.fetchCalls[0].branch, {
				kind: GitRefType.RemoteHead,
				name: 'origin/main',
				remote: 'origin',
				ref: 'refs/remotes/origin/main',
			});

			// Local branch is reported as behind
			const state = h.service.getSessionGitState(SESSION);
			assert.strictEqual(state?.incomingChanges, 1);
			assert.strictEqual(state?.outgoingChanges, 0);
		});
	});

	// 2. The Sync button becomes available after the remote state is refreshed
	test('2. sync button becomes available after remote state is refreshed', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createMockHarness();
			h.setBranch('main', {
				kind: GitRefType.Head,
				name: 'main',
				ref: 'refs/heads/main',
				upstream: {
					name: 'origin/main',
					remote: 'origin',
					ref: 'refs/remotes/origin/main',
				},
			});

			h.setGitResult({
				hasGitRemote: true,
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				incomingChanges: 0,
				outgoingChanges: 0,
			});
			h.setOnFetch(() => {
				h.setGitResult({
					hasGitRemote: true,
					branchName: 'main',
					upstreamBranchName: 'origin/main',
					incomingChanges: 1,
					outgoingChanges: 0,
				});
			});

			await h.service.refreshSessionGitState(SESSION, undefined);

			const gitState = h.service.getSessionGitState(SESSION);
			const operations = h.syncContribution.getOperations({
				sessionKey: SESSION,
				changesetUri: buildUncommittedChangesetUri(SESSION),
				changesetKind: ChangesetKind.Uncommitted,
				gitState,
			});

			// Sync button is exposed to the UI with incoming count
			assert.deepStrictEqual(operations, [{
				id: 'sync',
				label: 'Sync Changes 1\u2193',
				icon: 'sync',
				group: 'sync',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			}]);
		});
	});

	// 3. A new session is already synchronized
	test('3. already synchronized session does not perform repeated fetches and reports clean sync', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createMockHarness();
			h.setBranch('main', {
				kind: GitRefType.Head,
				name: 'main',
				ref: 'refs/heads/main',
				upstream: {
					name: 'origin/main',
					remote: 'origin',
					ref: 'refs/remotes/origin/main',
				},
			});
			h.setGitResult({
				hasGitRemote: true,
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				incomingChanges: 0,
				outgoingChanges: 0,
			});

			await h.service.refreshSessionGitState(SESSION, undefined);
			assert.strictEqual(h.fetchCalls.length, 1);

			// Subsequent refresh check does not re-fetch
			await h.service.refreshSessionGitState(SESSION, undefined);
			assert.strictEqual(h.fetchCalls.length, 1);

			const gitState = h.service.getSessionGitState(SESSION);
			assert.strictEqual(gitState?.incomingChanges, 0);
			assert.strictEqual(gitState?.outgoingChanges, 0);

			const operations = h.syncContribution.getOperations({
				sessionKey: SESSION,
				changesetUri: buildUncommittedChangesetUri(SESSION),
				changesetKind: ChangesetKind.Uncommitted,
				gitState,
			});
			assert.strictEqual(operations, undefined);
		});
	});

	// 4. The local branch is ahead of the remote
	test('4. local branch ahead of remote preserves outgoing changes and displays sync button', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createMockHarness();
			h.setBranch('main', {
				kind: GitRefType.Head,
				name: 'main',
				ref: 'refs/heads/main',
				upstream: {
					name: 'origin/main',
					remote: 'origin',
					ref: 'refs/remotes/origin/main',
				},
			});
			h.setGitResult({
				hasGitRemote: true,
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				incomingChanges: 0,
				outgoingChanges: 2,
			});

			await h.service.refreshSessionGitState(SESSION, undefined);

			const gitState = h.service.getSessionGitState(SESSION);
			assert.strictEqual(gitState?.outgoingChanges, 2);
			assert.strictEqual(gitState?.incomingChanges, 0);

			const operations = h.syncContribution.getOperations({
				sessionKey: SESSION,
				changesetUri: buildUncommittedChangesetUri(SESSION),
				changesetKind: ChangesetKind.Uncommitted,
				gitState,
			});
			assert.deepStrictEqual(operations?.map(op => ({ id: op.id, label: op.label })), [
				{ id: 'sync', label: 'Sync Changes 2\u2191' },
			]);
		});
	});

	// 5. The local branch has both incoming and outgoing changes (diverged)
	test('5. local branch with both incoming and outgoing changes reports diverged state', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createMockHarness();
			h.setBranch('main', {
				kind: GitRefType.Head,
				name: 'main',
				ref: 'refs/heads/main',
				upstream: {
					name: 'origin/main',
					remote: 'origin',
					ref: 'refs/remotes/origin/main',
				},
			});
			h.setGitResult({
				hasGitRemote: true,
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				incomingChanges: 3,
				outgoingChanges: 1,
			});

			await h.service.refreshSessionGitState(SESSION, undefined);

			const gitState = h.service.getSessionGitState(SESSION);
			assert.strictEqual(gitState?.incomingChanges, 3);
			assert.strictEqual(gitState?.outgoingChanges, 1);

			const operations = h.syncContribution.getOperations({
				sessionKey: SESSION,
				changesetUri: buildUncommittedChangesetUri(SESSION),
				changesetKind: ChangesetKind.Uncommitted,
				gitState,
			});
			assert.deepStrictEqual(operations?.map(op => ({ id: op.id, label: op.label })), [
				{ id: 'sync', label: 'Sync Changes 3\u2193 1\u2191' },
			]);
		});
	});

	// 6. The repository has no configured remote
	test('6. repository without configured remote succeeds without fetch failure', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createMockHarness();
			h.setBranch('local-branch', {
				kind: GitRefType.Head,
				name: 'local-branch',
				ref: 'refs/heads/local-branch',
			});
			h.setGitResult({
				hasGitRemote: false,
				branchName: 'local-branch',
				incomingChanges: 0,
				outgoingChanges: 0,
			});

			await h.service.refreshSessionGitState(SESSION, undefined);

			assert.strictEqual(h.fetchCalls.length, 0);
			const gitState = h.service.getSessionGitState(SESSION);
			assert.strictEqual(gitState?.branchName, 'local-branch');
			assert.strictEqual(gitState?.hasGitRemote, false);
			assert.strictEqual(h.runEvents.includes(SESSION), true);
		});
	});

	// 7. Fetch fails because the user is offline or authentication fails
	test('7. fetch failure handles error gracefully and completes session startup', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const logService = new LoggingTestLogService();
			const h = createMockHarness({ logService });
			h.setBranch('main', {
				kind: GitRefType.Head,
				name: 'main',
				ref: 'refs/heads/main',
				upstream: {
					name: 'origin/main',
					remote: 'origin',
					ref: 'refs/remotes/origin/main',
				},
			});
			h.setFetchError(new Error('fatal: unable to access: Could not resolve host: github.com'));
			h.setGitResult({
				hasGitRemote: true,
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				incomingChanges: 0,
				outgoingChanges: 0,
			});

			// Must complete without throwing
			await h.service.refreshSessionGitState(SESSION, undefined);

			assert.strictEqual(h.fetchCalls.length, 1);
			const gitState = h.service.getSessionGitState(SESSION);
			assert.strictEqual(gitState?.branchName, 'main');
			// Warning was logged via existing log mechanism
			assert.strictEqual(logService.warnings.some(w => w.includes('Failed to fetch remote for branch')), true);
			assert.strictEqual(h.runEvents.includes(SESSION), true);
		});
	});

	// 8. The repository has multiple remotes
	test('8. repository with multiple remotes fetches only the configured upstream remote', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createMockHarness();
			h.setBranch('main', {
				kind: GitRefType.Head,
				name: 'main',
				ref: 'refs/heads/main',
				upstream: {
					name: 'origin/main',
					remote: 'origin',
					ref: 'refs/remotes/origin/main',
				},
			});
			h.setGitResult({
				hasGitRemote: true,
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				incomingChanges: 0,
				outgoingChanges: 0,
			});

			await h.service.refreshSessionGitState(SESSION, undefined);

			assert.strictEqual(h.fetchCalls.length, 1);
			assert.strictEqual(h.fetchCalls[0].branch.remote, 'origin');
			assert.strictEqual(h.fetchCalls[0].branch.name, 'origin/main');
		});
	});

	// 9. The session is reopened repeatedly
	test('9. repeated session refreshes do not duplicate fetch work', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createMockHarness();
			h.setBranch('main', {
				kind: GitRefType.Head,
				name: 'main',
				ref: 'refs/heads/main',
				upstream: {
					name: 'origin/main',
					remote: 'origin',
					ref: 'refs/remotes/origin/main',
				},
			});
			h.setGitResult({
				hasGitRemote: true,
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				incomingChanges: 0,
			});

			for (let i = 0; i < 5; i++) {
				await h.service.refreshSessionGitState(SESSION, undefined);
			}

			// Fetched exactly once on startup, subsequent calls skipped
			assert.strictEqual(h.fetchCalls.length, 1);

			// Explicit fetchRemote option forces a fetch
			await h.service.refreshSessionGitState(SESSION, undefined, { fetchRemote: true });
			assert.strictEqual(h.fetchCalls.length, 2);
		});
	});

	// 10. The behavior applies only to intended session types and tracking branches
	test('10. local-only branches without upstream tracking do not perform fetch', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const h = createMockHarness();
			h.setBranch('feature-local', {
				kind: GitRefType.Head,
				name: 'feature-local',
				ref: 'refs/heads/feature-local',
			});
			h.setGitResult({
				hasGitRemote: true,
				branchName: 'feature-local',
				incomingChanges: 0,
			});

			await h.service.refreshSessionGitState(SESSION, undefined);

			// No upstream configured -> no fetch
			assert.strictEqual(h.fetchCalls.length, 0);
		});
	});
});

suite('AgentHostGitSyncRegression - Real Git Integration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const hasGit = (() => {
		try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
	})();

	let remoteOriginPath: string | undefined;
	let localRepoPath: string | undefined;
	let peerWorktreePath: string | undefined;
	let gitService: AgentHostGitService | undefined;

	function createRealGitService(logService: NullLogService = new NullLogService()): AgentHostGitService {
		const fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
		const env: Partial<INativeEnvironmentService> = { tmpDir: URI.file(tmpdir()) };
		return new AgentHostGitService(fileService, env as INativeEnvironmentService, logService);
	}

	teardown(async () => {
		await rmDirWithRetry(peerWorktreePath);
		await rmDirWithRetry(localRepoPath);
		await rmDirWithRetry(remoteOriginPath);
	});

	(hasGit ? test : test.skip)('detects merged remote pull request commit on main when starting new session', async function () {
		this.timeout(30_000);
		const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
		const runGit = (cwd: string, ...args: string[]) => cp.execFileSync('git', args, { cwd, env, stdio: 'pipe' });

		// 1. Create a remote bare repository with a main branch
		remoteOriginPath = realpathSync(mkdtempSync(join(tmpdir(), 'remote-origin-')));
		runGit(remoteOriginPath, 'init', '--bare', '-b', 'main');

		// 2. Clone it to local repository and push initial commit
		localRepoPath = realpathSync(mkdtempSync(join(tmpdir(), 'local-repo-')));
		runGit(localRepoPath, 'clone', remoteOriginPath, '.');
		runGit(localRepoPath, 'commit', '--allow-empty', '-m', 'initial on main');
		runGit(localRepoPath, 'push', '-u', 'origin', 'main');

		// 3. Simulate remote agent session: peer worktree makes a commit and pushes to origin/main (simulating merged PR)
		peerWorktreePath = realpathSync(mkdtempSync(join(tmpdir(), 'peer-worktree-')));
		runGit(peerWorktreePath, 'clone', remoteOriginPath, '.');
		runGit(peerWorktreePath, 'commit', '--allow-empty', '-m', 'merged PR commit from remote agent');
		runGit(peerWorktreePath, 'push', 'origin', 'main');

		// Notice: in localRepoPath, git status -b --porcelain=v2 shows +0 -0 because refs/remotes/origin/main is stale!
		const staleStatus = runGit(localRepoPath, 'status', '-b', '--porcelain=v2').toString();
		assert.strictEqual(staleStatus.includes('branch.ab +0 -0'), true);

		// 4. Start a new session on main in localRepoPath
		const logService = new NullLogService();
		gitService = createRealGitService(logService);
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const sessionUri = 'agent:/new-session-on-main';
		stateManager.createSession({
			resource: sessionUri,
			provider: 'copilot',
			title: 'New Session On Main',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: [URI.file(localRepoPath).toString()],
			defaultChat: buildDefaultChatUri(sessionUri),
		});

		const gitStateService = disposables.add(new AgentHostGitStateService(
			stateManager,
			gitService,
			createTestGitHubService(createTestGitHubClient({})),
			{ _serviceBrand: undefined, onDidChangeAuthToken: Event.None, getAuthAccount: () => undefined, getAuthToken: () => undefined },
			createTestGitHubEndpointService(),
			logService,
			createSessionDataService(new TestSessionDatabase()),
			disposables.add(new AgentConfigurationService(stateManager, logService)),
			NullTelemetryService,
			createTestChatOwnershipService(stateManager),
		));

		const instantiationService = disposables.add(new InstantiationService());
		const syncContribution = disposables.add(new AgentHostSyncOperationContribution(
			stateManager,
			instantiationService,
		));

		// 5. Trigger session refresh (as happens on session start)
		await gitStateService.refreshSessionGitState(sessionUri, URI.file(localRepoPath));

		// 6. Observable assertions:
		// - Local branch state updated with incomingChanges = 1
		const gitState = gitStateService.getSessionGitState(sessionUri);
		assert.strictEqual(gitState?.branchName, 'main');
		assert.strictEqual(gitState?.upstreamBranchName, 'origin/main');
		assert.strictEqual(gitState?.incomingChanges, 1);
		assert.strictEqual(gitState?.outgoingChanges, 0);

		// - Sync Changes button is now available to user without manual git fetch!
		const operations = syncContribution.getOperations({
			sessionKey: sessionUri,
			changesetUri: buildUncommittedChangesetUri(sessionUri),
			changesetKind: ChangesetKind.Uncommitted,
			gitState,
		});
		assert.deepStrictEqual(operations?.map(op => ({ id: op.id, label: op.label })), [
			{ id: 'sync', label: 'Sync Changes 1\u2193' },
		]);
	});
});
