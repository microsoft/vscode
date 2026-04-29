/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { GitHubPullRequestPollingContribution } from '../../browser/github.contribution.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { IGitHubService } from '../../browser/githubService.js';
import { IChat, IGitHubInfo, ISession, ISessionCapabilities, ISessionFileChange, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

suite('GitHubPullRequestPollingContribution', () => {

	const store = new DisposableStore();
	let sessionsManagementService: TestSessionsManagementService;
	let gitHubService: TestGitHubService;

	setup(() => {
		sessionsManagementService = new TestSessionsManagementService(store);
		gitHubService = new TestGitHubService();
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('starts polling existing and added pull request sessions', () => {
		const existingSession = sessionsManagementService.addSession('existing', makeGitHubInfo(1));

		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService));

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
		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService));

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
		store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService));

		assert.deepStrictEqual(gitHubService.snapshot(), {});

		sessionsManagementService.setArchived(session, false);
		sessionsManagementService.fireSessionsChanged({ changed: [session] });

		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 },
		});
	});

	test('stops polling tracked pull requests when disposed', () => {
		const session = sessionsManagementService.addSession('session', makeGitHubInfo(1));
		const contribution = store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService));

		contribution.dispose();

		assert.deepStrictEqual(gitHubService.snapshot(), {
			'owner/repo/1': { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 },
		});
		assert.strictEqual(session.isArchived.get(), false);
	});
});

class TestSessionsManagementService extends mock<ISessionsManagementService>() {

	private readonly _onDidChangeSessions: Emitter<ISessionsChangeEvent>;
	private readonly _activeSession = observableValue<IActiveSession | undefined>('test.activeSession', undefined);
	private readonly _sessions = new Map<string, ISession>();

	override readonly onDidChangeSessions: Event<ISessionsChangeEvent>;
	override readonly activeSession: IObservable<IActiveSession | undefined> = this._activeSession;

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
		(session.gitHubInfo as ReturnType<typeof observableValue<IGitHubInfo | undefined>>).set(gitHubInfo, undefined);
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
	readonly changes: ReturnType<typeof observableValue<readonly ISessionFileChange[]>>;
	readonly workspace: ReturnType<typeof observableValue<ISessionWorkspace | undefined>>;
	readonly modelId: ReturnType<typeof observableValue<string | undefined>>;
	readonly mode: ReturnType<typeof observableValue<{ readonly id: string; readonly kind: string } | undefined>>;
	readonly loading: ReturnType<typeof observableValue<boolean>>;
	readonly isArchived: ReturnType<typeof observableValue<boolean>>;
	readonly isRead: ReturnType<typeof observableValue<boolean>>;
	readonly description: ReturnType<typeof observableValue<IMarkdownString | undefined>>;
	readonly lastTurnEnd: ReturnType<typeof observableValue<Date | undefined>>;
	readonly gitHubInfo: ReturnType<typeof observableValue<IGitHubInfo | undefined>>;
	readonly chats: ReturnType<typeof observableValue<readonly IChat[]>>;
	readonly mainChat: IChat;
	readonly capabilities: ISessionCapabilities = { supportsMultipleChats: false };

	constructor(id: string, gitHubInfo: IGitHubInfo | undefined, archived: boolean) {
		this.sessionId = `test:${id}`;
		this.resource = URI.from({ scheme: 'test', path: `/${id}` });
		this.title = observableValue<string>(`test.title.${id}`, id);
		this.updatedAt = observableValue<Date>(`test.updatedAt.${id}`, new Date(0));
		this.status = observableValue<SessionStatus>(`test.status.${id}`, SessionStatus.Completed);
		this.changes = observableValue<readonly ISessionFileChange[]>(`test.changes.${id}`, []);
		this.workspace = observableValue<ISessionWorkspace | undefined>(`test.workspace.${id}`, undefined);
		this.modelId = observableValue<string | undefined>(`test.modelId.${id}`, undefined);
		this.mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>(`test.mode.${id}`, undefined);
		this.loading = observableValue<boolean>(`test.loading.${id}`, false);
		this.isArchived = observableValue<boolean>(`test.isArchived.${id}`, archived);
		this.isRead = observableValue<boolean>(`test.isRead.${id}`, true);
		this.description = observableValue<IMarkdownString | undefined>(`test.description.${id}`, undefined);
		this.lastTurnEnd = observableValue<Date | undefined>(`test.lastTurnEnd.${id}`, undefined);
		this.gitHubInfo = observableValue<IGitHubInfo | undefined>(`test.gitHubInfo.${id}`, gitHubInfo);
		this.mainChat = {
			resource: this.resource,
			createdAt: this.createdAt,
			title: this.title,
			updatedAt: this.updatedAt,
			status: this.status,
			changes: this.changes,
			modelId: this.modelId,
			mode: this.mode,
			isArchived: this.isArchived,
			isRead: this.isRead,
			description: this.description,
			lastTurnEnd: this.lastTurnEnd,
		};
		this.chats = observableValue<readonly IChat[]>(`test.chats.${id}`, [this.mainChat]);
	}
}

class TestGitHubService extends mock<IGitHubService>() {

	private readonly _models = new Map<string, TestPullRequestModel>();

	override getPullRequest(owner: string, repo: string, prNumber: number): GitHubPullRequestModel {
		return this._getModel(owner, repo, prNumber) as unknown as GitHubPullRequestModel;
	}

	override disposePullRequest(owner: string, repo: string, prNumber: number): void {
		this._getModel(owner, repo, prNumber).dispose();
	}

	snapshot(): Record<string, { startPollingCalls: number; stopPollingCalls: number; disposeCalls: number }> {
		const entries = [...this._models.entries()].map(([key, model]) => [key, {
			startPollingCalls: model.startPollingCalls,
			stopPollingCalls: model.stopPollingCalls,
			disposeCalls: model.disposeCalls,
		}] as const);
		return Object.fromEntries(entries);
	}

	private _getModel(owner: string, repo: string, prNumber: number): TestPullRequestModel {
		const key = `${owner}/${repo}/${prNumber}`;
		let model = this._models.get(key);
		if (!model) {
			model = new TestPullRequestModel();
			this._models.set(key, model);
		}
		return model;
	}
}

class TestPullRequestModel implements IDisposable {

	startPollingCalls = 0;
	stopPollingCalls = 0;
	disposeCalls = 0;

	startPolling(): void {
		this.startPollingCalls++;
	}

	stopPolling(): void {
		this.stopPollingCalls++;
	}

	refresh(): Promise<void> {
		return Promise.resolve();
	}

	dispose(): void {
		this.disposeCalls++;
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
