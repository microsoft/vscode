/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { SplitView, Sizing } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ISessionGridPane } from '../../../../../workbench/services/sessions/browser/sessionGridPane.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { Workbench } from '../../../../browser/workbench.js';
import { ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionComparison, SessionComparisonParticipantRole } from '../../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { AICustomizationShortcutsWidget } from '../../../../../workbench/contrib/sessions/browser/aiCustomizationShortcutsWidget.js';
import { getCustomizationsPresentation, SessionsView } from '../../../../../workbench/contrib/sessions/browser/views/sessionsView.js';
import { SessionsGrouping, SessionsSorting } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { SESSIONS_LIST_INBOX_ENABLED_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SessionViewFloatingToolbar } from '../../../../../workbench/contrib/sessions/browser/parts/sessionHeaderBar.js';
import { ISessionHost } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { IMenuService, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ChatCustomizationsLocation } from '../../../../../workbench/contrib/chat/common/customizationsLocation.js';
import '../../../../../workbench/contrib/sessions/browser/media/sessionsViewPane.css';

const registerEditorTabHeightClass = Reflect.get(Workbench.prototype, 'registerEditorTabHeightClass') as (this: {
	readonly mainContainer: HTMLElement;
	readonly editorGroupService: {
		readonly partOptions: { readonly tabHeight: 'default' | 'compact' };
		readonly onDidChangeEditorPartOptions: Event<void>;
	};
	_register<T extends IDisposable>(disposable: T): T;
}) => void;
const handleSessionOpened = Reflect.get(SessionsView.prototype, '_handleSessionOpened') as (this: {
	readonly sessionComparisonService: { getComparisonForSession(resource: URI): ISessionComparison | undefined };
	readonly sessionsService: { readonly slotPanes: IObservable<readonly ISessionGridPane[]> };
	readonly layoutService: { mainContainer: HTMLElement; setPartHidden(hidden: boolean, part: string): void };
	readonly hostLayoutService: { readonly sidePane?: { hideSidePane(): void } };
}, session: ISession) => void;
const updateHeaderLayout = Reflect.get(SessionsView.prototype, 'updateHeaderLayout') as (this: {
	readonly sessionsHeaders: ReadonlySet<{
		readonly row: HTMLElement;
		readonly label: HTMLElement;
		readonly actions: HTMLElement;
	}>;
	readonly layoutService: { readonly mainContainer: HTMLElement };
	readonly isFindWidgetOpen: boolean;
}) => void;

suite('Sessions - SessionsViewPane', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps global customization actions operable before a draft session is bound', async () => {
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
			contextKeyService: () => disposables.add(new ContextKeyService(configurationService)),
		}, disposables);
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		const calls: string[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string): Promise<T | undefined> { calls.push(id); return undefined; }
		});
		instantiationService.stub(IMenuService, disposables.add(instantiationService.createInstance(MenuService)));
		for (const menu of [Menus.NewSessionGlobalToolbar, Menus.SessionBarToolbar]) {
			disposables.add(MenuRegistry.appendMenuItem(menu, {
				command: { id: 'test.globalCustomization', title: 'Customizations', icon: Codicon.extensions },
				group: 'navigation',
			}));
		}
		const toolbar = disposables.add(instantiationService.createInstance(SessionViewFloatingToolbar));
		mainWindow.document.body.appendChild(toolbar.element);
		disposables.add(toDisposable(() => toolbar.element.remove()));
		toolbar.setSession(undefined);
		const visibleButtons = () => [...toolbar.element.querySelectorAll<HTMLElement>('.codicon-extensions')]
			.filter(button => button.closest<HTMLElement>('.chat-composite-bar-toolbar')!.style.display !== 'none');
		const button = visibleButtons()[0];
		assert.ok(button, toolbar.element.outerHTML);
		button.click();
		await timeout(0);
		const unbound = visibleButtons().length;
		toolbar.setSession(upcastPartial<ISession>({ resource: URI.parse('agent-host-copilot:/draft'), status: constObservable(SessionStatus.Untitled) }));
		const bound = visibleButtons().length;
		visibleButtons()[0].click();
		await timeout(0);
		toolbar.setSession(undefined);
		assert.deepStrictEqual({ calls, unbound, bound, unboundAgain: visibleButtons().length }, {
			calls: ['test.globalCustomization', 'test.globalCustomization'], unbound: 1, bound: 1, unboundAgain: 1,
		});
	});

	test('layout refresh keeps the chosen placement independent of navigation and phone transitions', () => {
		const container = mainWindow.document.createElement('div');
		const location = observableValue<ChatCustomizationsLocation>(disposables, 'chatInput');
		const navigation = observableValue(disposables, true);
		const customizationsAtBottom = observableValue(disposables, false);
		const calls: Array<[string, boolean]> = [];
		const host = {
			layoutService: { mainContainer: container },
			scopedContextKeyService: { contextMatchesRules: () => true },
			chatEntitlementService: { sentimentObs: constObservable({ hidden: false }) },
			separateNavigation: navigation,
			customizationsAtBottom,
			customizationsLocation: location,
			updateCustomizationsPresentation: (presentation: string, shortcuts: boolean) => calls.push([presentation, shortcuts]),
		};
		const refresh = Reflect.get(SessionsView.prototype, 'refreshCustomizationsPresentation') as (this: typeof host) => void;
		refresh.call(host);
		container.classList.add('phone-layout');
		refresh.call(host);
		container.classList.remove('phone-layout');
		refresh.call(host);
		location.set('sessionsHeader', undefined);
		navigation.set(false, undefined);
		refresh.call(host);
		location.set('sidebar', undefined);
		navigation.set(true, undefined);
		refresh.call(host);
		location.set('auto', undefined);
		refresh.call(host);
		customizationsAtBottom.set(true, undefined);
		refresh.call(host);
		navigation.set(false, undefined);
		refresh.call(host);
		assert.deepStrictEqual(calls, [['hidden', true], ['hidden', false], ['hidden', true], ['treatment', false], ['control', true], ['treatment', true], ['control', true], ['control', false]]);
	});

	test('floating toolbar view items follow their own draft rather than the focused session', () => {
		const host = {
			_session: undefined as ISession | undefined,
			_sessionDisposables: disposables.add(new MutableDisposable<DisposableStore>()),
			_sessionHost: upcastPartial<ISessionHost>({}),
			_menuActionArgs: [] as unknown[],
			_toolbar: { context: undefined as ISession | undefined },
			_toolbarContainer: { style: { display: '' } },
			_globalToolbarContainer: { style: { display: '' } },
			_setVisible: () => { },
		};
		const setSession = SessionViewFloatingToolbar.prototype.setSession as (this: typeof host, session: ISession | undefined) => void;
		const contexts: Array<string | undefined> = [];
		for (const resource of [URI.parse('agent-host-copilot:/draft'), URI.parse('agent-host-claude:/draft'), undefined]) {
			setSession.call(host, resource ? upcastPartial<ISession>({ resource, status: constObservable(SessionStatus.Untitled) }) : undefined);
			contexts.push(host._toolbar.context?.resource.toString());
		}
		assert.deepStrictEqual(contexts, ['agent-host-copilot:/draft', 'agent-host-claude:/draft', undefined]);
	});

	test('offers and selects environment grouping in the mobile sheet', async () => {
		const container = mainWindow.document.createElement('div');
		const selected = new DeferredPromise<SessionsGrouping>();
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const host = {
			layoutService: { mainContainer: container },
			grouping: SessionsGrouping.Environment,
			currentSorting: SessionsSorting.Created,
			configurationService,
			chatEntitlementService: { sentiment: { hidden: false } },
			setGrouping: (grouping: SessionsGrouping) => selected.complete(grouping),
			setSorting: () => assert.fail('Expected grouping selection'),
		};
		const openSheet = Reflect.get(SessionsView.prototype, 'openSortGroupSheet') as (this: typeof host) => void;
		openSheet.call(host);
		const option = [...container.querySelectorAll<HTMLButtonElement>('.mobile-sort-group-sheet-item')]
			.find(row => row.textContent?.trim() === 'Group by Environment');
		assert.ok(option);
		const checked = option.getAttribute('aria-selected');
		option.click();

		assert.deepStrictEqual({ checked, selected: await selected.p }, { checked: 'true', selected: SessionsGrouping.Environment });
	});

	test('uses the setting as the grouping default until an explicit choice is saved', async () => {
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const storageService = disposables.add(new InMemoryStorageService());
		const host = {
			currentGrouping: undefined as SessionsGrouping | undefined,
			configurationService,
			storageService,
			get grouping(): SessionsGrouping { return Reflect.get(SessionsView.prototype, 'grouping', this); },
			updateHeaderLayout: () => { },
		};
		const setGrouping = SessionsView.prototype.setGrouping as (this: typeof host, grouping: SessionsGrouping) => void;
		const initial = host.grouping;
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, true);
		const enabled = host.grouping;
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, false);
		const disabled = host.grouping;
		setGrouping.call(host, SessionsGrouping.Inbox);
		const saved = storageService.get('sessionsViewPane.grouping', StorageScope.PROFILE);
		const selected = host.grouping;
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, true);
		const restored = host.grouping;
		setGrouping.call(host, SessionsGrouping.Workspace);
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, false);
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, true);
		assert.deepStrictEqual({ initial, enabled, disabled, saved, selected, restored, changed: host.grouping }, {
			initial: SessionsGrouping.Workspace,
			enabled: SessionsGrouping.Inbox,
			disabled: SessionsGrouping.Workspace,
			saved: SessionsGrouping.Inbox,
			selected: SessionsGrouping.Inbox,
			restored: SessionsGrouping.Inbox,
			changed: SessionsGrouping.Workspace,
		});
	});

	for (const enabled of [false, true]) {
		test(`persists an explicit selection of the default grouping (${enabled})`, async () => {
			const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: enabled });
			disposables.add(configurationService.onDidChangeConfigurationEmitter);
			const storageService = disposables.add(new InMemoryStorageService());
			const host = {
				currentGrouping: undefined as SessionsGrouping | undefined,
				configurationService,
				storageService,
				get grouping(): SessionsGrouping { return Reflect.get(SessionsView.prototype, 'grouping', this); },
				updateHeaderLayout: () => { },
			};
			const initial = host.grouping;
			const setGrouping = SessionsView.prototype.setGrouping as (this: typeof host, grouping: SessionsGrouping) => void;
			setGrouping.call(host, initial);
			await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, !enabled);
			const saved = storageService.get('sessionsViewPane.grouping', StorageScope.PROFILE);
			assert.deepStrictEqual({ selected: host.grouping, saved }, {
				selected: enabled ? SessionsGrouping.Inbox : SessionsGrouping.Workspace,
				saved: enabled ? SessionsGrouping.Inbox : SessionsGrouping.Workspace,
			});
		});
	}

	for (const { enabled, hidden } of [{ enabled: false, hidden: false }, { enabled: true, hidden: false }, { enabled: true, hidden: true }]) {
		test(`mobile inbox option ignores default setting (${enabled}) and respects hidden AI (${hidden})`, async () => {
			const container = mainWindow.document.createElement('div');
			const selected = new DeferredPromise<SessionsGrouping>();
			const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: enabled });
			disposables.add(configurationService.onDidChangeConfigurationEmitter);
			const host = {
				layoutService: { mainContainer: container },
				grouping: SessionsGrouping.Workspace,
				currentSorting: SessionsSorting.Created,
				configurationService,
				chatEntitlementService: { sentiment: { hidden } },
				setGrouping: (grouping: SessionsGrouping) => selected.complete(grouping),
				setSorting: () => assert.fail('Expected grouping selection'),
			};
			const openSheet = Reflect.get(SessionsView.prototype, 'openSortGroupSheet') as (this: typeof host) => void;
			openSheet.call(host);
			const options = [...container.querySelectorAll<HTMLButtonElement>('.mobile-sort-group-sheet-item')];
			const inbox = options.find(row => row.textContent?.trim() === 'Inbox Mode');
			const workspace = options.find(row => row.textContent?.trim() === 'Group by Workspace')!;
			(inbox ?? workspace).click();
			assert.deepStrictEqual({ offered: !!inbox, selected: await selected.p }, {
				offered: !hidden,
				selected: !hidden ? SessionsGrouping.Inbox : SessionsGrouping.Workspace,
			});
		});
	}

	test('selects control and treatment presentations only when AI UI is visible on desktop', () => {
		assert.deepStrictEqual({
			control: getCustomizationsPresentation(false, true, false, false),
			treatment: getCustomizationsPresentation(false, true, false, true),
			phone: getCustomizationsPresentation(true, true, false, true),
			aiDisabled: getCustomizationsPresentation(false, false, false, true),
			aiHidden: getCustomizationsPresentation(false, true, true, true),
		}, {
			control: 'control',
			treatment: 'treatment',
			phone: 'hidden',
			aiDisabled: 'hidden',
			aiHidden: 'hidden',
		});
	});

	test('explicit customization locations override either sidebar arrangement', () => {
		assert.deepStrictEqual([false, true].map(navigation => ({
			sidebar: getCustomizationsPresentation(false, true, false, navigation, 'sidebar'),
			header: getCustomizationsPresentation(false, true, false, navigation, 'sessionsHeader'),
			toolbar: getCustomizationsPresentation(false, true, false, navigation, 'chatToolbar'),
			input: getCustomizationsPresentation(false, true, false, navigation, 'chatInput'),
			hidden: getCustomizationsPresentation(false, true, true, navigation, 'sidebar'),
		})), [
			{ sidebar: 'control', header: 'treatment', toolbar: 'hidden', input: 'hidden', hidden: 'hidden' },
			{ sidebar: 'control', header: 'treatment', toolbar: 'hidden', input: 'hidden', hidden: 'hidden' },
		]);
	});

	test('preserves Customizations and Automations focus while switching presentations', () => {
		const updatePresentation = Reflect.get(SessionsView.prototype, 'updateCustomizationsPresentation') as
			(this: ReturnType<typeof createHost>, presentation: 'hidden' | 'control' | 'treatment') => void;

		function createHost(
			presentation: 'hidden' | 'control' | 'treatment',
			focused: 'customizations' | 'automations',
		) {
			const calls: string[] = [];
			const widget = {
				hasFocus: () => presentation === 'control' && focused === 'customizations',
				focus: () => calls.push('focusControlCustomizations'),
			};
			const sessionsControl = {
				isCustomizationsFocused: () => presentation === 'treatment' && focused === 'customizations',
				isAutomationsFocused: () => focused === 'automations',
				updateNavigationVisibility: () => calls.push('updateTreeNavigation'),
				focusCustomizations: () => calls.push('focusTreatmentCustomizations'),
				focusAutomations: () => calls.push('focusControlAutomations'),
				focus: () => calls.push('focusSessions'),
			};
			const rearrangeContextValues: boolean[] = [];
			const host = {
				configurationService: new TestConfigurationService(),
				customizationsPresentation: presentation,
				customizationsNavigationVisible: { set: () => { } },
				sessionsListRearrangeContext: { set: (value: boolean) => rearrangeContextValues.push(value) },
				_customizationsWidget: presentation === 'control' ? widget : undefined,
				sessionsControl,
				updateHeaderLayout: () => calls.push('updateHeader'),
				removeCustomizationsPane: () => {
					calls.push('removePane');
					host._customizationsWidget = undefined;
				},
				updateCustomizationsPane: () => {
					calls.push('createPane');
					host._customizationsWidget = widget;
				},
				layoutSidebarSplitView: () => calls.push('layout'),
				calls,
				rearrangeContextValues,
			};
			return host;
		}

		const controlCustomizations = createHost('control', 'customizations');
		updatePresentation.call(controlCustomizations, 'treatment');
		const treatmentAutomations = createHost('treatment', 'automations');
		updatePresentation.call(treatmentAutomations, 'control');
		const hiddenCustomizations = createHost('treatment', 'customizations');
		updatePresentation.call(hiddenCustomizations, 'hidden');

		assert.deepStrictEqual({
			controlCustomizations: controlCustomizations.calls,
			treatmentAutomations: treatmentAutomations.calls,
			hiddenCustomizations: hiddenCustomizations.calls,
			rearrangeContextValues: [
				controlCustomizations.rearrangeContextValues,
				treatmentAutomations.rearrangeContextValues,
				hiddenCustomizations.rearrangeContextValues,
			],
		}, {
			controlCustomizations: [
				'updateHeader',
				'updateTreeNavigation',
				'removePane',
				'focusTreatmentCustomizations',
				'layout',
			],
			treatmentAutomations: [
				'updateHeader',
				'updateTreeNavigation',
				'removePane',
				'createPane',
				'focusControlAutomations',
				'layout',
			],
			hiddenCustomizations: [
				'updateHeader',
				'updateTreeNavigation',
				'removePane',
				'focusSessions',
				'layout',
			],
			rearrangeContextValues: [[true], [false], [false]],
		});
	});

	test('does not reserve customization space on phones and restores the pane on desktop', () => {
		const mainContainer = mainWindow.document.createElement('div');
		mainContainer.classList.add('phone-layout');
		const container = mainWindow.document.createElement('div');
		const instantiationService = disposables.add(new TestInstantiationService());
		const customizationsPaneDisposables = disposables.add(new MutableDisposable<DisposableStore>());
		const splitView = disposables.add(new SplitView(container));
		splitView.addView({
			element: mainWindow.document.createElement('div'),
			minimumSize: 120,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: () => { },
		}, Sizing.Distribute);
		splitView.layout(600);
		let disposedWidgets = 0;
		let focusCalls = 0;
		instantiationService.stubInstance(AICustomizationShortcutsWidget, {
			collapsed: false,
			collapsedHeight: 30,
			desiredHeight: 200,
			onDidChangeHeight: Event.None,
			onDidToggleCollapsed: Event.None,
			layout: () => { },
			focus: () => focusCalls++,
			dispose: () => disposedWidgets++,
		});
		const host = {
			layoutService: { mainContainer },
			instantiationService,
			configurationService: new TestConfigurationService(),
			sidebarSplitViewContainer: container,
			sidebarSplitView: splitView,
			customizationsPaneDisposables,
			_customizationsWidget: undefined as AICustomizationShortcutsWidget | undefined,
			customizationsPresentation: 'control',
			currentBodyWidth: 300,
			currentBodyHeight: 600,
			didInitializePaneSizes: false,
			getCustomizationsPaneHeight: () => 200,
			layoutSidebarSplitView: (): void => layoutPane.call(host),
			removeCustomizationsPane: (): void => {
				if (!host._customizationsWidget) {
					return;
				}
				splitView.removeView(1, Sizing.Distribute);
				host._customizationsWidget = undefined;
				customizationsPaneDisposables.clear();
				host.didInitializePaneSizes = false;
			},
		};
		const updatePane = Reflect.get(SessionsView.prototype, 'updateCustomizationsPane') as (this: typeof host) => void;
		const layoutPane = Reflect.get(SessionsView.prototype, 'layoutSidebarSplitView') as (this: typeof host) => void;
		const focusCustomizations = SessionsView.prototype.focusCustomizations as (this: typeof host) => void;
		const snapshot = () => ({
			panes: splitView.length,
			sessionsHeight: splitView.getViewSize(0),
			customizations: container.querySelectorAll('.agent-sessions-customizations-section').length,
			hasWidget: !!host._customizationsWidget,
			disposedWidgets,
			focusCalls,
		});

		updatePane.call(host);
		host.layoutSidebarSplitView();
		focusCustomizations.call(host);
		const phone = snapshot();
		mainContainer.classList.remove('phone-layout');
		updatePane.call(host);
		updatePane.call(host);
		host.layoutSidebarSplitView();
		focusCustomizations.call(host);
		const desktop = snapshot();
		mainContainer.classList.add('phone-layout');
		focusCustomizations.call(host);
		updatePane.call(host);
		host.layoutSidebarSplitView();
		const phoneAgain = snapshot();
		mainContainer.classList.remove('phone-layout');
		updatePane.call(host);
		host.layoutSidebarSplitView();
		focusCustomizations.call(host);

		assert.deepStrictEqual({ phone, desktop, phoneAgain, desktopAgain: snapshot() }, {
			phone: { panes: 1, sessionsHeight: 600, customizations: 0, hasWidget: false, disposedWidgets: 0, focusCalls: 0 },
			desktop: { panes: 2, sessionsHeight: 400, customizations: 1, hasWidget: true, disposedWidgets: 0, focusCalls: 1 },
			phoneAgain: { panes: 1, sessionsHeight: 600, customizations: 0, hasWidget: false, disposedWidgets: 1, focusCalls: 1 },
			desktopAgain: { panes: 2, sessionsHeight: 400, customizations: 1, hasWidget: true, disposedWidgets: 1, focusCalls: 2 },
		});
	});

	test('matches the default and compact editor tab heights', () => {
		const editorPartOptionsChanged = disposables.add(new Emitter<void>());
		let tabHeight: 'default' | 'compact' = 'default';
		const workbench = mainWindow.document.createElement('div');
		workbench.className = 'agent-sessions-workbench';
		workbench.style.setProperty('--vscode-spacing-size280', '28px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		const viewPane = mainWindow.document.createElement('div');
		viewPane.className = 'agent-sessions-viewpane';
		const headerRow = mainWindow.document.createElement('div');
		headerRow.className = 'agent-sessions-header-row';
		viewPane.appendChild(headerRow);
		workbench.appendChild(viewPane);
		mainWindow.document.body.appendChild(workbench);

		const host = {
			mainContainer: workbench,
			editorGroupService: {
				get partOptions() { return { tabHeight }; },
				onDidChangeEditorPartOptions: editorPartOptionsChanged.event,
			},
			_register: <T extends IDisposable>(disposable: T) => disposables.add(disposable),
		};

		disposables.add(toDisposable(() => workbench.remove()));
		registerEditorTabHeightClass.call(host);
		const defaultHeight = mainWindow.getComputedStyle(headerRow).height;

		tabHeight = 'compact';
		editorPartOptionsChanged.fire();
		const compactHeight = mainWindow.getComputedStyle(headerRow).height;

		tabHeight = 'default';
		editorPartOptionsChanged.fire();
		const restoredHeight = mainWindow.getComputedStyle(headerRow).height;

		assert.deepStrictEqual({
			defaultHeight,
			compactHeight,
			restoredHeight,
			flexShrink: mainWindow.getComputedStyle(headerRow).flexShrink,
			hasCompactClass: workbench.classList.contains('editor-tabs-compact-height'),
		}, {
			defaultHeight: '32px',
			compactHeight: '28px',
			restoredHeight: '32px',
			flexShrink: '0',
			hasCompactClass: false,
		});
	});

	test('hides session details only when an active comparison participant is opened', () => {
		const attempt = upcastPartial<ISession>({ sessionId: 'attempt', resource: URI.parse('test:/attempt') });
		const judge = upcastPartial<ISession>({ sessionId: 'judge', resource: URI.parse('test:/judge') });
		const comparison: ISessionComparison = {
			id: 'comparison',
			groupId: 'group',
			title: 'Compare',
			createdAt: 1,
			workspace: URI.file('/workspace'),
			prompt: 'Implement',
			participants: [
				{
					id: 'attempt',
					role: SessionComparisonParticipantRole.Attempt,
					harness: { providerId: 'test', sessionTypeId: 'test', label: 'Test' },
					sessionResource: attempt.resource,
				},
				{
					id: 'judge',
					role: SessionComparisonParticipantRole.Judge,
					harness: { providerId: 'test', sessionTypeId: 'test', label: 'Test' },
					sessionResource: judge.resource,
				},
			],
		};
		let hideSidePaneCalls = 0;
		let currentComparison: ISessionComparison | undefined = comparison;
		const visibleSessions = observableValue<readonly ISession[]>('visibleSessions', [attempt, judge]);
		const host = {
			sessionComparisonService: {
				getComparisonForSession: () => currentComparison,
			},
			sessionsService: { slotPanes: visibleSessions.map(sessions => sessions.map(session => upcastPartial<ISessionGridPane>({ session: constObservable(session) }))) },
			layoutService: {
				mainContainer: mainWindow.document.createElement('div'),
				setPartHidden: () => { },
			},
			hostLayoutService: {
				sidePane: { hideSidePane: () => hideSidePaneCalls++ },
			},
		};

		handleSessionOpened.call(host, attempt);
		handleSessionOpened.call(host, judge);
		// A cancelled or superseded open leaves the participant hidden, so the side pane stays.
		visibleSessions.set([], undefined);
		handleSessionOpened.call(host, attempt);
		visibleSessions.set([attempt, judge], undefined);
		currentComparison = { ...comparison, archivedAt: 1 };
		handleSessionOpened.call(host, attempt);
		currentComparison = undefined;
		handleSessionOpened.call(host, attempt);

		assert.strictEqual(hideSidePaneCalls, 2);
	});

	test('keeps the Sessions title visible while measuring a narrow header', () => {
		const mainContainer = mainWindow.document.createElement('div');
		const headerRow = mainWindow.document.createElement('div');
		const headerLabel = mainWindow.document.createElement('div');
		const headerActions = mainWindow.document.createElement('div');
		headerLabel.style.display = 'none';
		headerRow.append(headerLabel, headerActions);
		Object.defineProperty(headerRow, 'clientWidth', { configurable: true, value: 0 });
		Object.defineProperty(headerLabel, 'clientWidth', { configurable: true, value: 0 });
		const host = {
			sessionsHeaders: new Set([{
				row: headerRow,
				label: headerLabel,
				actions: headerActions,
				toolbar: undefined,
			}]),
			layoutService: { mainContainer },
			isFindWidgetOpen: false,
		};

		updateHeaderLayout.call(host);
		const transientDisplay = headerLabel.style.display;
		Object.defineProperty(headerRow, 'clientWidth', { configurable: true, value: 200 });
		updateHeaderLayout.call(host);

		assert.deepStrictEqual({
			transientDisplay,
			narrowDisplay: headerLabel.style.display,
		}, {
			transientDisplay: '',
			narrowDisplay: 'none',
		});
	});
});
