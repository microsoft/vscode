/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from '../chatActions.js';
import { localize2 } from '../../../../../../nls.js';
import { IChatService } from '../../../common/chatService.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { Action2 } from '../../../../../../platform/actions/common/actions.js';
import { IPromptsService } from '../../../common/promptSyntax/service/types.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ISelectPromptOptions, askToSelectPrompt } from './dialogs/askToSelectPrompt/askToSelectPrompt.js';

/**
 * Action ID for the `Attach Prompt` action.
 */
export const ATTACH_PROMPT_ACTION_ID = 'workbench.action.chat.attach.prompt';

/**
 * Options for the {@link AttachPromptAction} action.
 */
export interface IChatAttachPromptActionOptions extends Pick<
	ISelectPromptOptions, 'resource' | 'widget'
> { }

/**
 * Action to attach a prompt to a chat widget input.
 */
export class AttachPromptAction extends Action2 {
	constructor() {
		super({
			id: ATTACH_PROMPT_ACTION_ID,
			title: localize2('workbench.action.chat.attach.prompt.label', "Use Prompt"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			category: CHAT_CATEGORY,
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		options: IChatAttachPromptActionOptions,
	): Promise<void> {
		const fileService = accessor.get(IFileService);
		const chatService = accessor.get(IChatService);
		const labelService = accessor.get(ILabelService);
		const viewsService = accessor.get(IViewsService);
		const openerService = accessor.get(IOpenerService);
		const dialogService = accessor.get(IDialogService);
		const promptsService = accessor.get(IPromptsService);
		const commandService = accessor.get(ICommandService);
		const quickInputService = accessor.get(IQuickInputService);

		// find all prompt files in the user workspace
		const promptFiles = await promptsService.listPromptFiles();

		await askToSelectPrompt({
			...options,
			promptFiles,
			chatService,
			fileService,
			viewsService,
			labelService,
			dialogService,
			openerService,
			commandService,
			quickInputService,
		});
	}
}
