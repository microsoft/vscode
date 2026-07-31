/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_INPUT_WINDOW_TOGGLE_COMMAND_ID, IChatInputWindowService } from '../../common/chatInputWindow.js';
import { OmniChatEnabledSettingId } from '../../common/sessionRouter.js';
import { ChatViewId } from '../chat.js';

// Registers the singleton implementation (side-effect import).
import './chatInputWindowService.js';

const inputWindowEnabled = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.equals(`config.${OmniChatEnabledSettingId}`, true)
);

CommandsRegistry.registerCommand('_chat.omni.acceptVoiceInput', (accessor, text: string) => {
	return accessor.get(IChatInputWindowService).acceptVoiceInput(text);
});

let voiceRoutingBridge: IDisposable | undefined;
function ensureVoiceRoutingBridge(accessor: ServicesAccessor, service: IChatInputWindowService): void {
	if (!voiceRoutingBridge) {
		const commandService = accessor.get(ICommandService);
		voiceRoutingBridge = service.onDidResolveRoute(({ resource, kind }) => {
			commandService.executeCommand('_chat.voice.setOmniTarget', resource?.toString(), kind).catch(() => { });
		});
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CHAT_INPUT_WINDOW_TOGGLE_COMMAND_ID,
			title: nls.localize2('chat.toggleInputWindow', "Toggle Floating Chat Input Window"),
			category: Categories.View,
			icon: Codicon.commentDiscussionSparkle,
			f1: true,
			precondition: ChatContextKeys.enabled,
			menu: [
				{
					id: MenuId.CommandCenter,
					group: 'navigation',
					order: 4,
					when: inputWindowEnabled,
				},
				{
					id: MenuId.ViewTitle,
					group: 'navigation',
					order: 0,
					when: ContextKeyExpr.and(inputWindowEnabled, ContextKeyExpr.equals('view', ChatViewId)),
				},
			],
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const invokingWindow = dom.getActiveWindow();
		const invokingWindowBounds = {
			x: invokingWindow.screenX,
			y: invokingWindow.screenY,
			width: invokingWindow.outerWidth,
			height: invokingWindow.outerHeight,
		};
		const chatInputWindowService = accessor.get(IChatInputWindowService);
		ensureVoiceRoutingBridge(accessor, chatInputWindowService);
		await chatInputWindowService.toggleWindow(invokingWindowBounds);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.closeInputWindow',
			title: nls.localize2('chat.closeInputWindow', "Close Floating Chat Input Window"),
			category: Categories.View,
			f1: false,
			icon: Codicon.close,
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IChatInputWindowService).closeWindow();
	}
});
