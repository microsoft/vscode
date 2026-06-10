/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DisposableStore, ImmortalReference, IReference } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatSessionFileChange, IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPRFetcher } from '../../../github/browser/fetchers/githubPRFetcher.js';
import { GitHubPullRequestReviewThreadsModel } from '../../../github/browser/models/githubPullRequestReviewThreadsModel.js';
import { IGitHubPRComment, IGitHubPullRequestReviewThread } from '../../../github/common/types.js';
import { IGitHubInfo, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ICodeReviewService, ICodeReviewSuggestion, CodeReviewService, PRReviewStateKind } from '../../browser/codeReviewService.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

suite('CodeReviewService', () => {

	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let service: ICodeReviewService;
	let gitHubService: MockGitHubService;
	let storageService: InMemoryStorageService;
	let sessionsManagement: MockSessionsManagementService;

	let session: URI;
	let fileA: URI;
	let fileB: URI;

	class MockSessionsManagementService extends mock<ISessionsManagementService>() {
		private readonly _onDidChangeSessions: Emitter<ISessionsChangeEvent>;
		private readonly _activeSession: ReturnType<typeof observableValue<IActiveSession | undefined>>;
		override readonly onDidChangeSessions: Event<ISessionsChangeEvent>;
		override readonly activeSession: IObservable<IActiveSession | undefined>;

		private readonly _sessions = new Map<string, ISession>();

		constructor(disposables: DisposableStore) {
			super();
			this._onDidChangeSessions = disposables.add(new Emitter<ISessionsChangeEvent>());
			this.onDidChangeSessions = this._onDidChangeSessions.event;
			this._activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
			this.activeSession = this._activeSession;
		}

		override getSession(resource: URI): ISession | undefined {
			return this._sessions.get(resource.toString());
		}

		addSession(resource: URI, changes?: readonly IChatSessionFileChange2[], archived = false): ISession {
			const changesObs = observableValue<readonly IChatSessionFileChange[]>('test.changes',
				(changes ?? []).map(c => ({ modifiedUri: c.modifiedUri ?? c.uri, originalUri: c.originalUri, insertions: c.insertions, deletions: c.deletions }))
			);
			const isArchivedObs = observableValue<boolean>('test.isArchived', archived);
			const gitHubInfoObs = observableValue<IGitHubInfo | undefined>('test.gitHubInfo', undefined);
			const workspaceUri = URI.file('/workspace');
			const workspaceObs = observableValue<ISessionWorkspace | undefined>('test.workspace', {
				uri: workspaceUri,
				label: 'workspace',
				icon: Codicon.folder,
				folders: [{
					root: workspaceUri,
					workingDirectory: workspaceUri,
					name: 'workspace',
					description: undefined,
					gitRepository: { uri: workspaceUri, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: gitHubInfoObs },
				}],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			});
			const sessionData: ISession = {
				sessionId: `test:${resource.toString()}`,
				resource,
				workspace: workspaceObs,
				changes: changesObs,
				isArchived: isArchivedObs,
			} as unknown as ISession;
			this._sessions.set(resource.toString(), sessionData);
			return sessionData;
		}

		setGitHubInfo(resource: URI, gitHubInfo: IGitHubInfo | undefined): void {
			const session = this._sessions.get(resource.toString());
			if (session) {
				const workspace = session.workspace.get();
				const folder = workspace?.folders[0];
				if (folder) {
					(folder.gitRepository!.gitHubInfo as ReturnType<typeof observableValue<IGitHubInfo | undefined>>).set(gitHubInfo, undefined);
				}
			}
		}

		override setActiveSession(session: ISession | undefined): void {
			this._activeSession.set(session as IActiveSession | undefined, undefined);
		}

		updateSessionChanges(resource: URI, changes: readonly IChatSessionFileChange2[] | undefined): void {
			const session = this._sessions.get(resource.toString());
			if (session) {
				const obs = session.changes as ReturnType<typeof observableValue<readonly IChatSessionFileChange[]>>;
				obs.set(
					(changes ?? []).map(c => ({ modifiedUri: c.modifiedUri ?? c.uri, originalUri: c.originalUri, insertions: c.insertions, deletions: c.deletions })),
					undefined
				);
			}
		}

		removeSession(resource: URI): void {
			this._sessions.delete(resource.toString());
		}

		override getSessions(): ISession[] {
			return [...this._sessions.values()];
		}

		fireSessionsChanged(event?: Partial<ISessionsChangeEvent>): void {
			this._onDidChangeSessions.fire({
				added: event?.added ?? [],
				removed: event?.removed ?? [],
				changed: event?.changed ?? [],
			});
		}
	}

	class MockReviewThreadsFetcher {
		nextThreads: IGitHubPullRequestReviewThread[] = [];
		getReviewThreadsCalls = 0;
		resolveThreadCalls: { threadId: string }[] = [];

		async getReviewThreads(_owner: string, _repo: string, _prNumber: number): Promise<IGitHubPullRequestReviewThread[]> {
			this.getReviewThreadsCalls++;
			return this.nextThreads;
		}

		async postReviewComment(_owner: string, _repo: string, _prNumber: number, body: string, inReplyTo: number): Promise<IGitHubPRComment> {
			return makePRComment(inReplyTo, body);
		}

		async resolveThread(_owner: string, _repo: string, threadId: string): Promise<void> {
			this.resolveThreadCalls.push({ threadId });
		}
	}

	class MockGitHubService extends mock<IGitHubService>() {
		readonly legacyFetcher = new MockReviewThreadsFetcher();
		readonly reviewThreadsFetcher = new MockReviewThreadsFetcher();

		private readonly _reviewThreadsModels = new Map<string, GitHubPullRequestReviewThreadsModel>();
		private readonly _reviewThreadsFetchers = new Map<string, MockReviewThreadsFetcher>();

		getPullRequestCalls = 0;
		getPullRequestReviewThreadsCalls = 0;

		override readonly activeSessionPullRequestReviewThreadsObs: IObservable<GitHubPullRequestReviewThreadsModel | undefined>;

		constructor(sessionsManagementService: MockSessionsManagementService) {
			super();
			this._reviewThreadsFetchers.set(this._key('owner', 'repo', 1), this.reviewThreadsFetcher);

			this.activeSessionPullRequestReviewThreadsObs = derived(reader => {
				const session = sessionsManagementService.activeSession.read(reader);
				const gitHubInfo = session?.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
				if (!gitHubInfo?.pullRequest) {
					return undefined;
				}
				return this.getReviewThreadsModel(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
			});
		}

		getReviewThreadsFetcher(owner: string, repo: string, prNumber: number): MockReviewThreadsFetcher {
			const key = this._key(owner, repo, prNumber);
			let fetcher = this._reviewThreadsFetchers.get(key);
			if (!fetcher) {
				fetcher = new MockReviewThreadsFetcher();
				this._reviewThreadsFetchers.set(key, fetcher);
			}
			return fetcher;
		}

		getReviewThreadsModel(owner: string, repo: string, prNumber: number): GitHubPullRequestReviewThreadsModel {
			const key = this._key(owner, repo, prNumber);
			let model = this._reviewThreadsModels.get(key);
			if (!model) {
				model = store.add(new GitHubPullRequestReviewThreadsModel(owner, repo, prNumber, this.getReviewThreadsFetcher(owner, repo, prNumber) as unknown as GitHubPRFetcher, new NullLogService()));
				this._reviewThreadsModels.set(key, model);
			}
			return model;
		}

		override createPullRequestReviewThreadsModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestReviewThreadsModel> {
			this.getPullRequestReviewThreadsCalls++;
			return new ImmortalReference(this.getReviewThreadsModel(owner, repo, prNumber));
		}

		private _key(owner: string, repo: string, prNumber: number): string {
			return `${owner}/${repo}#${prNumber}`;
		}
	}

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());

		const logService = new NullLogService();
		instantiationService.stub(ILogService, logService);

		sessionsManagement = new MockSessionsManagementService(store);
		instantiationService.stub(ISessionsManagementService, sessionsManagement);

		gitHubService = new MockGitHubService(sessionsManagement);
		instantiationService.stub(IGitHubService, gitHubService);

		storageService = store.add(new InMemoryStorageService());
		instantiationService.stub(IStorageService, storageService);

		service = store.add(instantiationService.createInstance(CodeReviewService));
		session = URI.parse('test://session/1');
		fileA = URI.parse('file:///a.ts');
		fileB = URI.parse('file:///b.ts');
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createServiceWithStoredComments(
		sessionResource: URI,
		comments: readonly { readonly id?: string; readonly uri: URI; readonly range: Range; readonly body: string; readonly kind?: string; readonly severity?: string; readonly suggestion?: ICodeReviewSuggestion }[],
	): ICodeReviewService {
		storageService.store('codeReview.reviews', JSON.stringify({
			[sessionResource.toString()]: comments.map((comment, index) => ({
				id: comment.id ?? `comment-${index}`,
				uri: comment.uri.toJSON(),
				range: comment.range,
				body: comment.body,
				kind: comment.kind ?? 'comment',
				severity: comment.severity ?? 'info',
				suggestion: comment.suggestion,
			})),
		}), StorageScope.WORKSPACE, StorageTarget.MACHINE);

		return store.add(instantiationService.createInstance(CodeReviewService));
	}

	// --- getComments ---

	test('initial comments list is empty', () => {
		assert.deepStrictEqual(service.getComments(session).get(), []);
	});

	test('getComments returns the same observable for the same session', () => {
		const obs1 = service.getComments(session);
		const obs2 = service.getComments(session);
		assert.strictEqual(obs1, obs2);
	});

	test('getComments returns different observables for different sessions', () => {
		const session2 = URI.parse('test://session/2');
		const obs1 = service.getComments(session);
		const obs2 = service.getComments(session2);
		assert.notStrictEqual(obs1, obs2);
	});

	test('PR review state uses dedicated review threads model', async () => {
		sessionsManagement.addSession(session);
		sessionsManagement.setGitHubInfo(session, makeGitHubInfo());
		gitHubService.reviewThreadsFetcher.nextThreads = [makePRThread('thread-100', 'src/a.ts')];

		sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
		await tick();

		// Polling is owned by GitHubPullRequestPollingContribution; refresh
		// manually here to seed the review threads model with data.
		await gitHubService.getReviewThreadsModel('owner', 'repo', 1).refresh();
		await tick();

		const state = service.getPRReviewState(session).get();
		assert.strictEqual(state.kind, PRReviewStateKind.Loaded);
		if (state.kind === PRReviewStateKind.Loaded) {
			assert.deepStrictEqual({
				comments: state.comments.map(comment => ({ id: comment.id, uri: comment.uri.toString(), body: comment.body, author: comment.author })),
				getPullRequestCalls: gitHubService.getPullRequestCalls,
				getPullRequestReviewThreadsCalls: gitHubService.getPullRequestReviewThreadsCalls,
				legacyThreadRefreshes: gitHubService.legacyFetcher.getReviewThreadsCalls,
				reviewThreadRefreshes: gitHubService.reviewThreadsFetcher.getReviewThreadsCalls,
			}, {
				comments: [{ id: 'thread-100', uri: 'file:///workspace/src/a.ts', body: 'Comment on src/a.ts', author: 'reviewer' }],
				getPullRequestCalls: 0,
				getPullRequestReviewThreadsCalls: 0,
				legacyThreadRefreshes: 0,
				reviewThreadRefreshes: 1,
			});
		}
	});

	test('resolvePRReviewThread uses dedicated review threads model', async () => {
		sessionsManagement.addSession(session);
		sessionsManagement.setGitHubInfo(session, makeGitHubInfo());

		await service.resolvePRReviewThread(session, 'thread-100');

		assert.deepStrictEqual({
			getPullRequestCalls: gitHubService.getPullRequestCalls,
			getPullRequestReviewThreadsCalls: gitHubService.getPullRequestReviewThreadsCalls,
			legacyResolveThreadCalls: gitHubService.legacyFetcher.resolveThreadCalls,
			reviewResolveThreadCalls: gitHubService.reviewThreadsFetcher.resolveThreadCalls,
		}, {
			getPullRequestCalls: 0,
			getPullRequestReviewThreadsCalls: 1,
			legacyResolveThreadCalls: [],
			reviewResolveThreadCalls: [{ threadId: 'thread-100' }],
		});
	});

	// --- addComment ---

	test('addComment appends a comment to the session list', () => {
		const comment = service.addComment(session, fileA, new Range(7, 1, 7, 10), 'Needs a guard');

		assert.deepStrictEqual({
			uri: comment.uri.toString(),
			range: comment.range,
			body: comment.body,
			kind: comment.kind,
			severity: comment.severity,
			comments: service.getComments(session).get(),
		}, {
			uri: fileA.toString(),
			range: new Range(7, 1, 7, 10),
			body: 'Needs a guard',
			kind: 'comment',
			severity: 'info',
			comments: [comment],
		});
	});

	// --- removeComment ---

	test('removeComment removes a specific comment', () => {
		service.addComment(session, fileA, new Range(1, 1, 1, 1), 'comment1');
		service.addComment(session, fileA, new Range(5, 1, 5, 1), 'comment2');
		service.addComment(session, fileB, new Range(10, 1, 10, 1), 'comment3');

		const commentToRemove = service.getComments(session).get()[1];
		service.removeComment(session, commentToRemove.id);

		assert.deepStrictEqual(service.getComments(session).get().map(c => c.body), ['comment1', 'comment3']);
	});

	test('removeComment is a no-op for unknown comment id', () => {
		service.addComment(session, fileA, new Range(1, 1, 1, 1), 'comment1');

		service.removeComment(session, 'nonexistent-id');

		assert.strictEqual(service.getComments(session).get().length, 1);
	});

	test('removeComment is a no-op when no comments exist', () => {
		service.removeComment(session, 'some-id');
		assert.deepStrictEqual(service.getComments(session).get(), []);
	});

	// --- Isolation between sessions ---

	test('different sessions are independent', () => {
		const session2 = URI.parse('test://session/2');

		service.addComment(session, fileA, new Range(1, 1, 1, 1), 'session1 comment');
		service.addComment(session2, fileB, new Range(2, 1, 2, 1), 'session2 comment');

		assert.deepStrictEqual({
			session1: service.getComments(session).get().map(c => c.body),
			session2: service.getComments(session2).get().map(c => c.body),
		}, {
			session1: ['session1 comment'],
			session2: ['session2 comment'],
		});
	});

	test('each added comment gets a unique id', () => {
		service.addComment(session, fileA, new Range(1, 1, 1, 1), 'a');
		service.addComment(session, fileA, new Range(1, 1, 1, 1), 'b');

		const comments = service.getComments(session).get();
		assert.notStrictEqual(comments[0].id, comments[1].id);
	});

	// --- Storage persistence ---

	test('comments are persisted to storage', () => {
		service.addComment(session, fileA, new Range(1, 1, 5, 1), 'Persisted comment');

		const raw = storageService.get('codeReview.reviews', StorageScope.WORKSPACE);
		assert.ok(raw, 'Storage should contain review data');
		const stored = JSON.parse(raw!);
		const sessionComments = stored[session.toString()];
		assert.strictEqual(sessionComments.length, 1);
		assert.strictEqual(sessionComments[0].body, 'Persisted comment');
	});

	test('comments are restored from storage on service creation', () => {
		const service2 = createServiceWithStoredComments(session, [
			{ uri: fileA, range: new Range(1, 1, 5, 1), body: 'Restored comment', kind: 'bug', severity: 'high' },
		]);
		const comments = service2.getComments(session).get();
		assert.strictEqual(comments.length, 1);
		assert.strictEqual(comments[0].body, 'Restored comment');
		assert.strictEqual(comments[0].uri.toString(), fileA.toString());
		assert.deepStrictEqual(comments[0].range, { startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 1 });
	});

	test('suggestions are restored correctly', () => {
		const service2 = createServiceWithStoredComments(session, [{
			uri: fileA,
			range: new Range(1, 1, 5, 1),
			body: 'suggestion comment',
			suggestion: {
				edits: [{
					range: new Range(2, 1, 3, 10),
					oldText: 'let x = 1;',
					newText: 'const x = 1;',
				}],
			},
		}]);
		const comments = service2.getComments(session).get();
		assert.strictEqual(comments[0].suggestion?.edits.length, 1);
		assert.strictEqual(comments[0].suggestion?.edits[0].oldText, 'let x = 1;');
		assert.strictEqual(comments[0].suggestion?.edits[0].newText, 'const x = 1;');
	});

	test('removeComment updates storage', () => {
		service.addComment(session, fileA, new Range(1, 1, 1, 1), 'comment1');
		service.addComment(session, fileA, new Range(5, 1, 5, 1), 'comment2');

		const firstId = service.getComments(session).get()[0].id;
		service.removeComment(session, firstId);

		const stored = JSON.parse(storageService.get('codeReview.reviews', StorageScope.WORKSPACE)!);
		assert.strictEqual(stored[session.toString()].length, 1);
		assert.strictEqual(stored[session.toString()][0].body, 'comment2');
	});

	test('corrupted storage is handled gracefully', () => {
		storageService.store('codeReview.reviews', 'not-valid-json{{{', StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service2 = store.add(instantiationService.createInstance(CodeReviewService));
		assert.deepStrictEqual(service2.getComments(session).get(), []);
	});

	// --- Session lifecycle cleanup ---

	test('archived session comments are cleaned up', () => {
		service.addComment(session, fileA, new Range(1, 1, 1, 1), 'comment');

		const mockSession = sessionsManagement.addSession(session, undefined, true);
		sessionsManagement.fireSessionsChanged({ changed: [mockSession] });

		assert.deepStrictEqual(service.getComments(session).get(), []);
		assert.strictEqual(storageService.get('codeReview.reviews', StorageScope.WORKSPACE), undefined);
	});

	test('non-archived session change preserves comments', () => {
		const changes: IChatSessionFileChange2[] = [
			{ uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
		];

		const serviceWithReview = createServiceWithStoredComments(session, [
			{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' },
		]);

		const mockSession = sessionsManagement.addSession(session, changes, false);
		sessionsManagement.fireSessionsChanged({ changed: [mockSession] });

		assert.strictEqual(serviceWithReview.getComments(session).get().length, 1);
	});

	test('session that no longer exists has comments cleaned up', () => {
		service.addComment(session, fileA, new Range(1, 1, 1, 1), 'orphaned comment');

		sessionsManagement.fireSessionsChanged();

		assert.deepStrictEqual(service.getComments(session).get(), []);
	});
});

function makeGitHubInfo(prNumber = 1): IGitHubInfo {
	return {
		owner: 'owner',
		repo: 'repo',
		pullRequest: {
			number: prNumber,
			uri: URI.parse(`https://github.com/owner/repo/pull/${prNumber}`),
		},
	};
}

function makePRThread(id: string, path: string): IGitHubPullRequestReviewThread {
	return {
		id,
		isResolved: false,
		path,
		line: 10,
		comments: [makePRComment(100, `Comment on ${path}`, id)],
	};
}

function makePRComment(id: number, body: string, threadId: string = String(id)): IGitHubPRComment {
	return {
		id,
		body,
		author: { login: 'reviewer', avatarUrl: '' },
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		path: undefined,
		line: undefined,
		threadId,
		inReplyToId: undefined,
	};
}

function tick(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}
