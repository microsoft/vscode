/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatViewId } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NEW_SKILL_COMMAND_ID } from './newPromptFileActions.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';

/**
 * Action ID for the `Manage Skills` action.
 */
const MANAGE_SKILLS_ACTION_ID = 'workbench.action.chat.manage.skills';

interface ISkillQuickPickItem extends IQuickPickItem {
	skill?: { uri: import('../../../../../base/common/uri.js').URI };
	isCreateNew?: boolean;
}

class ManageSkillsAction extends Action2 {
	constructor() {
		super({
			id: MANAGE_SKILLS_ACTION_ID,
			title: localize2('manage-skills', "Manage Skills..."),
			shortTitle: localize2('manage-skills.short', "Skills"),
			icon: Codicon.library,
			f1: true,
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
			menu: {
				id: CHAT_CONFIG_MENU_ID,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
				order: 12,
				group: '0_level'
			}
		});
	}

	public override async run(
		accessor: ServicesAccessor,
	): Promise<void> {
		const commandService = accessor.get(ICommandService);
		const quickInputService = accessor.get(IQuickInputService);
		const promptsService = accessor.get(IPromptsService);
		const openerService = accessor.get(IOpenerService);

		// Get existing skills
		const skills = await promptsService.findAgentSkills(CancellationToken.None) ?? [];

		// Build quick pick items
		const items: (ISkillQuickPickItem | IQuickPickSeparator)[] = [];

		// Add "Create new skill" as first item
		items.push({
			label: `$(plus) ${localize('skills.createNew', "Create new skill...")}`,
			isCreateNew: true,
			alwaysShow: true
		});

		// Add separator if there are existing skills
		if (skills.length > 0) {
			items.push({ type: 'separator', label: localize('skills.existing', "Existing Skills") });

			// Add existing skills
			for (const skill of skills) {
				items.push({
					label: skill.name,
					description: skill.description,
					detail: skill.type === 'personal' ? localize('skills.personal', "Personal") : localize('skills.project', "Project"),
					skill: { uri: skill.uri }
				});
			}
		}

		const selected = await quickInputService.pick(items, {
			placeHolder: localize('skills.placeholder', "Select a skill to open or create a new one"),
			canPickMany: false
		});

		if (!selected) {
			return;
		}

		if (selected.isCreateNew) {
			await commandService.executeCommand(NEW_SKILL_COMMAND_ID);
		} else if (selected.skill) {
			await openerService.open(selected.skill.uri);
		}
	}
}

/**
 * Helper to register the `Manage Skills` action.
 */
export function registerManageSkillsAction(): void {
	registerAction2(ManageSkillsAction);
}
