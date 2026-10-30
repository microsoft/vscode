/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { AgentsWindowUsage } from '../../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { IView } from '../../../../../workbench/common/views.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionNavigationRequest, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionsWindowUsageService } from '../../../../services/sessions/browser/sessionsWindowUsageService.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { SessionsViewId } from '../../../sessions/browser/views/sessionsView.js';
import { INewSessionFirstLaunchService, NewSessionFirstLaunchService } from '../../browser/newSessionFirstLaunch.js';
import { NewSessionFirstLaunchWidget } from '../../browser/newSessionFirstLaunchWidget.js';
import { createFirstLaunchIllustration } from '../../browser/newSessionFirstLaunchIllustrations.js';
import { NewSessionComposerService } from '../../browser/newSessionComposerService.js';

suite('New session first launch', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options: { storage?: InMemoryStorageService; phone?: boolean; disabled?: boolean; sessions?: ISession[]; present?: boolean } = {}) {
		const storage = options.storage ?? store.add(new InMemoryStorageService());
		new SessionsWindowUsageService(storage);
		const sessions = options.sessions ?? [createTestSession('Recent').session];
		const changed = store.add(new Emitter<ISessionsChangeEvent>());
		const navigationRequest = observableValue<ISessionNavigationRequest | undefined>('navigation', undefined);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const restoreComplete = observableValue('restoreComplete', true);
		const sentiment = observableValue<IChatSentiment>('sentiment', {});
		const composer = store.add(new NewSessionComposerService());
		const configuration = new TestConfigurationService({ 'chat.disableAIFeatures': options.disabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const container = dom.$(options.phone ? '.phone-layout' : 'div');
		const hidden: Parts[] = [];
		const lifecycle = store.add(new TestLifecycleService());
		const service = store.add(new NewSessionFirstLaunchService(
			upcastPartial<ISessionsManagementService>({ getSessions: () => sessions, onDidChangeSessions: changed.event }),
			upcastPartial<ISessionsService>({ navigationRequest, activeSession, initialRestoreComplete: restoreComplete }),
			storage, composer, lifecycle,
			upcastPartial<IAgentWorkbenchLayoutService>({
				mainContainer: container,
				setPartHidden: (hide, part) => { if (hide) { hidden.push(part); } },
				suppressEditorPartAutoVisibility: () => toDisposable(() => { }),
			}),
			configuration,
			upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment }),
		));
		if (options.present !== false) {
			store.add(autorun(reader => {
				if (service.visible.read(reader)) {
					service.markPresented();
				}
			}));
		}
		return { service, hidden, sessions, changed, navigationRequest, activeSession, restoreComplete, sentiment, storage, composer, lifecycle };
	}

	test('shows ongoing and completed recent editor sessions and collapses the surrounding panes once', async () => {
		const h = createHarness({
			sessions: [
				createTestSession('Running', { status: SessionStatus.InProgress }).session,
				createTestSession('Completed').session,
			]
		});
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		const count = h.service.sessionCount.get();
		h.changed.fire({ added: [], removed: [], changed: h.sessions });
		assert.deepStrictEqual({ count, hidden: h.hidden }, {
			count: 2,
			hidden: [Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART],
		});
	});

	test('includes existing sessions created earlier when they have recent activity', async () => {
		const existing = createTestSession('Existing chat', { createdAt: new Date(2000, 0, 1) }).session;
		const session = { ...existing, updatedAt: constObservable(new Date()) };
		const h = createHarness({ sessions: [session] });
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), collapseCount: h.hidden.length }, { count: 1, collapseCount: 4 });
	});

	test('uses the existing Recent section and excludes archived, automation, draft and other-application sessions', async () => {
		const automation = createTestSession('Automation').session;
		const h = createHarness({
			sessions: [
				createTestSession('Recent').session,
				createTestSession('Archived', { isArchived: true }).session,
				createTestSession('Old', { createdAt: new Date(2000, 0, 1) }).session,
				createTestSession('Draft', { status: SessionStatus.Untitled }).session,
				createTestSession('CLI', { application: 'github/cli' }).session,
				{ ...automation, isAutomation: constObservable(true) },
			]
		});
		await h.service.start(AgentsWindowOpenSource.ChatTitleBar, false, CancellationToken.None);
		assert.strictEqual(h.service.sessionCount.get(), 1);
	});

	for (const source of [
		AgentsWindowOpenSource.TitleBar, AgentsWindowOpenSource.ChatTitleBar, AgentsWindowOpenSource.CommandPalette, AgentsWindowOpenSource.KeyboardShortcut,
		AgentsWindowOpenSource.CurrentChatHandoff, AgentsWindowOpenSource.EmptyWorkspaceCurrentChatHandoff, AgentsWindowOpenSource.ParallelWorkEmptyChatHandoff,
		AgentsWindowOpenSource.ContinueInAgentsWindow, AgentsWindowOpenSource.ParallelWorkSameWindow, AgentsWindowOpenSource.ParallelWorkAllWindows,
		AgentsWindowOpenSource.WelcomeTryOut, AgentsWindowOpenSource.WelcomeViewAll, AgentsWindowOpenSource.CommandLine, AgentsWindowOpenSource.Link, AgentsWindowOpenSource.Unknown,
	]) {
		test(`targets only ordinary editor entry points: ${source}`, async () => {
			const h = createHarness();
			await h.service.start(source, false, CancellationToken.None);
			const eligible = [AgentsWindowOpenSource.TitleBar, AgentsWindowOpenSource.ChatTitleBar, AgentsWindowOpenSource.CommandPalette, AgentsWindowOpenSource.KeyboardShortcut].includes(source);
			assert.deepStrictEqual({ count: h.service.sessionCount.get(), collapsed: h.hidden.length > 0 }, { count: eligible ? 1 : 0, collapsed: eligible });
		});
	}

	for (const options of [{ phone: true }, { disabled: true }]) {
		test(`preserves existing behavior for ${JSON.stringify(options)}`, async () => {
			const h = createHarness(options);
			await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
			assert.deepStrictEqual({ count: h.service.sessionCount.get(), hidden: h.hidden }, { count: 0, hidden: [] });
		});
	}

	test('qualifies existing Local Editor chats without promising unsupported resumption', async () => {
		const h = createHarness({ sessions: [] });
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IHoverService, upcastPartial<IHoverService>({}));
		instantiation.stub(IOpenerService, upcastPartial<IOpenerService>({}));
		const widget = store.add(new NewSessionFirstLaunchWidget(container, undefined, h.service, instantiation, upcastPartial<IViewsService>({})));
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None, true);
		assert.deepStrictEqual({
			visible: widget.visible.get(),
			resumableCount: h.service.sessionCount.get(),
			resumeHidden: container.querySelector('a')!.parentElement!.hidden,
			prompt: container.querySelector('h2 > div:last-child')!.textContent,
			hidden: h.hidden,
		}, {
			visible: true, resumableCount: 0, resumeHidden: true,
			prompt: 'Kick off a task with your favorite harness.',
			hidden: [Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART],
		});
	});

	test('retries after an unsuccessful earlier window and persists only a presented welcome', async () => {
		const first = createHarness({ sessions: [] });
		await first.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		const afterEmptyOpen = first.service.visible.get();
		first.service.dispose();
		const retry = createHarness({ storage: first.storage, sessions: [] });
		await retry.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None, true);
		const afterRetry = retry.service.visible.get();
		retry.service.dispose();
		const returning = createHarness({ storage: first.storage });
		await returning.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None, true);
		assert.deepStrictEqual({ afterEmptyOpen, afterRetry, afterPresentation: returning.service.visible.get(), hidden: returning.hidden }, {
			afterEmptyOpen: false, afterRetry: true, afterPresentation: false, hidden: [],
		});
	});

	test('does not consume eligibility before the welcome is actually rendered', async () => {
		const first = createHarness({ present: false });
		await first.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None, true);
		first.service.dispose();
		const retry = createHarness({ storage: first.storage });
		await retry.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None, true);
		assert.strictEqual(retry.service.visible.get(), true);
	});

	test('does not target an empty originating Editor merely because Agents discovers other sessions', async () => {
		const h = createHarness();
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None, false);
		assert.deepStrictEqual({ visible: h.service.visible.get(), hidden: h.hidden }, { visible: false, hidden: [] });
	});

	for (const options of [{ phone: true }, { disabled: true }]) {
		test(`does not consume Local Editor onboarding when ${JSON.stringify(options)}`, async () => {
			const first = createHarness({ ...options, sessions: [] });
			await first.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None, true);
			const before = first.service.visible.get();
			first.service.dispose();
			const retry = createHarness({ storage: first.storage, sessions: [] });
			await retry.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None, true);
			assert.deepStrictEqual({ before, after: retry.service.visible.get() }, { before: false, after: true });
		});
	}

	test('does not replace session or draft handoffs', async () => {
		const h = createHarness();
		await h.service.start(AgentsWindowOpenSource.TitleBar, true, CancellationToken.None);
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), hidden: h.hidden }, { count: 0, hidden: [] });
	});

	test('does not onboard existing Agents users when window-open history is absent', async () => {
		const h = createHarness();
		new AgentsWindowUsage(h.storage).recordSessionCreated();
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), hidden: h.hidden }, { count: 0, hidden: [] });
	});

	test('waits for late session discovery without showing an empty welcome', async () => {
		const h = createHarness({ sessions: [] });
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		const before = { count: h.service.sessionCount.get(), hidden: [...h.hidden] };
		h.sessions.push(createTestSession('Late').session);
		h.changed.fire({ added: h.sessions, removed: [], changed: [] });
		assert.deepStrictEqual({ before, after: h.service.sessionCount.get(), collapseCount: h.hidden.length }, {
			before: { count: 0, hidden: [] }, after: 1, collapseCount: 4,
		});
	});

	test('does not collapse panes after the user has navigated elsewhere during discovery', async () => {
		const h = createHarness({ sessions: [] });
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		h.navigationRequest.set({ token: CancellationToken.None }, undefined);
		h.sessions.push(createTestSession('Late').session);
		h.changed.fire({ added: h.sessions, removed: [], changed: [] });
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), hidden: h.hidden }, { count: 0, hidden: [] });
	});

	test('does not interrupt typing while waiting for session discovery', async () => {
		const h = createHarness({ sessions: [] });
		const inputChanged = store.add(new Emitter<void>());
		const composer = { hasInput: false, isInputReady: true, onDidChangeInput: inputChanged.event, animatePrompt: async () => false, showPromptOptions: () => false };
		store.add(h.composer.registerComposer(composer));
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		composer.hasInput = true;
		inputChanged.fire();
		h.sessions.push(createTestSession('Late').session);
		h.changed.fire({ added: h.sessions, removed: [], changed: [] });
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), hidden: h.hidden }, { count: 0, hidden: [] });
	});

	for (const change of ['mount', 'rebind', 'unmount'] as const) {
		test(`allows an empty composer to ${change} while waiting for session discovery`, async () => {
			const h = createHarness({ sessions: [] });
			const sessionResource = observableValue<ISession['resource'] | undefined>('composerSession', undefined);
			const composer = { sessionResource, hasInput: false, isInputReady: true, animatePrompt: async () => false, showPromptOptions: () => false };
			const registration = change !== 'mount' ? store.add(h.composer.registerComposer(composer)) : undefined;
			await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
			if (change === 'mount') {
				store.add(h.composer.registerComposer(composer));
			} else if (change === 'rebind') {
				sessionResource.set(createTestSession('Draft').session.resource, undefined);
			} else {
				registration?.dispose();
			}
			h.sessions.push(createTestSession('Late').session);
			h.changed.fire({ added: h.sessions, removed: [], changed: [] });
			assert.deepStrictEqual({ count: h.service.sessionCount.get(), collapseCount: h.hidden.length }, { count: 1, collapseCount: 4 });
		});
	}

	test('renders the welcome when stored sessions arrive after the composer mounts', async () => {
		const h = createHarness({ sessions: [] });
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IHoverService, upcastPartial<IHoverService>({}));
		instantiation.stub(IOpenerService, upcastPartial<IOpenerService>({}));
		store.add(new NewSessionFirstLaunchWidget(container, undefined, h.service, instantiation, upcastPartial<IViewsService>({})));
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		store.add(h.composer.registerComposer({ hasInput: false, isInputReady: true, animatePrompt: async () => false, showPromptOptions: () => false }));
		h.sessions.push(createTestSession('Existing chat').session);
		h.changed.fire({ added: h.sessions, removed: [], changed: [] });
		assert.deepStrictEqual({
			visible: container.classList.contains('first-launch-visible'),
			features: container.querySelectorAll('.new-session-first-launch-feature').length,
			prompt: container.querySelector('.new-session-first-launch-prompt')?.textContent,
			collapseCount: h.hidden.length,
		}, {
			visible: true,
			features: 3,
			prompt: 'Pick up where you left off in 1 session.Or kick off a task with another harness.',
			collapseCount: 4,
		});
	});

	test('preserves a draft already present when starting', async () => {
		const h = createHarness();
		store.add(h.composer.registerComposer({ hasInput: true, isInputReady: true, animatePrompt: async () => false, showPromptOptions: () => false }));
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), hidden: h.hidden }, { count: 0, hidden: [] });
	});

	test('does not interrupt user navigation before a session navigation request is created', async () => {
		const h = createHarness({ sessions: [] });
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		h.composer.notifyUserNavigation();
		h.sessions.push(createTestSession('Late').session);
		h.changed.fire({ added: h.sessions, removed: [], changed: [] });
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), hidden: h.hidden }, { count: 0, hidden: [] });
	});

	test('keeps the welcome stable while typing after it has appeared', async () => {
		const h = createHarness();
		const inputChanged = store.add(new Emitter<void>());
		const composer = { hasInput: false, isInputReady: true, onDidChangeInput: inputChanged.event, animatePrompt: async () => false, showPromptOptions: () => false };
		store.add(h.composer.registerComposer(composer));
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		composer.hasInput = true;
		inputChanged.fire();
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), collapseCount: h.hidden.length }, { count: 1, collapseCount: 4 });
	});

	test('waits for initial layout restoration before collapsing panes', async () => {
		const h = createHarness();
		h.restoreComplete.set(false, undefined);
		const start = h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		await Promise.resolve();
		const before = { count: h.service.sessionCount.get(), hidden: [...h.hidden] };
		h.restoreComplete.set(true, undefined);
		await start;
		assert.deepStrictEqual({ before, after: h.service.sessionCount.get(), collapseCount: h.hidden.length }, {
			before: { count: 0, hidden: [] }, after: 1, collapseCount: 4,
		});
	});

	test('does not replace an already visible created session', async () => {
		const h = createHarness();
		h.activeSession.set(upcastPartial<IActiveSession>({ isCreated: constObservable(true) }), undefined);
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), hidden: h.hidden }, { count: 0, hidden: [] });
	});

	test('ends the welcome on navigation and never replays it in a reused window', async () => {
		const h = createHarness();
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		h.navigationRequest.set({ token: CancellationToken.None }, undefined);
		const afterNavigation = h.service.sessionCount.get();
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		assert.deepStrictEqual({ afterNavigation, afterReopen: h.service.sessionCount.get(), collapseCount: h.hidden.length }, {
			afterNavigation: 0, afterReopen: 0, collapseCount: 4,
		});
	});

	test('does not present a cancelled launch while waiting for restoration', async () => {
		const h = createHarness();
		h.restoreComplete.set(false, undefined);
		const cancellation = store.add(new CancellationTokenSource());
		const start = h.service.start(AgentsWindowOpenSource.TitleBar, false, cancellation.token);
		cancellation.cancel();
		h.restoreComplete.set(true, undefined);
		await start;
		assert.deepStrictEqual({ count: h.service.sessionCount.get(), hidden: h.hidden }, { count: 0, hidden: [] });
	});

	test('hides the welcome when AI is hidden', async () => {
		const h = createHarness();
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		h.sentiment.set({ hidden: true }, undefined);
		assert.strictEqual(h.service.sessionCount.get(), 0);
	});

	test('cancelling an open prevents late discovery from collapsing panes', async () => {
		const h = createHarness({ sessions: [] });
		const cancellation = store.add(new CancellationTokenSource());
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, cancellation.token);
		cancellation.cancel();
		h.sessions.push(createTestSession('Late').session);
		h.changed.fire({ added: h.sessions, removed: [], changed: [] });
		assert.deepStrictEqual({ visible: h.service.visible.get(), hidden: h.hidden }, { visible: false, hidden: [] });
	});

	test('an older pending start cannot override a newer ineligible open', async () => {
		const h = createHarness();
		h.restoreComplete.set(false, undefined);
		const first = h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		await Promise.resolve();
		await h.service.start(AgentsWindowOpenSource.Link, true, CancellationToken.None);
		h.restoreComplete.set(true, undefined);
		await first;
		assert.deepStrictEqual({ visible: h.service.visible.get(), hidden: h.hidden }, { visible: false, hidden: [] });
	});

	test('an already cancelled stale start does not dismiss the current welcome', async () => {
		const h = createHarness();
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		await h.service.start(AgentsWindowOpenSource.Link, true, CancellationToken.Cancelled);
		assert.strictEqual(h.service.visible.get(), true);
	});

	test('disposing the service releases a start waiting for restoration', async () => {
		const h = createHarness();
		h.restoreComplete.set(false, undefined);
		const start = h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		await Promise.resolve();
		h.service.dispose();
		await start;
		assert.deepStrictEqual({ visible: h.service.visible.get(), hidden: h.hidden }, { visible: false, hidden: [] });
	});

	test('does not build artwork or resolve link services until the welcome is visible', () => {
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiation = store.add(new TestInstantiationService());
		const widget = store.add(new NewSessionFirstLaunchWidget(
			container, undefined, upcastPartial<INewSessionFirstLaunchService>({ visible: constObservable(false), sessionCount: constObservable(0) }),
			instantiation, upcastPartial<IViewsService>({}),
		));
		assert.deepStrictEqual({ visible: widget.visible.get(), artwork: container.querySelectorAll('svg').length }, { visible: false, artwork: 0 });
	});

	test('waits for the composer to be visible before rendering and consuming the welcome', async () => {
		const h = createHarness({ present: false });
		const inputVisible = observableValue('inputVisible', false);
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IHoverService, upcastPartial<IHoverService>({}));
		instantiation.stub(IOpenerService, upcastPartial<IOpenerService>({}));
		const widget = store.add(new NewSessionFirstLaunchWidget(container, inputVisible, h.service, instantiation, upcastPartial<IViewsService>({})));
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		const before = { visible: widget.visible.get(), artwork: container.querySelectorAll('svg').length };
		inputVisible.set(true, undefined);
		await new Promise<void>(resolve => store.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => resolve())));
		const after = { visible: widget.visible.get(), artwork: container.querySelectorAll('svg').length };
		widget.dispose();
		const next = createHarness({ storage: h.storage });
		await next.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		assert.deepStrictEqual({ before, after, cleanedUp: container.children.length === 0, replayed: next.service.visible.get() }, {
			before: { visible: false, artwork: 0 }, after: { visible: true, artwork: 3 }, cleanedUp: true, replayed: false,
		});
	});

	test('a hidden ancestor does not consume the one-time welcome', async () => {
		const h = createHarness({ present: false });
		const container = dom.append(document.body, dom.$('div'));
		container.style.display = 'none';
		store.add(toDisposable(() => container.remove()));
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IHoverService, upcastPartial<IHoverService>({}));
		instantiation.stub(IOpenerService, upcastPartial<IOpenerService>({}));
		store.add(new NewSessionFirstLaunchWidget(container, undefined, h.service, instantiation, upcastPartial<IViewsService>({})));
		await h.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		await new Promise<void>(resolve => store.add(dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => resolve())));
		const next = createHarness({ storage: h.storage });
		await next.service.start(AgentsWindowOpenSource.TitleBar, false, CancellationToken.None);
		assert.strictEqual(next.service.visible.get(), true);
	});

	test('keeps illustration clipping isolated across multiple welcome instances', () => {
		const illustrations = [createFirstLaunchIllustration('agents'), createFirstLaunchIllustration('agents')];
		const ids = illustrations.flatMap(svg => Array.from(svg.querySelectorAll('clipPath'), clip => clip.id));
		const references = illustrations.flatMap(svg => Array.from(svg.querySelectorAll('[clip-path]'), element => {
			const id = element.getAttribute('clip-path')!.slice(5, -1);
			return svg.querySelector(`[id="${id}"]`) !== null;
		}));
		assert.deepStrictEqual({ clips: ids.length, uniqueClips: new Set(ids).size, references }, {
			clips: 8, uniqueClips: 8, references: Array(8).fill(true),
		});
	});

	test('renders decorative SVG artwork and opens the existing sessions view with Enter and Space', async () => {
		const count = observableValue('count', 4);
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IHoverService, upcastPartial<IHoverService>({}));
		instantiation.stub(IOpenerService, upcastPartial<IOpenerService>({}));
		const opened: { id: string; focus?: boolean }[] = [];
		const expanded: boolean[] = [];
		const widget = store.add(new NewSessionFirstLaunchWidget(
			container, undefined, upcastPartial<INewSessionFirstLaunchService>({ sessionCount: count, visible: count.map(value => value > 0), markPresented: () => { } }), instantiation,
			upcastPartial<IViewsService>({
				openView: async <T extends IView>(id: string, focus?: boolean): Promise<T | null> => {
					opened.push({ id, focus });
					const view = upcastPartial<T>({});
					Object.assign(view, { setExpanded: (value: boolean) => { expanded.push(value); return true; } });
					return view;
				},
			}),
		));
		const link = container.querySelector('a')!;
		const before = {
			visible: widget.visible.get(),
			text: link.textContent,
			role: link.getAttribute('role'),
			tabIndex: link.tabIndex,
			decorativeIllustrations: container.querySelectorAll('svg.new-session-first-launch-illustration[aria-hidden="true"][focusable="false"]').length,
		};
		for (const keyCode of [13, 32]) {
			link.dispatchEvent(new KeyboardEvent('keydown', { keyCode, bubbles: true }));
			await Promise.resolve();
		}
		count.set(1, undefined);
		const singular = link.textContent;
		count.set(0, undefined);
		assert.deepStrictEqual({
			before, opened, expanded, singular,
			hidden: container.querySelector<HTMLElement>('.new-session-first-launch')!.hidden,
			visible: widget.visible.get(),
		}, {
			before: { visible: true, text: 'Pick up where you left off in 4 sessions.', role: 'button', tabIndex: 0, decorativeIllustrations: 3 },
			opened: [{ id: SessionsViewId, focus: true }, { id: SessionsViewId, focus: true }],
			expanded: [true, true],
			singular: 'Pick up where you left off in 1 session.',
			hidden: true, visible: false,
		});
	});
});
