/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatViewId, IChatWidget } from '../chat.js';
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from '../actions/chatActions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { PromptFilePickers } from './pickers/promptFilePickers.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPicker } from '../attachments/chatContextPickService.js';
import { IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getCleanPromptName } from '../../common/promptSyntax/config/promptFileLocations.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { compare } from '../../../../../base/common/strings.js';
import { IPromptFileVariableEntry, PromptFileVariableKind, toPromptFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';

/**
 * Action ID for the `Attach Instruction` action.
 */
const ATTACH_INSTRUCTIONS_ACTION_ID = 'workbench.action.chat.attach.instructions';

/**
 * Action ID for the `Configure Instruction` action.
 */
const CONFIGURE_INSTRUCTIONS_ACTION_ID = 'workbench.action.chat.configure.instructions';


class ManageInstructionsFilesAction extends Action2 {
	constructor() {
		super({
			id: CONFIGURE_INSTRUCTIONS_ACTION_ID,
			title: localize2('configure-instructions', "Configure Instructions..."),
			shortTitle: localize2('configure-instructions.short', "Chat Instructions"),
			icon: Codicon.bookmark,
			f1: true,
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
			menu: {
				id: CHAT_CONFIG_MENU_ID,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
				order: 10,
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
			'commands.prompt.manage-dialog.placeholder',
			'Select the instructions file to open'
		);

		const result = await pickers.selectPromptFile({ placeholder, type: PromptsType.instructions, optionEdit: false });
		if (result !== undefined) {
			await openerService.open(result.promptFile);
		}

	}
}

/**
 * Helper to register the `Attach Prompt` action.
 */
export function registerAttachPromptActions(): void {
	registerAction2(ManageInstructionsFilesAction);
}


export class ChatInstructionsPickerPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';
	readonly label = localize('chatContext.attach.instructions.label', 'Instructions...');
	readonly icon = Codicon.bookmark;
	readonly commandId = ATTACH_INSTRUCTIONS_ACTION_ID;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
	) { }

	isEnabled(widget: IChatWidget): Promise<boolean> | boolean {
		return !!widget.attachmentCapabilities.supportsInstructionAttachments;
	}

	asPicker(): IChatContextPicker {

		const picks = this.promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None).then(value => {

			const result: (IChatContextPickerPickItem | IQuickPickSeparator)[] = [];

			value = value.slice(0).sort((a, b) => compare(a.storage, b.storage));

			let storageType: string | undefined;

			for (const promptsPath of value) {

				if (storageType !== promptsPath.storage) {
					storageType = promptsPath.storage;
					result.push({
						type: 'separator',
						label: this.promptsService.getPromptLocationLabel(promptsPath)
					});
				}

				result.push({
					label: promptsPath.name ?? getCleanPromptName(promptsPath.uri),
					asAttachment: (): IPromptFileVariableEntry => {
						return toPromptFileVariableEntry(promptsPath.uri, PromptFileVariableKind.Instruction);
					}
				});
			}
			return result;
		});

		return {
			placeholder: localize('placeholder', 'Select instructions files to attach'),
			picks,
			configure: {
				label: localize('configureInstructions', 'Configure Instructions...'),
				commandId: CONFIGURE_INSTRUCTIONS_ACTION_ID
			}
		};
	}
}
