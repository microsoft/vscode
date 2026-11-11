/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuActionOptions, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatPetService } from '../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChat, ISessionChangeset, ISessionChangesetOperation, ISessionWorkspace, ISessionFolder, SessionChangesetOperationScope, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { IChangesSessionObservables, IChangesSessionScope, IChangesViewService } from '../../../../../workbench/contrib/sessions/common/changesViewService.js';
import { actionsNamingSession, ChangesActionsBar, createChangesSessionScope } from '../../../../../workbench/contrib/sessionChanges/browser/changesView.js';
import { SessionHost, SessionHostKind } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { ITestSessionWithChat } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

suite('ChangesActionsBar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** The command context of the window host of the bar's session. */
	const barHostContext = { sessionHostId: 'bar-window' };

	function describeArg(arg: unknown, session: ITestSessionWithChat): unknown {
		return Array.isArray(arg) ? arg.map(item => describeArg(item, session))
			: arg === session ? 'session'
				: arg === session.resource ? 'resource'
					: arg === barHostContext ? 'bar window host'
						: arg;
	}

	function createBar(providerId: string, getActionsOptions: Map<MenuId, IMenuActionOptions | undefined> = new Map(), { isMainWindowSession = false, operations = [] as ISessionChangesetOperation[] } = {}) {
		const menus: MenuId[] = [];
		const toolbarArgs: unknown[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IMenuService, upcastPartial<IMenuService>({
			createMenu: (id: MenuId) => {
				menus.push(id);
				return upcastPartial<IMenu>({ onDidChange: Event.None, getActions: (options?: IMenuActionOptions) => { getActionsOptions.set(id, options); if (id === MenuId.AgentsChangesToolbar) { toolbarArgs.push(options?.args ?? options?.arg); } return []; }, dispose: () => { } });
			},
		}));
		instantiationService.stub(IContextKeyService, store.add(new ContextKeyService(new TestConfigurationService())));
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({}));
		instantiationService.stub(IContextViewService, upcastPartial<IContextViewService>({}));
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IChatPetService, upcastPartial<IChatPetService>({}));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({}));
		instantiationService.stub(ILayoutService, upcastPartial<ILayoutService>({ onDidLayoutContainer: Event.None, mainContainer: document.createElement('div'), getContainer: () => document.createElement('div') }));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		// A created session whose folder, a worktree, is not the mounted workspace: that of the main window's session.
		const session = upcastPartial<ITestSessionWithChat>({
			providerId,
			resource: URI.parse('session:/bar'),
			status: constObservable(operations.length > 0 ? SessionStatus.Completed : SessionStatus.Untitled),
			isCreated: constObservable(operations.length > 0),
			activeChat: constObservable(upcastPartial<IChat>({ workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [upcastPartial<ISessionFolder>({ workingDirectory: URI.file('/worktree') })] })) })),
		});
		const sessionObs = constObservable(session);
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => ({ folders: [] }) as never }));

		const source: IChangesSessionScope = {
			session: sessionObs,
			chat: constObservable(session.activeChat.get()),
			isMainWindow: isMainWindowSession,
			hostCommandContext: barHostContext,
			changes: upcastPartial<IChangesSessionObservables>({
				stateObs: constObservable(undefined),
				resourceObs: constObservable(undefined),
				changesetObs: constObservable(operations.length > 0 ? upcastPartial<ISessionChangeset>({ id: 'branch', operations: constObservable(operations) }) : undefined),
				changesetOperationsObs: constObservable(operations),
				loadingObs: constObservable(false),
			}),
		};
		const container = document.createElement('div');
		store.add(instantiationService.createInstance(ChangesActionsBar, container, source, new Set<string>()));
		return { menus, session, container, toolbarArgs };
	}

	test('renders the git variant for a non-agent-host source session', () => {
		assert.deepStrictEqual(createBar('github-copilot').menus, [MenuId.AgentsChangesToolbar]);
	});

	test('renders the agent host variant for an agent host source session', () => {
		assert.deepStrictEqual(createBar('local-agent-host').menus, [MenuId.AgentsChangesToolbar, Menus.ChangesOperationsDropdown]);
	});

	test('the actions of its toolbar get the session of a bar of a session other than the main window\'s, such as in a chat window, and nothing in the main window, as before', () => {
		const { session, toolbarArgs } = createBar('local-agent-host');
		const ofMainWindowSession = new Map<MenuId, IMenuActionOptions | undefined>();
		createBar('local-agent-host', ofMainWindowSession, { isMainWindowSession: true });

		assert.deepStrictEqual({
			// The session itself, for its own actions, and its resource, for those of extensions.
			otherSession: toolbarArgs.map(arg => describeArg(arg, session)),
			mainWindow: ofMainWindowSession.get(MenuId.AgentsChangesToolbar),
		}, { otherSession: [['session', undefined, 'bar window host'], 'resource'], mainWindow: { shouldForwardArgs: true } });
	});

	test('its own actions get the session, which names it whichever window has focus, and those of extensions its resource, as the API gives them', () => {
		const action = (source?: { id: string; title: string }) => Object.assign(Object.create(MenuItemAction.prototype) as MenuItemAction, { item: { id: 'action', title: 'Action', source } });
		const extension = { id: 'publisher.extension', title: 'Extension' };
		const own = action();
		const ofExtensionWithResource = action(extension);

		const [[, actions]] = actionsNamingSession([['navigation', [own, action(extension)]]], [['navigation', [action(), ofExtensionWithResource]]]);

		assert.deepStrictEqual(actions.map(candidate => candidate === own ? 'session' : candidate === ofExtensionWithResource ? 'resource' : 'other'), ['session', 'resource']);
	});

	test('a bar of a session other than the main window\'s, such as in a chat window, shows its operations, such as Merge Changes or Create Pull Request, without waiting for its folders to be the mounted workspace, which only the main window\'s session is', () => {
		const operations = [upcastPartial<ISessionChangesetOperation>({ id: 'merge', label: 'Merge Changes', scopes: [SessionChangesetOperationScope.Changeset] })];
		const shown = (container: HTMLElement) => container.style.display !== 'none';

		assert.deepStrictEqual({
			otherSession: shown(createBar('local-agent-host', new Map(), { operations }).container),
			// The main window's session waits for its folders to be mounted, as before.
			mainWindowSession: shown(createBar('local-agent-host', new Map(), { operations, isMainWindowSession: true }).container),
		}, { otherSession: true, mainWindowSession: false });
	});

	test('the actions of its operations dropdown, such as Agent Merge, act on the session of the bar, such as that of a chat window, not on the active session', () => {
		const getActionsOptions = new Map<MenuId, IMenuActionOptions | undefined>();
		const { session } = createBar('local-agent-host', getActionsOptions);
		const options = getActionsOptions.get(Menus.ChangesOperationsDropdown);

		assert.deepStrictEqual({ args: describeArg(options?.args, session), shouldForwardArgs: options?.shouldForwardArgs }, { args: ['session', undefined, 'bar window host'], shouldForwardArgs: true });
	});

	test('creates the scope from the active session observables only for the main window, from the window host of a pane', () => {
		const activeChanges = upcastPartial<IChangesSessionObservables>({ resourceObs: constObservable(undefined) });
		const otherChanges = upcastPartial<IChangesSessionObservables>({ resourceObs: constObservable(undefined) });
		const requested: unknown[] = [];
		const changesViewService = upcastPartial<IChangesViewService>({
			activeSessionResourceObs: activeChanges.resourceObs,
			getSessionChanges: (session, chat) => { requested.push(session, chat); return otherChanges; },
		});
		const contextKeyService = upcastPartial<IContextKeyService>({});
		const mainHost = new SessionHost({ kind: SessionHostKind.MainWindow, parent: undefined, session: constObservable<ITestSessionWithChat | undefined>(undefined), chat: constObservable(undefined), contextKeyService });
		const pane = new SessionHost({ kind: SessionHostKind.Pane, parent: mainHost, session: constObservable<ITestSessionWithChat | undefined>(undefined), chat: constObservable(undefined), contextKeyService });
		const chatWindowHost = new SessionHost({ kind: SessionHostKind.ChatWindow, parent: undefined, session: constObservable<ITestSessionWithChat | undefined>(undefined), chat: constObservable(undefined), contextKeyService });

		const mainScope = createChangesSessionScope(changesViewService, pane);
		const windowScope = createChangesSessionScope(changesViewService, chatWindowHost);

		assert.deepStrictEqual({
			mainWindow: mainScope.isMainWindow,
			mainSession: mainScope.session === mainHost.session,
			mainResource: mainScope.changes.resourceObs === activeChanges.resourceObs,
			chatWindow: windowScope.isMainWindow,
			windowSession: windowScope.session === chatWindowHost.session,
			windowChanges: windowScope.changes === otherChanges,
			requested: requested[0] === chatWindowHost.session && requested[1] === chatWindowHost.chat,
		}, { mainWindow: true, mainSession: true, mainResource: true, chatWindow: false, windowSession: true, windowChanges: true, requested: true });
	});
});
