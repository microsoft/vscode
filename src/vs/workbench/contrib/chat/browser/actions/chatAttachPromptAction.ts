/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from './chatActions.js';
import { localize2 } from '../../../../../nls.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { IChatWidget, showChatView, showEditsView } from '../chat.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISelectPromptOptions, showSelectPromptDialog } from './chatAttachPromptAction/showPromptSelectionDialog.js';
import { IPromptsService } from '../../common/promptSyntax/service/types.js';

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
			category: CHAT_CATEGORY,
		});
	}

	public override async run(
		accessor: ServicesAccessor,
		options: IChatAttachPromptActionOptions,
	): Promise<void> {
		const labelService = accessor.get(ILabelService);
		const viewsService = accessor.get(IViewsService);
		const openerService = accessor.get(IOpenerService);
		const promptsService = accessor.get(IPromptsService);
		const initService = accessor.get(IInstantiationService);
		const quickInputService = accessor.get(IQuickInputService);

		const selectionResult = await showSelectPromptDialog({
			...options,
			initService,
			labelService,
			openerService,
			promptsService,
			quickInputService,
		});

		// no prompt selected, nothing to do
		if (!selectionResult) {
			return;
		}

		const { selected, altOption } = selectionResult;

		// reveal appropriate chat widget
		const widget = await revealChatWidget(options, altOption, viewsService);

		widget
			.attachmentModel
			.promptInstructions
			.add(selected.value);

		widget.focusInput();
	}
}

/**
 * Reveals a chat widget based on the provided {@link IChatAttachPromptActionOptions.widget widget}
 * reference. If no widget reference is provided, the function will reveal a `chat panel` by default
 * (either a last focused, or a new one), but if the {@link altOption} is set to `true`, a `chat edits`
 * panel will be revealed instead (likewise either a last focused, or a new one).
 */
const revealChatWidget = async (
	options: IChatAttachPromptActionOptions,
	altOption: boolean,
	viewsService: IViewsService,
): Promise<IChatWidget> => {
	const { widget } = options;

	// if no widget reference is present, the command was triggered from outside of
	// an active chat input, so we reveal a chat widget window based on the `alt`
	// key modifier state when a prompt was selected from the picker UI dialog
	if (!widget) {
		const widget = (altOption)
			? await showEditsView(viewsService)
			: await showChatView(viewsService);

		assertDefined(
			widget,
			'Revealed chat widget must be defined.',
		);

		return widget;
	}

	return widget;
};
