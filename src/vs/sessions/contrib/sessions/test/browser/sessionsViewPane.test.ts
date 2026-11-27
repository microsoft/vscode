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
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfile, toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { DidChangeUserDataProfileEvent } from '../../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { IAnyWorkspaceIdentifier } from '../../../../../platform/workspace/common/workspace.js';
import { Workbench } from '../../../../browser/workbench.js';
import { ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionComparison, SessionComparisonParticipantRole } from '../../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { AICustomizationShortcutsWidget } from '../../../../../workbench/contrib/sessions/browser/aiCustomizationShortcutsWidget.js';
import { DEFAULT_SESSIONS_GROUPINGS, getCustomizationsPresentation, getStoredSessionsGrouping, ISessionsViewGroupingStorageKeys, SessionsView, SessionsViewGroupingContext } from '../../../../../workbench/contrib/sessions/browser/views/sessionsView.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS, CHAT_VIEW_SESSIONS_GROUPINGS, EDITOR_WINDOW_SESSIONS_GROUPINGS } from '../../../../../workbench/contrib/sessions/browser/agentsView/editorWindowSessionsList.js';
import { SessionsGrouping, SessionsSorting } from '../../../../../workbench/contrib/sessions/browser/views/sessionsListCommon.js';
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

	function createGroupingHost(
		configurationService: TestConfigurationService,
		storageService = disposables.add(new InMemoryStorageService()),
		groupings?: { readonly offered: readonly SessionsGrouping[]; readonly default: SessionsGrouping },
		hidden = false,
		groupingStorageKeys?: ISessionsViewGroupingStorageKeys,
		leaveInboxWithoutChat = false,
		chatEnabledAtStart = true,
	) {
		const sentimentChanged = disposables.add(new Emitter<void>());
		const profileChange = disposables.add(new Emitter<DidChangeUserDataProfileEvent>());
		const contextKeyService = disposables.add(new ContextKeyService(configurationService));
		const chatEnabled = ChatContextKeys.enabled.bindTo(contextKeyService);
		chatEnabled.set(chatEnabledAtStart);
		const host = {
			scopedContextKeyService: contextKeyService,
			chatEnabled,
			currentGrouping: undefined as SessionsGrouping | undefined,
			groupings,
			groupingStorageKeys,
			leaveInboxWithoutChat,
			configurationService,
			storageService,
			chatEntitlementService: { sentiment: { hidden }, onDidChangeSentiment: sentimentChanged.event },
			sentimentChanged,
			groupingContextKey: SessionsViewGroupingContext.bindTo(contextKeyService),
			_register: <T extends IDisposable>(disposable: T): T => disposables.add(disposable),
			get grouping(): SessionsGrouping { return Reflect.get(SessionsView.prototype, 'grouping', this); },
			get offeredGroupings(): readonly SessionsGrouping[] { return Reflect.get(SessionsView.prototype, 'offeredGroupings', this); },
			get nonInboxGrouping(): SessionsGrouping { return Reflect.get(SessionsView.prototype, 'nonInboxGrouping', this); },
			get storedNonInboxGrouping(): SessionsGrouping { return Reflect.get(SessionsView.prototype, 'storedNonInboxGrouping', this); },
			mountedNonInboxGrouping: undefined as SessionsGrouping | undefined,
			get inboxAvailable(): boolean { return Reflect.get(SessionsView.prototype, 'inboxAvailable', this); },
			get canEnterInbox(): boolean { return Reflect.get(SessionsView.prototype, 'canEnterInbox', this); },
			profileChange,
			userDataProfileService: { currentProfile: toUserDataProfile('a', 'A', URI.file('/profiles/a'), URI.file('/cache')), onDidChangeCurrentProfile: profileChange.event },
			sessionsControl: undefined as { readonly filters: { reload(): void }; resetSectionCollapseState(): void; update(): void } | undefined,
			_store: disposables.add(new DisposableStore()),
			readStoredGrouping: Reflect.get(SessionsView.prototype, 'readStoredGrouping') as () => { readonly grouping: SessionsGrouping | undefined; readonly seed: boolean },
			initializeGrouping: Reflect.get(SessionsView.prototype, 'initializeGrouping') as () => void,
			followProfileSwitches: Reflect.get(SessionsView.prototype, 'followProfileSwitches') as () => void,
			restoreStoredGrouping: Reflect.get(SessionsView.prototype, 'restoreStoredGrouping') as () => void,
			updateInboxAvailability: Reflect.get(SessionsView.prototype, 'updateInboxAvailability') as () => void,
			leaveInbox: Reflect.get(SessionsView.prototype, 'leaveInbox') as () => void,
			setGrouping: SessionsView.prototype.setGrouping,
			toggleInbox: SessionsView.prototype.toggleInbox,
			updateHeaderLayout: () => { },
		};
		host.initializeGrouping();
		host.groupingContextKey.set(host.grouping);
		return host;
	}

	test('enabling Inbox leaves the current mode unchanged and disabling it restores the previous grouping', async () => {
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const host = createGroupingHost(configurationService);
		const initial = host.grouping;
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, true);
		host.updateInboxAvailability();
		const enabled = host.grouping;
		host.setGrouping(SessionsGrouping.Repository);
		host.toggleInbox();
		const opened = host.grouping;
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, false);
		host.updateInboxAvailability();
		const disabled = host.grouping;
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, true);
		host.updateInboxAvailability();
		assert.deepStrictEqual({ initial, enabled, opened, disabled, reenabled: host.grouping, reloaded: createGroupingHost(configurationService, host.storageService).grouping }, {
			initial: SessionsGrouping.Workspace,
			enabled: SessionsGrouping.Workspace,
			opened: SessionsGrouping.Inbox,
			disabled: SessionsGrouping.Repository,
			reenabled: SessionsGrouping.Repository,
			reloaded: SessionsGrouping.Repository,
		});
	});

	test('Inbox restores each ordinary grouping across reloads without resetting section collapse state', () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const results = [SessionsGrouping.Workspace, SessionsGrouping.Repository, SessionsGrouping.Environment, SessionsGrouping.Date].map(grouping => {
			const host = createGroupingHost(configurationService);
			host.setGrouping(grouping);
			let resets = 0;
			const control = { resetSectionCollapseState: () => resets++, update: () => { } };
			const initial = Object.assign(host, { sessionsControl: control });
			initial.toggleInbox();
			const restored = Object.assign(createGroupingHost(configurationService, host.storageService), { sessionsControl: control });
			const reloaded = restored.grouping;
			restored.toggleInbox();
			return { reloaded, restored: restored.grouping, resets };
		});
		assert.deepStrictEqual(results, [SessionsGrouping.Workspace, SessionsGrouping.Repository, SessionsGrouping.Environment, SessionsGrouping.Date]
			.map(grouping => ({ reloaded: SessionsGrouping.Inbox, restored: grouping, resets: 0 })));
	});

	test('selecting an ordinary grouping in Inbox updates the next toggle round trip', () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const host = createGroupingHost(configurationService);
		host.setGrouping(SessionsGrouping.Repository);
		host.toggleInbox();
		host.setGrouping(SessionsGrouping.Environment);
		host.toggleInbox();
		host.toggleInbox();
		assert.strictEqual(host.grouping, SessionsGrouping.Environment);
	});

	test('legacy saved Inbox uses Workspace as its return mode and does not reopen after disabling', async () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessionsViewPane.grouping', SessionsGrouping.Inbox, StorageScope.PROFILE, StorageTarget.USER);
		storageService.store('sessionsViewPane.nonInboxGrouping', SessionsGrouping.Inbox, StorageScope.PROFILE, StorageTarget.USER);
		const host = createGroupingHost(configurationService, storageService);
		const enabled = host.grouping;
		host.toggleInbox();
		const fallback = host.grouping;
		host.toggleInbox();
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, false);
		const disabled = createGroupingHost(configurationService, storageService).grouping;
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, true);
		assert.deepStrictEqual({ enabled, fallback, disabled, reenabled: createGroupingHost(configurationService, storageService).grouping }, {
			enabled: SessionsGrouping.Inbox, fallback: SessionsGrouping.Workspace, disabled: SessionsGrouping.Workspace, reenabled: SessionsGrouping.Workspace,
		});
	});

	test('programmatic Inbox requests reject disabled Inbox and hidden AI', async () => {
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const host = createGroupingHost(configurationService);
		assert.throws(() => host.toggleInbox(), /Enable sessions\.list\.inboxEnabled and AI features/);
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, true);
		host.chatEntitlementService.sentiment.hidden = true;
		assert.throws(() => host.setGrouping(SessionsGrouping.Inbox), /Enable sessions\.list\.inboxEnabled and AI features/);
		assert.strictEqual(host.grouping, SessionsGrouping.Workspace);
	});

	for (const source of ['configuration', 'sentiment']) {
		test(`restoring Inbox while AI is hidden by ${source} preserves the previous ordinary grouping`, () => {
			const configurationService = new TestConfigurationService({
				[SESSIONS_LIST_INBOX_ENABLED_SETTING]: true,
				'chat.disableAIFeatures': source === 'configuration',
			});
			disposables.add(configurationService.onDidChangeConfigurationEmitter);
			const storageService = disposables.add(new InMemoryStorageService());
			storageService.store('sessionsViewPane.grouping', SessionsGrouping.Inbox, StorageScope.PROFILE, StorageTarget.USER);
			storageService.store('sessionsViewPane.nonInboxGrouping', SessionsGrouping.Environment, StorageScope.PROFILE, StorageTarget.USER);
			const host = createGroupingHost(configurationService, storageService, undefined, source === 'sentiment');
			assert.deepStrictEqual({
				grouping: host.grouping,
				context: host.groupingContextKey.get(),
				saved: storageService.get('sessionsViewPane.grouping', StorageScope.PROFILE),
			}, { grouping: SessionsGrouping.Environment, context: SessionsGrouping.Environment, saved: SessionsGrouping.Environment });
		});

		test(`hiding AI through ${source} leaves Inbox and showing AI again does not reopen it`, async () => {
			const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
			disposables.add(configurationService.onDidChangeConfigurationEmitter);
			const host = createGroupingHost(configurationService);
			host.setGrouping(SessionsGrouping.Repository);
			host.toggleInbox();
			let updates = 0;
			Object.assign(host, { sessionsControl: { update: () => updates++ } });
			const setHidden = async (hidden: boolean) => {
				if (source === 'configuration') {
					const key = 'chat.disableAIFeatures';
					await configurationService.setUserConfiguration(key, hidden);
					configurationService.onDidChangeConfigurationEmitter.fire({
						affectsConfiguration: section => section === key,
						affectedKeys: new Set([key]),
						change: { keys: [key], overrides: [] },
						source: ConfigurationTarget.USER,
					});
				} else {
					host.chatEntitlementService.sentiment.hidden = hidden;
					host.sentimentChanged.fire();
				}
			};
			await setHidden(true);
			const hidden = {
				grouping: host.grouping,
				context: host.groupingContextKey.get(),
				saved: host.storageService.get('sessionsViewPane.grouping', StorageScope.PROFILE),
				updates,
			};
			await setHidden(false);
			assert.deepStrictEqual({ hidden, visibleAgain: host.grouping, reloaded: createGroupingHost(configurationService, host.storageService).grouping, updates }, {
				hidden: { grouping: SessionsGrouping.Repository, context: SessionsGrouping.Repository, saved: SessionsGrouping.Repository, updates: 1 },
				visibleAgain: SessionsGrouping.Repository, reloaded: SessionsGrouping.Repository, updates: 1,
			});
		});
	}

	test('a view offers only its groupings: the editor window shows Time until one of its groupings is chosen, also for a stored grouping that only the Agents window offers or that no window offers any more, such as Worktree, which it leaves stored', () => {
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const storageService = disposables.add(new InMemoryStorageService());
		const createHost = (groupings: { readonly offered: readonly SessionsGrouping[]; readonly default: SessionsGrouping } | undefined) => ({
			currentGrouping: getStoredSessionsGrouping(storageService.get('sessionsViewPane.grouping', StorageScope.PROFILE), groupings?.offered ?? DEFAULT_SESSIONS_GROUPINGS),
			groupings,
			configurationService,
			storageService,
			get grouping(): SessionsGrouping { return Reflect.get(SessionsView.prototype, 'grouping', this); },
			get offeredGroupings(): readonly SessionsGrouping[] { return Reflect.get(SessionsView.prototype, 'offeredGroupings', this); },
			updateHeaderLayout: () => { },
		});
		const setGrouping = SessionsView.prototype.setGrouping as (this: ReturnType<typeof createHost>, grouping: SessionsGrouping) => void;
		const saved = () => storageService.get('sessionsViewPane.grouping', StorageScope.PROFILE);

		const editorWindowDefault = createHost(EDITOR_WINDOW_SESSIONS_GROUPINGS).grouping;
		const agentsWindow = createHost(undefined);
		setGrouping.call(agentsWindow, SessionsGrouping.Repository);
		const editorWindow = createHost(EDITOR_WINDOW_SESSIONS_GROUPINGS);
		const fallback = { shown: editorWindow.grouping, saved: saved() };
		for (const grouping of [SessionsGrouping.Workspace, SessionsGrouping.Repository, SessionsGrouping.Inbox]) {
			setGrouping.call(editorWindow, grouping);
		}
		const notOffered = { shown: editorWindow.grouping, saved: saved() };
		storageService.store('sessionsViewPane.grouping', 'worktree', StorageScope.PROFILE, StorageTarget.USER);
		const agentsWindowGrouping = createGroupingHost(configurationService, storageService).grouping;
		const editorWindowGrouping = createGroupingHost(configurationService, storageService, EDITOR_WINDOW_SESSIONS_GROUPINGS).grouping;
		const worktree = { agentsWindow: agentsWindowGrouping, editorWindow: editorWindowGrouping, saved: saved() };

		assert.deepStrictEqual({ editorWindowDefault, fallback, notOffered, worktree, unknown: getStoredSessionsGrouping('unknown-grouping', DEFAULT_SESSIONS_GROUPINGS) }, {
			editorWindowDefault: SessionsGrouping.Date,
			fallback: { shown: SessionsGrouping.Date, saved: SessionsGrouping.Repository },
			notOffered: { shown: SessionsGrouping.Date, saved: SessionsGrouping.Repository },
			worktree: { agentsWindow: SessionsGrouping.Workspace, editorWindow: SessionsGrouping.Date, saved: 'worktree' },
			unknown: undefined,
		});
	});

	test('the Chat view and the Agents window each remember their own grouping and Inbox Mode, across reloads', () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const storageService = disposables.add(new InMemoryStorageService());
		const agents = () => createGroupingHost(configurationService, storageService);
		const chat = () => createGroupingHost(configurationService, storageService, CHAT_VIEW_SESSIONS_GROUPINGS, false, CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS);
		const agentsWindow = agents();
		agentsWindow.setGrouping(SessionsGrouping.Repository);
		const chatView = chat();
		const chatInitially = chatView.grouping;
		chatView.setGrouping(SessionsGrouping.Environment);
		chatView.toggleInbox();
		const afterChatInbox = { chat: chat().grouping, agents: agents().grouping };
		agentsWindow.toggleInbox();
		chatView.toggleInbox();
		const afterAgentsInbox = { chat: chat().grouping, agents: agents().grouping };
		assert.deepStrictEqual({ chatInitially, afterChatInbox, afterAgentsInbox, agentsSaved: storageService.get('sessionsViewPane.grouping', StorageScope.PROFILE) }, {
			chatInitially: SessionsGrouping.Date,
			afterChatInbox: { chat: SessionsGrouping.Inbox, agents: SessionsGrouping.Repository },
			afterAgentsInbox: { chat: SessionsGrouping.Environment, agents: SessionsGrouping.Inbox },
			agentsSaved: SessionsGrouping.Inbox,
		});
	});

	test('as the window switches to another profile, the Chat view shows the mode and filters that profile remembers without storing them, once the extension host is back, even where no value differs; the Agents window does not follow', () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		// One storage for both profiles: it holds the current profile's values, as a window's storage does
		const storageService = disposables.add(new class extends InMemoryStorageService {
			profile = 'a';
			override hasScope(scope: IAnyWorkspaceIdentifier | IUserDataProfile): boolean { return (scope as IUserDataProfile).id === this.profile; }
		});
		const chatView = createGroupingHost(configurationService, storageService, CHAT_VIEW_SESSIONS_GROUPINGS, false, CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS, true);
		const agentsWindow = createGroupingHost(configurationService, storageService);
		let reloads = 0;
		chatView.sessionsControl = { filters: { reload: () => reloads++ }, resetSectionCollapseState: () => { }, update: () => { } };
		chatView.followProfileSwitches();
		agentsWindow.followProfileSwitches();
		chatView.setGrouping(SessionsGrouping.Environment);
		chatView.toggleInbox();
		agentsWindow.toggleInbox();
		// As a real switch does: the extension host stops, the profile changes, the storage switches, telling only the values that differ, and the extension host starts
		const switchTo = (profile: string, stored: SessionsGrouping) => {
			chatView.chatEnabled.set(false);
			agentsWindow.chatEnabled.set(false);
			const left = storageService.get(CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS.grouping, StorageScope.PROFILE);
			chatView.userDataProfileService.currentProfile = toUserDataProfile(profile, profile.toUpperCase(), URI.file(`/profiles/${profile}`), URI.file('/cache'));
			chatView.profileChange.fire({ previous: chatView.userDataProfileService.currentProfile, profile: chatView.userDataProfileService.currentProfile, join: () => { } });
			storageService.profile = profile;
			const written: string[] = [];
			const listener = storageService.onDidChangeValue(StorageScope.PROFILE, undefined, disposables.add(new DisposableStore()))(e => written.push(e.key));
			// The destination profile stores Inbox; the leaving profile now stores what the view left Inbox for, so the values differ only for B's first visit
			storageService.store(CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS.grouping, stored, StorageScope.PROFILE, StorageTarget.MACHINE, left !== stored);
			const whileChatStarts = chatView.grouping;
			chatView.chatEnabled.set(true);
			agentsWindow.chatEnabled.set(true);
			listener.dispose();
			return { whileChatStarts, grouping: chatView.grouping, written: written.filter(key => key !== CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS.grouping), reloads };
		};
		const toB = switchTo('b', SessionsGrouping.Inbox);
		// The same value on both sides: the storage tells nothing, and the view follows only as Chat is back
		storageService.store(CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS.grouping, SessionsGrouping.Environment, StorageScope.PROFILE, StorageTarget.MACHINE);
		chatView.setGrouping(SessionsGrouping.Environment);
		const noDelta = switchTo('a', SessionsGrouping.Environment);
		assert.deepStrictEqual({ toB, noDelta, agents: agentsWindow.grouping }, {
			toB: { whileChatStarts: SessionsGrouping.Inbox, grouping: SessionsGrouping.Inbox, written: [], reloads: 2 },
			noDelta: { whileChatStarts: SessionsGrouping.Environment, grouping: SessionsGrouping.Environment, written: [], reloads: 3 },
			agents: SessionsGrouping.Inbox,
		});
	});

	test('each Chat view returns from Inbox to the grouping it left for Inbox, even where another window entered Inbox from another one since, and the next Chat view opens with the one stored last', () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const storageService = disposables.add(new InMemoryStorageService());
		const chat = () => createGroupingHost(configurationService, storageService, CHAT_VIEW_SESSIONS_GROUPINGS, false, CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS, true);
		const windowA = chat();
		windowA.setGrouping(SessionsGrouping.Date);
		windowA.toggleInbox();
		const windowB = chat();
		windowB.setGrouping(SessionsGrouping.Environment);
		windowB.toggleInbox();
		windowA.toggleInbox();
		assert.deepStrictEqual({ windowA: windowA.grouping, next: chat().grouping }, {
			windowA: SessionsGrouping.Date,
			next: SessionsGrouping.Date,
		});
	});

	test('the Chat view leaves Inbox for its own previous grouping when the setting or AI turns off, and the Agents window\'s Inbox stays', async () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const storageService = disposables.add(new InMemoryStorageService());
		const agentsWindow = createGroupingHost(configurationService, storageService);
		agentsWindow.toggleInbox();
		const chatView = createGroupingHost(configurationService, storageService, CHAT_VIEW_SESSIONS_GROUPINGS, false, CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS);
		chatView.setGrouping(SessionsGrouping.Environment);
		chatView.toggleInbox();
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, false);
		chatView.updateInboxAvailability();
		const settingOff = { chat: chatView.grouping, agentsSaved: storageService.get('sessionsViewPane.grouping', StorageScope.PROFILE) };
		await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, true);
		chatView.toggleInbox();
		chatView.chatEntitlementService.sentiment.hidden = true;
		chatView.sentimentChanged.fire();
		assert.deepStrictEqual({ settingOff, aiHidden: chatView.grouping, reloaded: createGroupingHost(configurationService, storageService, CHAT_VIEW_SESSIONS_GROUPINGS, false, CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS).grouping }, {
			settingOff: { chat: SessionsGrouping.Environment, agentsSaved: SessionsGrouping.Inbox },
			aiHidden: SessionsGrouping.Environment,
			reloaded: SessionsGrouping.Environment,
		});
	});

	test('the Chat view leaves Inbox as Chat goes, such as as its participant deactivates, and does not come back in it, but keeps the Inbox it restores while Chat starts; the Agents window\'s Inbox stays', () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const storageService = disposables.add(new InMemoryStorageService());
		const chat = (chatEnabledAtStart = true) => createGroupingHost(configurationService, storageService, CHAT_VIEW_SESSIONS_GROUPINGS, false, CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS, true, chatEnabledAtStart);
		const agentsWindow = createGroupingHost(configurationService, storageService);
		agentsWindow.toggleInbox();
		const chatView = chat();
		chatView.setGrouping(SessionsGrouping.Environment);
		chatView.toggleInbox();
		const restoredWhileStarting = chat(false).grouping;
		chatView.chatEnabled.set(false);
		agentsWindow.chatEnabled.set(false);
		const chatGone = { chat: chatView.grouping, agents: agentsWindow.grouping };
		chatView.chatEnabled.set(true);
		assert.deepStrictEqual({ restoredWhileStarting, chatGone, chatBack: chatView.grouping, reloaded: chat().grouping }, {
			restoredWhileStarting: SessionsGrouping.Inbox,
			chatGone: { chat: SessionsGrouping.Environment, agents: SessionsGrouping.Inbox },
			chatBack: SessionsGrouping.Environment,
			reloaded: SessionsGrouping.Environment,
		});
	});

	test('the Chat view stores its Inbox Mode on this machine, and starts from the grouping it shared with the Agents window, unless that is Inbox or one it does not offer', () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const chat = (storageService: InMemoryStorageService) => createGroupingHost(configurationService, storageService, CHAT_VIEW_SESSIONS_GROUPINGS, false, CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS);
		const seeded = [SessionsGrouping.Environment, SessionsGrouping.Inbox, SessionsGrouping.Repository].map(shared => {
			const storageService = disposables.add(new InMemoryStorageService());
			storageService.store('sessionsViewPane.grouping', shared, StorageScope.PROFILE, StorageTarget.USER);
			return chat(storageService).grouping;
		});
		const seedStorage = disposables.add(new InMemoryStorageService());
		seedStorage.store('sessionsViewPane.grouping', SessionsGrouping.Environment, StorageScope.PROFILE, StorageTarget.USER);
		chat(seedStorage);
		seedStorage.store('sessionsViewPane.grouping', SessionsGrouping.Date, StorageScope.PROFILE, StorageTarget.USER);
		const reopenedAfterSharedChange = chat(seedStorage).grouping;
		const storageService = disposables.add(new InMemoryStorageService());
		const chatView = chat(storageService);
		chatView.setGrouping(SessionsGrouping.Environment);
		chatView.toggleInbox();
		assert.deepStrictEqual({
			seeded,
			reopenedAfterSharedChange,
			machine: storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE).sort(),
			user: storageService.keys(StorageScope.PROFILE, StorageTarget.USER),
		}, {
			seeded: [SessionsGrouping.Environment, SessionsGrouping.Date, SessionsGrouping.Date],
			reopenedAfterSharedChange: SessionsGrouping.Environment,
			machine: ['chatViewSessionsList.grouping', 'chatViewSessionsList.nonInboxGrouping'],
			user: [],
		});
	});

	test('without Chat, the Chat view cannot enter Inbox, while the Agents window takes programmatic requests as before, the same mode too', () => {
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_INBOX_ENABLED_SETTING]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const chatView = createGroupingHost(configurationService, undefined, CHAT_VIEW_SESSIONS_GROUPINGS, false, CHAT_VIEW_SESSIONS_GROUPING_STORAGE_KEYS, true, false);
		assert.throws(() => chatView.toggleInbox(), /Enable sessions\.list\.inboxEnabled and AI features/);
		const agentsWindow = createGroupingHost(configurationService, undefined, undefined, false, undefined, false, false);
		agentsWindow.setGrouping(SessionsGrouping.Inbox);
		agentsWindow.setGrouping(SessionsGrouping.Inbox);
		assert.deepStrictEqual({ chat: chatView.grouping, agents: agentsWindow.grouping }, { chat: SessionsGrouping.Date, agents: SessionsGrouping.Inbox });
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
				get offeredGroupings(): readonly SessionsGrouping[] { return Reflect.get(SessionsView.prototype, 'offeredGroupings', this); },
				updateHeaderLayout: () => { },
			};
			const initial = host.grouping;
			const setGrouping = SessionsView.prototype.setGrouping as (this: typeof host, grouping: SessionsGrouping) => void;
			setGrouping.call(host, initial);
			await configurationService.setUserConfiguration(SESSIONS_LIST_INBOX_ENABLED_SETTING, !enabled);
			const saved = storageService.get('sessionsViewPane.grouping', StorageScope.PROFILE);
			assert.deepStrictEqual({ selected: host.grouping, saved }, {
				selected: SessionsGrouping.Workspace,
				saved: SessionsGrouping.Workspace,
			});
		});
	}

	for (const { enabled, hidden } of [{ enabled: false, hidden: false }, { enabled: true, hidden: false }, { enabled: true, hidden: true }]) {
		test(`mobile grouping sheet excludes Inbox (${enabled}, hidden AI ${hidden})`, async () => {
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
				offered: false,
				selected: SessionsGrouping.Workspace,
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
