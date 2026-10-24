/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
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
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { IChangesSessionObservables, IChangesSessionScope, IChangesViewService } from '../../common/changesViewService.js';
import { ChangesActionsBar, createChangesSessionScope } from '../../browser/changesView.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

suite('ChangesActionsBar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBar(providerId: string) {
		const menus: MenuId[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IMenuService, upcastPartial<IMenuService>({
			createMenu: (id: MenuId) => {
				menus.push(id);
				return upcastPartial<IMenu>({ onDidChange: Event.None, getActions: () => [], dispose: () => { } });
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
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ onDidChangeWorkspaceFolders: Event.None, getWorkspace: () => ({ folders: [] }) as never }));

		const source: IChangesSessionScope = {
			session: constObservable(upcastPartial<IActiveSession>({ providerId, status: constObservable(SessionStatus.Completed), isCreated: constObservable(false) })),
			changes: upcastPartial<IChangesSessionObservables>({
				stateObs: constObservable(undefined),
				resourceObs: constObservable(undefined),
				changesetObs: constObservable(undefined),
				changesetOperationsObs: constObservable([]),
				loadingObs: constObservable(false),
			}),
		};
		store.add(instantiationService.createInstance(ChangesActionsBar, document.createElement('div'), source, new Set<string>()));
		return menus;
	}

	test('renders the git variant for a non-agent-host source session', () => {
		assert.deepStrictEqual(createBar('github-copilot'), [MenuId.AgentsChangesToolbar]);
	});

	test('renders the agent host variant for an agent host source session', () => {
		assert.deepStrictEqual(createBar('local-agent-host'), [MenuId.AgentsChangesToolbar, Menus.ChangesOperationsDropdown]);
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
