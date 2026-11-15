/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../../base/common/errors.js';
import { DeferredPromise, RunOnceScheduler, timeout } from '../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProgressService } from '../../../../../../../platform/progress/common/progress.js';
import { IViewsService } from '../../../../../../services/views/common/viewsService.js';
import { ChatViewHostService } from '../../../../browser/widgetHosts/viewPane/chatViewHostService.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentHostClaudeAgentEnabledSettingId } from '../../../../../../../platform/agentHost/common/agentService.js';
import { COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY, NullManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { AccountPolicyGateState } from '../../../../../../services/policies/common/accountPolicyService.js';
import { TestContextService, TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';
import { ChatViewPane } from '../../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { ChatViewSessionsListService, IChatViewSessionsListProvider } from '../../../../browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { IChatWidgetViewModelChangeEvent } from '../../../../browser/chat.js';
import { IChatViewHostNewChatOptions, IChatViewHostShownSession, IChatViewNewChatTarget } from '../../../../browser/chatViewHost.js';
import { ChatWidget } from '../../../../browser/widget/chatWidget.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ChatOpenDiagnosticsService } from '../../../../common/chatOpenDiagnosticsService.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';
import { IChatModelReference } from '../../../../common/chatService/chatService.js';
import { getChatSessionType, LocalChatSessionUri } from '../../../../common/model/chatUri.js';
import { ChatSessionRefreshReason, SessionType } from '../../../../common/chatSessionsService.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IChatModel } from '../../../../common/model/chatModel.js';
import { AgentSessionsControl } from '../../../../browser/agentSessions/agentSessionsControl.js';
import { AgentSessionsFilter } from '../../../../browser/agentSessions/agentSessionsFilter.js';
import { MenuWorkbenchToolBar } from '../../../../../../../platform/actions/browser/toolbar.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { AgentSessionsViewerOrientation } from '../../../../browser/agentSessions/agentSessions.js';
import { IWorkbenchLayoutService, Position } from '../../../../../../services/layout/browser/layoutService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../../common/views.js';

suite('ChatViewPane sessions refresh', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('sessions visibility combines pane body, settings, sidebar width and stacked chat state', async () => {
		const visibility: boolean[] = [];
		const configuration = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsEnabled]: true });
		let bodyVisible = false;
		const host = {
			sessionsContainer: document.createElement('div'),
			viewPaneContainer: document.createElement('div'),
			sessionsControl: { setVisible: (visible: boolean) => visibility.push(visible) },
			sessionsListService: { sessionsOnly: constObservable(false) },
			configurationService: configuration,
			sessionsViewerOrientation: AgentSessionsViewerOrientation.SideBySide,
			lastDimensions: { width: 1000, height: 600 },
			sessionsViewerVisibilityContext: { set: () => { } },
			isBodyVisible: () => bodyVisible,
			chatEntitlementService: { sentiment: { completed: true } },
			_widget: { isEmpty: () => false },
			_sessionsListSuppressionCount: 0,
		};
		const update = Reflect.get(ChatViewPane.prototype, 'updateSessionsControlVisibility') as (this: typeof host) => void;
		update.call(host);
		bodyVisible = true;
		update.call(host);
		host.lastDimensions.width = 100;
		update.call(host);
		host.lastDimensions.width = 1000;
		update.call(host);
		await configuration.setUserConfiguration(ChatConfiguration.ChatViewSessionsEnabled, false);
		update.call(host);
		await configuration.setUserConfiguration(ChatConfiguration.ChatViewSessionsEnabled, true);
		host.sessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
		update.call(host);
		assert.deepStrictEqual(visibility, [false, true, false, true, false, false]);
	});

	test('a sessions list that a provider gives shows, while it asks for only the sessions, also with a chat and the sessions off in settings', async () => {
		const visibility: boolean[] = [];
		const sessionsOnly = observableValue('sessionsOnly', true);
		const host = {
			sessionsContainer: document.createElement('div'),
			viewPaneContainer: document.createElement('div'),
			sessionsControl: { setVisible: (visible: boolean) => visibility.push(visible) },
			sessionsListService: { sessionsOnly },
			configurationService: new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsEnabled]: false }),
			sessionsViewerOrientation: AgentSessionsViewerOrientation.Stacked,
			lastDimensions: { width: 1000, height: 600 },
			sessionsViewerVisibilityContext: { set: () => { } },
			isBodyVisible: () => true,
			chatEntitlementService: { sentiment: { completed: true } },
			_widget: { isEmpty: () => false },
			_sessionsListSuppressionCount: 0,
		};
		const update = Reflect.get(ChatViewPane.prototype, 'updateSessionsControlVisibility') as (this: typeof host) => void;
		update.call(host);
		sessionsOnly.set(false, undefined);
		update.call(host);
		assert.deepStrictEqual(visibility, [true, false]);
	});

	test('New Chat that is not its own is left to the chat widget it acts on', async () => {
		const calls: string[] = [];
		const cancellable = (name: string) => ({ value: { cancel: () => calls.push(`cancel ${name}`) } });
		const newChat = Reflect.get(ChatViewPane.prototype, 'newChat') as (this: object) => Promise<boolean>;
		const taken = await newChat.call({ loadSessionCts: cancellable('load'), _applyModelCts: cancellable('restore') });
		assert.deepStrictEqual({ taken, calls }, { taken: false, calls: [] });
	});

	test('focusing the input of a Chat view that shows only the sessions focuses its sessions, else the chat', () => {
		const focused: string[] = [];
		const focusInput = Reflect.get(ChatViewPane.prototype, 'focusInput') as (this: object) => void;
		const host = (sessionsOnly: boolean) => ({
			sessionsListService: { sessionsOnly: constObservable(sessionsOnly) },
			sessionsControl: { focus: () => focused.push('sessions') },
			_widget: { focusInput: () => focused.push('chat') },
		});
		focusInput.call(host(true));
		focusInput.call(host(false));
		assert.deepStrictEqual(focused, ['sessions', 'chat']);
	});

	test('the Chat view takes the sessions list of the provider registered last, and its own once none is', () => {
		const service = store.add(new ChatViewSessionsListService());
		const provider = (name: string) => upcastPartial<IChatViewSessionsListProvider>({ create: () => { throw new Error(name); } });
		const a = provider('a');
		const b = provider('b');
		const first = service.registerProvider(a);
		const second = service.registerProvider(b);
		const providers = [service.provider === b];
		second.dispose();
		providers.push(service.provider === a);
		first.dispose();
		assert.deepStrictEqual({ providers, none: service.provider }, { providers: [true, true], none: undefined });
	});

	test('the chat widget is not visible while the Chat view shows only its sessions, so a chat it hides is not marked read; as the claim goes, it shows and the view lays it out', () => {
		const service = store.add(new ChatViewSessionsListService());
		const filter = Object.assign(toDisposable(() => { }), { onDidChange: Event.None, isDefault: () => true });
		const events: string[] = [];
		const widget = {
			visible: true,
			setVisible(value: boolean) { this.visible = value; events.push(`visible ${value}`); },
		};
		const host = {
			_register: <T extends { dispose(): void }>(value: T) => store.add(value),
			instantiationService: {
				createInstance: (ctor: typeof AgentSessionsControl | typeof AgentSessionsFilter | typeof MenuWorkbenchToolBar) => ctor === AgentSessionsFilter ? filter : Object.assign(toDisposable(() => { }), { context: undefined, setVisible: () => { } }),
			},
			hostService: { onDidChangeFocus: Event.None },
			sessionsListService: service,
			configurationService: new TestConfigurationService(),
			onDidChangeBodyVisibility: Event.None,
			getLocationBasedColors: () => ({ listOverrideStyles: {} }),
			doUpdateConfiguredSessionsViewerOrientation: () => { },
			viewPaneContainer: document.createElement('div'),
			isBodyVisible: () => true,
			sessionsViewerVisible: true,
			updateSessionsControlVisibility: () => ({ changed: false, visible: true }),
			welcomeController: undefined,
			lastDimensions: { width: 400, height: 600 },
			layoutBody: () => events.push(`layout, chat ${widget.visible ? 'shown' : 'hidden'}`),
			relayout: Reflect.get(ChatViewPane.prototype, 'relayout'),
			updateWidgetVisibility: Reflect.get(ChatViewPane.prototype, 'updateWidgetVisibility'),
			_widget: undefined as typeof widget | undefined,
		};
		// As the Chat view creates them: its sessions control, then its chat widget
		(Reflect.get(ChatViewPane.prototype, 'createSessionsControl') as (this: typeof host, parent: HTMLElement) => void).call(host, document.createElement('div'));
		host._widget = widget;
		(Reflect.get(ChatViewPane.prototype, 'trackWidgetVisibility') as (this: typeof host) => void).call(host);
		events.splice(0);

		const claim = service.claimSessionsOnly();
		const claimed = events.splice(0);
		claim.dispose();

		assert.deepStrictEqual({ claimed, released: events }, {
			claimed: ['visible false', 'layout, chat hidden'],
			released: ['visible true', 'layout, chat shown'],
		});
	});

	test('the Chat view shows only its sessions while a claim is held, also without a provided list', () => {
		const service = store.add(new ChatViewSessionsListService());
		const steps = [service.sessionsOnly.get()];
		const first = service.claimSessionsOnly();
		const second = service.claimSessionsOnly();
		steps.push(service.sessionsOnly.get());
		first.dispose();
		steps.push(service.sessionsOnly.get());
		second.dispose();
		steps.push(service.sessionsOnly.get());
		assert.deepStrictEqual(steps, [false, true, true, false]);
	});

	test('the sessions list follows the provider live: a provider registering replaces the Chat view\'s own list, and its own list returns as it goes, the replaced one disposed', () => {
		const service = store.add(new ChatViewSessionsListService());
		const disposed: string[] = [];
		const control = (name: string) => upcastPartial<AgentSessionsControl>({ dispose: () => disposed.push(name), setVisible: () => { } });
		let ownLists = 0;
		const viewPaneContainer = document.createElement('div');
		const filter = Object.assign(toDisposable(() => { }), { onDidChange: Event.None, isDefault: () => true });
		const host = {
			_register: <T extends { dispose(): void }>(value: T) => store.add(value),
			instantiationService: {
				createInstance: (ctor: typeof AgentSessionsControl | typeof AgentSessionsFilter | typeof MenuWorkbenchToolBar) => {
					if (ctor === AgentSessionsControl) {
						return control(`own ${++ownLists}`);
					}
					return ctor === AgentSessionsFilter ? filter : Object.assign(toDisposable(() => { }), { context: undefined });
				},
			},
			hostService: { onDidChangeFocus: Event.None },
			sessionsListService: service,
			configurationService: new TestConfigurationService(),
			onDidChangeBodyVisibility: Event.None,
			getLocationBasedColors: () => ({ listOverrideStyles: {} }),
			doUpdateConfiguredSessionsViewerOrientation: () => { },
			viewPaneContainer,
			isBodyVisible: () => true,
			sessionsViewerVisible: true,
			updateSessionsControlVisibility: () => ({ changed: false, visible: true }),
			relayout: () => { },
			sessionsControl: undefined as unknown,
			sessionsTitleContainer: undefined as HTMLElement | undefined,
		};
		const createControl = Reflect.get(ChatViewPane.prototype, 'createSessionsControl') as (this: typeof host, parent: HTMLElement) => void;
		createControl.call(host, document.createElement('div'));
		const providedControl = control('provided');
		const state = () => ({ control: host.sessionsControl === providedControl ? 'provided' : `own ${ownLists}`, sessionsOnly: service.sessionsOnly.get(), sessionsOnlyClass: viewPaneContainer.classList.contains('sessions-only'), title: host.sessionsTitleContainer?.style.display !== 'none', disposed: disposed.splice(0) });
		const steps = [state()];

		const registration = service.registerProvider(upcastPartial<IChatViewSessionsListProvider>({
			create: () => ({ control: providedControl, hasHeader: true, sessionsOnly: constObservable(true) }),
		}));
		steps.push(state());
		registration.dispose();
		steps.push(state());

		assert.deepStrictEqual(steps, [
			{ control: 'own 1', sessionsOnly: false, sessionsOnlyClass: false, title: true, disposed: [] },
			{ control: 'provided', sessionsOnly: true, sessionsOnlyClass: true, title: false, disposed: ['own 1'] },
			{ control: 'own 2', sessionsOnly: false, sessionsOnlyClass: false, title: true, disposed: ['provided'] },
		]);
	});

	test('as the sessions list swaps live, the new list takes focus only if the replaced list had it, or the chat input while the new list does not show', () => {
		const service = store.add(new ChatViewSessionsListService());
		const filter = Object.assign(toDisposable(() => { }), { onDidChange: Event.None, isDefault: () => true });
		const parent = mainWindow.document.body.appendChild(document.createElement('div'));
		const elsewhere = mainWindow.document.body.appendChild(document.createElement('input'));
		const chatInput = mainWindow.document.body.appendChild(document.createElement('textarea'));
		store.add(toDisposable(() => { parent.remove(); elsewhere.remove(); chatInput.remove(); }));
		// Each list renders a focusable row into its container, which its focus focuses
		const render = (container: HTMLElement, name: string) => {
			const row = container.appendChild(document.createElement('input'));
			row.name = name;
			return upcastPartial<AgentSessionsControl>({ dispose: () => { }, setVisible: () => { }, focus: () => row.focus() });
		};
		const host = {
			_register: <T extends { dispose(): void }>(value: T) => store.add(value),
			instantiationService: {
				createInstance: (ctor: typeof AgentSessionsControl | typeof AgentSessionsFilter | typeof MenuWorkbenchToolBar, container?: HTMLElement) => {
					if (ctor === AgentSessionsControl) {
						return render(container!, 'own');
					}
					return ctor === AgentSessionsFilter ? filter : Object.assign(toDisposable(() => { }), { context: undefined });
				},
			},
			hostService: { onDidChangeFocus: Event.None },
			sessionsListService: service,
			configurationService: new TestConfigurationService(),
			onDidChangeBodyVisibility: Event.None,
			getLocationBasedColors: () => ({ listOverrideStyles: {} }),
			doUpdateConfiguredSessionsViewerOrientation: () => { },
			viewPaneContainer: document.createElement('div'),
			isBodyVisible: () => true,
			sessionsViewerVisible: true,
			// Whether the list shows after the swap, as the Chat view's visibility rules say, such as its own list while
			// its sessions are disabled in the settings
			sessionsVisible: true,
			updateSessionsControlVisibility: () => {
				host.sessionsViewerVisible = host.sessionsVisible;
				return { changed: false, visible: host.sessionsVisible };
			},
			// Whether the layout shows the list, such as switching to side by side in a wide window, after the visibility check
			layoutShowsList: false,
			relayout: () => {
				if (host.layoutShowsList) {
					host.sessionsVisible = true;
					host.updateSessionsControlVisibility();
				}
			},
			sessionsControlContainer: undefined as HTMLElement | undefined,
			_widget: { focusInput: () => chatInput.focus() },
			updateWidgetVisibility: () => { },
		};
		Object.assign(host, { focusInput: Reflect.get(ChatViewPane.prototype, 'focusInput') });
		const createControl = Reflect.get(ChatViewPane.prototype, 'createSessionsControl') as (this: typeof host, parent: HTMLElement) => void;
		createControl.call(host, parent);
		const focusList = () => host.sessionsControlContainer!.querySelector('input')!.focus();
		const active = () => {
			const element = mainWindow.document.activeElement;
			return element === chatInput ? 'chat input' : element === elsewhere ? 'elsewhere' : (element as HTMLInputElement | null)?.name ?? 'none';
		};
		const provide = (sessionsOnly: boolean) => service.registerProvider(upcastPartial<IChatViewSessionsListProvider>({
			create: container => ({ control: render(container, 'provided'), hasHeader: true, sessionsOnly: constObservable(sessionsOnly) }),
		}));
		const steps: string[] = [];

		// The list has focus, and the list that replaces it shows: it takes focus
		focusList();
		const provided = provide(false);
		steps.push(active());
		// Focus is elsewhere, such as in an editor: it stays there
		elsewhere.focus();
		provided.dispose();
		steps.push(active());
		// The provided list, showing only the sessions, has focus, and the Chat view's own list that replaces it does not
		// show: the chat input takes focus
		const sessionsOnly = provide(true);
		focusList();
		host.sessionsVisible = false;
		sessionsOnly.dispose();
		steps.push(active());
		// As before, but the layout then shows the Chat view's own list, such as side by side: that list takes focus
		const sessionsOnlyAgain = provide(true);
		focusList();
		host.sessionsVisible = false;
		host.layoutShowsList = true;
		sessionsOnlyAgain.dispose();
		steps.push(active());

		assert.deepStrictEqual(steps, ['provided', 'elsewhere', 'chat input', 'own']);
	});

	test('sessions layout telemetry reports the settled layout once shown and restored, then only changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const events: unknown[] = [];
		const host = {
			sessionsContainer: document.createElement('div'),
			lastDimensions: { width: 1000, height: 600 },
			bodyVisible: false,
			isBodyVisible: () => host.bodyVisible,
			restoringSession: Promise.resolve() as Promise<void> | undefined,
			_loadingSessionCount: 0,
			_sessionsListSuppressionCount: 0,
			getViewPositionAndLocation: () => ({ position: Position.RIGHT, location: ViewContainerLocation.AuxiliaryBar }),
			sessionsViewerOrientationConfiguration: 'sideBySide',
			sessionsViewerOrientation: AgentSessionsViewerOrientation.SideBySide,
			sessionsViewerVisible: true,
			configurationService: new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsEnabled]: true }),
			layoutService: { isAuxiliaryBarMaximized: () => false },
			telemetryService: { publicLog2: (eventName: string, data: object) => events.push({ eventName, ...data }) },
			lastReportedSessionsLayout: undefined,
		};
		const report = Reflect.get(ChatViewPane.prototype, 'reportSessionsLayout') as (this: typeof host) => void;
		const scheduler = store.add(new RunOnceScheduler(() => report.call(host), 1000));
		const settle = async (change: () => void = () => { }) => { change(); scheduler.schedule(); await timeout(1000); };
		const setOrientation = (orientation: AgentSessionsViewerOrientation) => () => host.sessionsViewerOrientation = orientation;

		await settle();												// hidden view: nothing
		await settle(() => host.bodyVisible = true);					// shown but still restoring: nothing
		await settle(() => host.restoringSession = undefined);		// restored: initial

		setOrientation(AgentSessionsViewerOrientation.Stacked)();	// resize flips and returns before settling: nothing
		scheduler.schedule();
		await settle(setOrientation(AgentSessionsViewerOrientation.SideBySide));

		await settle(() => { host._loadingSessionCount = 1; host.sessionsViewerVisible = false; });	// transient state while loading: nothing
		await settle(() => host._sessionsListSuppressionCount = 1);									// transient state while transitioning: nothing
		await settle(() => { host._loadingSessionCount = 0; host._sessionsListSuppressionCount = 0; host.sessionsViewerVisible = true; });	// settled unchanged: nothing
		await settle(setOrientation(AgentSessionsViewerOrientation.Stacked));							// settled change: orientationChanged

		const layout = { configuredOrientation: 'sideBySide', sessionsVisible: true, sessionsEnabled: true, position: 'right', chatViewLocation: 'auxiliaryBar', chatViewMaximized: false };
		assert.deepStrictEqual(events, [
			{ eventName: 'chatViewSessionsLayout', ...layout, effectiveOrientation: 'sideBySide', reason: 'initial' },
			{ eventName: 'chatViewSessionsLayout', ...layout, effectiveOrientation: 'stacked', reason: 'orientationChanged' },
		]);
	}));

	test('window focus refreshes automatically while the toolbar retains explicit refresh intent', async () => {
		const focusChanged = store.add(new Emitter<boolean>());
		const reasons: (ChatSessionRefreshReason | undefined)[] = [];
		const control = Object.assign(Object.create(AgentSessionsControl.prototype), {
			agentSessionsService: {
				model: { resolve: async (_provider: string | undefined, _onError: undefined, reason?: ChatSessionRefreshReason) => { reasons.push(reason); } },
			},
			dispose: () => { },
			setVisible: () => { },
		});
		const toolbar = Object.assign(toDisposable(() => { }), { context: control });
		const filter = Object.assign(toDisposable(() => { }), { onDidChange: Event.None, isDefault: () => true });
		const host = {
			_register: <T extends { dispose(): void }>(value: T) => store.add(value),
			instantiationService: {
				createInstance: (ctor: typeof AgentSessionsControl | typeof AgentSessionsFilter | typeof MenuWorkbenchToolBar) => {
					if (ctor === AgentSessionsControl) {
						return control;
					}
					return ctor === AgentSessionsFilter ? filter : toolbar;
				},
			},
			hostService: { onDidChangeFocus: focusChanged.event },
			sessionsListService: { provider: undefined, onDidChangeProvider: Event.None, sessionsOnly: constObservable(false) },
			configurationService: new TestConfigurationService(),
			onDidChangeBodyVisibility: Event.None,
			getLocationBasedColors: () => ({ listOverrideStyles: {} }),
			doUpdateConfiguredSessionsViewerOrientation: () => { },
			relayout: () => { },
		};
		const createControl = Reflect.get(ChatViewPane.prototype, 'createSessionsControl') as (this: typeof host, parent: HTMLElement) => AgentSessionsControl;
		createControl.call(host, document.createElement('div'));

		focusChanged.fire(false);
		focusChanged.fire(true);
		focusChanged.fire(false);
		focusChanged.fire(true);
		await toolbar.context.refresh();

		assert.deepStrictEqual(reasons, ['automatic', 'automatic', 'manual']);
	});
});

suite('ChatViewPane session transitions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const previousResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/previous' });
	const nextResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-next' });

	function createPane(resolving: Promise<void> = Promise.resolve(), preparing: Promise<void> = Promise.resolve()) {
		const previousModel = upcastPartial<IChatModel>({ sessionResource: previousResource });
		const nextModel = upcastPartial<IChatModel>({ sessionResource: nextResource });
		const shownSession = observableValue<IChatViewHostShownSession | undefined>('shownSession', undefined);
		let shown: IChatModel | undefined = previousModel;
		let input = 'previous draft';
		const bindings: (URI | undefined)[] = [];
		const disposed: URI[] = [];
		const locks: string[] = [];
		/** Tells the pane its widget's chat changed, as the widget's onDidChangeViewModel does. */
		let didChangeViewModel = (_committed?: boolean) => { };
		const paneStore = store.add(new DisposableStore());
		const modelRef = paneStore.add(new MutableDisposable<IChatModelReference>());
		const createReference = (model: IChatModel): IChatModelReference => Object.assign(toDisposable(() => {
			disposed.push(model.sessionResource);
			if (shown === model) {
				widget.setModel(undefined);
			}
		}), { object: model });
		const widget = {
			get viewModel() { return shown && { model: shown, sessionResource: shown.sessionResource }; },
			getViewState: () => ({}),
			restoreViewState: () => { },
			getInput: () => input,
			setInput: (value: string) => { input = value; },
			// Like ChatWidget: the chat it shows already is not set again, and its view model does not change
			setModel: (model: IChatModel | undefined) => {
				if (model && shown && model.sessionResource.toString() === shown.sessionResource.toString()) {
					return;
				}
				shown = model;
				input = '';
				bindings.push(model?.sessionResource);
				didChangeViewModel();
			},
			/** As its first request makes the session it sends in, which the widget then shows */
			showCommitted: (model: IChatModel) => {
				shown = model;
				didChangeViewModel(true);
			},
			lockToCodingAgent: (_name: string, _displayName: string, sessionType: string) => { locks.push(sessionType); },
			unlockFromCodingAgent: () => { locks.push('local'); },
			visible: true,
		};
		modelRef.value = createReference(previousModel);
		const nextRef = createReference(nextModel);
		const pane: {
			showModel(token: CancellationToken, ref: IChatModelReference): Promise<IChatModel | undefined>;
			loadSession(resource: URI, sessionTypeSelectionReason?: undefined, showReason?: 'open' | 'restore'): Promise<IChatModel | undefined>;
			applyModel(): void;
			restoringSession: Promise<void> | undefined;
			readonly shownSession: IObservable<IChatViewHostShownSession | undefined>;
			reportOpened(sessionResource: URI): void;
			reportRestored(sessionResource: URI): void;
		} = Object.assign(Object.create(ChatViewPane.prototype), {
			_store: paneStore,
			_showReason: 'open',
			_shownReports: 0,
			_shownSession: shownSession,
			shownSession,
			modelRef,
			widgetViewStates: new Map(),
			viewState: {},
			_widget: widget,
			_openDiagnostics: store.add(new MutableDisposable()),
			loadSessionCts: store.add(new MutableDisposable()),
			_applyModelCts: store.add(new MutableDisposable()),
			localChatCommit: store.add(new MutableDisposable()),
			logService: new NullLogService(),
			layoutService: { isRestored: () => false },
			notificationService: { error: () => { } },
			progressService: { withProgress: (_: unknown, task: () => Promise<unknown>) => task() },
			chatService: { acquireOrLoadSession: async () => nextRef },
			provisionalSessionService: { prepareSessionConfig: () => preparing },
			chatSessionsService: {
				canResolveChatSession: async () => { await resolving; return true; },
				getChatSessionContribution: () => ({ name: 'copilot', displayName: 'Copilot', agentHostProviderId: 'copilotcli' }),
			},
			agentSessionsService: { model: { getSession: () => undefined } },
			updateActions: () => { },
		});
		didChangeViewModel = committed => (Reflect.get(pane, 'onDidChangeShownModel') as (e: IChatWidgetViewModelChangeEvent) => void).call(pane, { previousSessionResource: undefined, currentSessionResource: shown?.sessionResource, committed });
		return { pane, paneStore, widget, modelRef, nextModel, nextRef, bindings, disposed, locks };
	}

	test('a new Local chat, whose model stays as its first request is accepted, reports its commit as that request is added, and only its first', () => {
		const rig = createPane();
		rig.nextRef.dispose();
		const requests: unknown[] = [];
		const changed = store.add(new Emitter<{ kind: string }>());
		const local = upcastPartial<IChatModel>({ sessionResource: LocalChatSessionUri.forSession('new'), getRequests: () => requests as ReturnType<IChatModel['getRequests']>, onDidChange: changed.event as IChatModel['onDidChange'] });
		const reason = () => rig.pane.shownSession.get()?.reason ?? 'none';
		rig.widget.setModel(local);
		const shownNew = reason();
		requests.push({});
		changed.fire({ kind: 'addRequest' });
		const afterFirst = reason();
		rig.pane.reportOpened(local.sessionResource);
		requests.push({});
		changed.fire({ kind: 'addRequest' });

		assert.deepStrictEqual({ shownNew, afterFirst, afterSecond: reason() }, { shownNew: 'open', afterFirst: 'commit', afterSecond: 'open' });
	});

	test('keeps the previous session bound until its replacement is ready', async () => {
		const resolving = new DeferredPromise<void>();
		const rig = createPane(resolving.p);
		const showing = rig.pane.showModel(CancellationToken.None, rig.nextRef);
		await timeout(0);
		const whileResolving = { shown: rig.widget.viewModel?.sessionResource, disposed: [...rig.disposed] };
		await resolving.complete();
		await showing;
		assert.deepStrictEqual({ whileResolving, bindings: rig.bindings, disposed: rig.disposed, shown: rig.widget.viewModel?.sessionResource }, {
			whileResolving: { shown: previousResource, disposed: [] },
			bindings: [nextResource],
			disposed: [previousResource],
			shown: nextResource,
		});
	});

	for (const stalledPhase of ['acquisition', 'configuration'] as const) {
		test(`explicit navigation supersedes initial ${stalledPhase} and releases the abandoned model`, async () => {
			const blocked = new DeferredPromise<void>();
			const rig = createPane(Promise.resolve(), blocked.p);
			const savedResource = nextResource.with({ path: '/saved' });
			const savedModel = upcastPartial<IChatModel>({ sessionResource: savedResource });
			const savedReference = Object.assign(toDisposable(() => { }), { object: savedModel });
			Object.assign(rig.pane, {
				acquireTransferredOrPersistedSession: async () => {
					if (stalledPhase === 'acquisition') {
						await blocked.p;
					}
					return { modelRef: rig.nextRef };
				},
				chatService: { acquireOrLoadSession: async () => savedReference },
			});
			rig.pane.applyModel();
			const restoration = rig.pane.restoringSession;
			await timeout(0);
			await rig.pane.loadSession(savedResource);
			const navigatedBeforeUnblocking = rig.widget.viewModel?.sessionResource;
			await blocked.complete();
			await restoration;
			assert.deepStrictEqual({ navigatedBeforeUnblocking, bindings: rig.bindings, disposed: [...rig.disposed].sort((a, b) => a.path.localeCompare(b.path)) }, {
				navigatedBeforeUnblocking: savedResource, bindings: [savedResource], disposed: [previousResource, nextResource],
			});
		});
	}

	test('reports a restored chat as restored and a chat that the user loads as opened, also one that supersedes a restore under way', async () => {
		const shown = (rig: ReturnType<typeof createPane>) => { const value = rig.pane.shownSession.get(); return value && `${value.resource.path} ${value.reason}`; };
		const savedResource = nextResource.with({ path: '/saved' });
		const savedReference = () => Object.assign(toDisposable(() => { }), { object: upcastPartial<IChatModel>({ sessionResource: savedResource }) });

		const restored = createPane();
		Object.assign(restored.pane, { acquireTransferredOrPersistedSession: async () => ({ modelRef: restored.nextRef }) });
		restored.pane.applyModel();
		await restored.pane.restoringSession;
		const afterRestore = shown(restored);
		// The user picks the restored chat that the view shows already, such as in a sessions list
		restored.pane.reportOpened(previousResource);
		const otherReported = shown(restored);
		restored.pane.reportOpened(nextResource);
		const reopened = shown(restored);
		// Picked again, such as after the user moved the window's folder away: reported again
		const reportedBefore = restored.pane.shownSession.get();
		restored.pane.reportOpened(nextResource);
		const reportedAgain = restored.pane.shownSession.get() !== reportedBefore;
		// Its first request makes a session of the new chat, which the widget then shows: not one the user picked
		restored.widget.showCommitted(upcastPartial<IChatModel>({ sessionResource: nextResource.with({ path: '/committed' }) }));
		const committed = shown(restored);
		// The user opens it, also as the chat it shows
		restored.pane.reportOpened(nextResource.with({ path: '/committed' }));
		const committedOpened = shown(restored);
		Object.assign(restored.pane, { chatService: { acquireOrLoadSession: async () => savedReference() } });
		await restored.pane.loadSession(savedResource);
		const afterLoad = shown(restored);
		// A chat loaded as one to restore, such as the last chat of where the user moved the folder
		const recalledResource = nextResource.with({ path: '/recalled' });
		Object.assign(restored.pane, { chatService: { acquireOrLoadSession: async () => Object.assign(toDisposable(() => { }), { object: upcastPartial<IChatModel>({ sessionResource: recalledResource }) }) } });
		await restored.pane.loadSession(recalledResource, undefined, 'restore');
		const loadedToRestore = shown(restored);
		// The chat it shows, opened again as one to restore, such as where it was opened before
		restored.pane.reportOpened(recalledResource);
		restored.pane.reportRestored(recalledResource);
		const reopenedToRestore = shown(restored);

		// The user loads a chat while the restore still prepares its chat's configuration
		const preparing = new DeferredPromise<void>();
		const superseded = createPane(Promise.resolve(), preparing.p);
		Object.assign(superseded.pane, {
			acquireTransferredOrPersistedSession: async () => ({ modelRef: superseded.nextRef }),
			chatService: { acquireOrLoadSession: async () => savedReference() },
		});
		superseded.pane.applyModel();
		const restoration = superseded.pane.restoringSession;
		await timeout(0);
		const loading = superseded.pane.loadSession(savedResource);
		await preparing.complete();
		await loading;
		await restoration;

		assert.deepStrictEqual({ afterRestore, otherReported, reopened, reportedAgain, committed, committedOpened, afterLoad, loadedToRestore, reopenedToRestore, superseded: shown(superseded) }, {
			afterRestore: '/untitled-next restore',
			otherReported: '/untitled-next restore',
			reopened: '/untitled-next open',
			reportedAgain: true,
			committed: '/committed commit',
			committedOpened: '/committed open',
			afterLoad: '/saved open',
			loadedToRestore: '/recalled restore',
			reopenedToRestore: '/recalled restore',
			superseded: '/saved open',
		});
	});

	test('through the Chat view host, each open reports the chat it shows exactly once: a chat it loads, the chat it shows already when picked again, to restore, and a committed one', async () => {
		const rig = createPane();
		// Each open below loads a chat of its own
		rig.nextRef.dispose();
		const savedResource = nextResource.with({ path: '/saved' });
		const committedResource = nextResource.with({ path: '/committed' });
		const reference = (resource: URI) => Object.assign(toDisposable(() => { }), { object: upcastPartial<IChatModel>({ sessionResource: resource }) });
		Object.assign(rig.pane, { chatService: { acquireOrLoadSession: async (resource: URI) => reference(resource) } });
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async () => rig.pane) as IViewsService['openView'],
			onDidChangeViewVisibility: Event.None,
			getViewWithId: (<T>() => rig.pane as T) as IViewsService['getViewWithId'],
		}));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({}));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({}));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({}));
		const host = store.add(instantiationService.createInstance(ChatViewHostService));
		const stream: string[] = [];
		store.add(autorun(reader => {
			const shown = rig.pane.shownSession.read(reader);
			stream.push(shown ? `${shown.resource.path} ${shown.reason}` : 'none');
		}));
		const step = async (name: string, open: () => Promise<unknown>) => {
			const before = stream.length;
			await open();
			return { [name]: stream.slice(before) };
		};

		assert.deepStrictEqual(Object.assign({},
			await step('loaded', () => host.openSession(savedResource, { preserveFocus: true })),
			await step('pickedAgain', () => host.openSession(savedResource, { preserveFocus: true })),
			await step('restored', () => host.openSession(savedResource, { preserveFocus: true, restore: true })),
			await step('committed', () => host.openSession(committedResource, { preserveFocus: true, commit: true })),
		), {
			loaded: ['/saved open'],
			pickedAgain: ['/saved open'],
			restored: ['/saved restore'],
			committed: ['/committed commit'],
		});
	});

	test('through the Chat view host, a New Chat of its own that an open supersedes leaves the opened chat as the shown one', async () => {
		const rig = createPane();
		rig.nextRef.dispose();
		const opened = nextResource.with({ path: '/opened' });
		const reference = (resource: URI) => Object.assign(toDisposable(() => { }), { object: upcastPartial<IChatModel>({ sessionResource: resource }) });
		const newChatAcquired = new DeferredPromise<{ modelRef: IChatModelReference }>();
		Object.assign(rig.pane, {
			chatService: { acquireOrLoadSession: async (resource: URI) => reference(resource) },
			acquireDefaultNewSession: () => newChatAcquired.p,
			updateViewState: () => { },
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async () => rig.pane) as IViewsService['openView'],
			onDidChangeViewVisibility: Event.None,
			getViewWithId: (<T>() => rig.pane as T) as IViewsService['getViewWithId'],
			isViewVisible: () => true,
		}));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({}));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({}));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({}));
		const host = store.add(instantiationService.createInstance(ChatViewHostService));
		const shown = () => { const value = host.shownSession.get(); return value ? `${value.resource.path} ${value.reason}` : 'none'; };

		// New Chat of its own waits for its new chat, and meanwhile the user opens a chat
		const resetting = host.newChat(undefined, { ownChat: true, preserveFocus: true });
		await host.openSession(opened, { preserveFocus: true });
		const afterOpen = shown();
		await newChatAcquired.complete({ modelRef: reference(nextResource.with({ path: '/untitled-reset' })) });
		const taken = await resetting;

		assert.deepStrictEqual({ afterOpen, taken, afterReset: shown(), widget: rig.widget.viewModel?.sessionResource.path }, {
			afterOpen: '/opened open',
			taken: true,
			afterReset: '/opened open',
			widget: '/opened',
		});
	});

	test('through the Chat view host, of two New Chats of its own under way, the later one is the shown none, also as the earlier one completes first, until its first send commits', async () => {
		const rig = createPane();
		rig.nextRef.dispose();
		const reference = (resource: URI) => Object.assign(toDisposable(() => { }), { object: upcastPartial<IChatModel>({ sessionResource: resource }) });
		const acquisitions = [new DeferredPromise<{ modelRef: IChatModelReference }>(), new DeferredPromise<{ modelRef: IChatModelReference }>()];
		const [acquiredA, acquiredB] = acquisitions;
		const pending = [...acquisitions];
		Object.assign(rig.pane, {
			chatService: { acquireOrLoadSession: async (resource: URI) => reference(resource) },
			acquireDefaultNewSession: () => pending.shift()!.p,
			updateViewState: () => { },
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async () => rig.pane) as IViewsService['openView'],
			onDidChangeViewVisibility: Event.None,
			getViewWithId: (<T>() => rig.pane as T) as IViewsService['getViewWithId'],
			isViewVisible: () => true,
		}));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({}));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({}));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({}));
		const host = store.add(instantiationService.createInstance(ChatViewHostService));
		const shown = () => { const value = host.shownSession.get(); return value ? `${value.resource.path} ${value.reason}` : 'none'; };

		const newChatA = host.newChat(undefined, { ownChat: true, preserveFocus: true });
		const newChatB = host.newChat(undefined, { ownChat: true, preserveFocus: true });
		await acquiredA.complete({ modelRef: reference(nextResource.with({ path: '/untitled-a' })) });
		await newChatA;
		await acquiredB.complete({ modelRef: reference(nextResource.with({ path: '/untitled-b' })) });
		await newChatB;
		const afterNewChats = shown();
		const widget = rig.widget.viewModel?.sessionResource.path;
		// Its first send commits the session it starts
		await host.openSession(nextResource.with({ path: '/committed' }), { preserveFocus: true, commit: true });

		assert.deepStrictEqual({ afterNewChats, widget, afterCommit: shown() }, {
			afterNewChats: 'none',
			widget: '/untitled-b',
			afterCommit: '/committed commit',
		});
	});

	test('through the Chat view host, an open of the chat it shows already that supersedes a restore of it under way reports the open, not the restore', async () => {
		const rig = createPane();
		rig.nextRef.dispose();
		const chat = nextResource.with({ path: '/chat' });
		const reference = () => Object.assign(toDisposable(() => { }), { object: upcastPartial<IChatModel>({ sessionResource: chat }) });
		// The restore's load and the explicit open's each wait, so that the superseded restore ends first
		const restoring = new DeferredPromise<void>();
		const opening = new DeferredPromise<void>();
		const loads = [async () => reference(), async () => { await restoring.p; return reference(); }, async () => { await opening.p; return reference(); }];
		Object.assign(rig.pane, { chatService: { acquireOrLoadSession: () => loads.shift()!() } });
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async () => rig.pane) as IViewsService['openView'],
			onDidChangeViewVisibility: Event.None,
			getViewWithId: (<T>() => rig.pane as T) as IViewsService['getViewWithId'],
		}));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({}));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({}));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({}));
		const host = store.add(instantiationService.createInstance(ChatViewHostService));
		await host.openSession(chat, { preserveFocus: true });
		const stream: string[] = [];
		store.add(autorun(reader => {
			const shown = rig.pane.shownSession.read(reader);
			stream.push(shown ? `${shown.resource.path} ${shown.reason}` : 'none');
		}));
		stream.length = 0;

		const restore = host.openSession(chat, { preserveFocus: true, restore: true });
		await timeout(0);
		const open = host.openSession(chat, { preserveFocus: true });
		await timeout(0);
		await restoring.complete();
		await restore;
		await opening.complete();
		await open;

		assert.deepStrictEqual({ stream, shown: rig.pane.shownSession.get()?.reason }, { stream: ['/chat open'], shown: 'open' });
	});

	test('through the Chat view host, the session that a started chat moves to after its first request stays reported as committed', async () => {
		const rig = createPane();
		rig.nextRef.dispose();
		const untitled = nextResource.with({ path: '/untitled-started' });
		const committed = nextResource.with({ path: '/committed' });
		const reference = (resource: URI) => Object.assign(toDisposable(() => { }), { object: upcastPartial<IChatModel>({ sessionResource: resource }) });
		Object.assign(rig.pane, { chatService: { acquireOrLoadSession: async (resource: URI) => reference(resource) }, focus: () => { } });
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: (async () => rig.pane) as IViewsService['openView'],
			onDidChangeViewVisibility: Event.None,
			getViewWithId: (<T>() => rig.pane as T) as IViewsService['getViewWithId'],
		}));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({}));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({}));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({}));
		const host = store.add(instantiationService.createInstance(ChatViewHostService));
		const start = await host.startSession(untitled, { local: false, importingConversation: false });
		const stream: string[] = [];
		store.add(autorun(reader => {
			const shown = rig.pane.shownSession.read(reader);
			stream.push(shown ? `${shown.resource.path} ${shown.reason}` : 'none');
		}));
		stream.length = 0;
		// The first request committed the session, which the host shows as committed, then the start moves to it
		await host.openSession(committed, { preserveFocus: true, commit: true });
		await start.moved(committed);
		start.dispose();

		assert.deepStrictEqual(stream, ['/committed commit']);
	});

	test('cancelling a replacement releases its pending reference before provider activation completes', async () => {
		const resolving = new DeferredPromise<void>();
		const rig = createPane(resolving.p);
		const cts = store.add(new CancellationTokenSource());
		const showing = rig.pane.showModel(cts.token, rig.nextRef);
		await timeout(0);
		cts.cancel();
		const whileProviderPending = [...rig.disposed];
		const result = await showing;
		await resolving.complete();
		assert.deepStrictEqual({ whileProviderPending, result, bindings: rig.bindings, disposed: rig.disposed, shown: rig.widget.viewModel?.sessionResource, locks: rig.locks }, {
			whileProviderPending: [nextResource], result: undefined, bindings: [], disposed: [nextResource], shown: previousResource, locks: [],
		});
	});

	test('disposing the pane releases the incoming reference before provider activation completes', async () => {
		const resolving = new DeferredPromise<void>();
		const rig = createPane(resolving.p);
		const showing = rig.pane.showModel(CancellationToken.None, rig.nextRef);
		await timeout(0);
		rig.paneStore.dispose();
		const whileProviderPending = [...rig.disposed];
		const result = await showing;
		await resolving.complete();
		assert.deepStrictEqual({ whileProviderPending, result, bindings: rig.bindings, disposed: rig.disposed, locks: rig.locks }, {
			whileProviderPending: [previousResource, nextResource],
			result: undefined, bindings: [undefined], disposed: [previousResource, nextResource], locks: [],
		});
	});

	test('cancelling initial configuration preparation preserves the displayed session', async () => {
		const preparing = new DeferredPromise<void>();
		const rig = createPane(Promise.resolve(), preparing.p);
		const cts = store.add(new CancellationTokenSource());
		const showing = rig.pane.showModel(cts.token, rig.nextRef);
		await timeout(0);
		const whilePreparing = rig.widget.viewModel?.sessionResource;
		cts.cancel();
		const result = await showing;
		await preparing.complete();
		assert.deepStrictEqual({ whilePreparing, result, bindings: rig.bindings, disposed: rig.disposed, locks: rig.locks }, {
			whilePreparing: previousResource, result: undefined, bindings: [], disposed: [nextResource], locks: [],
		});
	});

	test('preserves input typed while the new chat configuration is being prepared', async () => {
		const preparing = new DeferredPromise<void>();
		const rig = createPane(Promise.resolve(), preparing.p);
		const showing = rig.pane.showModel(CancellationToken.None, rig.nextRef);
		await timeout(0);
		rig.widget.setInput('New draft typed while loading');
		await preparing.complete();
		await showing;
		assert.deepStrictEqual({ input: rig.widget.getInput(), bindings: rig.bindings }, {
			input: 'New draft typed while loading', bindings: [nextResource],
		});
	});

	test('a new chat of its own, as a sessions list starts one, replaces the chat it shows and its slow load, without focus', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const rig = createPane();
		const acquiring = new DeferredPromise<IChatModelReference>();
		const freshResource = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-fresh' });
		const freshRef = Object.assign(toDisposable(() => { }), { object: upcastPartial<IChatModel>({ sessionResource: freshResource }) });
		const focused: string[] = [];
		Object.assign(rig.pane, {
			chatService: { acquireOrLoadSession: () => acquiring.p },
			acquireDefaultNewSession: async () => ({ modelRef: freshRef }),
			updateViewState: () => { },
		});
		Object.assign(rig.widget, { focusInput: () => focused.push('chat') });
		// A load still under way, while the chat it replaces still shows
		const loading = rig.pane.loadSession(nextResource);
		await timeout(150);

		const taken = await (Reflect.get(ChatViewPane.prototype, 'newChat') as (this: object, target: IChatViewNewChatTarget, options: IChatViewHostNewChatOptions) => Promise<boolean>)
			.call(rig.pane, { folder: URI.file('/repo') }, { ownChat: true, preserveFocus: true });
		await acquiring.complete(rig.nextRef);
		await loading;

		assert.deepStrictEqual({ taken, focused, bindings: rig.bindings, shown: rig.widget.viewModel?.sessionResource.path }, {
			taken: true,
			focused: [],
			bindings: [freshResource],
			shown: '/untitled-fresh',
		});
	}));

	test('of two New Chats of its own under way, the later one shows its new chat, also as the earlier one completes last', async () => {
		const rig = createPane();
		const disposedNew: string[] = [];
		const newChat = (name: string) => {
			const model = upcastPartial<IChatModel>({ sessionResource: URI.from({ scheme: SessionType.AgentHostCopilot, path: `/untitled-${name}` }) });
			return { model, ref: Object.assign(toDisposable(() => disposedNew.push(name)), { object: model }) as IChatModelReference, acquired: new DeferredPromise<{ modelRef: IChatModelReference }>() };
		};
		const a = newChat('a');
		const b = newChat('b');
		const acquisitions = [a, b];
		Object.assign(rig.pane, {
			acquireDefaultNewSession: () => acquisitions.shift()!.acquired.p,
			updateViewState: () => { },
		});
		const run = Reflect.get(ChatViewPane.prototype, 'newChat') as (this: object, target: { folder: URI }, options: { ownChat: boolean; preserveFocus: boolean }) => Promise<boolean>;
		const first = run.call(rig.pane, { folder: URI.file('/a') }, { ownChat: true, preserveFocus: true });
		const second = run.call(rig.pane, { folder: URI.file('/b') }, { ownChat: true, preserveFocus: true });
		await b.acquired.complete({ modelRef: b.ref });
		const takenLater = await second;
		await a.acquired.complete({ modelRef: a.ref });
		const takenEarlier = await first;
		// The rig's next chat, which these New Chats do not use
		rig.nextRef.dispose();

		assert.deepStrictEqual({ takenEarlier, takenLater, bindings: rig.bindings.map(resource => resource?.path), disposedNew, shown: rig.widget.viewModel?.sessionResource?.path }, {
			takenEarlier: true,
			takenLater: true,
			bindings: ['/untitled-b'],
			disposedNew: ['a'],
			shown: '/untitled-b',
		});
	});

	for (const untitled of [true, false]) {
		test(`${untitled ? 'new chats stay bound' : 'saved chats still clear'} while a slow load is pending`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const rig = createPane();
			const acquiring = new DeferredPromise<IChatModelReference>();
			Object.assign(rig.pane, { chatService: { acquireOrLoadSession: () => acquiring.p } });
			const loading = rig.pane.loadSession(untitled ? nextResource : nextResource.with({ path: '/saved' }));
			await timeout(150);
			const whileLoading = rig.widget.viewModel?.sessionResource;
			await acquiring.complete(rig.nextRef);
			await loading;
			assert.deepStrictEqual({ whileLoading, bindings: rig.bindings, disposed: rig.disposed }, {
				whileLoading: untitled ? previousResource : undefined,
				bindings: untitled ? [nextResource] : [undefined, nextResource],
				disposed: [previousResource],
			});
		}));
	}
});

suite('ChatViewPane persisted session restore', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createPane(error: Error): { acquireTransferredOrPersistedSession(token: CancellationToken, debugOwner: string): Promise<{ modelRef?: IChatModelReference }> } {
		return Object.assign(Object.create(ChatViewPane.prototype), {
			viewState: { sessionResource: URI.parse('agent-host-copilotcli:/missing') },
			logService: new NullLogService(),
			chatService: { acquireOrLoadSession: async () => { throw error; } },
		});
	}

	test('starts a new session when the persisted session fails to load', async () => {
		const restored = await createPane(new Error('Session identity was not advertised by its agent host')).acquireTransferredOrPersistedSession(CancellationToken.None, 'test');
		assert.strictEqual(restored.modelRef, undefined);
	});

	test('still propagates cancellation', async () => {
		await assert.rejects(createPane(new CancellationError()).acquireTransferredOrPersistedSession(CancellationToken.None, 'test'), CancellationError);
	});
});

suite('ChatViewPane managed permission rules', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [policyKey, policyValue, required] of [
		['permissions.deny', '["Shell"]', true],
		['permissions.deny', '[]', false],
		['permissions.ask', '["Shell"]', false],
		['permissions.allow', '[]', false],
		['permissions.disableBypassPermissionsMode', 'disable', false],
		['permissions.defaultMode', 'manual', false],
		['sandbox.enabled', true, true],
		[COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY, false, true],
	] as const) {
		for (const result of ['missing', 'error'] as const) {
			test(`${policyKey}=${policyValue} waits for policy and ${required ? 'prohibits' : 'preserves'} Local with ${result} Copilot`, async () => {
				const ready = new DeferredPromise<void>();
				let rules: string | boolean | undefined = undefined;
				const selected: string[] = [];
				const errors: string[] = [];
				const localModel = { object: upcastPartial<IChatModel>({}), dispose: () => { } };
				let localStarts = 0;
				const pane: { acquireDefaultNewSession(token: CancellationToken): Promise<{ modelRef?: IChatModelReference }> } = Object.assign(Object.create(ChatViewPane.prototype), {
					accountPolicyGateService: { gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: () => ready.p },
					managedSettingsService: new class extends NullManagedSettingsService {
						override getManagedSettingValue(key: string) { return key === policyKey ? rules : undefined; }
						override getManagedSettings() { return rules === undefined ? {} : { [policyKey]: rules }; }
					}(),
					configurationService: new TestConfigurationService(),
					workspaceContextService: new TestContextService(),
					storageService: store.add(new TestStorageService()),
					chatSessionsService: new MockChatSessionsService(),
					agentHostEnablementService: { enabled: constObservable(false), managedSandboxEnforced: constObservable(false) },
					logService: new NullLogService(),
					notificationService: { error: (message: string) => errors.push(message) },
					chatService: {
						startNewLocalSession: () => { localStarts++; return localModel; },
						acquireOrLoadSession: async (resource: URI): Promise<IChatModelReference | undefined> => {
							selected.push(getChatSessionType(resource));
							if (result === 'error') {
								throw new Error('host unavailable');
							}
							return undefined;
						},
					},
				});
				const pending = pane.acquireDefaultNewSession(CancellationToken.None);
				const before = [...selected];
				rules = policyValue;
				ready.complete();
				if (required) {
					await assert.rejects(pending);
				} else {
					assert.strictEqual((await pending).modelRef, localModel);
				}
				assert.deepStrictEqual({ before, selected, localStarts, explained: errors.some(error => error.includes('organization requires the new Copilot experience')) }, {
					before: [], selected: required ? [SessionType.AgentHostCopilot] : [], localStarts: required ? 0 : 1, explained: required,
				});
			});
		}
	}
});

suite('ChatViewPane chat open diagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const chat = URI.parse('vscode-chat-session://local/abc');
	const other = URI.parse('vscode-chat-session://local/other');

	function createPane(options: { shown?: URI; restored?: boolean; acquired?: URI | undefined; fail?: boolean; acquiring?: Promise<void> }) {
		const events: string[] = [];
		const pane: { loadSession(resource: URI): Promise<IChatModel | undefined>; loadSessionCts: { value: CancellationTokenSource | undefined } } = Object.assign(Object.create(ChatViewPane.prototype), {
			_openDiagnostics: store.add(new MutableDisposable()),
			logService: new NullLogService(),
			chatOpenDiagnosticsService: store.add(new ChatOpenDiagnosticsService(new class extends NullLogService {
				override info(message: string): void { events.push(message); }
			}())),
			layoutService: { isRestored: () => options.restored ?? true },
			notificationService: { error: () => { } },
			progressService: { withProgress: (_: unknown, task: () => Promise<unknown>) => task() },
			loadSessionCts: { value: undefined, },
			_shownSession: observableValue<IChatViewHostShownSession | undefined>('shownSession', undefined),
			_shownReports: 0,
			_applyModelCts: { value: undefined },
			element: { ownerDocument: { hidden: false } },
			_widget: { viewModel: options.shown ? { sessionResource: options.shown } : undefined, visible: true, getInput: () => '' },
			chatService: {
				acquireOrLoadSession: async () => {
					await options.acquiring;
					if (options.fail) {
						throw new Error('boom');
					}
					return options.acquired ? { object: { sessionResource: options.acquired }, dispose: () => { } } : undefined;
				},
			},
			showModel: async (_token: CancellationToken, modelRef: { object: IChatModel } | undefined) => modelRef?.object,
		});
		return { pane, events };
	}

	const summarize = (events: string[]) => events.map(summary => [summary.split(' ')[1], summary.split(' ')[2], summary.endsWith('alreadyShown=true')]);

	test('loading the requested chat completes the open', async () => {
		const { pane, events } = createPane({ acquired: chat });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'completed', false]]);
	});

	test('showing another chat in its place fails the open', async () => {
		const { pane, events } = createPane({ acquired: other });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'failed', false]]);
	});

	test('an error loading the chat fails the open', async () => {
		const { pane, events } = createPane({ fail: true });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'failed', false]]);
	});

	test('showing the chat again is reported as a re-show', async () => {
		const { pane, events } = createPane({ shown: chat, acquired: chat });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'completed', true]]);
	});

	test('a re-show that cannot load the requested chat is not logged as completed', async () => {
		const { pane, events } = createPane({ shown: chat, fail: true });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'failed', true]]);
	});

	test('an open cancelled by a newer load, such as New Chat, is cancelled', async () => {
		const acquiring = new DeferredPromise<void>();
		const { pane, events } = createPane({ acquired: chat, acquiring: acquiring.p });
		const loading = pane.loadSession(chat);
		await timeout(0);
		pane.loadSessionCts.value?.cancel();
		acquiring.complete();
		await loading;
		assert.deepStrictEqual(summarize(events), [['panel', 'cancelled', false]]);
	});

	test('opens during restore are not measured', async () => {
		const { pane, events } = createPane({ restored: false, acquired: chat });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), []);
	});
});

suite('ChatViewPane restored chat with a harness disabled by policy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function restore(sessionResource: URI, hasRequests: boolean, claudeDisabled: boolean) {
		const configurationService = new TestConfigurationService();
		const inspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string) => {
			const value = inspect<T>(key);
			return claudeDisabled && key === AgentHostClaudeAgentEnabledSettingId ? { ...value, policyValue: false as T } : value;
		};
		let disposed = false;
		const pane: { acquireTransferredOrPersistedSession(token: CancellationToken, debugOwner: string): Promise<{ modelRef?: IChatModelReference }> } = Object.assign(Object.create(ChatViewPane.prototype), {
			viewState: { sessionResource },
			managedSettingsService: new NullManagedSettingsService(),
			configurationService,
			workspaceContextService: new TestContextService(),
			storageService: store.add(new TestStorageService()),
			chatSessionsService: new MockChatSessionsService(),
			agentHostEnablementService: { enabled: constObservable(true), managedSandboxEnforced: constObservable(false) },
			chatService: {
				transferredSessionResource: undefined,
				acquireOrLoadSession: async (resource: URI): Promise<IChatModelReference> => ({ object: upcastPartial<IChatModel>({ sessionResource: resource, hasRequests }), dispose: () => { disposed = true; } }),
			},
		});
		const { modelRef } = await pane.acquireTransferredOrPersistedSession(CancellationToken.None, 'test');
		return { restored: !!modelRef, disposed };
	}

	test('skips only an empty draft of the disabled harness', async () => {
		const draft = URI.from({ scheme: SessionType.AgentHostClaude, path: '/untitled-abc' });
		const saved = URI.from({ scheme: SessionType.AgentHostClaude, path: '/abc' });
		assert.deepStrictEqual({
			emptyDraft: await restore(draft, false, true),
			draftWithRequests: await restore(draft, true, true),
			savedChat: await restore(saved, false, true),
			allowedDraft: await restore(draft, false, false),
		}, {
			emptyDraft: { restored: false, disposed: true },
			draftWithRequests: { restored: true, disposed: false },
			savedChat: { restored: true, disposed: false },
			allowedDraft: { restored: true, disposed: false },
		});
	});
});

suite('ChatViewPane widget readiness', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('whenWidget resolves to the widget the body creates, once it is rendered, as the body creates its controls', async () => {
		const steps: string[] = [];
		const store = disposables.add(new DisposableStore());
		const widget = upcastPartial<ChatWidget>({
			render: () => { steps.push('render'); },
			setVisible: () => { },
			dispose: () => { },
		});
		const instantiationService = {
			createInstance: () => ({ onDidChangeHeight: Event.None, dispose: () => { } }),
			createChild: () => ({ createInstance: (ctor: unknown) => ctor === ChatWidget ? widget : { dispose: () => { } }, dispose: () => { } }),
		};
		// The order of the real Chat view: its title control, then its widget, which it renders
		const pane = Object.assign(Object.create(ChatViewPane.prototype), {
			_store: store,
			_widgetCreated: new DeferredPromise<ChatWidget>(),
			id: 'workbench.panel.chat.view.copilot',
			instantiationService,
			layoutService: { getContainer: () => mainWindow.document.createElement('div') },
			scopedContextKeyService: {},
			aiCustomizationWorkspaceService: { activeProjectRoot: constObservable(undefined) },
			customizationMigrationsAvailable: { set: () => { } },
			getLocationBasedColors: () => ({ background: '', overlayBackground: '', listOverrideStyles: {} }),
			onDidChangeBodyVisibility: Event.None,
			isBodyVisible: () => true,
			welcomeController: undefined,
			sessionsListService: { sessionsOnly: constObservable(false) },
			relayout: () => { },
		}) as ChatViewPane;
		pane.whenWidget.then(created => steps.push(created === widget ? 'resolved to the widget' : `resolved to ${created}`));

		(Reflect.get(ChatViewPane.prototype, 'createChatControl') as (this: ChatViewPane, parent: HTMLElement) => ChatWidget).call(pane, mainWindow.document.createElement('div'));
		await timeout(0);

		assert.deepStrictEqual(steps, ['render', 'resolved to the widget']);
	});
});
