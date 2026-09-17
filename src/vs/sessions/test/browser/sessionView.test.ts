/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SessionView } from '../../browser/parts/sessionView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../base/common/observable.js';
import { mock } from '../../../base/test/common/mock.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions, ISelectWorkspaceOptions, WorkspaceSelectionResult } from '../../browser/parts/chatView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ChatGroupView } from '../../browser/parts/chatGroupView.js';
import { ChatGroupsView } from '../../browser/parts/chatGroupsView.js';
import { URI } from '../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../../workbench/browser/parts/editor/editor.js';
import { IEditorGroupsService } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../common/sessionConfig.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { ISessionsListModelService } from '../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsPartService } from '../../services/sessions/browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISessionCapabilities, SessionStatus } from '../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../services/sessions/common/sessionChangesStatsCache.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { Event } from '../../../base/common/event.js';
import { mainWindow } from '../../../base/browser/window.js';

suite('Sessions - Session View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestNewSessionView extends AbstractChatView {
		disposed = false;

		constructor(readonly kind: ChatViewKind = 'newSession') {
			super();
		}

		protected override doLayout(): void { }
		override toJSON(): object { return {}; }
		override focus(): void { }
		override dispose(): void {
			this.disposed = true;
			super.dispose();
		}
	}

	test('forwards workspace selection to the actual standalone or active group view', () => {
		const folder = URI.file('/requested');
		const options: ISelectWorkspaceOptions = { providerId: 'provider', isDefault: true };
		const calls: { folder: URI; options?: ISelectWorkspaceOptions }[] = [];
		const target = disposables.add(new class extends TestNewSessionView {
			override selectWorkspace(folder: URI, options?: ISelectWorkspaceOptions): WorkspaceSelectionResult {
				calls.push({ folder, options });
				return 'preserved';
			}
		}());
		const missingPicker = disposables.add(new TestNewSessionView());
		const currentView = { value: undefined as AbstractChatView | undefined };
		const group: ChatGroupView = Object.assign(Object.create(ChatGroupView.prototype), { _currentView: currentView });
		const groups: ChatGroupsView = Object.assign(Object.create(ChatGroupsView.prototype), { _activeGroup: { view: group } });
		const standalone = { value: undefined as AbstractChatView | undefined };
		const sessionView: SessionView = Object.assign(Object.create(SessionView.prototype), { _standaloneView: standalone, _groupsView: groups });
		const results = [sessionView.selectWorkspace(folder, options)];
		currentView.value = missingPicker;
		results.push(sessionView.selectWorkspace(folder, options));
		currentView.value = target;
		results.push(sessionView.selectWorkspace(folder, options));
		currentView.value = missingPicker;
		standalone.value = target;
		results.push(sessionView.selectWorkspace(folder, options));
		assert.deepStrictEqual({ results, calls }, {
			results: ['notReady', 'notReady', 'preserved', 'preserved'],
			calls: [{ folder, options }, { folder, options }],
		});
	});

	test('forwards effective visibility (part and grid leaf) to the hosted chat view', () => {
		const forwarded: boolean[] = [];
		// Created from the prototype so the internal visibility helpers are present.
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			_isPartVisible: true,
			_isLeafVisible: true,
			_lastLayout: undefined,
			_groupsView: { setSessionVisible: (visible: boolean) => forwarded.push(visible) },
			_standaloneView: { value: undefined },
		});

		// A sibling session is maximized, hiding this leaf.
		view.setVisible(false);
		// The whole sessions part is hidden while the leaf is still hidden.
		view.setPartVisible(false);
		// Leaving the maximized state must not reveal the chat while the part is hidden.
		view.setVisible(true);
		// Showing the part again reveals the chat.
		view.setPartVisible(true);

		assert.deepStrictEqual(forwarded, [false, true]);
	});

	test('exposes active state to shared editor tab presentation', () => {
		const element = document.createElement('div');
		element.classList.add('modern-ui-editor-tab-group');
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			_isActive: true,
			element,
			themeService: { getColorTheme: () => ({ getColor: () => undefined }) },
			_groupsView: { setSessionActive: () => { } },
			_standaloneView: { value: undefined },
		});

		view.setActive(false);
		const inactiveClassName = element.className;
		view.setActive(true);

		assert.deepStrictEqual({
			inactiveClassName,
			activeClassName: element.className,
		}, {
			inactiveClassName: 'modern-ui-editor-tab-group',
			activeClassName: 'modern-ui-editor-tab-group modern-ui-editor-tab-group-active',
		});
	});

	test('lays out the header host and chat content at the full session width', () => {
		const element = document.createElement('div');
		const centeredContentContainer = document.createElement('div');
		const groupsLayout: number[] = [];
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			element,
			_isPartVisible: true,
			_isLeafVisible: true,
			_centeredContentContainer: centeredContentContainer,
			_header: { visible: true, height: 35 },
			_groupsView: { layout: (...dimensions: number[]) => groupsLayout.push(...dimensions) },
			_standaloneView: { value: undefined },
		});

		view.layout(1200, 800, 10, 20);

		assert.deepStrictEqual({
			sessionSize: [element.style.width, element.style.height],
			headerHostSize: [centeredContentContainer.style.width, centeredContentContainer.style.height],
			groupsLayout,
		}, {
			sessionSize: ['1200px', '800px'],
			headerHostSize: ['1200px', '35px'],
			groupsLayout: [1200, 765, 45, 20],
		});
	});

	test('preserves the new-session composer while an uncreated draft is activated', () => {
		const createdViews: TestNewSessionView[] = [];
		const forwardedInstantiationServices: (IInstantiationService | undefined)[] = [];
		const shownSessions: Array<IActiveSession | undefined> = [];
		const contentContainer = document.createElement('div');
		const groupsElement = document.createElement('div');
		const isCreated = observableValue<boolean>('isCreated', false);
		const session = new class extends mock<IActiveSession>() {
			override readonly isCreated = isCreated;
		}();
		const standaloneView = disposables.add(new MutableDisposable<AbstractChatView>());
		const openSessionDisposables = disposables.add(new DisposableStore());
		const scopedInstantiationService = new class extends mock<IInstantiationService>() { }();
		const view: SessionView = Object.assign(Object.create(SessionView.prototype), {
			_hasOpenedSession: false,
			_currentSession: undefined,
			_sessionObs: observableValue<IActiveSession | undefined>('session', undefined),
			_openSessionDisposables: openSessionDisposables,
			_header: { setSession: () => { } },
			_groupsView: {
				element: groupsElement,
				setSession: (activeSession: IActiveSession | undefined) => shownSessions.push(activeSession),
			},
			_standaloneView: standaloneView,
			_scopedInstantiationService: scopedInstantiationService,
			_floatingToolbar: { setSession: () => { } },
			_contentContainer: contentContainer,
			_chatViewFactory: {
				createNewChatView: (_isNewChatInSession: boolean, _options: IChatViewOptions, instantiationService?: IInstantiationService) => {
					forwardedInstantiationServices.push(instantiationService);
					const created = new TestNewSessionView();
					createdViews.push(created);
					return created;
				},
			},
			_isActive: true,
			_isPartVisible: true,
			_isLeafVisible: true,
			_lastLayout: undefined,
			_handleContextKeys: () => ({ dispose: () => { } }),
		});

		view.openSession(undefined, {});
		const initialElement = contentContainer.firstElementChild;
		view.openSession(session, {});
		const draftElement = contentContainer.firstElementChild;
		isCreated.set(true, undefined);

		assert.deepStrictEqual({
			createdViewCount: createdViews.length,
			preservedForDraft: draftElement === initialElement,
			disposedAfterCreation: createdViews[0].disposed,
			finalElement: contentContainer.firstElementChild,
			shownSessions,
			forwardedInstantiationServices,
		}, {
			createdViewCount: 1,
			preservedForDraft: true,
			disposedAfterCreation: true,
			finalElement: groupsElement,
			shownSessions: [undefined, undefined, session],
			forwardedInstantiationServices: [scopedInstantiationService],
		});
	});

	test('updates header replacement when chat tab presentation changes', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configurationService = new TestConfigurationService({ [SESSIONS_CHAT_TABS_SETTING]: SessionsChatTabsMode.Multiple });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override readonly onDidChangeEditorPartOptions = Event.None;
			override readonly partOptions = DEFAULT_EDITOR_PART_OPTIONS;
		}());
		instantiationService.stub(IChatViewFactory, new class extends mock<IChatViewFactory>() {
			override createNewChatView(isNewChatInSession: boolean): AbstractChatView {
				return new TestNewSessionView(isNewChatInSession ? 'newChatInSession' : 'newSession');
			}
			override createChatView(): AbstractChatView {
				return new TestNewSessionView('chat');
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = observableValue<IActiveSession | undefined>(this, undefined);
		}());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
		}());
		instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProvider() { return undefined; }
		}());
		instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
			override readonly onDidChange = Event.None;
			override isSessionPinned(): boolean { return false; }
			override getStatusIcon(): ThemeIcon { return ThemeIcon.fromId('circle'); }
		}());
		instantiationService.stub(ISessionChangesStatsCache, new class extends mock<ISessionChangesStatsCache>() {
			override get() { return undefined; }
			override set(): void { }
		}());

		const chat = new class extends mock<IChat>() {
			override readonly resource = URI.parse('test-chat://main');
			override readonly title = constObservable('Main Chat');
			override readonly status = constObservable(SessionStatus.Completed);
			override readonly isRead = constObservable(true);
			override readonly interactivity = constObservable(ChatInteractivity.Full);
			override readonly capabilities = constObservable({ canRename: true, canDelete: false });
		}();
		const session = new class extends mock<IActiveSession>() {
			override readonly sessionId = 'session';
			override readonly resource = URI.parse('test-session://session');
			override readonly providerId = 'test';
			override readonly title = constObservable('Session');
			override readonly status = constObservable(SessionStatus.Completed);
			override readonly isRead = constObservable(true);
			override readonly isArchived = constObservable(false);
			override readonly isCreated = constObservable(true);
			override readonly sticky = constObservable(false);
			override readonly workspace = constObservable(undefined);
			override readonly changesets = constObservable(undefined);
			override readonly changes = constObservable([]);
			override readonly capabilities: IObservable<ISessionCapabilities> = constObservable({ supportsMultipleChats: true });
			override readonly chats: IObservable<readonly IChat[]> = constObservable([chat]);
			override readonly openChats: IObservable<readonly IChat[]> = constObservable([chat]);
			override readonly closedChats: IObservable<readonly IChat[]> = constObservable([]);
			override readonly visibleChatTabs: IObservable<readonly IChat[]> = constObservable([chat]);
			override readonly activeChat: IObservable<IChat> = constObservable(chat);
			override readonly mainChat: IObservable<IChat> = constObservable(chat);
			override readonly shouldShowChatTabs = constObservable(true);
			override readonly isNewSessionRequestInProgress = constObservable(false);
			override readonly loading = constObservable(false);
		}();

		const view = store.add(instantiationService.createInstance(SessionView));
		mainWindow.document.body.appendChild(view.element);
		store.add({ dispose: () => view.element.remove() });
		view.openSession(session, {});

		const getState = () => ({
			headerDisplay: view.element.querySelector<HTMLElement>('.session-header-bar')?.style.display,
			tabBarDisplay: view.element.querySelector<HTMLElement>('.chat-groups-view .chat-composite-bar')?.style.display,
			tabsReplaceHeader: view.element.classList.contains('tabs-replace-header'),
		});
		const setChatTabsMode = async (mode: SessionsChatTabsMode) => {
			await configurationService.setUserConfiguration(SESSIONS_CHAT_TABS_SETTING, mode);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([SESSIONS_CHAT_TABS_SETTING]),
				change: { keys: [SESSIONS_CHAT_TABS_SETTING], overrides: [] },
				affectsConfiguration: key => key === SESSIONS_CHAT_TABS_SETTING,
			});
		};

		const multiple = getState();
		await setChatTabsMode(SessionsChatTabsMode.Single);
		const single = getState();
		await setChatTabsMode(SessionsChatTabsMode.Multiple);

		assert.deepStrictEqual({
			multiple,
			single,
			restoredMultiple: getState(),
		}, {
			multiple: { headerDisplay: 'none', tabBarDisplay: '', tabsReplaceHeader: true },
			single: { headerDisplay: '', tabBarDisplay: 'none', tabsReplaceHeader: false },
			restoredMultiple: { headerDisplay: 'none', tabBarDisplay: '', tabsReplaceHeader: true },
		});
	});
});
