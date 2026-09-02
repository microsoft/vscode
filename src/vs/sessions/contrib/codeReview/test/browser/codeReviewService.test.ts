/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { IObservable, constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { DisposableStore, ImmortalReference, IReference } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatSessionFileChange, IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionHasChangesContext, SessionIsCreatedContext, SinglePaneLayoutEnabledContext } from '../../../../common/contextkeys.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPRFetcher } from '../../../github/browser/fetchers/githubPRFetcher.js';
import { GitHubPullRequestReviewThreadsModel } from '../../../github/browser/models/githubPullRequestReviewThreadsModel.js';
import { IGitHubPRComment, IGitHubPullRequestReviewThread } from '../../../github/common/types.js';
import { SessionChangesEditorInput } from '../../../changes/browser/sessionChangesEditorInput.js';
import { IGitHubInfo, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ICodeReviewService, CodeReviewService, PRReviewStateKind } from '../../browser/codeReviewService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISendRequestOptions, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import '../../browser/codeReview.contributions.js';

suite('CodeReviewService', () => {

	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let service: ICodeReviewService;
	let gitHubService: MockGitHubService;
	let sessionsManagement: MockSessionsManagementService;

	let session: URI;

	class MockSessionsManagementService extends mock<ISessionsManagementService>() {
		private readonly _onDidChangeSessions: Emitter<ISessionsChangeEvent>;
		private readonly _activeSession: ReturnType<typeof observableValue<IActiveSession | undefined>>;
		override readonly onDidChangeSessions: Event<ISessionsChangeEvent>;
		readonly activeSession: IObservable<IActiveSession | undefined>;

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

		setActiveSession(session: ISession | undefined): void {
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
		nextError: Error | undefined;
		getReviewThreadsGate: DeferredPromise<void> | undefined;
		getReviewThreadsCalls = 0;
		resolveThreadCalls: { threadId: string }[] = [];

		async getReviewThreads(_owner: string, _repo: string, _prNumber: number): Promise<IGitHubPullRequestReviewThread[]> {
			this.getReviewThreadsCalls++;
			const result = this.nextThreads;
			await this.getReviewThreadsGate?.p;
			if (this.nextError) {
				throw this.nextError;
			}
			return result;
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
		instantiationService.stub(ISessionsService, { activeSession: sessionsManagement.activeSession } as unknown as ISessionsService);

		gitHubService = new MockGitHubService(sessionsManagement);
		instantiationService.stub(IGitHubService, gitHubService);

		service = store.add(instantiationService.createInstance(CodeReviewService));
		session = URI.parse('test://session/1');
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('PR review state uses dedicated review threads model', async () => {
		sessionsManagement.addSession(session);
		sessionsManagement.setGitHubInfo(session, makeGitHubInfo());
		gitHubService.reviewThreadsFetcher.nextThreads = [makePRThread('thread-100', 'src/a.ts')];

		sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
		await tick();

		const state = service.getPRReviewState(session).get();
		assert.strictEqual(state.kind, PRReviewStateKind.Loaded);
		if (state.kind === PRReviewStateKind.Loaded) {
			assert.deepStrictEqual({
				comments: state.comments.map(comment => ({ id: comment.id, prNumber: comment.pullRequest.number, uri: comment.uri.toString(), body: comment.body, author: comment.author })),
				getPullRequestCalls: gitHubService.getPullRequestCalls,
				legacyThreadRefreshes: gitHubService.legacyFetcher.getReviewThreadsCalls,
				reviewThreadRefreshes: gitHubService.reviewThreadsFetcher.getReviewThreadsCalls,
			}, {
				comments: [{ id: 'thread-100', prNumber: 1, uri: 'file:///workspace/src/a.ts', body: 'Comment on src/a.ts', author: 'reviewer' }],
				getPullRequestCalls: 0,
				legacyThreadRefreshes: 0,
				reviewThreadRefreshes: 1,
			});
		}
	});

	test('PR review state combines comments from every associated pull request', async () => {
		sessionsManagement.addSession(session);
		sessionsManagement.setGitHubInfo(session, {
			...makeGitHubInfo(),
			pullRequests: [1, 2].map(number => ({
				owner: 'owner',
				repo: 'repo',
				number,
				uri: URI.parse(`https://github.com/owner/repo/pull/${number}`),
			})),
		});
		gitHubService.getReviewThreadsFetcher('owner', 'repo', 1).nextThreads = [makePRThread('thread-100', 'src/a.ts')];
		gitHubService.getReviewThreadsFetcher('owner', 'repo', 2).nextThreads = [makePRThread('thread-200', 'src/b.ts')];

		sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
		await tick();

		const state = service.getPRReviewState(session).get();
		assert.deepStrictEqual(state.kind === PRReviewStateKind.Loaded
			? state.comments.map(comment => ({ id: comment.id, prNumber: comment.pullRequest.number }))
			: state.kind, [
			{ id: 'thread-100', prNumber: 1 },
			{ id: 'thread-200', prNumber: 2 },
		]);
	});

	test('PR review state stays loading until every pull request completes its initial refresh', async () => {
		sessionsManagement.addSession(session);
		sessionsManagement.setGitHubInfo(session, {
			...makeGitHubInfo(),
			pullRequests: [1, 2].map(number => ({
				owner: 'owner',
				repo: 'repo',
				number,
				uri: URI.parse(`https://github.com/owner/repo/pull/${number}`),
			})),
		});
		const firstFetcher = gitHubService.getReviewThreadsFetcher('owner', 'repo', 1);
		const secondFetcher = gitHubService.getReviewThreadsFetcher('owner', 'repo', 2);
		firstFetcher.nextThreads = [makePRThread('thread-100', 'src/a.ts')];
		secondFetcher.nextThreads = [makePRThread('thread-200', 'src/b.ts')];
		firstFetcher.getReviewThreadsGate = new DeferredPromise<void>();
		secondFetcher.getReviewThreadsGate = new DeferredPromise<void>();

		sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
		await tick();
		const beforeRefresh = service.getPRReviewState(session).get().kind;

		firstFetcher.getReviewThreadsGate.complete();
		await tick();
		const afterFirstRefresh = service.getPRReviewState(session).get().kind;

		secondFetcher.getReviewThreadsGate.complete();
		await tick();
		const afterAllRefreshes = service.getPRReviewState(session).get();

		assert.deepStrictEqual({
			beforeRefresh,
			afterFirstRefresh,
			afterAllRefreshes: afterAllRefreshes.kind === PRReviewStateKind.Loaded
				? afterAllRefreshes.comments.map(comment => ({ id: comment.id, prNumber: comment.pullRequest.number }))
				: afterAllRefreshes.kind,
		}, {
			beforeRefresh: PRReviewStateKind.Loading,
			afterFirstRefresh: PRReviewStateKind.Loading,
			afterAllRefreshes: [
				{ id: 'thread-100', prNumber: 1 },
				{ id: 'thread-200', prNumber: 2 },
			],
		});
	});

	test('PR review state exposes healthy comments when another pull request fails to load', async () => {
		sessionsManagement.addSession(session);
		sessionsManagement.setGitHubInfo(session, {
			...makeGitHubInfo(),
			pullRequests: [1, 2].map(number => ({
				owner: 'owner',
				repo: 'repo',
				number,
				uri: URI.parse(`https://github.com/owner/repo/pull/${number}`),
			})),
		});
		gitHubService.getReviewThreadsFetcher('owner', 'repo', 1).nextThreads = [makePRThread('thread-100', 'src/a.ts')];
		gitHubService.getReviewThreadsFetcher('owner', 'repo', 2).nextError = new Error('not found');

		sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
		await tick();

		const state = service.getPRReviewState(session).get();
		assert.deepStrictEqual(state.kind === PRReviewStateKind.Loaded
			? {
				comments: state.comments.map(comment => ({ id: comment.id, prNumber: comment.pullRequest.number })),
				incompletePullRequests: state.incompletePullRequests.map(pullRequest => pullRequest.number),
			}
			: state.kind, {
			comments: [{ id: 'thread-100', prNumber: 1 }],
			incompletePullRequests: [2],
		});
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

	test('dismissPRReviewComment filters the comment from the loaded review state', async () => {
		sessionsManagement.addSession(session);
		sessionsManagement.setGitHubInfo(session, makeGitHubInfo());
		gitHubService.reviewThreadsFetcher.nextThreads = [makePRThread('thread-100', 'src/a.ts'), makePRThread('thread-200', 'src/b.ts')];

		sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
		await tick();
		await gitHubService.getReviewThreadsModel('owner', 'repo', 1).refresh();
		await tick();

		service.dismissPRReviewComment(session, 'thread-100');

		const state = service.getPRReviewState(session).get();
		assert.deepStrictEqual(
			state.kind === PRReviewStateKind.Loaded ? state.comments.map(c => c.id) : state.kind,
			['thread-200'],
		);
	});
});

suite('Code Review Contributions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Run Code Review is contributed to the editor title bar', () => {
		const titleItem = MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.codeReview.run');

		assert.ok(titleItem, 'expected Run Code Review in the editor title bar');
		const when = titleItem.when?.serialize() ?? '';
		const enablementContext = new Context(1, null);
		enablementContext.setValue(ChatContextKeys.hasAgentSessionChanges.key, false);
		enablementContext.setValue(SessionHasChangesContext.key, true);
		const enabledFromSessionChanges = titleItem.command.precondition?.evaluate(enablementContext);
		enablementContext.setValue(ChatContextKeys.hasAgentSessionChanges.key, true);
		enablementContext.setValue(SessionHasChangesContext.key, false);
		assert.deepStrictEqual({
			group: titleItem.group,
			order: titleItem.order,
			enabledFromSessionChanges,
			enabledFromChatChanges: titleItem.command.precondition?.evaluate(enablementContext),
			hasSessionsWindowGate: when.includes(IsSessionsWindowContext.key),
			hasActiveEditorGate: when.includes(ActiveEditorContext.key) && when.includes(SessionChangesEditorInput.EDITOR_ID),
			hasSinglePaneLayoutGate: when.includes(SinglePaneLayoutEnabledContext.key),
			hasAuxiliaryWindowGate: when.includes(IsAuxiliaryWindowContext.key),
			hasTopRightEditorGroupGate: when.includes(IsTopRightEditorGroupContext.key),
			hasChangesGate: when.includes(SessionHasChangesContext.key),
			hasCreatedGate: when.includes(SessionIsCreatedContext.key),
			hasEditorAreaVisibleGate: when.includes(MainEditorAreaVisibleContext.key),
		}, {
			group: 'navigation',
			order: 10,
			enabledFromSessionChanges: true,
			enabledFromChatChanges: true,
			hasSessionsWindowGate: true,
			hasActiveEditorGate: true,
			hasSinglePaneLayoutGate: true,
			hasAuxiliaryWindowGate: true,
			hasTopRightEditorGroupGate: true,
			hasChangesGate: true,
			hasCreatedGate: true,
			hasEditorAreaVisibleGate: false,
		});
	});

	test('Run Code Review is shown in the classic Changes toolbar only for created sessions', () => {
		const item = MenuRegistry.getMenuItems(MenuId.AgentsChangesToolbar)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessions.codeReview.run');

		assert.ok(item, 'expected Run Code Review action on the classic Changes toolbar');
		assert.strictEqual(
			item.when?.serialize().includes(SessionIsCreatedContext.key),
			true,
		);
	});

	test('Run Code Review resolves a Changes editor resource to its owning session', async () => {
		const sessionResource = URI.parse('session:test');
		const editorResource = URI.parse('changes-multi-diff-source:test');
		const session = {
			resource: sessionResource,
			capabilities: constObservable({ supportsMultipleChats: true }),
		} as ISession;
		let sentQuery: string | undefined;
		const testInstantiationService = store.add(new TestInstantiationService());
		testInstantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI): ISession | undefined {
				return resource.toString() === sessionResource.toString() ? session : undefined;
			}
			override async sendNewChatRequest(_session: ISession, options: ISendRequestOptions): Promise<void> {
				sentQuery = options.query;
			}
		});
		testInstantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { });
		testInstantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() { });
		testInstantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
			override getSessionResource(resource: URI): URI | undefined {
				return resource.toString() === editorResource.toString() ? sessionResource : undefined;
			}
		});
		const command = CommandsRegistry.getCommand('sessions.codeReview.run');
		assert.ok(command);

		await testInstantiationService.invokeFunction((accessor: ServicesAccessor) => command.handler(accessor, editorResource));

		assert.strictEqual(sentQuery, '/code-review');
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
