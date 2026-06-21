/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, IDisposable, ImmortalReference, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { GitHubPullRequestCIModel } from '../../browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../browser/models/githubPullRequestReviewThreadsModel.js';
import { GitHubPullRequestState, IGitHubPullRequest } from '../../common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { GitHubPullRequestPollingContribution } from '../../browser/github.contribution.js';
import { IGitHubService } from '../../browser/githubService.js';
import { IChat, IGitHubInfo, ISession, ISessionCapabilities, ISessionChangeset, IChatCheckpoints, ISessionFileChange, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

suite('GitHubPullRequestPollingContribution', () => {

	const store = new DisposableStore();
	const logService = new NullLogService();
	let sessionsManagementService: TestSessionsManagementService;
	let sessionsService: ISessionsService;
	let gitHubService: TestGitHubService;
	let activeSession: ISettableObservable<IActiveSession | undefined>;

	setup(() => {
		sessionsManagementService = new TestSessionsManagementService(store);
		activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
		sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
		};
		gitHubService = new TestGitHubService();
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('starts polling existing and added pull request sessions', () => {
		const existingSession = sessionsManagementService.addSession('existing', makeGitHubInfo(1));

		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));

		const addedSession = sessionsManagementService.addSession('added', makeGitHubInfo(2));
		sessionsManagementService.fireSessionsChanged({ added: [addedSession] });

		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 },
			'owner/repo/2': { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 },
		});
		assert.strictEqual(existingSession.isArchived.get(), false);
	});

	test('stops polling when a session is archived, then resumes when unarchived', () => {
		const session = sessionsManagementService.addSession('session', makeGitHubInfo(1));
		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));

		sessionsManagementService.setArchived(session, true);
		sessionsManagementService.fireSessionsChanged({ changed: [session] });

		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 },
		});

		sessionsManagementService.setArchived(session, false);
		sessionsManagementService.fireSessionsChanged({ changed: [session] });

		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 2, stopPollingCalls: 1, disposeCalls: 0 },
		});
	});

	test('does not poll archived sessions until they are unarchived', () => {
		const session = sessionsManagementService.addSession('session', makeGitHubInfo(1), true);
		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));

		assert.deepStrictEqual(gitHubService.snapshot(), {});

		sessionsManagementService.setArchived(session, false);
		sessionsManagementService.fireSessionsChanged({ changed: [session] });

		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 },
		});
	});

	test('stops polling tracked pull requests when disposed', () => {
		const session = sessionsManagementService.addSession('session', makeGitHubInfo(1));
		const contribution = store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));

		contribution.dispose();

		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 },
		});
		assert.strictEqual(session.isArchived.get(), false);
	});

	test('polls CI checks and review threads once an open pull request resolves', () => {
		sessionsManagementService.addSession('session', makeGitHubInfo(1));
		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));

		// Until the PR details load, only the PR model is polled.
		assert.deepStrictEqual(gitHubService.statusModelSnapshot(), { ci: {}, reviewThreads: {} });

		gitHubService.setPullRequestDetails('owner', 'repo', 1, { state: GitHubPullRequestState.Open, isDraft: false, headSha: 'sha1' });

		assert.deepStrictEqual(gitHubService.statusModelSnapshot(), {
			ci: { 'owner/repo/1/sha1': { startPollingCalls: 1, refreshCalls: 1 } },
			reviewThreads: { 'owner/repo/1': { startPollingCalls: 1, refreshCalls: 1 } },
		});
	});

	test('does not poll CI checks or review threads for draft pull requests', () => {
		sessionsManagementService.addSession('session', makeGitHubInfo(1));
		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));

		gitHubService.setPullRequestDetails('owner', 'repo', 1, { state: GitHubPullRequestState.Open, isDraft: true, headSha: 'sha1' });

		assert.deepStrictEqual(gitHubService.statusModelSnapshot(), { ci: {}, reviewThreads: {} });
	});

	test('starts polling once an asynchronously resolved PR number appears', () => {
		// Mirrors the agent-host provider, whose `gitHubInfo` initially has no PR
		// number (it is resolved asynchronously via findPullRequestNumberByHeadBranch).
		const session = sessionsManagementService.addSession('async', { owner: 'owner', repo: 'repo' });
		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));

		// No PR number yet → nothing is polled.
		assert.deepStrictEqual(gitHubService.snapshot(), {});

		// The PR number resolves later.
		sessionsManagementService.setGitHubInfo(session, makeGitHubInfo(1));

		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 },
		});
	});

	test('stops polling a merged pull request unless it is the active session', () => {
		const session = sessionsManagementService.addSession('session', makeGitHubInfo(1));
		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));

		// Open PR → polling.
		gitHubService.setPullRequestDetails('owner', 'repo', 1, { state: GitHubPullRequestState.Open, isDraft: false, headSha: 'sha1' });
		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 },
		});

		// Merges while not the active session → the repeating poll loop stops (the
		// single initial fetch already produced the merged icon).
		gitHubService.setPullRequestDetails('owner', 'repo', 1, { state: GitHubPullRequestState.Merged, isDraft: false, headSha: 'sha1' });
		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 },
		});

		// Becomes the active session → polling resumes even though it is merged.
		activeSession.set(session as unknown as IActiveSession, undefined);
		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 2, stopPollingCalls: 1, disposeCalls: 0 },
		});
	});
});

class TestSessionsManagementService extends mock<ISessionsManagementService>() {

	private readonly _onDidChangeSessions: Emitter<ISessionsChangeEvent>;
	private readonly _sessions = new Map<string, ISession>();

	override readonly onDidChangeSessions: Event<ISessionsChangeEvent>;

	constructor(disposables: DisposableStore) {
		super();
		this._onDidChangeSessions = disposables.add(new Emitter<ISessionsChangeEvent>());
		this.onDidChangeSessions = this._onDidChangeSessions.event;
	}

	addSession(id: string, gitHubInfo: IGitHubInfo | undefined, archived = false): ISession {
		const session = new TestSession(id, gitHubInfo, archived);
		this._sessions.set(session.sessionId, session);
		return session;
	}

	removeSession(session: ISession): void {
		this._sessions.delete(session.sessionId);
		this.fireSessionsChanged({ removed: [session] });
	}

	setArchived(session: ISession, archived: boolean): void {
		(session.isArchived as ReturnType<typeof observableValue<boolean>>).set(archived, undefined);
	}

	setGitHubInfo(session: ISession, gitHubInfo: IGitHubInfo | undefined): void {
		const workspace = session.workspace.get();
		const folder = workspace?.folders[0];
		if (folder) {
			(folder.gitRepository!.gitHubInfo as ReturnType<typeof observableValue<IGitHubInfo | undefined>>).set(gitHubInfo, undefined);
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

class TestSession implements ISession {

	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId = 'test';
	readonly sessionType = 'test';
	readonly icon = Codicon.comment;
	readonly createdAt = new Date(0);
	readonly title: ReturnType<typeof observableValue<string>>;
	readonly updatedAt: ReturnType<typeof observableValue<Date>>;
	readonly status: ReturnType<typeof observableValue<SessionStatus>>;
	readonly changesets: ReturnType<typeof observableValue<readonly ISessionChangeset[]>>;
	readonly changes: ReturnType<typeof observableValue<readonly ISessionFileChange[]>>;
	readonly workspace: ReturnType<typeof observableValue<ISessionWorkspace | undefined>>;
	readonly modelId: ReturnType<typeof observableValue<string | undefined>>;
	readonly mode: ReturnType<typeof observableValue<{ readonly id: string; readonly kind: string } | undefined>>;
	readonly loading: ReturnType<typeof observableValue<boolean>>;
	readonly isArchived: ReturnType<typeof observableValue<boolean>>;
	readonly isRead: ReturnType<typeof observableValue<boolean>>;
	readonly description: ReturnType<typeof observableValue<IMarkdownString | undefined>>;
	readonly lastTurnEnd: ReturnType<typeof observableValue<Date | undefined>>;
	readonly chats: ReturnType<typeof observableValue<readonly IChat[]>>;
	readonly mainChat: IObservable<IChat>;
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
		this.chats = observableValue<readonly IChat[]>(`test.chats.${id}`, [mainChat]);
	}
}

class TestGitHubService extends mock<IGitHubService>() {

	private readonly _models = new Map<string, TestPullRequestModel>();
	private readonly _ciModels = new Map<string, TestStatusModel>();
	private readonly _threadModels = new Map<string, TestStatusModel>();

	override readonly activeSessionPullRequestObs = observableValue('test.activePR', undefined);
	override readonly activeSessionPullRequestCIObs = observableValue('test.activePRCI', undefined);
	override readonly activeSessionPullRequestReviewThreadsObs = observableValue('test.activePRReviewThreads', undefined);

	override createPullRequestModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestModel> {
		const key = `${owner}/${repo}/${prNumber}`;
		let model = this._models.get(key);
		if (!model) {
			model = new TestPullRequestModel();
			this._models.set(key, model);
		}
		return new ImmortalReference(model as unknown as GitHubPullRequestModel);
	}

	override createPullRequestCIModelReference(owner: string, repo: string, prNumber: number, headSha: string): IReference<GitHubPullRequestCIModel> {
		const key = `${owner}/${repo}/${prNumber}/${headSha}`;
		let model = this._ciModels.get(key);
		if (!model) {
			model = new TestStatusModel();
			this._ciModels.set(key, model);
		}
		return new ImmortalReference(model as unknown as GitHubPullRequestCIModel);
	}

	override createPullRequestReviewThreadsModelReference(owner: string, repo: string, prNumber: number): IReference<GitHubPullRequestReviewThreadsModel> {
		const key = `${owner}/${repo}/${prNumber}`;
		let model = this._threadModels.get(key);
		if (!model) {
			model = new TestStatusModel();
			this._threadModels.set(key, model);
		}
		return new ImmortalReference(model as unknown as GitHubPullRequestReviewThreadsModel);
	}

	setPullRequestDetails(owner: string, repo: string, prNumber: number, details: { readonly state: GitHubPullRequestState; readonly isDraft: boolean; readonly headSha: string }): void {
		const model = this._models.get(`${owner}/${repo}/${prNumber}`);
		model?.setPullRequest(makePullRequest(details));
	}

	snapshot(): Record<string, { startPollingCalls: number; stopPollingCalls: number; disposeCalls: number }> {
		const entries = [...this._models.entries()].map(([key, model]) => [key, {
			startPollingCalls: model.startPollingCalls,
			stopPollingCalls: model.stopPollingCalls,
			disposeCalls: model.disposeCalls,
		}] as const);
		return Object.fromEntries(entries);
	}

	statusModelSnapshot(): { ci: Record<string, { startPollingCalls: number; refreshCalls: number }>; reviewThreads: Record<string, { startPollingCalls: number; refreshCalls: number }> } {
		const toRecord = (models: Map<string, TestStatusModel>) => Object.fromEntries(
			[...models.entries()].map(([key, model]) => [key, { startPollingCalls: model.startPollingCalls, refreshCalls: model.refreshCalls }] as const)
		);
		return { ci: toRecord(this._ciModels), reviewThreads: toRecord(this._threadModels) };
	}
}

class TestPullRequestModel implements IDisposable {

	startPollingCalls = 0;
	stopPollingCalls = 0;
	disposeCalls = 0;

	private readonly _pullRequest = observableValue<IGitHubPullRequest | undefined>('test.pullRequest', undefined);
	readonly pullRequest: IObservable<IGitHubPullRequest | undefined> = this._pullRequest;

	setPullRequest(pullRequest: IGitHubPullRequest): void {
		this._pullRequest.set(pullRequest, undefined);
	}

	startPolling(): IDisposable {
		this.startPollingCalls++;
		return toDisposable(() => this.stopPollingCalls++);
	}

	refresh(): Promise<void> {
		return Promise.resolve();
	}

	dispose(): void {
		this.disposeCalls++;
	}
}

class TestStatusModel implements IDisposable {

	startPollingCalls = 0;
	refreshCalls = 0;

	refresh(): Promise<void> {
		this.refreshCalls++;
		return Promise.resolve();
	}

	startPolling(): IDisposable {
		this.startPollingCalls++;
		return toDisposable(() => { });
	}

	dispose(): void { }
}

function makePullRequest(overrides: { readonly state: GitHubPullRequestState; readonly isDraft: boolean; readonly headSha: string }): IGitHubPullRequest {
	return {
		number: 1,
		title: '',
		body: '',
		state: overrides.state,
		author: { login: '', avatarUrl: '' },
		headRef: '',
		headSha: overrides.headSha,
		baseRef: '',
		isDraft: overrides.isDraft,
		createdAt: '',
		updatedAt: '',
		mergedAt: undefined,
		mergeable: undefined,
		mergeableState: '',
	};
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
