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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
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
	async function createUnstartedWorktreeSession(workspace: string, prefix: string, sessionConfig: Readonly<Record<string, unknown>> = {}): Promise<string> {
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
			config: { isolation: 'worktree', branch: git(workspace, 'branch', '--show-current'), ...sessionConfig },
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

	async function withIncludedFiles(
		prefix: string,
		patterns: readonly string[],
		prepare: (workspace: string) => string | undefined,
		verify: (workspace: string, worktree: string) => void,
	): Promise<void> {
		const workspace = createGitWorkspace(`ahp-include-${prefix}-`);
		const branch = prepare(workspace);
		const session = await createUnstartedWorktreeSession(workspace, prefix, {
			worktreeIncludeFiles: patterns,
			...(branch ? { branch } : {}),
		});
		const created = await createDetachedWorktree(session, 'prepare included local files');
		try {
			verify(workspace, URI.parse(created.resource).fsPath);
		} finally {
			await deleteDetachedWorktree(created.handle);
		}
	}

	conformanceTest(context, 'worktree include files: copies matching ignored files but not ordinary untracked files', async function () {
		await withIncludedFiles('selection', ['*.local'], workspace => {
			writeFileSync(join(workspace, '.gitignore'), 'settings.local\nexcluded.local\n');
			writeFileSync(join(workspace, 'settings.local'), 'settings');
			writeFileSync(join(workspace, 'excluded.local'), 'excluded');
			writeFileSync(join(workspace, 'ordinary.local'), 'ordinary');
			return undefined;
		}, (_workspace, worktree) => {
			assert.deepStrictEqual({
				settings: readFileSync(join(worktree, 'settings.local'), 'utf8'),
				excluded: readFileSync(join(worktree, 'excluded.local'), 'utf8'),
				ordinaryExists: existsSync(join(worktree, 'ordinary.local')),
			}, { settings: 'settings', excluded: 'excluded', ordinaryExists: false });
		});
	}, enabled);

	conformanceTest(context, 'worktree include files: recursively copies a wholly ignored directory', async function () {
		await withIncludedFiles('recursive', ['cache/**'], workspace => {
			writeFileSync(join(workspace, '.gitignore'), 'cache/\n');
			mkdirSync(join(workspace, 'cache', 'nested'), { recursive: true });
			writeFileSync(join(workspace, 'cache', 'root.bin'), Buffer.from([0, 1, 254, 255]));
			writeFileSync(join(workspace, 'cache', 'nested', 'value.txt'), 'nested');
			return undefined;
		}, (_workspace, worktree) => {
			assert.deepStrictEqual({
				bytes: [...readFileSync(join(worktree, 'cache', 'root.bin'))],
				text: readFileSync(join(worktree, 'cache', 'nested', 'value.txt'), 'utf8'),
			}, { bytes: [0, 1, 254, 255], text: 'nested' });
		});
	}, enabled);

	conformanceTest(context, 'worktree include files: partial directory globs leave unmatched ignored files behind', async function () {
		await withIncludedFiles('partial', ['cache/**/*.json'], workspace => {
			writeFileSync(join(workspace, '.gitignore'), 'cache/\n');
			mkdirSync(join(workspace, 'cache'));
			writeFileSync(join(workspace, 'cache', 'settings.json'), '{"enabled":true}');
			writeFileSync(join(workspace, 'cache', 'private.txt'), 'not selected');
			return undefined;
		}, (_workspace, worktree) => {
			assert.deepStrictEqual({
				selected: readFileSync(join(worktree, 'cache', 'settings.json'), 'utf8'),
				unselected: existsSync(join(worktree, 'cache', 'private.txt')),
			}, { selected: '{"enabled":true}', unselected: false });
		});
	}, enabled);

	conformanceTest(context, 'worktree include files: honors repository exclude rules and names containing spaces', async function () {
		await withIncludedFiles('exclude', ['local data/**'], workspace => {
			writeFileSync(join(workspace, '.git', 'info', 'exclude'), 'local data/\n');
			mkdirSync(join(workspace, 'local data'));
			writeFileSync(join(workspace, 'local data', 'my settings.json'), '{"port":1234}');
			return undefined;
		}, (_workspace, worktree) => {
			assert.strictEqual(readFileSync(join(worktree, 'local data', 'my settings.json'), 'utf8'), '{"port":1234}');
		});
	}, enabled);

	conformanceTest(context, 'worktree include files: overlapping globs copy a partially tracked directory without replacing tracked content', async function () {
		await withIncludedFiles('overlap', ['data/**', '**/*.local'], workspace => {
			mkdirSync(join(workspace, 'data'));
			writeFileSync(join(workspace, 'data', 'tracked.txt'), 'committed');
			git(workspace, 'add', '.');
			git(workspace, 'commit', '-q', '-m', 'tracked directory');
			writeFileSync(join(workspace, '.gitignore'), '*.local\n');
			writeFileSync(join(workspace, 'data', 'tracked.txt'), 'uncommitted');
			writeFileSync(join(workspace, 'data', 'settings.local'), 'included');
			return undefined;
		}, (_workspace, worktree) => {
			assert.deepStrictEqual({
				tracked: readFileSync(join(worktree, 'data', 'tracked.txt'), 'utf8'),
				local: readFileSync(join(worktree, 'data', 'settings.local'), 'utf8'),
				status: git(worktree, 'status', '--porcelain', '--untracked-files=no'),
			}, { tracked: 'committed', local: 'included', status: '' });
		});
	}, enabled);

	for (const collision of ['file', 'directory', 'ancestor'] as const) {
		conformanceTest(context, `worktree include files: preserves target branch content across ${collision} collisions`, async function () {
			await withIncludedFiles(`collision-${collision}`, ['local/**'], workspace => {
				const original = git(workspace, 'branch', '--show-current');
				git(workspace, 'checkout', '-q', '-b', 'included-target');
				if (collision === 'ancestor') {
					writeFileSync(join(workspace, 'local'), 'target file');
				} else {
					mkdirSync(join(workspace, 'local'), { recursive: true });
					if (collision === 'directory') {
						mkdirSync(join(workspace, 'local', 'value'));
						writeFileSync(join(workspace, 'local', 'value', 'tracked.txt'), 'target file');
					} else {
						writeFileSync(join(workspace, 'local', 'value'), 'target file');
					}
				}
				git(workspace, 'add', '.');
				git(workspace, 'commit', '-q', '-m', 'target shape');
				git(workspace, 'checkout', '-q', original);
				writeFileSync(join(workspace, '.gitignore'), 'local/\n');
				mkdirSync(join(workspace, 'local'), { recursive: true });
				writeFileSync(join(workspace, 'local', 'value'), 'source ignored file');
				writeFileSync(join(workspace, 'local', 'other'), 'non-colliding file');
				return 'included-target';
			}, (_workspace, worktree) => {
				const target = collision === 'ancestor' ? 'local' : collision === 'directory' ? 'local/value/tracked.txt' : 'local/value';
				assert.strictEqual(readFileSync(join(worktree, target), 'utf8'), 'target file');
				if (collision !== 'ancestor') {
					assert.strictEqual(readFileSync(join(worktree, 'local', 'other'), 'utf8'), 'non-colliding file');
				}
				assert.strictEqual(git(worktree, 'status', '--porcelain', '--untracked-files=no'), '');
			});
		}, enabled);
	}

	conformanceTest(context, 'detached worktree safety: archive commits local edits and restores them on unarchive', async function () {
		const workspace = createGitWorkspace('ahp-detached-dirty-');
		const session = await createUnstartedWorktreeSession(workspace, 'dirty-archive');
		const created = await createDetachedWorktree(session, 'preserve local changes');
		const worktree = URI.parse(created.resource).fsPath;
		try {
			const branch = git(worktree, 'branch', '--show-current');
			writeFileSync(join(worktree, 'seed.txt'), 'unsaved work');
			writeFileSync(join(worktree, 'new.txt'), 'new work');
			await setDetachedWorktreeArchived(created.handle, true);
			assert.deepStrictEqual({
				checkoutExists: existsSync(worktree),
				saved: git(workspace, 'show', `${branch}:seed.txt`),
				newFile: git(workspace, 'show', `${branch}:new.txt`),
			}, { checkoutExists: false, saved: 'unsaved work', newFile: 'new work' });
			await setDetachedWorktreeArchived(created.handle, false);
			assert.strictEqual(readFileSync(join(worktree, 'seed.txt'), 'utf8'), 'unsaved work');
			assert.strictEqual(readFileSync(join(worktree, 'new.txt'), 'utf8'), 'new work');
			assert.ok(isRegisteredWorktree(workspace, worktree));
		} finally {
			await deleteDetachedWorktree(created.handle);
		}
	}, enabled);

	conformanceTest(context, 'detached worktree safety: archived handles remain restorable after a host restart', async function () {
		const workspace = createGitWorkspace('ahp-detached-restart-');
		const session = await createUnstartedWorktreeSession(workspace, 'archive-restart');
		const created = await createDetachedWorktree(session, 'persist this detached checkout');
		const worktree = URI.parse(created.resource).fsPath;
		try {
			writeFileSync(join(worktree, 'seed.txt'), 'saved across restart');
			await claimDetachedWorktree(created.handle);
			await setDetachedWorktreeArchived(created.handle, true);
			await context.client.call('disposeSession', { channel: session });
			createdSessions.splice(createdSessions.indexOf(session), 1);
			await context.restartServer();
			await context.client.call('initialize', {
				channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'detached-restored',
			});
			await setDetachedWorktreeArchived(created.handle, false);
			assert.deepStrictEqual({
				contents: readFileSync(join(worktree, 'seed.txt'), 'utf8'),
				registered: isRegisteredWorktree(workspace, worktree),
			}, { contents: 'saved across restart', registered: true });
		} finally {
			await deleteDetachedWorktree(created.handle);
		}
	}, enabled);

	conformanceTest(context, 'detached worktree safety: deletion recovers when the checkout was already removed externally', async function () {
		const workspace = createGitWorkspace('ahp-detached-missing-');
		const session = await createUnstartedWorktreeSession(workspace, 'missing-delete');
		const created = await createDetachedWorktree(session, 'remove missing checkout');
		const worktree = URI.parse(created.resource).fsPath;
		rmSync(worktree, { recursive: true, force: true });
		await deleteDetachedWorktree(created.handle);
		assert.deepStrictEqual({
			registered: isRegisteredWorktree(workspace, worktree),
			original: readFileSync(join(workspace, 'seed.txt'), 'utf8'),
		}, { registered: false, original: 'seed\n' });
		await assert.rejects(claimDetachedWorktree(created.handle), /Unknown detached worktree handle/);
	}, enabled);

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
		const remote = realpathSync(mkdtempSync(join(tmpdir(), 'ahp-detached-archive-remote-')));
		tempDirs.push(remote);
		execFileSync('git', ['init', '--bare', '-q'], { cwd: remote });
		git(workspace, 'remote', 'add', 'origin', remote);
		const sessionUri = await createUnstartedWorktreeSession(workspace, 'detached-archive');

		const created = await createDetachedWorktree(sessionUri, 'archive and restore this checkout');
		const worktreePath = URI.parse(created.resource).fsPath;
		const branchName = git(worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD');
		git(worktreePath, 'push', '-q', '--set-upstream', 'origin', branchName);

		// Archiving reclaims the disk a dormant checkout is holding, but it must
		// preserve the branch and first confirm it has no local-only work. That
		// branch is the only thing that makes the checkout reconstructible, so
		// dropping an unsynced branch would turn "archive" into "discard".
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
