/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IChatModeService } from '../../common/chatModes.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ChatModeKind } from '../../common/constants.js';
import { Codicon } from '../../../../../base/common/codicons.js';

const CODE_REVIEW_ACTION_ID = 'workbench.action.chat.runCodeReview';

export class RunCodeReviewAction extends Action2 {
	constructor() {
		super({
			id: CODE_REVIEW_ACTION_ID,
			title: localize2('chat.runCodeReview.label', "Run Code Review"),
			category: CHAT_CATEGORY,
			icon: Codicon.checklist,
			f1: true,
			precondition: ChatContextKeys.enabled,
			menu: [
				{
					id: MenuId.CommandPalette,
					when: ChatContextKeys.enabled
				},
				{
					id: MenuId.SCMTitle,
					when: ChatContextKeys.enabled,
					group: 'navigation',
					order: 100
				}
			]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const chatModeService = accessor.get(IChatModeService);
		const commandService = accessor.get(ICommandService);

		// Try to find code-review mode
		const codeReviewMode = chatModeService.findModeByName('code-review');
		
		if (codeReviewMode) {
			// Open chat with code-review mode
			await commandService.executeCommand('workbench.action.openChat', {
				query: '',
				mode: 'code-review'
			});
		} else {
			// Fallback: Open chat in agent mode with a code review prompt
			await commandService.executeCommand('workbench.action.openChat', {
				query: localize('chat.codeReview.defaultPrompt', "Please review the current code changes"),
				mode: ChatModeKind.Agent
			});
		}
	}
}

export function registerCodeReviewActions(): void {
	registerAction2(RunCodeReviewAction);
}
