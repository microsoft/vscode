/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestChatEntitlementService, TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { hashSessionIdForTelemetry } from '../../../../common/sessionsTelemetry.js';
import { IChat, ISession, ISessionArtifact, ISessionWorkspace, SessionArtifactKind, SessionRemoteConnectionStatus, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { GitHubPullRequestState, IGitHubPullRequest } from '../../../github/common/types.js';
import { getPullRequestKey } from '../../../github/common/utils.js';
import { SESSION_ARCHIVE_NUDGE_SETTING, SessionArchiveNudge, SessionArchiveNudgeService } from '../../browser/sessionArchiveNudge.js';

suite('SessionArchiveNudge', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function artifact(number: number, overrides: Partial<ISessionArtifact> = {}): ISessionArtifact {
		return {
			id: `pr-${number}`,
			kind: SessionArtifactKind.PullRequest,
			isArtifact: true,
			isGitHub: true,
			label: `Pull request ${number}`,
			link: URI.parse(`https://github.com/owner/repo/pull/${number}`),
			...overrides,
		};
	}

	function createSession(id: string = 'session') {
		return new class extends mock<ISession>() {
			override readonly sessionId = `test:${id}`;
			override readonly resource = URI.from({ scheme: 'test-session', path: `/${id}` });
			override readonly status = observableValue<SessionStatus>(this, SessionStatus.Completed);
			override readonly isArchived = observableValue(this, false);
			override readonly loading = observableValue(this, false);
			override readonly isNewSessionRequestInProgress = observableValue(this, false);
			override readonly worktreePending = observableValue(this, false);
			override readonly artifacts = observableValue<readonly ISessionArtifact[]>(this, [artifact(1)]);
			override readonly chats = observableValue<readonly IChat[]>(this, []);
			override readonly workspace = observableValue<ISessionWorkspace | undefined>(this, undefined);
			override readonly remoteConnectionStatus = observableValue<SessionRemoteConnectionStatus>(this, { kind: 'connected' });
		}();
	}

	function setup(sessions = [createSession()], enabled = true, enterpriseHost?: string) {
		const configuration = new TestConfigurationService({ [SESSION_ARCHIVE_NUDGE_SETTING]: enabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const entitlement = new TestChatEntitlementService();
		const storage = store.add(new TestStorageService());
		const archived = store.add(new Emitter<ISession>());
		const unarchived = store.add(new Emitter<ISession>());
		const deleted = store.add(new Emitter<ISession>());
		const changed = store.add(new Emitter<ISessionsChangeEvent>());
		const events: { name: string; data: object | undefined }[] = [];
		const telemetry = new class extends mock<ITelemetryService>() {
			override publicLog2(name: string, data?: object): void {
				events.push({ name, data });
			}
		}();
		let catalog: ISession[] = sessions;
		let archiveError: Error | undefined;
		let archiveNoop = false;
		const archiveTargets: ISession[] = [];
		const management = new class extends mock<ISessionsManagementService>() {
			override readonly onDidArchiveSession = archived.event;
			override readonly onDidUnarchiveSession = unarchived.event;
			override readonly onDidDeleteSession = deleted.event;
			override readonly onDidChangeSessions = changed.event;
			override getSessions(): ISession[] { return catalog; }
			override async archiveSession(session: ISession): Promise<void> {
				archiveTargets.push(session);
				if (archiveError) {
					throw archiveError;
				}
				if (!archiveNoop) {
					sessions.find(candidate => candidate.sessionId === session.sessionId)?.isArchived.set(true, undefined);
					archived.fire(session);
				}
			}
		}();
		const requests: string[] = [];
		let references = 0;
		let polling = 0;
		let refreshes = 0;
		const models = new Map<string, ReturnType<typeof createPullRequestModel>>();
		function createPullRequestModel() {
			const pullRequest = observableValue<IGitHubPullRequest | undefined>('pullRequest', undefined);
			const model = upcastPartial<GitHubPullRequestModel>({
				pullRequest,
				refresh: async () => { refreshes++; },
				startPolling: () => {
					polling++;
					return toDisposable(() => { polling--; });
				},
			});
			return { pullRequest, model };
		}
		const github = new class extends mock<IGitHubService>() {
			override readonly enterpriseHost = enterpriseHost;
			override createPullRequestModelReference(owner: string, repo: string, number: number): IReference<GitHubPullRequestModel> {
				const key = getPullRequestKey(owner, repo, number);
				requests.push(key);
				references++;
				let entry = models.get(key);
				if (!entry) {
					entry = createPullRequestModel();
					models.set(key, entry);
				}
				return {
					object: entry.model,
					dispose: () => { references--; },
				};
			}
		}();
		let service = store.add(new SessionArchiveNudgeService(storage, management, telemetry));
		const current = observableValue<ISession | undefined>('current', sessions[0]);
		function createNudge() {
			const nudge = store.add(new SessionArchiveNudge(current, configuration, entitlement, github, service));
			store.add(autorun(reader => nudge.options.read(reader)));
			return nudge;
		}
		return {
			current, configuration, entitlement, storage, archived, unarchived, deleted, changed, events, requests, archiveTargets,
			get service() { return service; },
			get counts() { return { references, polling, refreshes }; },
			createNudge,
			reloadService() {
				service.dispose();
				service = store.add(new SessionArchiveNudgeService(storage, management, telemetry));
			},
			setArchiveError(error: Error) { archiveError = error; },
			setArchiveNoop() { archiveNoop = true; },
			setCatalog(next: ISession[], event: ISessionsChangeEvent) {
				catalog = next;
				changed.fire(event);
			},
			async setEnabled(value: boolean) {
				await configuration.setUserConfiguration(SESSION_ARCHIVE_NUDGE_SETTING, value);
				configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === SESSION_ARCHIVE_NUDGE_SETTING,
				}));
			},
			setPullRequest(number: number, state: GitHubPullRequestState | undefined, owner = 'owner', repo = 'repo') {
				const key = getPullRequestKey(owner, repo, number);
				let entry = models.get(key);
				if (!entry) {
					entry = createPullRequestModel();
					models.set(key, entry);
				}
				entry.pullRequest.set(state === undefined ? undefined : upcastPartial<IGitHubPullRequest>({ number, state }), undefined);
			},
		};
	}

	test('honors explicit enablement overrides and disabled AI features', async () => {
		const context = setup(undefined, false);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		const states = [!!nudge.options.get()];
		assert.deepStrictEqual(context.requests, []);
		await context.setEnabled(true);
		states.push(!!nudge.options.get());
		context.entitlement.sentimentObs.set({ hidden: true }, undefined);
		states.push(!!nudge.options.get());
		context.entitlement.sentimentObs.set({}, undefined);
		states.push(!!nudge.options.get());
		await context.setEnabled(false);
		states.push(!!nudge.options.get());
		nudge.markShown();
		assert.deepStrictEqual({ states, live: context.counts.references, polling: context.counts.polling, events: context.events }, {
			states: [false, true, false, true, false], live: 0, polling: 0, events: [],
		});
	});

	test('waits for every PR artifact, ignoring references and unrelated links', () => {
		const session = createSession();
		session.artifacts.set([
			artifact(1),
			artifact(2),
			artifact(3, { isArtifact: false }),
			artifact(4, { isGitHub: false, link: URI.parse('https://example.com/pull/4') }),
			artifact(5, { kind: SessionArtifactKind.Issue }),
			artifact(1, { id: 'duplicate', link: URI.parse('https://github.com/OWNER/REPO/pull/1/') }),
		], undefined);
		const context = setup([session]);
		const nudge = context.createNudge();
		const states = [!!nudge.options.get()];
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		states.push(!!nudge.options.get());
		context.setPullRequest(2, GitHubPullRequestState.Open);
		states.push(!!nudge.options.get());
		context.setPullRequest(2, GitHubPullRequestState.Closed);
		states.push(!!nudge.options.get());
		context.setPullRequest(2, GitHubPullRequestState.Merged);
		states.push(!!nudge.options.get());
		assert.deepStrictEqual({ states, count: nudge.options.get()?.pullRequestCount, requests: context.requests, refreshes: context.counts.refreshes }, {
			states: [false, false, false, false, true], count: 2, requests: ['owner/repo/1', 'owner/repo/2'], refreshes: 2,
		});
	});

	test('does not resolve github.com artifacts against a different GitHub host', () => {
		const context = setup(undefined, true, 'github.example.com');
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		assert.deepStrictEqual({ visible: !!nudge.options.get(), requests: context.requests }, { visible: false, requests: [] });
	});

	test('requires at least one resolvable GitHub PR artifact, including across repositories', () => {
		const session = createSession();
		const context = setup([session]);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		const states: (number | undefined)[] = [];
		for (const artifacts of [
			[],
			[artifact(1, { isArtifact: false })],
			[artifact(1), artifact(2, { link: undefined })],
			[artifact(1), artifact(2, { link: URI.parse('https://github.com/owner/repo/pull/not-a-number') })],
			[artifact(1), artifact(0)],
			[artifact(1), artifact(2, { link: URI.parse('https://github.example.com/owner/repo/pull/2') })],
			[artifact(1, { isGitHub: undefined })],
			[artifact(1), artifact(1, { id: 'other-repo', link: URI.parse('https://github.com/other/project/pull/1') })],
		]) {
			session.artifacts.set(artifacts, undefined);
			states.push(nudge.options.get()?.pullRequestCount);
		}
		context.setPullRequest(1, GitHubPullRequestState.Merged, 'other', 'project');
		states.push(nudge.options.get()?.pullRequestCount);
		assert.deepStrictEqual(states, [undefined, undefined, undefined, undefined, undefined, undefined, 1, undefined, 2]);
	});

	test('hides during work, input requests, loading, disconnection, and archiving', () => {
		const session = createSession();
		const context = setup([session]);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		const states: boolean[] = [];
		for (const status of [SessionStatus.Completed, SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Untitled, SessionStatus.Error]) {
			session.status.set(status, undefined);
			states.push(!!nudge.options.get());
		}
		session.loading.set(true, undefined);
		states.push(!!nudge.options.get());
		session.loading.set(false, undefined);
		session.isNewSessionRequestInProgress.set(true, undefined);
		states.push(!!nudge.options.get());
		session.isNewSessionRequestInProgress.set(false, undefined);
		session.remoteConnectionStatus.set({ kind: 'reconnecting' }, undefined);
		states.push(!!nudge.options.get());
		session.remoteConnectionStatus.set({ kind: 'connected' }, undefined);
		session.isArchived.set(true, undefined);
		states.push(!!nudge.options.get());
		session.isArchived.set(false, undefined);
		states.push(!!nudge.options.get());
		assert.deepStrictEqual(states, [true, false, false, false, true, false, false, false, false, true]);
	});

	test('waits for peer chats and releases polling while the view is hidden', () => {
		const session = createSession();
		const peerStatus = observableValue<SessionStatus>('peerStatus', SessionStatus.InProgress);
		session.chats.set([upcastPartial<IChat>({ status: peerStatus })], undefined);
		const context = setup([session]);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		const states = [!!nudge.options.get()];
		peerStatus.set(SessionStatus.NeedsInput, undefined);
		states.push(!!nudge.options.get());
		peerStatus.set(SessionStatus.Completed, undefined);
		states.push(!!nudge.options.get());
		context.current.set(undefined, undefined);
		states.push(!!nudge.options.get());
		assert.deepStrictEqual({ states, references: context.counts.references, polling: context.counts.polling }, {
			states: [false, false, true, false], references: 0, polling: 0,
		});
	});

	test('describes actual worktrees without treating missing or virtual workspaces as worktrees', () => {
		const session = createSession();
		const context = setup([session]);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		const states = [nudge.options.get()?.hasWorktree];
		const folder = upcastPartial<ISessionWorkspace>({
			folders: [{ root: URI.file('/folder'), workingDirectory: URI.file('/folder'), name: 'folder', description: undefined }],
			isVirtualWorkspace: false,
		});
		session.workspace.set(folder, undefined);
		states.push(nudge.options.get()?.hasWorktree);
		const worktree = upcastPartial<ISessionWorkspace>({
			...folder,
			folders: [...folder.folders, {
				...folder.folders[0],
				gitRepository: { uri: URI.file('/repo'), workTreeUri: URI.file('/worktree'), baseBranchName: undefined, gitHubInfo: observableValue('gitHubInfo', undefined) },
			}],
		});
		session.workspace.set(worktree, undefined);
		states.push(nudge.options.get()?.hasWorktree);
		session.workspace.set({ ...worktree, isVirtualWorkspace: true }, undefined);
		states.push(nudge.options.get()?.hasWorktree);
		assert.deepStrictEqual(states, [false, false, true, false]);
	});

	test('remembers dismissal per session across reload, without forgetting temporarily missing sessions', () => {
		const first = createSession('first');
		const second = createSession('second');
		const context = setup([first, second]);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		nudge.options.get()!.onDismiss();
		const states = [!!nudge.options.get()];
		context.setCatalog([second], { added: [], removed: [first], changed: [] });
		context.reloadService();
		const reloaded = context.createNudge();
		states.push(!!reloaded.options.get());
		context.current.set(second, undefined);
		states.push(!!reloaded.options.get());
		context.setCatalog([first, second], { added: [first], removed: [], changed: [] });
		context.current.set(first, undefined);
		states.push(!!reloaded.options.get());
		assert.deepStrictEqual({ states, keys: context.storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE).length }, {
			states: [false, false, true, false], keys: 1,
		});
	});

	test('clears dismissals on observed archive and explicit deletion even without a chat view', () => {
		const first = createSession('first');
		const second = createSession('second');
		const context = setup([first, second]);
		const state = (session: ISession) => ({ session, hasWorktree: false, pullRequestCount: 1 });
		context.service.dismiss(state(first));
		context.service.dismiss(state(second));
		first.isArchived.set(true, undefined);
		first.isArchived.set(false, undefined);
		const afterArchive = [context.service.isDismissed(first, undefined), context.service.isDismissed(second, undefined)];
		context.deleted.fire(second);
		assert.deepStrictEqual({ afterArchive, keys: context.storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE) }, {
			afterArchive: [false, true], keys: [],
		});
	});

	test('clears dismissal when an archived session is discovered after reload', () => {
		const session = createSession();
		const context = setup([session]);
		context.service.dismiss({ session, hasWorktree: false, pullRequestCount: 1 });
		context.setCatalog([], { added: [], removed: [session], changed: [] });
		context.reloadService();
		session.isArchived.set(true, undefined);
		context.setCatalog([session], { added: [session], removed: [], changed: [] });
		session.isArchived.set(false, undefined);
		assert.strictEqual(context.service.isDismissed(session, undefined), false);
	});

	test('tracks storage changes across views without overwriting other session dismissals', () => {
		const first = createSession('first');
		const second = createSession('second');
		const context = setup([first, second]);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const one = context.createNudge();
		const two = context.createNudge();
		one.options.get()!.onDismiss();
		const states = [!!one.options.get(), !!two.options.get()];
		context.service.dismiss({ session: second, hasWorktree: false, pullRequestCount: 1 });
		context.storage.remove(`sessions.archiveNudge.dismissed.${first.sessionId}`, StorageScope.PROFILE);
		states.push(!!one.options.get(), !!two.options.get(), context.service.isDismissed(second, undefined));
		assert.deepStrictEqual(states, [false, false, true, true, true]);
	});

	test('correlates impressions, dismissal, and archive with existing session telemetry', async () => {
		const session = createSession('private-session-identifier');
		const context = setup([session]);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		nudge.markShown();
		nudge.markShown();
		context.current.set(undefined, undefined);
		context.current.set(session, undefined);
		nudge.markShown();
		nudge.options.get()!.onDismiss();
		context.archived.fire(session);
		nudge.markShown();
		await nudge.options.get()!.onArchive();
		const payload = { agentSessionId: hashSessionIdForTelemetry(session.sessionId), pullRequestCount: 1, hasWorktree: false };
		assert.deepStrictEqual({
			events: context.events,
			targets: context.archiveTargets.map(target => target.sessionId),
			visible: !!nudge.options.get(),
		}, {
			events: ['shown', 'dismissed', 'shown', 'archived'].map(action => ({ name: 'agents/sessionArchiveNudge', data: { ...payload, action } })),
			targets: [session.sessionId],
			visible: false,
		});
	});

	test('keeps the nudge available after an archive error and rejects a stale action', async () => {
		const session = createSession();
		const context = setup([session]);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		const options = nudge.options.get()!;
		context.setArchiveError(new Error('Archive failed'));
		await assert.rejects(options.onArchive(), /Archive failed/);
		assert.deepStrictEqual({ visible: !!nudge.options.get(), dismissed: context.service.isDismissed(session, undefined), events: context.events }, {
			visible: true, dismissed: false, events: [],
		});
		session.status.set(SessionStatus.InProgress, undefined);
		await assert.rejects(options.onArchive(), /no longer available/);
		assert.strictEqual(context.archiveTargets.length, 1);
	});

	test('does not report success when the provider does not archive the session', async () => {
		const context = setup();
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		context.setArchiveNoop();
		await assert.rejects(nudge.options.get()!.onArchive(), /could not be archived/);
		assert.deepStrictEqual({ visible: !!nudge.options.get(), events: context.events }, { visible: true, events: [] });
	});
});
