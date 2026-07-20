/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatInputWindowService } from '../../common/chatInputWindow.js';

// Registers the singleton implementation (side-effect import).
import './chatInputWindowService.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.chat.toggleInputWindow',
			title: nls.localize2('chat.toggleInputWindow', "Toggle Floating Chat Input Window"),
			category: Categories.View,
			f1: true,
			precondition: ChatContextKeys.enabled,
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
			menu: {
				id: MenuId.ChatInputWindowSide,
				group: 'navigation',
				order: 10
			}
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IChatInputWindowService).closeWindow();
	}
});
