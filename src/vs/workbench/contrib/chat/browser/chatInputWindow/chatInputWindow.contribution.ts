/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
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
		const chatInputWindowService = accessor.get(IChatInputWindowService);
		await chatInputWindowService.toggleWindow();
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
