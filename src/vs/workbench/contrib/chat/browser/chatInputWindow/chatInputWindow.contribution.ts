/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_INPUT_WINDOW_ACCEPT_VOICE_COMMAND_ID, CHAT_INPUT_WINDOW_TOGGLE_COMMAND_ID, IChatInputWindowService } from '../../common/chatInputWindow.js';
import { OmniChatEnabledSettingId } from '../../common/sessionRouter.js';

// Registers the singleton implementation (side-effect import).
import './chatInputWindowService.js';
import '../sessionRouter/chatSessionRoutingProviderService.js';

const inputWindowEnabled = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.equals(`config.${OmniChatEnabledSettingId}`, true)
);

CommandsRegistry.registerCommand(CHAT_INPUT_WINDOW_ACCEPT_VOICE_COMMAND_ID, (accessor, text: string) => {
	return accessor.get(IChatInputWindowService).acceptVoiceInput(text);
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CHAT_INPUT_WINDOW_TOGGLE_COMMAND_ID,
			title: nls.localize2('chat.toggleInputWindow', "Toggle Floating Chat Input Window"),
			icon: Codicon.arrowCircleUpSparkle,
			f1: false,
			precondition: inputWindowEnabled,
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
			icon: Codicon.closeSmall,
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IChatInputWindowService).closeWindow();
	}
});
