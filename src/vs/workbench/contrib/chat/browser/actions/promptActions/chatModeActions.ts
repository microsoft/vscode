/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from '../chatActions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { IPromptsService } from '../../../common/promptSyntax/service/types.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { PromptFilePickers } from './dialogs/askToSelectPrompt/promptFilePickers.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { PromptsType } from '../../../../../../platform/prompts/common/prompts.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';

/**
 * Action ID for the `Manage Custom Chat Mode` action.
 */
const MANAGE_CUSTOM_MODE_ACTION_ID = 'workbench.action.chat.manage.mode';

class ManageModeAction extends Action2 {
	constructor() {
		super({
			id: MANAGE_CUSTOM_MODE_ACTION_ID,
			title: localize2('manage-mode.capitalized', "Manage Custom Chat Modes..."),
			shortTitle: localize('manage-mode', "Manage Modes..."),
			icon: Codicon.bookmark,
			f1: true,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
			menu: [
				{
					id: MenuId.ChatModePicker,
					when: ChatContextKeys.Modes.hasCustomChatModes
				}
			]
		});
	}

	public override async run(
		accessor: ServicesAccessor,
	): Promise<void> {
		const promptsService = accessor.get(IPromptsService);
		const openerService = accessor.get(IOpenerService);
		const instaService = accessor.get(IInstantiationService);

		const pickers = instaService.createInstance(PromptFilePickers);

		// find all prompt files in the user workspace
		const promptFiles = await promptsService.listPromptFiles(PromptsType.mode);
		const placeholder = localize(
			'commands.mode.select-dialog.placeholder',
			'Select the custom chat mode to edit'
		);

		const result = await pickers.selectPromptFile({ promptFiles, placeholder, type: PromptsType.mode, optionEdit: false });

		if (result === undefined) {
			return;
		}
		openerService.open(result.promptFile);
	}
}



/**
 * Helper to register all the `Run Current Prompt` actions.
 */
export const registerChatModeActions = () => {
	registerAction2(ManageModeAction);
};
