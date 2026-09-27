/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostSessionIdentity } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { COPY_AGENT_HOST_CHAT_LINK_COMMAND_ID, COPY_AGENT_HOST_SESSION_LINK_COMMAND_ID } from '../../../../../common/sessionCommands.js';
import { Menus } from '../../../../../browser/menus.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import '../../browser/agentHostSessionBranchActions.js';
import '../../browser/agentHostSettings.contribution.js';
import '../../browser/agentSessionSettings.contribution.js';

suite('Agent Host session link actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes chat link copying in the final menu group', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionChatItemContext)
			.filter(isIMenuItem)
			.find(item => item.command.id === COPY_AGENT_HOST_CHAT_LINK_COMMAND_ID);

		assert.deepStrictEqual(item && {
			title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
			group: item.group,
			order: item.order,
			when: item.when?.serialize(),
		}, {
			title: 'Copy Link',
			group: '3_copy',
			order: 1,
			when: 'sessionProviderId =~ /^(local-agent-host|agenthost-)/',
		});
	});

	test('groups settings in a submenu and omits branch name copying', () => {
		const submenu = MenuRegistry.getMenuItems(Menus.SessionItemContextMenu)
			.filter(isISubmenuItem)
			.find(item => item.submenu === Menus.SessionItemSettings);
		const settings = MenuRegistry.getMenuItems(Menus.SessionItemSettings)
			.filter(isIMenuItem)
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map(item => ({
				id: item.command.id,
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				group: item.group,
				order: item.order,
				when: item.when?.serialize(),
			}));
		const sessionMenuCommandIds = MenuRegistry.getMenuItems(Menus.SessionItemContextMenu)
			.filter(isIMenuItem)
			.map(item => item.command.id);

		assert.deepStrictEqual({
			submenu: submenu && {
				title: typeof submenu.title === 'string' ? submenu.title : submenu.title.value,
				group: submenu.group,
				order: submenu.order,
				when: submenu.when?.serialize(),
			},
			settings,
			hasCopyBranchName: sessionMenuCommandIds.includes('sessionsViewPane.agentHost.copySessionBranchName'),
		}, {
			submenu: {
				title: 'Settings',
				group: '2_settings',
				order: 1,
				when: 'sessionProviderId =~ /^(local-agent-host|agenthost-)/',
			},
			settings: [{
				id: 'sessionsViewPane.openSessionSettings',
				title: 'Open Session Settings',
				group: 'navigation',
				order: 1,
				when: 'sessionProviderId =~ /^(local-agent-host|agenthost-)/',
			}, {
				id: 'sessionsViewPane.openHostSettings',
				title: 'Open Host Settings',
				group: 'navigation',
				order: 2,
				when: 'sessionProviderId =~ /^(local-agent-host|agenthost-)/',
			}],
			hasCopyBranchName: false,
		});
	});

	test('copies browser links for sessions and chats', async () => {
		const copied: string[] = [];
		const clipboardService = new class extends mock<IClipboardService>() {
			override async writeText(text: string): Promise<void> {
				copied.push(text);
			}
		};
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override resolveSessionResourceIdentity(): IAgentHostSessionIdentity {
				return upcastPartial<IAgentHostSessionIdentity>({
					backendSession: URI.parse('copilotcli:/session-1'),
				});
			}
		};
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IClipboardService, clipboardService],
			[IAgentHostConnectionsService, connectionsService],
			[IProductService, upcastPartial<IProductService>({ urlProtocol: 'vscode-insiders' })],
		)));
		const session = upcastPartial<ISession>({
			resource: URI.parse('agent-host-copilotcli:/session-1'),
		});
		const chat = upcastPartial<IChat>({
			resource: session.resource.with({ fragment: 'chat-2' }),
			title: constObservable('Chat 2'),
		});

		await instantiationService.invokeFunction(CommandsRegistry.getCommand(COPY_AGENT_HOST_SESSION_LINK_COMMAND_ID)!.handler, session);
		await instantiationService.invokeFunction(CommandsRegistry.getCommand(COPY_AGENT_HOST_CHAT_LINK_COMMAND_ID)!.handler, { session, chat });

		assert.deepStrictEqual(copied, [
			'vscode-insiders://agents/agent-host-session/copilotcli/session-1',
			'vscode-insiders://agents/agent-host-session/copilotcli/session-1/chat/chat-2',
		]);
	});
});
