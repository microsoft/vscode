/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { hash } from '../../../../../base/common/hash.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChat, IGitHubInfo, IGitHubPullRequestRef, ISession, ISessionChangesSummary, ISessionFileChange, ISessionFolder, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { computePullRequestIcon, GitHubPullRequestState } from '../../../github/common/types.js';
import { MAX_TRACKED_SESSIONS, MAX_TYPED_FILES_PER_SESSION, SESSIONS_KEY, SessionsLifecycleTracker } from '../../browser/sessionsLifecycleTracker.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

interface ICreateSessionOptions {
	providerId?: string;
	sessionType?: string;
	workspace?: ISessionWorkspace;
	changes?: readonly ISessionFileChange[];
	changesSummary?: ISessionChangesSummary;
	isExternal?: IObservable<boolean>;
}

function createSession(id: string, opts: ICreateSessionOptions = {}): ISession {
	const providerId = opts.providerId ?? 'test-provider';
	const sessionType = opts.sessionType ?? 'test-type';
	return {
		sessionId: id,
		resource: URI.parse(`session://${id}`),
		providerId,
		sessionType,
		icon: Codicon.account,
		createdAt: new Date(),
		workspace: observableValue(`workspace-${id}`, opts.workspace),
		title: observableValue(`title-${id}`, id),
		updatedAt: observableValue(`updatedAt-${id}`, new Date()),
		status: observableValue(`status-${id}`, SessionStatus.Completed),
		changesets: observableValue(`changesets-${id}`, []),
		changes: observableValue(`changes-${id}`, opts.changes ?? []),
		changesSummary: opts.changesSummary !== undefined ? observableValue(`changesSummary-${id}`, opts.changesSummary as ISessionChangesSummary | undefined) : undefined,
		modelId: observableValue(`modelId-${id}`, undefined),
		mode: observableValue(`mode-${id}`, undefined),
		loading: observableValue(`loading-${id}`, false),
		isArchived: observableValue(`isArchived-${id}`, false),
		isRead: observableValue(`isRead-${id}`, true),
		description: observableValue(`description-${id}`, undefined),
		lastTurnEnd: observableValue(`lastTurnEnd-${id}`, undefined),
		chats: observableValue<readonly IChat[]>(`chats-${id}`, []),
		mainChat: constObservable<IChat>(undefined!),
		capabilities: constObservable({ supportsMultipleChats: false }),
		isExternal: opts.isExternal,
	};
}

function createWorkspace(uri: URI, folders: ISessionFolder[]): ISessionWorkspace {
	return {
		uri,
		label: 'ws',
		icon: ThemeIcon.fromId('folder'),
		folders,
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: uri.scheme !== 'file',
	};
}

function createFolder(uri: URI, opts: { readonly workTreeUri?: URI; readonly withGitRepository?: boolean; readonly gitHubInfo?: IGitHubInfo } = {}): ISessionFolder {
	return {
		root: uri,
		workingDirectory: uri,
		name: 'folder',
		description: undefined,
		gitRepository: (opts.withGitRepository || opts.workTreeUri || opts.gitHubInfo)
			? {
				uri,
				workTreeUri: opts.workTreeUri,
				baseBranchName: undefined,
				gitHubInfo: constObservable(opts.gitHubInfo),
			}
			: undefined,
	};
}

function createPullRequestRef(number: number, state: GitHubPullRequestState | 'draft'): IGitHubPullRequestRef {
	return {
		owner: 'microsoft',
		repo: 'vscode',
		number,
		uri: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`),
		icon: computePullRequestIcon(state),
	};
}

suite('SessionsLifecycleTracker', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let storage: InMemoryStorageService;
	let tracker: SessionsLifecycleTracker;

	setup(() => {
		storage = disposables.add(new InMemoryStorageService());
		tracker = disposables.add(new SessionsLifecycleTracker(storage));
	});

	test('starts untracked until a user interaction is recorded', () => {
		const session = createSession('s1');
		assert.strictEqual(tracker.isTracked(session.sessionId), false);

		tracker.recordNewChatRequestSent(session);

		assert.strictEqual(tracker.isTracked(session.sessionId), true);
	});

	test('finalize emits summary and removes tracking entry', () => {
		const session = createSession('s1', { providerId: 'agenthost-example.internal:1234' });
		tracker.recordNewChatRequestSent(session);
		tracker.bumpCounter(session, 'feedbackAdded');
		tracker.bumpCounter(session, 'feedbackAdded');
		tracker.bumpCounter(session, 'commit');

		const summary = tracker.finalize(session.sessionId, 'archived', session);

		assert.ok(summary);
		assert.strictEqual(summary!.agentSessionId, '640d87e741e6aa4c669a82a4cd304787960513ab');
		assert.strictEqual(summary!.providerId, 'remote-agent-host');
		assert.strictEqual(summary!.providerType, 'test-type');
		assert.strictEqual(summary!.doneReason, 'archived');
		assert.strictEqual(summary!.requestsSent, 1);
		assert.strictEqual(summary!.feedbackAdded, 2);
		assert.strictEqual(summary!.commit, 1);
		assert.strictEqual(summary!.firstRequestSentInThisClient, true);
		assert.strictEqual(tracker.isTracked(session.sessionId), false);
	});

	test('finalize returns undefined when session is not tracked', () => {
		const summary = tracker.finalize('does-not-exist', 'deletedRemotely');
		assert.strictEqual(summary, undefined);
	});

	test('state persists across tracker instances and app launch count grows', () => {
		const session = createSession('s1');
		tracker.recordNewChatRequestSent(session);
		tracker.bumpCounter(session, 'feedbackAdded');

		const secondTracker = disposables.add(new SessionsLifecycleTracker(storage));

		assert.strictEqual(secondTracker.isTracked(session.sessionId), true);
		const summary = secondTracker.finalize(session.sessionId, 'archived', session);
		assert.ok(summary);
		assert.strictEqual(summary!.feedbackAdded, 1);
		assert.strictEqual(summary!.requestsSent, 1);
		assert.strictEqual(summary!.appLaunchesSinceFirstObserved, 1);
	});

	test('chatCount increments once per recordRequestSent call', () => {
		const session = createSession('s1');

		tracker.recordNewChatRequestSent(session);
		tracker.recordNewChatRequestSent(session);
		tracker.bumpCounter(session, 'feedbackAdded'); // bumpCounter should not affect chatCount
		tracker.recordNewChatRequestSent(session);

		const summary = tracker.finalize(session.sessionId, 'archived', session);

		assert.ok(summary);
		assert.strictEqual(summary!.chatCount, 3);
		assert.strictEqual(summary!.requestsSent, 3);
	});

	test('getTrackedEntries returns sessionId plus providerId for each entry', () => {
		const a = createSession('a', { providerId: 'provider-a' });
		const b = createSession('b', { providerId: 'provider-b' });

		tracker.recordNewChatRequestSent(a);
		tracker.bumpCounter(b, 'commit');

		const entries = tracker.getTrackedEntries()
			.map(e => `${e.providerId}:${e.sessionId}`)
			.sort();

		assert.deepStrictEqual(entries, ['provider-a:a', 'provider-b:b']);
	});

	test('local archive then deferred remote signal yields a single summary', () => {
		const session = createSession('s1');
		tracker.recordNewChatRequestSent(session);

		const localSummary = tracker.finalize(session.sessionId, 'archived', session);
		assert.ok(localSummary);
		assert.strictEqual(localSummary!.doneReason, 'archived');

		const deferredSummary = tracker.finalize(session.sessionId, 'archivedRemotely', session);
		assert.strictEqual(deferredSummary, undefined);
	});

	test('bumpCounter creates a tracking entry for previously untracked sessions', () => {
		const session = createSession('s1');

		tracker.bumpCounter(session, 'commit');

		assert.strictEqual(tracker.isTracked(session.sessionId), true);
		const summary = tracker.finalize(session.sessionId, 'archived', session);
		assert.ok(summary);
		assert.strictEqual(summary!.commit, 1);
		assert.strictEqual(summary!.requestsSent, 0);
		assert.strictEqual(summary!.firstRequestSentInThisClient, false);
	});

	test('addTypedCharacters accumulates for tracked sessions and never starts tracking', () => {
		const tracked = createSession('s1');
		const untracked = createSession('s2');
		const file = URI.parse('file:///repo/a.ts');
		tracker.recordNewChatRequestSent(tracked);

		tracker.addTypedCharacters(tracked.sessionId, file, 12);
		tracker.addTypedCharacters(tracked.sessionId, file, 30);
		tracker.addTypedCharacters(untracked.sessionId, file, 100);

		assert.strictEqual(tracker.isTracked(untracked.sessionId), false);
		assert.strictEqual(tracker.finalize(tracked.sessionId, 'archived', tracked)!.typedCharacters, 42);
	});

	test('typedFileCount counts distinct files and saturates at the cap', () => {
		const session = createSession('s1');
		tracker.recordNewChatRequestSent(session);

		tracker.addTypedCharacters(session.sessionId, URI.parse('file:///repo/a.ts'), 1);
		tracker.addTypedCharacters(session.sessionId, URI.parse('file:///repo/a.ts'), 1);
		tracker.addTypedCharacters(session.sessionId, URI.parse('file:///repo/b.ts'), 1);
		for (let i = 0; i < MAX_TYPED_FILES_PER_SESSION + 10; i++) {
			tracker.addTypedCharacters(session.sessionId, URI.parse(`file:///repo/gen-${i}.ts`), 1);
		}

		const summary = tracker.finalize(session.sessionId, 'archived', session);
		assert.strictEqual(summary!.typedFileCount, MAX_TYPED_FILES_PER_SESSION);
		assert.strictEqual(summary!.typedCharacters, MAX_TYPED_FILES_PER_SESSION + 13);
	});

	test('typedFileCount separates paths that collide under a 32-bit string hash', () => {
		// `hash()` is a polynomial string hash, so these two paths hash equal
		// and would be counted as a single file.
		const first = URI.parse('file:///repo/Aa.ts');
		const second = URI.parse('file:///repo/BB.ts');
		assert.strictEqual(hash(first.toString()), hash(second.toString()), 'precondition: paths collide under hash()');

		const session = createSession('s1');
		tracker.recordNewChatRequestSent(session);
		tracker.addTypedCharacters(session.sessionId, first, 3);
		tracker.addTypedCharacters(session.sessionId, second, 4);

		const summary = tracker.finalize(session.sessionId, 'archived', session);
		assert.strictEqual(summary!.typedFileCount, 2);
		assert.strictEqual(summary!.typedCharacters, 7);
	});

	test('discards file identities persisted in the superseded numeric format', () => {
		const session = createSession('s1');
		tracker.recordNewChatRequestSent(session);
		tracker.addTypedCharacters(session.sessionId, URI.parse('file:///repo/a.ts'), 5);

		// Rewrite the stored identities the way an earlier build wrote them.
		const stored = JSON.parse(storage.get(SESSIONS_KEY, StorageScope.APPLICATION)!);
		stored[session.sessionId].typedFileHashes = [123, 456];
		storage.store(SESSIONS_KEY, JSON.stringify(stored), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const reloaded = disposables.add(new SessionsLifecycleTracker(storage));
		reloaded.addTypedCharacters(session.sessionId, URI.parse('file:///repo/a.ts'), 2);

		const summary = reloaded.finalize(session.sessionId, 'archived', session);
		// Characters survive; only the incomparable identities are dropped.
		assert.strictEqual(summary!.typedFileCount, 1);
		assert.strictEqual(summary!.typedCharacters, 7);
	});

	test('bumpCounter increments distinct counter keys independently', () => {
		const session = createSession('s1');

		tracker.bumpCounter(session, 'chatRenamed');
		tracker.bumpCounter(session, 'chatRenamed');
		tracker.bumpCounter(session, 'taskRun');
		tracker.bumpCounter(session, 'mergePullRequest');
		tracker.bumpCounter(session, 'fixCIChecks');
		tracker.bumpCounter(session, 'fixCIChecks');
		tracker.bumpCounter(session, 'fixCIChecks');

		const summary = tracker.finalize(session.sessionId, 'archived', session);
		assert.ok(summary);
		assert.deepStrictEqual({
			chatRenamed: summary!.chatRenamed,
			taskRun: summary!.taskRun,
			mergePullRequest: summary!.mergePullRequest,
			fixCIChecks: summary!.fixCIChecks,
			commit: summary!.commit,
		}, {
			chatRenamed: 2,
			taskRun: 1,
			mergePullRequest: 1,
			fixCIChecks: 3,
			commit: 0,
		});
	});

	test('updateSessionState is a no-op for untracked sessions', () => {
		const session = createSession('s1', { changes: [{ modifiedUri: URI.parse('file:///a'), insertions: 5, deletions: 1 }] });

		tracker.updateSessionState(session);

		assert.strictEqual(tracker.isTracked(session.sessionId), false);
	});

	test('changesSummary observable takes precedence over the changes list', () => {
		const session = createSession('s1', {
			changes: [
				{ modifiedUri: URI.parse('file:///a'), insertions: 5, deletions: 1 },
				{ modifiedUri: URI.parse('file:///b'), insertions: 2, deletions: 3 },
			],
			changesSummary: { files: 17, additions: 99, deletions: 88 },
		});

		tracker.recordNewChatRequestSent(session);
		const summary = tracker.finalize(session.sessionId, 'archived', session);

		assert.ok(summary);
		assert.deepStrictEqual({
			filesChanged: summary!.filesChanged,
			linesAdded: summary!.linesAdded,
			linesDeleted: summary!.linesDeleted,
		}, {
			filesChanged: 17,
			linesAdded: 99,
			linesDeleted: 88,
		});
	});

	test('falls back to aggregating changes when changesSummary is absent', () => {
		const session = createSession('s1', {
			changes: [
				{ modifiedUri: URI.parse('file:///a'), insertions: 5, deletions: 1 },
				{ modifiedUri: URI.parse('file:///b'), insertions: 2, deletions: 3 },
			],
		});

		tracker.recordNewChatRequestSent(session);
		const summary = tracker.finalize(session.sessionId, 'archived', session);

		assert.ok(summary);
		assert.deepStrictEqual({
			filesChanged: summary!.filesChanged,
			linesAdded: summary!.linesAdded,
			linesDeleted: summary!.linesDeleted,
		}, {
			filesChanged: 2,
			linesAdded: 7,
			linesDeleted: 4,
		});
	});

	test('summary derives workspace fields from the session workspace at first observation', () => {
		const workspaceUri = URI.parse('vscode-remote://host/repo');
		const repoUri = URI.parse('file:///repo');
		const workspace = createWorkspace(workspaceUri, [
			createFolder(repoUri, { workTreeUri: URI.parse('file:///repo/.git/worktrees/feature') }),
		]);
		const session = createSession('s1', { workspace });

		tracker.recordNewChatRequestSent(session);
		const summary = tracker.finalize(session.sessionId, 'archived', session);

		assert.ok(summary);
		assert.deepStrictEqual({
			isolationKind: summary!.isolationKind,
			hasGitRepository: summary!.hasGitRepository,
			isVirtualWorkspace: summary!.isVirtualWorkspace,
			workspaceHash: summary!.workspaceHash,
		}, {
			isolationKind: 'worktree',
			hasGitRepository: true,
			isVirtualWorkspace: true,
			workspaceHash: hash(workspaceUri.toString()).toString(16),
		});
	});

	test('summary reports folder isolation for a plain file workspace with no worktree', () => {
		const workspaceUri = URI.parse('file:///repo');
		const workspace = createWorkspace(workspaceUri, [
			createFolder(workspaceUri, { withGitRepository: true }),
		]);
		const session = createSession('s1', { workspace });

		tracker.recordNewChatRequestSent(session);
		const summary = tracker.finalize(session.sessionId, 'archived', session);

		assert.ok(summary);
		assert.deepStrictEqual({
			isolationKind: summary!.isolationKind,
			hasGitRepository: summary!.hasGitRepository,
			isVirtualWorkspace: summary!.isVirtualWorkspace,
		}, {
			isolationKind: 'folder',
			hasGitRepository: true,
			isVirtualWorkspace: false,
		});
	});

	test('summary reports the multi-root workspace topology', () => {
		const workspaceUri = URI.parse('file:///repo');
		const gitFolder = URI.parse('file:///repo/app');
		const nonGitFolder = URI.parse('file:///repo/notes');
		const workspace = createWorkspace(workspaceUri, [
			createFolder(gitFolder, { withGitRepository: true }),
			createFolder(nonGitFolder),
		]);
		const session = createSession('s1', { workspace });

		tracker.recordNewChatRequestSent(session);
		const summary = tracker.finalize(session.sessionId, 'archived', session);

		assert.ok(summary);
		assert.deepStrictEqual({
			isMultiRoot: summary!.isMultiRoot,
			folderCount: summary!.folderCount,
			gitFolderCount: summary!.gitFolderCount,
			nonGitFolderCount: summary!.nonGitFolderCount,
		}, {
			isMultiRoot: true,
			folderCount: 2,
			gitFolderCount: 1,
			nonGitFolderCount: 1,
		});
	});

	test('summary reports the folder counts as last observed, not as first observed', () => {
		// A session's workspace resolves asynchronously, so the folders known
		// when tracking starts are not necessarily what the user worked with.
		const workspaceUri = URI.parse('file:///repo');
		const workspace = observableValue<ISessionWorkspace | undefined>('workspace', undefined);
		const session = { ...createSession('s1'), workspace };

		tracker.recordNewChatRequestSent(session);
		workspace.set(createWorkspace(workspaceUri, [
			createFolder(URI.parse('file:///repo/app'), { withGitRepository: true }),
			createFolder(URI.parse('file:///repo/notes')),
			createFolder(URI.parse('file:///repo/docs')),
		]), undefined);
		const summary = tracker.finalize(session.sessionId, 'archived', session);

		assert.ok(summary);
		assert.deepStrictEqual({
			isMultiRoot: summary!.isMultiRoot,
			folderCount: summary!.folderCount,
			gitFolderCount: summary!.gitFolderCount,
			nonGitFolderCount: summary!.nonGitFolderCount,
		}, {
			isMultiRoot: true,
			folderCount: 3,
			gitFolderCount: 1,
			nonGitFolderCount: 2,
		});
	});

	test('summary reports whether the session is external, refreshed on later interactions', () => {
		const isExternal = observableValue('isExternal', false);
		const session = createSession('s1', { isExternal });

		tracker.recordNewChatRequestSent(session);
		isExternal.set(true, undefined);
		tracker.bumpCounter(session, 'commit');
		const summary = tracker.finalize(session.sessionId, 'archived', session);

		const plain = createSession('s2');
		tracker.recordNewChatRequestSent(plain);
		const plainSummary = tracker.finalize(plain.sessionId, 'archived', plain);

		assert.deepStrictEqual({
			external: summary?.isExternal,
			plain: plainSummary?.isExternal,
		}, {
			external: true,
			plain: false,
		});
	});

	test('summary reports the pull request count and the status of the most recent pull request', () => {
		const workspaceUri = URI.parse('file:///repo');
		const gitHubInfo: IGitHubInfo = {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequests: [createPullRequestRef(2, GitHubPullRequestState.Merged), createPullRequestRef(1, GitHubPullRequestState.Closed)],
			pullRequest: { number: 2, uri: URI.parse('https://github.com/microsoft/vscode/pull/2'), icon: computePullRequestIcon(GitHubPullRequestState.Merged) },
		};
		const workspace = createWorkspace(workspaceUri, [createFolder(workspaceUri, { gitHubInfo })]);
		const session = createSession('s1', { workspace });

		tracker.recordNewChatRequestSent(session);
		const summary = tracker.finalize(session.sessionId, 'archived', session);

		const plain = createSession('s2');
		tracker.recordNewChatRequestSent(plain);
		const plainSummary = tracker.finalize(plain.sessionId, 'archived', plain);

		assert.deepStrictEqual({
			pullRequestCount: summary?.pullRequestCount,
			pullRequestStatus: summary?.pullRequestStatus,
			plainPullRequestCount: plainSummary?.pullRequestCount,
			plainPullRequestStatus: plainSummary?.pullRequestStatus,
		}, {
			pullRequestCount: 2,
			pullRequestStatus: 'merged',
			plainPullRequestCount: 0,
			plainPullRequestStatus: undefined,
		});
	});

	test('summary reports a draft pull request status without a resolved main pull request icon', () => {
		const workspaceUri = URI.parse('file:///repo');
		const gitHubInfo: IGitHubInfo = {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequests: [createPullRequestRef(7, 'draft')],
		};
		const workspace = createWorkspace(workspaceUri, [createFolder(workspaceUri, { gitHubInfo })]);
		const session = createSession('s1', { workspace });

		tracker.recordNewChatRequestSent(session);
		const summary = tracker.finalize(session.sessionId, 'archived', session);

		assert.deepStrictEqual({
			pullRequestCount: summary?.pullRequestCount,
			pullRequestStatus: summary?.pullRequestStatus,
		}, {
			pullRequestCount: 1,
			pullRequestStatus: 'draft',
		});
	});

	test('recordFirstRequestTaskInfo is a no-op when the session is not tracked', () => {
		const session = createSession('s1');

		tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: true, configuredTasksCount: 3 });

		assert.strictEqual(tracker.isTracked(session.sessionId), false);
	});

	test('recordFirstRequestTaskInfo only records the first call per session', () => {
		const session = createSession('s1');
		tracker.recordNewChatRequestSent(session);

		tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: true, configuredTasksCount: 4 });
		tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: false, configuredTasksCount: 0 });

		const summary = tracker.finalize(session.sessionId, 'archived', session);
		assert.ok(summary);
		assert.deepStrictEqual({
			hasWorktreeCreatedTask: summary!.hasWorktreeCreatedTask,
			configuredTasksCount: summary!.configuredTasksCount,
		}, {
			hasWorktreeCreatedTask: true,
			configuredTasksCount: 4,
		});
	});

	test('recordFirstRequestTaskInfo persists across tracker instances', () => {
		const session = createSession('s1');
		tracker.recordNewChatRequestSent(session);
		tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: false, configuredTasksCount: 2 });

		const secondTracker = disposables.add(new SessionsLifecycleTracker(storage));
		const summary = secondTracker.finalize(session.sessionId, 'archived', session);

		assert.ok(summary);
		assert.deepStrictEqual({
			hasWorktreeCreatedTask: summary!.hasWorktreeCreatedTask,
			configuredTasksCount: summary!.configuredTasksCount,
		}, {
			hasWorktreeCreatedTask: false,
			configuredTasksCount: 2,
		});
	});

	test('summary reports task info as undefined when never recorded', () => {
		const session = createSession('s1');
		tracker.recordNewChatRequestSent(session);

		const summary = tracker.finalize(session.sessionId, 'archived', session);
		assert.ok(summary);
		assert.deepStrictEqual({
			hasWorktreeCreatedTask: summary!.hasWorktreeCreatedTask,
			configuredTasksCount: summary!.configuredTasksCount,
		}, {
			hasWorktreeCreatedTask: undefined,
			configuredTasksCount: undefined,
		});
	});

	test('incrementAndGetUserRequestCounters returns post-increment values per provider, workspace and total', () => {
		const workspaceA = createWorkspace(URI.parse('file:///ws/a'), [createFolder(URI.parse('file:///ws/a'))]);
		const workspaceB = createWorkspace(URI.parse('file:///ws/b'), [createFolder(URI.parse('file:///ws/b'))]);
		const a1 = createSession('a1', { providerId: 'agenthost-first.example:1234', workspace: workspaceA });
		const a2 = createSession('a2', { providerId: 'agenthost-second.example:5678', workspace: workspaceA });
		const b = createSession('b', { providerId: 'default-copilot', workspace: workspaceB });
		const noWorkspace = createSession('n', { providerId: 'agenthost-third.example:9012' });

		assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(a1), { userSessionsTotal: 1, userSessionsInWorkspace: 1, userSessionsForProvider: 1 });
		assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(a2), { userSessionsTotal: 2, userSessionsInWorkspace: 2, userSessionsForProvider: 2 });
		assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(b), { userSessionsTotal: 3, userSessionsInWorkspace: 1, userSessionsForProvider: 1 });
		assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(noWorkspace), { userSessionsTotal: 4, userSessionsInWorkspace: 0, userSessionsForProvider: 3 });
	});

	test('provider counters migrate raw provider IDs into bounded categories', () => {
		storage.store('agentSessions.telemetry.providerSessions', JSON.stringify({
			'agenthost-first.example:1234': 2,
			'agenthost-second.example:5678': 3,
			'default-copilot': 4,
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const remoteSession = createSession('remote', { providerId: 'agenthost-third.example:9012' });
		const copilotSession = createSession('copilot', { providerId: 'default-copilot' });

		assert.deepStrictEqual([
			tracker.incrementAndGetUserRequestCounters(remoteSession),
			tracker.getUserRequestCounters(copilotSession),
			JSON.parse(storage.get('agentSessions.telemetry.providerSessions', StorageScope.APPLICATION) ?? ''),
		], [
			{ userSessionsTotal: 1, userSessionsInWorkspace: 0, userSessionsForProvider: 6 },
			{ userSessionsTotal: 1, userSessionsInWorkspace: 0, userSessionsForProvider: 4 },
			{ 'remote-agent-host': 6, 'default-copilot': 4 },
		]);
	});

	test('summary includes the request counters as observed at finalize time', () => {
		const workspaceA = createWorkspace(URI.parse('file:///ws/a'), [createFolder(URI.parse('file:///ws/a'))]);
		const workspaceB = createWorkspace(URI.parse('file:///ws/b'), [createFolder(URI.parse('file:///ws/b'))]);
		const sessionToFinalize = createSession('a1', { providerId: 'agenthost-first.example:1234', workspace: workspaceA });
		const otherSameWorkspace = createSession('a2', { providerId: 'agenthost-second.example:5678', workspace: workspaceA });
		const otherDifferentEverything = createSession('b', { providerId: 'default-copilot', workspace: workspaceB });

		tracker.recordNewChatRequestSent(sessionToFinalize);
		tracker.incrementAndGetUserRequestCounters(sessionToFinalize);
		tracker.incrementAndGetUserRequestCounters(otherSameWorkspace);
		tracker.incrementAndGetUserRequestCounters(otherDifferentEverything);

		const summary = tracker.finalize(sessionToFinalize.sessionId, 'archived', sessionToFinalize);
		assert.ok(summary);
		assert.deepStrictEqual({
			userSessionsTotal: summary!.userSessionsTotal,
			userSessionsInWorkspace: summary!.userSessionsInWorkspace,
			userSessionsForProvider: summary!.userSessionsForProvider,
		}, {
			userSessionsTotal: 3,
			userSessionsInWorkspace: 2,
			userSessionsForProvider: 2,
		});
	});

	test('request counters persist across tracker instances', () => {
		const workspace = createWorkspace(URI.parse('file:///ws/a'), [createFolder(URI.parse('file:///ws/a'))]);
		const session = createSession('a1', { providerId: 'p1', workspace });
		tracker.incrementAndGetUserRequestCounters(session);
		tracker.incrementAndGetUserRequestCounters(session);

		const secondTracker = disposables.add(new SessionsLifecycleTracker(storage));
		assert.deepStrictEqual(secondTracker.incrementAndGetUserRequestCounters(session), { userSessionsTotal: 3, userSessionsInWorkspace: 3, userSessionsForProvider: 3 });
	});

	test('getUserRequestCounters returns current values without incrementing', () => {
		const workspace = createWorkspace(URI.parse('file:///ws/a'), [createFolder(URI.parse('file:///ws/a'))]);
		const session = createSession('a1', { providerId: 'p1', workspace });

		assert.deepStrictEqual(tracker.getUserRequestCounters(session), { userSessionsTotal: 0, userSessionsInWorkspace: 0, userSessionsForProvider: 0 });

		tracker.incrementAndGetUserRequestCounters(session);
		tracker.incrementAndGetUserRequestCounters(session);

		assert.deepStrictEqual(tracker.getUserRequestCounters(session), { userSessionsTotal: 2, userSessionsInWorkspace: 2, userSessionsForProvider: 2 });
		// Repeated reads do not mutate state.
		assert.deepStrictEqual(tracker.getUserRequestCounters(session), { userSessionsTotal: 2, userSessionsInWorkspace: 2, userSessionsForProvider: 2 });
	});

	test('summary reports zero request counters for an untouched provider/workspace', () => {
		const session = createSession('s1');
		tracker.bumpCounter(session, 'commit');

		const summary = tracker.finalize(session.sessionId, 'archived', session);
		assert.ok(summary);
		assert.deepStrictEqual({
			userSessionsTotal: summary!.userSessionsTotal,
			userSessionsInWorkspace: summary!.userSessionsInWorkspace,
			userSessionsForProvider: summary!.userSessionsForProvider,
		}, {
			userSessionsTotal: 0,
			userSessionsInWorkspace: 0,
			userSessionsForProvider: 0,
		});
	});

	test('getTrackedIds returns ids of all tracked sessions', () => {
		const a = createSession('a');
		const b = createSession('b');

		tracker.recordNewChatRequestSent(a);
		tracker.bumpCounter(b, 'commit');

		assert.deepStrictEqual(tracker.getTrackedIds().sort(), ['a', 'b']);
	});

	test('tracker treats corrupted storage as empty', () => {
		storage.store(SESSIONS_KEY, '{not valid json', StorageScope.APPLICATION, StorageTarget.MACHINE);

		const recoveredTracker = disposables.add(new SessionsLifecycleTracker(storage));

		assert.deepStrictEqual(recoveredTracker.getTrackedIds(), []);
	});

	test('evicts the oldest entry when capacity is exceeded', () => {
		// Pre-populate storage with MAX_TRACKED_SESSIONS entries; the oldest
		// entry has the smallest firstObservedAt so it should be evicted when
		// one more session is added.
		const now = Date.now();
		const stored: Record<string, unknown> = {};
		for (let i = 0; i < MAX_TRACKED_SESSIONS; i++) {
			stored[`existing-${i}`] = {
				providerId: 'p',
				providerType: 't',
				sessionResourceUri: `session://existing-${i}`,
				workspaceUriString: '',
				isolationKind: 'folder',
				hasGitRepository: false,
				isVirtualWorkspace: false,
				firstRequestSentInThisClient: false,
				hasWorktreeCreatedTask: undefined,
				configuredTasksCount: undefined,
				firstObservedAt: now + i, // existing-0 is oldest
				firstRequestSentAt: 0,
				appLaunchCountAtFirstObserved: 1,
				requestsSent: 0, chatCount: 0,
				feedbackAdded: 0, feedbackConverted: 0, feedbackReplyAdded: 0, feedbackSubmitted: 0,
				createPullRequest: 0, createDraftPullRequest: 0, updatePullRequest: 0, mergePullRequest: 0, checkoutPullRequest: 0,
				initializeRepository: 0, commit: 0, commitAndSync: 0,
				sessionRestored: 0, stickinessToggled: 0, maximizeToggled: 0,
				chatDeleted: 0, chatRenamed: 0, fixCIChecks: 0, taskRun: 0,
				filesChanged: 0, linesAdded: 0, linesDeleted: 0,
			};
		}
		storage.store(SESSIONS_KEY, JSON.stringify(stored), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const capTracker = disposables.add(new SessionsLifecycleTracker(storage));
		assert.strictEqual(capTracker.getTrackedIds().length, MAX_TRACKED_SESSIONS);

		const newSession = createSession('brand-new');
		capTracker.recordNewChatRequestSent(newSession);

		const ids = capTracker.getTrackedIds();
		assert.strictEqual(ids.length, MAX_TRACKED_SESSIONS);
		assert.strictEqual(ids.includes('brand-new'), true);
		assert.strictEqual(ids.includes('existing-0'), false, 'oldest entry should have been evicted');
		assert.strictEqual(ids.includes('existing-1'), true, 'second-oldest entry should still be tracked');
	});
});
