/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { localize, localize2 } from '../../../../../nls.js';
import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ChatViewId } from '../chat.js';

abstract class ConfigModeActionImpl extends Action2 {
	public override async run(accessor: ServicesAccessor): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const instaService = accessor.get(IInstantiationService);

		const pickers = instaService.createInstance(PromptFilePickers);

		const placeholder = localize(
			'commands.mode.select-dialog.placeholder',
			'Select the chat mode file to open'
		);

		const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.mode, optionEdit: false });
		if (result !== undefined) {
			await openerService.open(result.promptFile);
		}
	}
}

// Separate action `Configure Mode` link in the mode picker.

const PICKER_CONFIGURE_MODES_ACTION_ID = 'workbench.action.chat.picker.configmode';

class PickerConfigModeAction extends ConfigModeActionImpl {
	constructor() {
		super({
			id: PICKER_CONFIGURE_MODES_ACTION_ID,
			title: localize2('select-mode', "Configure Modes..."),
			category: CHAT_CATEGORY,
			f1: false,
			menu: {
				id: MenuId.ChatModePicker,
			}
		});
	}
}

/**
 * Action ID for the `Configure Custom Chat Mode` action.
 */
const CONFIGURE_MODES_ACTION_ID = 'workbench.action.chat.manage.mode';

class ManageModeAction extends ConfigModeActionImpl {
	constructor() {
		super({
			id: CONFIGURE_MODES_ACTION_ID,
			title: localize2('configure-modes', "Configure Chat Modes..."),
			shortTitle: localize('configure-modes.short', "Modes"),
			icon: Codicon.bookmark,
			f1: true,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
			menu: [
				{
					id: CHAT_CONFIG_MENU_ID,
					when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
					order: 12,
					group: '0_level'
				}
			]
		});
	}
}


/**
 * Helper to register all the `Run Current Prompt` actions.
 */
export function registerChatModeActions(): void {
	registerAction2(ManageModeAction);
	registerAction2(PickerConfigModeAction);
}
