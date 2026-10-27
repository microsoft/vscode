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
import { IMenu, IMenuActionOptions, IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
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
import { Menus } from '../../../../browser/menus.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISessionChangeset, ISessionChangesetOperation, ISessionWorkspace, ISessionFolder, SessionChangesetOperationScope, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IChangesSessionObservables, IChangesSessionScope, IChangesViewService } from '../../common/changesViewService.js';
import { ChangesActionsBar, createChangesSessionScope } from '../../browser/changesView.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

suite('ChangesActionsBar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBar(providerId: string, getActionsOptions: Map<MenuId, IMenuActionOptions | undefined> = new Map(), { isMainWindowSession = false, operations = [] as ISessionChangesetOperation[] } = {}) {
		const menus: MenuId[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IMenuService, upcastPartial<IMenuService>({
			createMenu: (id: MenuId) => {
				menus.push(id);
				return upcastPartial<IMenu>({ onDidChange: Event.None, getActions: (options?: IMenuActionOptions) => { getActionsOptions.set(id, options); return []; }, dispose: () => { } });
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
		const session = upcastPartial<IActiveSession>({
			providerId,
			resource: URI.parse('session:/bar'),
			status: constObservable(SessionStatus.Completed),
			isCreated: constObservable(operations.length > 0),
			activeChat: constObservable(upcastPartial<IChat>({ workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [upcastPartial<ISessionFolder>({ workingDirectory: URI.file('/worktree') })] })) })),
		});
		const sessionObs = constObservable(session);
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ mainWindowActiveSession: isMainWindowSession ? sessionObs : constObservable(undefined) }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => ({ folders: [] }) as never }));

		const source: IChangesSessionScope = {
			session: sessionObs,
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
		return { menus, session, container };
	}

	test('renders the git variant for a non-agent-host source session', () => {
		assert.deepStrictEqual(createBar('github-copilot').menus, [MenuId.AgentsChangesToolbar]);
	});

	test('renders the agent host variant for an agent host source session', () => {
		assert.deepStrictEqual(createBar('local-agent-host').menus, [MenuId.AgentsChangesToolbar, Menus.ChangesOperationsDropdown]);
	});

	test('the actions of its toolbar get the session of a bar of a session other than the main window\'s, such as in a chat window, and nothing in the main window, as before', () => {
		const ofOtherSession = new Map<MenuId, IMenuActionOptions | undefined>();
		const { session } = createBar('local-agent-host', ofOtherSession);
		const ofMainWindowSession = new Map<MenuId, IMenuActionOptions | undefined>();
		createBar('local-agent-host', ofMainWindowSession, { isMainWindowSession: true });

		assert.deepStrictEqual({
			otherSession: ofOtherSession.get(MenuId.AgentsChangesToolbar)?.arg === session.resource,
			mainWindow: ofMainWindowSession.get(MenuId.AgentsChangesToolbar),
		}, { otherSession: true, mainWindow: { shouldForwardArgs: true } });
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

		assert.deepStrictEqual({ argIsBarSession: options?.arg === session, shouldForwardArgs: options?.shouldForwardArgs }, { argIsBarSession: true, shouldForwardArgs: true });
	});

	test('creates the scope from the active session observables only for the active session', () => {
		const active = constObservable<IActiveSession | undefined>(undefined);
		const other = constObservable<IActiveSession | undefined>(undefined);
		const activeChanges = upcastPartial<IChangesSessionObservables>({ resourceObs: constObservable(undefined) });
		const otherChanges = upcastPartial<IChangesSessionObservables>({ resourceObs: constObservable(undefined) });
		const changesViewService = upcastPartial<IChangesViewService>({
			activeSessionResourceObs: activeChanges.resourceObs,
			getSessionChanges: () => otherChanges,
		});
		const sessionsService = upcastPartial<ISessionsService>({ activeSession: active, mainWindowActiveSession: active });

		const activeScope = createChangesSessionScope(changesViewService, sessionsService, { _serviceBrand: undefined, session: active });
		const otherScope = createChangesSessionScope(changesViewService, sessionsService, { _serviceBrand: undefined, session: other });

		assert.deepStrictEqual({
			activeSession: activeScope.session === active,
			activeResource: activeScope.changes.resourceObs === activeChanges.resourceObs,
			otherSession: otherScope.session === other,
			otherChanges: otherScope.changes === otherChanges,
		}, { activeSession: true, activeResource: true, otherSession: true, otherChanges: true });
	});
});
