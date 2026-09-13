/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatSessionArchiveActionWordingSettingId } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestChatEntitlementService, TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { ISpotlightPayload } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { SpotlightOverlay } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightOverlay.js';
import { onboardingScenarioRegistry } from '../../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario, OnboardingOutcome } from '../../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, ONBOARDING_ENABLED_CONFIG } from '../../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { hashSessionIdForTelemetry } from '../../../../common/sessionsTelemetry.js';
import { IChat, ISession, ISessionArtifact, ISessionWorkspace, SessionArtifactKind, SessionRemoteConnectionStatus, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { GitHubPullRequestState, IGitHubPullRequest } from '../../../github/common/types.js';
import { getPullRequestKey } from '../../../github/common/utils.js';
import { AUTOMATIC_MERGED_SESSION_CLEANUP_SETTINGS_QUERY } from '../../../github/common/sessionLifecycleSettings.js';
import { SESSION_ARCHIVE_NUDGE_SETTING, SessionArchiveNudge, SessionArchiveNudgeService } from '../../browser/sessionArchiveNudge.js';
import { SessionsList } from '../../../sessions/browser/views/sessionsList.js';
import { SessionsView, SessionsViewId } from '../../../sessions/browser/views/sessionsView.js';

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
		return new class extends mock<IActiveSession>() {
			override readonly sessionId = `test:${id}`;
			override readonly resource = URI.from({ scheme: 'test-session', path: `/${id}` });
			override readonly status = observableValue<SessionStatus>(this, SessionStatus.Completed);
			override readonly isArchived = observableValue(this, false);
			override readonly loading = observableValue(this, false);
			override readonly isNewSessionRequestInProgress = observableValue(this, false);
			override readonly worktreePending = observableValue(this, false);
			override readonly artifacts = observableValue<readonly ISessionArtifact[]>(this, [artifact(1)]);
			override readonly chats = observableValue<readonly IChat[]>(this, []);
			override readonly mainChat = observableValue<IChat>(this, new class extends mock<IChat>() {
				override readonly resource = URI.from({ scheme: 'test-chat', path: `/${id}` });
			}());
			override readonly workspace = observableValue<ISessionWorkspace | undefined>(this, undefined);
			override readonly remoteConnectionStatus = observableValue<SessionRemoteConnectionStatus>(this, { kind: 'connected' });
		}();
	}

	function setup(sessions = [createSession()], enabled = true, enterpriseHost?: string, onboardingEnabled = false) {
		const configuration = new TestConfigurationService({ [SESSION_ARCHIVE_NUDGE_SETTING]: enabled, [ONBOARDING_ENABLED_CONFIG]: onboardingEnabled });
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
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				commands.push({ id, args });
				return undefined;
			}
		}();
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
		const onboardingEvents: string[] = [];
		const onboardingPayloads: ISpotlightPayload[] = [];
		const onboardingStarted = new DeferredPromise<void>();
		let onboardingResult = Promise.resolve(OnboardingOutcome.Completed);
		let onboardingShown = false;
		let viewAvailable = true;
		const view = upcastPartial<SessionsView>({
			setExpanded: expanded => { onboardingEvents.push(`expanded:${expanded}`); return true; },
			sessionsControl: upcastPartial<SessionsList>({
				revealArchiveAction: session => {
					onboardingEvents.push(`reveal:${session.sessionId}`);
					return { targetId: 'archive', dispose: () => onboardingEvents.push('released') };
				},
			}),
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(IViewsService, 'openView', async (id: string, focus: boolean) => {
			onboardingEvents.push(`open:${id}:${focus}`);
			return viewAvailable ? view : null;
		});
		const viewsService = instantiationService.get(IViewsService);
		const onboardingService = new class extends mock<IOnboardingScenarioService>() {
			override hasBeenShown(): boolean { return onboardingShown; }
			override reset(): void { onboardingShown = false; }
			override async runScenario(id: string): Promise<OnboardingOutcome> {
				const scenario = onboardingScenarioRegistry.getScenario(id) as IOnboardingScenario<ISpotlightPayload>;
				onboardingShown = true;
				onboardingPayloads.push(scenario.presentation.payload);
				await scenario.presentation.payload.steps[0].onBeforeShow?.();
				onboardingStarted.complete();
				return onboardingResult;
			}
		}();
		let service = store.add(new SessionArchiveNudgeService(storage, management, telemetry, configuration, viewsService, onboardingService));
		const current = observableValue<ISession | undefined>('current', sessions[0]);
		function createNudge() {
			const nudge = store.add(new SessionArchiveNudge(current, configuration, entitlement, github, service, commandService));
			store.add(autorun(reader => nudge.options.read(reader)));
			return nudge;
		}
		return {
			current, configuration, entitlement, storage, archived, unarchived, deleted, changed, events, requests, archiveTargets, commands,
			get service() { return service; },
			get counts() { return { references, polling, refreshes }; },
			createNudge,
			onboarding: {
				events: onboardingEvents,
				payloads: onboardingPayloads,
				started: onboardingStarted.p,
				setResult(result: Promise<OnboardingOutcome>) { onboardingResult = result; },
				setViewAvailable(value: boolean) { viewAvailable = value; },
			},
			reloadService() {
				service.dispose();
				service = store.add(new SessionArchiveNudgeService(storage, management, telemetry, configuration, viewsService, onboardingService));
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

	test('opens both automatic cleanup settings from the nudge', async () => {
		const context = setup();
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		await nudge.options.get()!.onOpenCleanupSettings();

		assert.deepStrictEqual(context.commands, [{
			id: 'workbench.action.openSettings',
			args: [AUTOMATIC_MERGED_SESSION_CLEANUP_SETTINGS_QUERY],
		}]);
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
		await assert.rejects(options.onArchive(), {
			message: 'This suggestion is no longer available. Review the session before trying again.',
		});
		assert.strictEqual(context.archiveTargets.length, 1);
	});

	test('does not report success when the provider does not archive the session', async () => {
		const context = setup();
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		context.setArchiveNoop();
		await assert.rejects(nudge.options.get()!.onArchive(), {
			message: 'The session could not be updated. Check its connection and try again.',
		});
		assert.deepStrictEqual({ visible: !!nudge.options.get(), events: context.events }, { visible: true, events: [] });
	});

	for (const outcome of [OnboardingOutcome.Completed, OnboardingOutcome.Skipped]) {
		test(`waits for onboarding ${outcome} before archiving and does not repeat after reload`, async () => {
			const session = createSession();
			const context = setup([session], true, undefined, true);
			context.setPullRequest(1, GitHubPullRequestState.Merged);
			const nudge = context.createNudge();
			const finish = new DeferredPromise<OnboardingOutcome>();
			context.onboarding.setResult(finish.p);
			const archive = nudge.options.get()!.onArchive();
			await context.onboarding.started;
			assert.deepStrictEqual({
				targets: context.archiveTargets,
				events: context.onboarding.events,
			}, {
				targets: [],
				events: [`open:${SessionsViewId}:true`, 'expanded:true', `reveal:${session.sessionId}`],
			});
			finish.complete(outcome);
			await archive;
			context.reloadService();
			await context.service.showArchiveOnboarding(createSession('another'));
			assert.deepStrictEqual({
				targets: context.archiveTargets.map(target => target.sessionId),
				tours: context.onboarding.payloads.length,
				released: context.onboarding.events.at(-1),
			}, { targets: [session.sessionId], tours: 1, released: 'released' });
		});
	}

	for (const wording of ['archive', 'done']) {
		test(`uses ${wording} wording and only Understood for the spotlight`, async () => {
			const context = setup(undefined, true, undefined, true);
			await context.configuration.setUserConfiguration(ChatSessionArchiveActionWordingSettingId, wording);
			await context.service.showArchiveOnboarding(createSession());
			const step = context.onboarding.payloads[0].steps[0];
			assert.deepStrictEqual({
				title: step.title,
				description: step.description,
				button: step.nextButtonLabel,
				advanceOnTargetClick: step.advanceOnTargetClick,
				hideNext: step.hideNext,
				missingTarget: step.missingTarget,
			}, {
				title: wording === 'done' ? 'Mark sessions as done from the list' : 'Archive sessions from the list',
				description: wording === 'done'
					? 'You can mark any session as done directly from the sessions list. Hover over a session or focus it to show Mark as Done.'
					: 'You can archive any session directly from the sessions list. Hover over a session or focus it to show Archive.',
				button: 'Understood',
				advanceOnTargetClick: 'advanceOnly',
				hideNext: false,
				missingTarget: { kind: 'abort' },
			});
		});
	}

	test('clicking the spotlighted action completes onboarding before archiving exactly once', async () => {
		const session = createSession();
		const context = setup([session], true, undefined, true);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		const finish = new DeferredPromise<OnboardingOutcome>();
		context.onboarding.setResult(finish.p);
		const archiving = nudge.options.get()!.onArchive();
		await context.onboarding.started;

		const container = $('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const target = $('button');
		container.appendChild(target);
		let nativeActions = 0;
		store.add(addDisposableListener(target, EventType.CLICK, () => nativeActions++));
		const step = context.onboarding.payloads[0].steps[0];
		const overlay = store.add(new SpotlightOverlay(container));
		store.add(overlay.onDidClickNext(() => {
			overlay.hide();
			void finish.complete(OnboardingOutcome.Completed);
		}));
		overlay.show(target, {
			title: step.title,
			description: step.description,
			nextButtonLabel: step.nextButtonLabel,
			stepIndex: 0,
			stepCount: 1,
			canGoBack: false,
			isLastStep: true,
		}, { advanceOnTargetClick: step.advanceOnTargetClick, hideNext: step.hideNext });
		target.click();
		const archivesBeforeTourFinished = context.archiveTargets.length;
		await archiving;
		assert.deepStrictEqual({
			archivesBeforeTourFinished,
			nativeActions,
			targets: context.archiveTargets,
			released: context.onboarding.events.at(-1),
		}, { archivesBeforeTourFinished: 0, nativeActions: 0, targets: [session], released: 'released' });
	});

	test('does not archive when onboarding aborts and allows a retry', async () => {
		const context = setup(undefined, true, undefined, true);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		context.onboarding.setResult(Promise.resolve(OnboardingOutcome.Aborted));
		await assert.rejects(nudge.options.get()!.onArchive(), /introduction was interrupted/);
		assert.deepStrictEqual(context.archiveTargets, []);
		context.onboarding.setResult(Promise.resolve(OnboardingOutcome.Completed));
		await nudge.options.get()!.onArchive();
		assert.deepStrictEqual({ tours: context.onboarding.payloads.length, targets: context.archiveTargets.length }, { tours: 2, targets: 1 });
	});

	test('revalidates the session after onboarding instead of archiving a stale suggestion', async () => {
		const session = createSession();
		const context = setup([session], true, undefined, true);
		context.setPullRequest(1, GitHubPullRequestState.Merged);
		const nudge = context.createNudge();
		const finish = new DeferredPromise<OnboardingOutcome>();
		context.onboarding.setResult(finish.p);
		const archive = nudge.options.get()!.onArchive();
		await context.onboarding.started;
		session.status.set(SessionStatus.InProgress, undefined);
		finish.complete(OnboardingOutcome.Completed);
		await assert.rejects(archive, /no longer available/);
		assert.deepStrictEqual(context.archiveTargets, []);
	});

	test('coalesces concurrent onboarding requests', async () => {
		const context = setup(undefined, true, undefined, true);
		const finish = new DeferredPromise<OnboardingOutcome>();
		context.onboarding.setResult(finish.p);
		const first = context.service.showArchiveOnboarding(createSession('first'));
		const second = context.service.showArchiveOnboarding(createSession('second'));
		await context.onboarding.started;
		finish.complete(OnboardingOutcome.Completed);
		await Promise.all([first, second]);
		assert.strictEqual(context.onboarding.payloads.length, 1);
	});

	test('honors disabled onboarding without opening the list', async () => {
		const context = setup();
		await context.service.showArchiveOnboarding(createSession());
		assert.deepStrictEqual(context.onboarding.events, []);
	});
});
