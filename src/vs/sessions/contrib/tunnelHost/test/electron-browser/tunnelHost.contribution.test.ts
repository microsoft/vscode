/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import type { ContextKeyExpression, ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, type TunnelMode, type TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, RemoteNameContext } from '../../../../../workbench/common/contextkeys.js';
import { Menus } from '../../../../browser/menus.js';
import { RemoteTunnelCommandIds } from '../../../../../workbench/contrib/remoteTunnel/electron-browser/remoteTunnel.contribution.js';
import { TOGGLE_SHARING_ID } from '../../../../../workbench/contrib/chat/electron-browser/tunnelHost.contribution.js';
import { SessionsTunnelHostTitlebarContribution, TOGGLE_SHARING_FROM_AGENTS_ID } from '../../electron-browser/tunnelHost.contribution.js';

class TestRemoteTunnelService extends mock<IRemoteTunnelService>() {
	override getMode(): Promise<TunnelMode> {
		return Promise.resolve(INACTIVE_TUNNEL_MODE);
	}

	override getTunnelStatus(): Promise<TunnelStatus> {
		return Promise.resolve({ type: 'disconnected' });
	}
}

class TestCommandService extends mock<ICommandService>() {
	readonly calls: Array<{ id: string; args: unknown[] }> = [];

	override executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
		this.calls.push({ id, args });
		return Promise.resolve(undefined);
	}
}

suite('Sessions - Tunnel Host Contribution', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the remote connections toggle with the titlebar contribution', () => {
		const findToggle = (menu: MenuId, id: string) => MenuRegistry.getMenuItems(menu)
			.filter(isIMenuItem)
			.find(item => item.command.id === id);

		assert.strictEqual(findToggle(Menus.TitleBarRightLayout, TOGGLE_SHARING_FROM_AGENTS_ID), undefined);
		assert.strictEqual(CommandsRegistry.getCommand(TOGGLE_SHARING_FROM_AGENTS_ID), undefined);

		const contribution = new SessionsTunnelHostTitlebarContribution(new TestRemoteTunnelService(), new NullActionViewItemService());

		const summarize = (menu: MenuId, id: string) => {
			const item = findToggle(menu, id);
			return item && {
				group: item.group,
				order: item.order,
				icon: ThemeIcon.isThemeIcon(item.command.icon) ? item.command.icon.id : undefined,
			};
		};

		try {
			assert.deepStrictEqual({
				titlebar: summarize(Menus.TitleBarRightLayout, TOGGLE_SHARING_FROM_AGENTS_ID),
				chatInput: summarize(MenuId.ChatInputSecondary, TOGGLE_SHARING_ID),
			}, {
				titlebar: { group: 'navigation', order: 90, icon: Codicon.radioTower.id },
				chatInput: { group: 'navigation', order: 10, icon: Codicon.radioTower.id },
			});

			const titlebarToggle = findToggle(Menus.TitleBarRightLayout, TOGGLE_SHARING_FROM_AGENTS_ID);
			const chatInputToggle = findToggle(MenuId.ChatInputSecondary, TOGGLE_SHARING_ID);
			if (!titlebarToggle?.when || !chatInputToggle?.when) {
				assert.fail('remote connections menu items should have when clauses');
			}

			const evalWhen = (when: ContextKeyExpression, values: Record<string, ContextKeyValue>) => {
				return when.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => values[key] as T });
			};
			const agentHostChat = {
				[ChatContextKeys.enabled.key]: true,
				[ChatContextKeys.chatIsAgentHostSession.key]: true,
				[IsAuxiliaryWindowContext.key]: false,
				[RemoteNameContext.key]: '',
			};

			assert.deepStrictEqual({
				agentsTitlebar: evalWhen(titlebarToggle.when, { ...agentHostChat, [IsSessionsWindowContext.key]: true }),
				editorTitlebar: evalWhen(titlebarToggle.when, { ...agentHostChat, [IsSessionsWindowContext.key]: false }),
				agentsChatInput: evalWhen(chatInputToggle.when, { ...agentHostChat, [IsSessionsWindowContext.key]: true }),
				editorChatInput: evalWhen(chatInputToggle.when, { ...agentHostChat, [IsSessionsWindowContext.key]: false }),
				remoteEditorChatInput: evalWhen(chatInputToggle.when, { ...agentHostChat, [IsSessionsWindowContext.key]: false, [RemoteNameContext.key]: 'ssh-remote' }),
			}, {
				agentsTitlebar: true,
				editorTitlebar: false,
				agentsChatInput: false,
				editorChatInput: true,
				remoteEditorChatInput: false,
			});
		} finally {
			contribution.dispose();
		}

		assert.strictEqual(findToggle(Menus.TitleBarRightLayout, TOGGLE_SHARING_FROM_AGENTS_ID), undefined);
		assert.strictEqual(CommandsRegistry.getCommand(TOGGLE_SHARING_FROM_AGENTS_ID), undefined);
	});

	test('Agents turn-on forces GitHub without offering service installation', async () => {
		const instantiationService = new TestInstantiationService();
		const commandService = new TestCommandService();
		instantiationService.stub(IRemoteTunnelService, new TestRemoteTunnelService());
		instantiationService.stub(ICommandService, commandService);
		const contribution = new SessionsTunnelHostTitlebarContribution(new TestRemoteTunnelService(), new NullActionViewItemService());

		try {
			const command = CommandsRegistry.getCommand(TOGGLE_SHARING_FROM_AGENTS_ID);
			assert.ok(command);

			await instantiationService.invokeFunction(command.handler);

			assert.deepStrictEqual(commandService.calls, [{
				id: RemoteTunnelCommandIds.turnOn,
				args: [{ authenticationProviderId: 'github', showServiceOption: false, showSuccessNotification: false }],
			}]);
		} finally {
			contribution.dispose();
		}
	});
});
