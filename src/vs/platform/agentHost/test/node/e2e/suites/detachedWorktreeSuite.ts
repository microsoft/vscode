/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Detached worktrees: a git worktree the host materializes *before* any session
 * owns it.
 *
 * A client that wants a worktree ready before the user sends their first
 * message (the Agents window does this so a draft session already has a
 * checkout) asks the host for one through the `vscode/…DetachedWorktree`
 * extension methods. The worktree is keyed by an opaque handle rather than by a
 * session, so its whole lifecycle — materialize, claim, archive/unarchive,
 * delete, reconcile — is addressable over the protocol without a turn ever
 * running.
 *
 * Everything here is host-local: git commands against a temporary repository
 * plus the host's own per-handle record. Nothing crosses the model boundary, so
 * every scenario is registered as a conformance-tier host-only test and runs
 * against the strict shared empty fixture.
 */

import assert from 'assert';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { getComparisonKey } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import {
	ClaimAgentHostDetachedWorktreeExtensionMethod,
	CreateAgentHostDetachedWorktreeExtensionMethod,
	DeleteAgentHostDetachedWorktreeExtensionMethod,
	ReconcileAgentHostDetachedWorktreesExtensionMethod,
	SetAgentHostDetachedWorktreeArchivedExtensionMethod,
	type IAgentHostExtensionCommandMap,
} from '../../../../common/agentHostExtensionProtocol.js';
import { isAgentDevContainerWorktreeHandle } from '../../../../common/meta/agentDevContainerWorktreeMeta.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ROOT_STATE_URI, SessionLifecycle, type SessionState } from '../../../../common/state/sessionState.js';
import { initTestGitRepo, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { vscodeAgentHostTarget } from '../harness/agentHostTarget.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

type CreateDetachedWorktreeResult = IAgentHostExtensionCommandMap[typeof CreateAgentHostDetachedWorktreeExtensionMethod]['result'];

/** The `agents/` prefix the host puts in front of every branch it generates for an isolated checkout. */
const AGENT_BRANCH_PREFIX = 'agents/';

/**
 * Resolves a path through symlinks when it exists, and returns it unchanged
 * when it does not. Temp directories are symlinked on macOS (`/var` ->
 * `/private/var`), and these tests compare paths that git printed against paths
 * the host returned, so both sides have to be canonicalized the same way —
 * including after a worktree has been removed, when the path no longer resolves.
 */
function canonicalPath(candidate: string): string {
	try {
		return realpathSync(candidate);
	} catch {
		return candidate;
	}
}

function pathComparisonKey(candidate: string): string {
	return getComparisonKey(URI.file(canonicalPath(candidate)));
}

export function defineDetachedWorktreeTests(context: IAgentHostE2ETestContext): void {
	// The detached-worktree family is an AHP *extension* method set rather than
	// part of the core protocol, so only the VS Code agent host answers it.
	if (context.targetId !== vscodeAgentHostTarget.id) {
		return;
	}

	const { config, createdSessions, tempDirs } = context;
	const enabled = config.supportsWorktreeIsolation;

	let clientOrdinal = 0;

	/** A git repository with one commit, so a worktree has a branch point to check out. */
	function createGitWorkspace(prefix: string): string {
		// Canonicalized up front: the host resolves the repository root through
		// git, which reports the real path, and the worktree container is derived
		// from that root.
		const workspace = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
		tempDirs.push(workspace, `${workspace}.worktrees`);
		initTestGitRepo(workspace);
		writeFileSync(join(workspace, 'seed.txt'), 'seed\n');
		execFileSync('git', ['add', '.'], { cwd: workspace });
		execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: workspace });
		return workspace;
	}

	function git(cwd: string, ...args: string[]): string {
		return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	}

	/** The worktrees git currently has registered for `repository`, canonicalized. */
	function registeredWorktrees(repository: string): string[] {
		return git(repository, 'worktree', 'list', '--porcelain')
			.split('\n')
			.filter(line => line.startsWith('worktree '))
			.map(line => pathComparisonKey(line.slice('worktree '.length).trim()));
	}

	function isRegisteredWorktree(repository: string, worktreePath: string): boolean {
		return registeredWorktrees(repository).includes(pathComparisonKey(worktreePath));
	}

	function branchExists(repository: string, branchName: string): boolean {
		return git(repository, 'branch', '--list', branchName).length > 0;
	}

	/**
	 * Creates a session configured for worktree isolation and stops before the
	 * first turn, which is exactly the state a detached worktree is requested
	 * from: the host has a session record but has deliberately not resolved its
	 * working directory yet.
	 */
	async function createUnstartedWorktreeSession(workspace: string, prefix: string): Promise<string> {
		context.client.setWorkingDirectory(workspace);
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `${prefix}-${config.provider}-${clientOrdinal++}`,
		}, 30_000);
		await context.client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: config.githubToken ?? resolveGitHubToken(),
		}, 30_000);

		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			workingDirectories: [URI.file(workspace).toString()],
			config: { isolation: 'worktree', branch: git(workspace, 'branch', '--show-current') },
		}, 30_000);
		createdSessions.push(sessionUri);
		return sessionUri;
	}

	function createDetachedWorktree(session: string, prompt: string): Promise<CreateDetachedWorktreeResult> {
		return context.client.call<CreateDetachedWorktreeResult>(CreateAgentHostDetachedWorktreeExtensionMethod, { session, prompt }, 60_000);
	}

	function claimDetachedWorktree(handle: string): Promise<void> {
		return context.client.call(ClaimAgentHostDetachedWorktreeExtensionMethod, { handle }, 30_000);
	}

	function setDetachedWorktreeArchived(handle: string, archived: boolean): Promise<void> {
		return context.client.call(SetAgentHostDetachedWorktreeArchivedExtensionMethod, { handle, archived }, 60_000);
	}

	function deleteDetachedWorktree(handle: string): Promise<void> {
		return context.client.call(DeleteAgentHostDetachedWorktreeExtensionMethod, { handle }, 60_000);
	}

	function reconcileDetachedWorktrees(scope: string, activeHandles: readonly string[]): Promise<void> {
		return context.client.call(ReconcileAgentHostDetachedWorktreesExtensionMethod, { scope, activeHandles: [...activeHandles] }, 60_000);
	}

	conformanceTest(context, 'creating a detached worktree materializes a checkout for an unstarted session', async function () {
		const workspace = createGitWorkspace('ahp-detached-create-');
		const sessionUri = await createUnstartedWorktreeSession(workspace, 'detached-create');
		const sessionState = (await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri })).snapshot!.state as SessionState;

		const created = await createDetachedWorktree(sessionUri, 'summarize the seed file');
		const worktreePath = URI.parse(created.resource).fsPath;

		// The handle is opaque to the client, the checkout is a real git worktree
		// of the session's repository, and it carries the repository's content —
		// the three things a client needs before it can hand the directory to a
		// user. The session itself stays unstarted: a detached worktree is not
		// (yet) anybody's working directory.
		assert.deepStrictEqual({
			sessionLifecycle: sessionState.lifecycle,
			handleIsOpaqueId: isAgentDevContainerWorktreeHandle(created.handle),
			existsOnDisk: existsSync(worktreePath),
			registeredWithGit: isRegisteredWorktree(workspace, worktreePath),
			checkedOutRepositoryContent: existsSync(join(worktreePath, 'seed.txt')),
			onGeneratedAgentBranch: git(worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD').startsWith(AGENT_BRANCH_PREFIX),
			isSeparateFromWorkspace: pathComparisonKey(worktreePath) !== pathComparisonKey(workspace),
		}, {
			sessionLifecycle: SessionLifecycle.Creating,
			handleIsOpaqueId: true,
			existsOnDisk: true,
			registeredWithGit: true,
			checkedOutRepositoryContent: true,
			onGeneratedAgentBranch: true,
			isSeparateFromWorkspace: true,
		});
	}, enabled);

	conformanceTest(context, 'reconciling detached worktrees keeps every handle inside its retention window', async function () {
		const workspace = createGitWorkspace('ahp-detached-reconcile-');
		const sessionUri = await createUnstartedWorktreeSession(workspace, 'detached-reconcile');

		const held = await createDetachedWorktree(sessionUri, 'reconcile the held checkout');
		const dropped = await createDetachedWorktree(sessionUri, 'reconcile the dropped checkout');
		const heldPath = URI.parse(held.resource).fsPath;
		const droppedPath = URI.parse(dropped.resource).fsPath;
		await claimDetachedWorktree(held.handle);

		// Omitted handles remain claimable until the retention grace period expires.
		await reconcileDetachedWorktrees(getComparisonKey(URI.parse(held.resource)), [held.handle]);
		await reconcileDetachedWorktrees(getComparisonKey(URI.parse(dropped.resource)), []);

		await claimDetachedWorktree(dropped.handle);

		assert.deepStrictEqual({
			heldExists: existsSync(heldPath),
			droppedExists: existsSync(droppedPath),
			heldRegistered: isRegisteredWorktree(workspace, heldPath),
			droppedRegistered: isRegisteredWorktree(workspace, droppedPath),
			areDistinctCheckouts: pathComparisonKey(heldPath) !== pathComparisonKey(droppedPath),
		}, {
			heldExists: true,
			droppedExists: true,
			heldRegistered: true,
			droppedRegistered: true,
			areDistinctCheckouts: true,
		});
	}, enabled);

	conformanceTest(context, 'archiving a detached worktree removes its checkout and unarchiving recreates it', async function () {
		const workspace = createGitWorkspace('ahp-detached-archive-');
		const sessionUri = await createUnstartedWorktreeSession(workspace, 'detached-archive');

		const created = await createDetachedWorktree(sessionUri, 'archive and restore this checkout');
		const worktreePath = URI.parse(created.resource).fsPath;
		const branchName = git(worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD');

		// Archiving reclaims the disk a dormant checkout is holding, but it must
		// preserve the branch: that branch is the only thing that makes the
		// checkout reconstructible, so dropping it would turn "archive" into
		// "discard".
		await setDetachedWorktreeArchived(created.handle, true);
		const archived = {
			existsOnDisk: existsSync(worktreePath),
			registeredWithGit: isRegisteredWorktree(workspace, worktreePath),
			branchPreserved: branchExists(workspace, branchName),
		};

		// Unarchiving puts the same branch back at the same path, so a client that
		// stored the path before archiving still resolves to a valid checkout.
		await setDetachedWorktreeArchived(created.handle, false);
		const restored = {
			existsOnDisk: existsSync(worktreePath),
			registeredWithGit: isRegisteredWorktree(workspace, worktreePath),
			checkedOutRepositoryContent: existsSync(join(worktreePath, 'seed.txt')),
			branch: git(worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'),
		};

		assert.deepStrictEqual({ archived, restored }, {
			archived: {
				existsOnDisk: false,
				registeredWithGit: false,
				branchPreserved: true,
			},
			restored: {
				existsOnDisk: true,
				registeredWithGit: true,
				checkedOutRepositoryContent: true,
				branch: branchName,
			},
		});
	}, enabled);

	conformanceTest(context, 'deleting a detached worktree removes its checkout and forgets its handle', async function () {
		const workspace = createGitWorkspace('ahp-detached-delete-');
		const sessionUri = await createUnstartedWorktreeSession(workspace, 'detached-delete');

		const created = await createDetachedWorktree(sessionUri, 'delete this checkout');
		const worktreePath = URI.parse(created.resource).fsPath;

		await deleteDetachedWorktree(created.handle);

		// Deletion takes the checkout off disk *and* drops the host's record for
		// the handle. The record is not directly observable, so the oracle is the
		// handle no longer resolving — a client cannot claim what the host forgot.
		await assert.rejects(claimDetachedWorktree(created.handle), /Unknown detached worktree handle/);
		await assert.rejects(claimDetachedWorktree(generateUuid()), /Unknown detached worktree handle/);

		// Deletion is idempotent: a client retrying after a dropped response, or
		// two clients reacting to the same removal, must not turn the second
		// attempt into an error.
		await deleteDetachedWorktree(created.handle);

		assert.deepStrictEqual({
			existsOnDisk: existsSync(worktreePath),
			registeredWithGit: isRegisteredWorktree(workspace, worktreePath),
			repositoryStillIntact: existsSync(join(workspace, 'seed.txt')),
		}, {
			existsOnDisk: false,
			registeredWithGit: false,
			repositoryStillIntact: true,
		});
	}, enabled);
}
