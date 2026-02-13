/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatViewId } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';

/**
 * Action ID for the `Configure Skills` action.
 */
const CONFIGURE_SKILLS_ACTION_ID = 'workbench.action.chat.configure.skills';


class ManageSkillsAction extends Action2 {
	constructor() {
		super({
			id: CONFIGURE_SKILLS_ACTION_ID,
			title: localize2('configure-skills', "Configure Skills..."),
			shortTitle: localize2('configure-skills.short', "Skills"),
			icon: Codicon.lightbulb,
			f1: true,
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
			menu: {
				id: CHAT_CONFIG_MENU_ID,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
				order: 9,
				group: '1_level'
			}
		});
	}

	public override async run(
		accessor: ServicesAccessor,
	): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const instaService = accessor.get(IInstantiationService);

		const pickers = instaService.createInstance(PromptFilePickers);

		const placeholder = localize(
			'commands.prompt.manage-skills-dialog.placeholder',
			'Select the skill to open'
		);

		const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.skill, optionEdit: false });
		if (result !== undefined) {
			await openerService.open(result.promptFile);
		}
	}
}

/**
 * Helper to register the `Manage Skills` action.
 */
export function registerSkillActions(): void {
	registerAction2(ManageSkillsAction);
}
