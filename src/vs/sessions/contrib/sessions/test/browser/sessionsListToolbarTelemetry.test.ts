/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { SessionsListPromoteNewChatActionContext } from '../../../../common/contextkeys.js';
import { SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING } from '../../../../common/sessionConfig.js';
import { SessionsFlatList, SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness, createTestSession, IListHarness } from './sessionsListTestUtils.js';
import '../../browser/sessionsActions.js';
import '../../browser/views/sessionsViewActions.js';

const ADD_CHAT_TO_SESSION_ACTION_ID = 'sessions.chatCompositeBar.addChat';

class TestContextMenuService extends mock<IContextMenuService>() {
	override readonly onDidShowContextMenu = Event.None;
	override readonly onDidHideContextMenu = Event.None;
	delegate: IContextMenuDelegate | undefined;

	override showContextMenu(delegate: IContextMenuDelegate): void {
		this.delegate = delegate;
	}
}

class TestActionTelemetryService extends NullTelemetryServiceShape {
	readonly events: WorkbenchActionExecutedEvent[] = [];

	override publicLog2(eventName?: string, data?: object): void {
		if (eventName === 'workbenchActionExecuted' && data) {
			this.events.push(data as WorkbenchActionExecutedEvent);
		}
	}
}

suite('Sessions list toolbar telemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(sessions: Parameters<typeof createListHarness>[1]) {
		const telemetryService = new TestActionTelemetryService();
		const contextMenuService = new TestContextMenuService();
		const harness = createListHarness(disposables, sessions);
		const contextKeyService = harness.store.add(new ContextKeyService(new TestConfigurationService()));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		SessionsListPromoteNewChatActionContext.bindTo(contextKeyService).set(true);
		harness.instantiationService.stub(IContextKeyService, contextKeyService);
		harness.instantiationService.stub(ITelemetryService, telemetryService);
		harness.instantiationService.stub(IContextMenuService, contextMenuService);
		harness.instantiationService.stub(IMenuService, harness.store.add(harness.instantiationService.createInstance(MenuService)));
		return { harness, telemetryService, contextMenuService };
	}

	function clickNewChat(container: HTMLElement): void {
		const newChat = container.querySelector<HTMLElement>('.session-item .session-title-toolbar .action-label.codicon-add');
		assert.ok(newChat);
		newChat.click();
	}

	function executedCommands(harness: IListHarness): string[] {
		return harness.commandService.calls.map(call => call.commandId);
	}

	test('row and section toolbar actions log workbenchActionExecuted with their surface', async () => {
		const session = createTestSession('Session');
		session.capabilities.set({ supportsMultipleChats: true }, undefined);
		const external = createTestSession('External', { isExternal: true }).session;
		const { harness, telemetryService, contextMenuService } = createHarness([session.session, external]);
		const configurationService = harness.instantiationService.get(IConfigurationService) as TestConfigurationService;
		await configurationService.setUserConfiguration(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, true);
		const container = harness.createContainer(400, 500);
		const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
			grouping: () => SessionsGrouping.Workspace,
			sorting: () => SessionsSorting.Created,
			onSessionOpen: () => { },
		}));
		list.layout(500, 400);
		await timeout(100);

		clickNewChat(container);
		await timeout(0);

		const externalFilter = container.querySelector<HTMLElement>('.session-section .session-section-toolbar .action-label.codicon-filter');
		assert.ok(externalFilter);
		externalFilter.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		const filterMenu = contextMenuService.delegate;
		assert.ok(filterMenu?.actionRunner);
		await filterMenu.actionRunner.run(filterMenu.getActions()[0]);

		assert.deepStrictEqual({
			commands: executedCommands(harness),
			filterMenuSkipsContextMenuTelemetry: filterMenu.skipTelemetry,
			events: telemetryService.events,
		}, {
			commands: [ADD_CHAT_TO_SESSION_ACTION_ID, filterMenu.getActions()[0].id],
			filterMenuSkipsContextMenuTelemetry: true,
			events: [
				{ id: ADD_CHAT_TO_SESSION_ACTION_ID, from: 'sessionsList.row' },
				{ id: filterMenu.getActions()[0].id, from: 'sessionsList.section' },
			],
		});
	});

	test('flat list row toolbar logs actions handled by the list surface', async () => {
		const session = createTestSession('Session');
		session.capabilities.set({ supportsMultipleChats: true }, undefined);
		const { harness, telemetryService } = createHarness([session.session]);
		const handled: string[] = [];
		const container = harness.createContainer();
		const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
			showSessionHover: false,
			onSessionOpen: () => { },
			toolbarTelemetrySource: 'test.row',
			onToolbarAction: action => {
				handled.push(action.id);
				return true;
			},
		}));
		list.setSessions([session.session]);
		list.layout(300, 400);
		await timeout(100);

		clickNewChat(container);
		await timeout(0);

		assert.deepStrictEqual({
			handled,
			commands: executedCommands(harness),
			events: telemetryService.events,
		}, {
			handled: [ADD_CHAT_TO_SESSION_ACTION_ID],
			commands: [],
			events: [{ id: ADD_CHAT_TO_SESSION_ACTION_ID, from: 'test.row' }],
		});
	});
});
