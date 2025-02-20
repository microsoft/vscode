/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CHAT_CATEGORY } from './chatActions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IPromptsService } from '../../common/promptSyntax/service/types.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISelectPromptOptions, showSelectPromptDialog } from './chatAttachPromptAction/showPromptSelectionDialog.js';

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

		await showSelectPromptDialog({
			...options,
			initService,
			labelService,
			viewsService,
			openerService,
			promptsService,
			quickInputService,
		});
	}
}
