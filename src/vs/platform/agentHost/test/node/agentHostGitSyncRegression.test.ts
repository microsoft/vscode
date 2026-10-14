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
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { Schemas } from '../../../../base/common/network.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { AgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostGitStateService } from '../../node/agentHostGitStateService.js';
import { AgentHostSyncOperationContribution } from '../../node/agentHostSyncOperationProvider.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { Event } from '../../../../base/common/event.js';
import { buildUncommittedChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { createTestGitHubClient, createTestGitHubService } from './testGitHubService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

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
