/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { GitHubPullRequestPollingContribution } from '../../browser/github.contribution.js';
import { IGitHubService } from '../../browser/githubService.js';
import { IPullRequestStateSnapshot } from '../../browser/githubPullRequestStateCache.js';
import { GitHubPullRequestState } from '../../common/types.js';
import { getPullRequestKey } from '../../common/utils.js';
import { IChat, IGitHubInfo, ISession, ISessionCapabilities, ISessionChangeset, IChatCheckpoints, ISessionFileChange, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

suite('GitHubPullRequestPollingContribution', () => {

	const store = new DisposableStore();
	let sessionsManagementService: TestSessionsManagementService;
	let sessionsService: TestSessionsService;
	let gitHubService: TestGitHubService;

	setup(() => {
		sessionsManagementService = new TestSessionsManagementService(store);
		sessionsService = new TestSessionsService();
		gitHubService = new TestGitHubService();
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(): GitHubPullRequestPollingContribution {
		return store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService));
	}

	test('fetches pull request state once when it resolves asynchronously', () => {
		// Some providers (e.g. the agent host) resolve the PR number
		// asynchronously, so a session can be present before its `gitHubInfo`
		// carries a pull request. The contribution must observe `gitHubInfo`
		// reactively and fetch the state once it resolves.
		const session = sessionsManagementService.addSession('async', undefined);
		createContribution();

		assert.deepStrictEqual(gitHubService.fetchCalls, []);

		sessionsManagementService.setGitHubInfo(session, makeGitHubInfo(1));

		assert.deepStrictEqual(gitHubService.fetchCalls, ['owner/repo/1']);
	});

	test('does not fetch when the state is already cached (seeded from storage)', () => {
		gitHubService.seedCache('owner', 'repo', 1, { iconState: GitHubPullRequestState.Open });
		sessionsManagementService.addSession('cached', makeGitHubInfo(1));

		createContribution();

		assert.deepStrictEqual(gitHubService.fetchCalls, []);
	});

	test('polls sessions that are open in the grid', () => {
		gitHubService.seedCache('owner', 'repo', 1, { iconState: GitHubPullRequestState.Open });
		const session = sessionsManagementService.addSession('visible', makeGitHubInfo(1));
		sessionsService.setVisibleSessions([session]);

		createContribution();

		assert.deepStrictEqual(gitHubService.pollSnapshot(), { 'owner/repo/1': { start: 1, stop: 0 } });
	});

	test('only polls the most recently updated sessions, retaining cached state for the rest', () => {
		// 6 non-visible sessions, each with a distinct PR and update time. Only
		// the 5 most recently updated should be polled.
		for (let i = 1; i <= 6; i++) {
			gitHubService.seedCache('owner', 'repo', i, { iconState: GitHubPullRequestState.Open });
			const session = sessionsManagementService.addSession(`s${i}`, makeGitHubInfo(i));
			session.updatedAt.set(new Date(i * 1000), undefined);
		}

		createContribution();

		// The oldest (s1 -> PR #1) is not polled; the rest are.
		assert.deepStrictEqual(gitHubService.pollSnapshot(), {
			'owner/repo/2': { start: 1, stop: 0 },
			'owner/repo/3': { start: 1, stop: 0 },
			'owner/repo/4': { start: 1, stop: 0 },
			'owner/repo/5': { start: 1, stop: 0 },
			'owner/repo/6': { start: 1, stop: 0 },
		});

		// The un-polled session still has its (last-seen) cached state available.
		assert.deepStrictEqual(gitHubService.getCachedPullRequestState('owner', 'repo', 1).get(), { iconState: GitHubPullRequestState.Open });
	});

	test('stops polling when a session is archived but keeps its cached state', () => {
		gitHubService.seedCache('owner', 'repo', 1, { iconState: GitHubPullRequestState.Open });
		const session = sessionsManagementService.addSession('session', makeGitHubInfo(1));
		createContribution();

		assert.deepStrictEqual(gitHubService.pollSnapshot(), { 'owner/repo/1': { start: 1, stop: 0 } });

		sessionsManagementService.setArchived(session, true);
		sessionsManagementService.fireSessionsChanged({ changed: [session] });

		assert.deepStrictEqual(gitHubService.pollSnapshot(), { 'owner/repo/1': { start: 1, stop: 1 } });
		assert.deepStrictEqual(gitHubService.getCachedPullRequestState('owner', 'repo', 1).get(), { iconState: GitHubPullRequestState.Open });
	});

	test('stops polling when disposed', () => {
		gitHubService.seedCache('owner', 'repo', 1, { iconState: GitHubPullRequestState.Open });
		sessionsManagementService.addSession('session', makeGitHubInfo(1));
		const contribution = createContribution();

		contribution.dispose();

		assert.deepStrictEqual(gitHubService.pollSnapshot(), { 'owner/repo/1': { start: 1, stop: 1 } });
	});
});

class TestSessionsService extends mock<ISessionsService>() {

	override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
	override readonly visibleSessions: ISettableObservable<readonly (IActiveSession | undefined)[]> = observableValue('test.visibleSessions', []);

	setVisibleSessions(sessions: readonly ISession[]): void {
		this.visibleSessions.set(sessions as readonly IActiveSession[], undefined);
	}
}

class TestSessionsManagementService extends mock<ISessionsManagementService>() {

	private readonly _onDidChangeSessions: Emitter<ISessionsChangeEvent>;
	private readonly _sessions = new Map<string, TestSession>();

	override readonly onDidChangeSessions: Event<ISessionsChangeEvent>;

	constructor(disposables: DisposableStore) {
		super();
		this._onDidChangeSessions = disposables.add(new Emitter<ISessionsChangeEvent>());
		this.onDidChangeSessions = this._onDidChangeSessions.event;
	}

	addSession(id: string, gitHubInfo: IGitHubInfo | undefined, archived = false): TestSession {
		const session = new TestSession(id, gitHubInfo, archived);
		this._sessions.set(session.sessionId, session);
		return session;
	}

	setArchived(session: ISession, archived: boolean): void {
		(session.isArchived as ISettableObservable<boolean>).set(archived, undefined);
	}

	setGitHubInfo(session: ISession, gitHubInfo: IGitHubInfo | undefined): void {
		const workspace = session.workspace.get();
		const folder = workspace?.folders[0];
		if (folder) {
			(folder.gitRepository!.gitHubInfo as ISettableObservable<IGitHubInfo | undefined>).set(gitHubInfo, undefined);
		}
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

class TestSession implements IActiveSession {

	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId = 'test';
	readonly sessionType = 'test';
	readonly icon = Codicon.comment;
	readonly createdAt = new Date(0);
	readonly title: ISettableObservable<string>;
	readonly updatedAt: ISettableObservable<Date>;
	readonly status: ISettableObservable<SessionStatus>;
	readonly changesets: ISettableObservable<readonly ISessionChangeset[]>;
	readonly changes: ISettableObservable<readonly ISessionFileChange[]>;
	readonly workspace: ISettableObservable<ISessionWorkspace | undefined>;
	readonly modelId: ISettableObservable<string | undefined>;
	readonly mode: ISettableObservable<{ readonly id: string; readonly kind: string } | undefined>;
	readonly loading: ISettableObservable<boolean>;
	readonly isArchived: ISettableObservable<boolean>;
	readonly isRead: ISettableObservable<boolean>;
	readonly description: ISettableObservable<IMarkdownString | undefined>;
	readonly lastTurnEnd: ISettableObservable<Date | undefined>;
	readonly chats: ISettableObservable<readonly IChat[]>;
	readonly mainChat: IObservable<IChat>;
	readonly activeChat: IObservable<IChat>;
	readonly isCreated: IObservable<boolean> = constObservable(true);
	readonly sticky: IObservable<boolean> = constObservable(false);
	readonly capabilities: ISessionCapabilities = { supportsMultipleChats: false };

	constructor(id: string, gitHubInfo: IGitHubInfo | undefined, archived: boolean) {
		this.sessionId = `test:${id}`;
		this.resource = URI.from({ scheme: 'test', path: `/${id}` });
		const gitHubInfoObs = observableValue<IGitHubInfo | undefined>(`test.gitHubInfo.${id}`, gitHubInfo);
		const workspaceUri = URI.from({ scheme: 'test', path: `/workspace/${id}` });
		this.title = observableValue<string>(`test.title.${id}`, id);
		this.updatedAt = observableValue<Date>(`test.updatedAt.${id}`, new Date(0));
		this.status = observableValue<SessionStatus>(`test.status.${id}`, SessionStatus.Completed);
		this.changesets = observableValue<readonly ISessionChangeset[]>(`test.changesets.${id}`, []);
		this.changes = observableValue<readonly ISessionFileChange[]>(`test.changes.${id}`, []);
		this.workspace = observableValue<ISessionWorkspace | undefined>(`test.workspace.${id}`, {
			uri: workspaceUri,
			label: id,
			icon: Codicon.folder,
			folders: [{
				root: workspaceUri,
				workingDirectory: workspaceUri,
				name: id,
				description: undefined,
				gitRepository: { uri: workspaceUri, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: gitHubInfoObs },
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		});
		this.modelId = observableValue<string | undefined>(`test.modelId.${id}`, undefined);
		this.mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>(`test.mode.${id}`, undefined);
		this.loading = observableValue<boolean>(`test.loading.${id}`, false);
		this.isArchived = observableValue<boolean>(`test.isArchived.${id}`, archived);
		this.isRead = observableValue<boolean>(`test.isRead.${id}`, true);
		this.description = observableValue<IMarkdownString | undefined>(`test.description.${id}`, undefined);
		this.lastTurnEnd = observableValue<Date | undefined>(`test.lastTurnEnd.${id}`, undefined);

		const checkpoints = observableValue<IChatCheckpoints | undefined>(`test.checkpoints.${id}`, undefined);

		const mainChat: IChat = {
			resource: this.resource,
			createdAt: this.createdAt,
			title: this.title,
			updatedAt: this.updatedAt,
			status: this.status,
			changes: this.changes,
			checkpoints,
			modelId: this.modelId,
			mode: this.mode,
			isArchived: this.isArchived,
			isRead: this.isRead,
			description: this.description,
			lastTurnEnd: this.lastTurnEnd,
		};
		this.mainChat = constObservable(mainChat);
		this.activeChat = this.mainChat;
		this.chats = observableValue<readonly IChat[]>(`test.chats.${id}`, [mainChat]);
	}
}

class TestGitHubService extends mock<IGitHubService>() {

	readonly fetchCalls: string[] = [];
	private readonly _polls = new Map<string, { start: number; stop: number }>();
	private readonly _cache = new Map<string, ISettableObservable<IPullRequestStateSnapshot | undefined>>();

	override getCachedPullRequestState(owner: string, repo: string, prNumber: number): IObservable<IPullRequestStateSnapshot | undefined> {
		return this._obs(getPullRequestKey(owner, repo, prNumber));
	}

	override fetchPullRequestState(owner: string, repo: string, prNumber: number): Promise<void> {
		this.fetchCalls.push(getPullRequestKey(owner, repo, prNumber));
		return Promise.resolve();
	}

	override pollPullRequestState(owner: string, repo: string, prNumber: number): IDisposable {
		const key = getPullRequestKey(owner, repo, prNumber);
		const entry = this._polls.get(key) ?? { start: 0, stop: 0 };
		entry.start++;
		this._polls.set(key, entry);
		return toDisposable(() => { entry.stop++; });
	}

	seedCache(owner: string, repo: string, prNumber: number, snapshot: IPullRequestStateSnapshot): void {
		this._obs(getPullRequestKey(owner, repo, prNumber)).set(snapshot, undefined);
	}

	pollSnapshot(): Record<string, { start: number; stop: number }> {
		return Object.fromEntries([...this._polls.entries()].map(([key, value]) => [key, { ...value }]));
	}

	private _obs(key: string): ISettableObservable<IPullRequestStateSnapshot | undefined> {
		let observable = this._cache.get(key);
		if (!observable) {
			observable = observableValue<IPullRequestStateSnapshot | undefined>(`test.cache.${key}`, undefined);
			this._cache.set(key, observable);
		}
		return observable;
	}
}

function makeGitHubInfo(prNumber: number): IGitHubInfo {
	return {
		owner: 'owner',
		repo: 'repo',
		pullRequest: {
			number: prNumber,
			uri: URI.parse(`https://github.com/owner/repo/pull/${prNumber}`),
		},
	};
}
