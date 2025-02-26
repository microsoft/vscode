/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IChatWidgetService } from '../chat.js';

export function registerChatDeveloperActions() {
	registerAction2(LogChatInputHistoryAction);
}

class LogChatInputHistoryAction extends Action2 {

	static readonly ID = 'workbench.action.chat.logInputHistory';

	constructor() {
		super({
			id: LogChatInputHistoryAction.ID,
			title: localize2('workbench.action.chat.logInputHistory.label', "Log Chat Input History"),
			icon: Codicon.attach,
			category: Categories.Developer,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		chatWidgetService.lastFocusedWidget?.logInputHistory();
	}
}
