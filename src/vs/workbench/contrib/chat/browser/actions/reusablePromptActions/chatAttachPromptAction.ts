/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from '../chatActions.js';
import { localize2 } from '../../../../../../nls.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { IPromptsService } from '../../../common/promptSyntax/service/types.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { attachPrompt, IAttachPromptOptions } from './dialogs/askToSelectPrompt/utils/attachPrompt.js';
import { ISelectPromptOptions, askToSelectPrompt } from './dialogs/askToSelectPrompt/askToSelectPrompt.js';

/**
 * Action ID for the `Attach Prompt` action.
 */
const ATTACH_PROMPT_ACTION_ID = 'workbench.action.chat.attach.prompt';

/**
 * Options for the {@link AttachPromptAction} action.
 */
export interface IChatAttachPromptActionOptions extends Pick<
	ISelectPromptOptions, 'resource' | 'widget'
> {
	/**
	 * Whether to create a new chat panel or open
	 * an existing one (if present).
	 */
	inNewChat?: boolean;

	/**
	 * Whether to skip the prompt files selection dialog.
	 *
	 * Note! if this option is set to `true`, the {@link resource}
	 * option `must be defined`.
	 */
	skipSelectionDialog?: boolean;
}

/**
 * Action to attach a prompt to a chat widget input.
 */
class AttachPromptAction extends Action2 {
	constructor() {
		super({
			id: ATTACH_PROMPT_ACTION_ID,
			title: localize2('workbench.action.chat.attach.prompt.label', "Use Prompt"),
			f1: false,
			precondition: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
			category: CHAT_CATEGORY,
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		options: IChatAttachPromptActionOptions,
	): Promise<void> {
		const fileService = accessor.get(IFileService);
		const labelService = accessor.get(ILabelService);
		const viewsService = accessor.get(IViewsService);
		const openerService = accessor.get(IOpenerService);
		const dialogService = accessor.get(IDialogService);
		const promptsService = accessor.get(IPromptsService);
		const commandService = accessor.get(ICommandService);
		const quickInputService = accessor.get(IQuickInputService);

		const { skipSelectionDialog, resource } = options;

		if (skipSelectionDialog === true) {
			assertDefined(
				resource,
				'Resource must be defined when skipping prompt selection dialog.',
			);

			const attachOptions: IAttachPromptOptions = {
				...options,
				viewsService,
				commandService,
			};

			const { widget } = await attachPrompt(
				resource,
				attachOptions,
			);

			widget.focusInput();

			return;
		}

		// find all prompt files in the user workspace
		const promptFiles = await promptsService.listPromptFiles();

		await askToSelectPrompt({
			...options,
			promptFiles,
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

/**
 * Runs the `Attach Prompt` action with provided options. We export this
 * function instead of {@link ATTACH_PROMPT_ACTION_ID} directly to
 * encapsulate/enforce the correct options to be passed to the action.
 */
export const runAttachPromptAction = async (
	options: IChatAttachPromptActionOptions,
	commandService: ICommandService,
): Promise<void> => {
	return await commandService.executeCommand(
		ATTACH_PROMPT_ACTION_ID,
		options,
	);
};

/**
 * Helper to register the `Attach Prompt` action.
 */
export const registerAttachPromptActions = () => {
	registerAction2(AttachPromptAction);
};
