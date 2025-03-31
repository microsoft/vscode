/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatService } from '../../../../../../common/chatService.js';
import { IChatWidget, showChatView, showEditsView } from '../../../../../chat.js';
import { IChatAttachPromptActionOptions } from '../../../chatAttachPromptAction.js';
import { assertDefined, WithUriValue } from '../../../../../../../../../base/common/types.js';
import { IViewsService } from '../../../../../../../../services/views/common/viewsService.js';
import { ACTION_ID_NEW_CHAT, ACTION_ID_NEW_EDIT_SESSION } from '../../../../chatClearActions.js';
import { ICommandService } from '../../../../../../../../../platform/commands/common/commands.js';

/**
 * TODO: @legomushroom
 */
export interface IAttachPromptOptions {
	readonly widget?: IChatWidget;
	readonly inNewChat?: boolean;

	readonly chatService: IChatService;
	readonly viewsService: IViewsService;
	readonly commandService: ICommandService;
}

/**
 * Attaches provided prompts to a chat input.
 */
export const attachPrompts = async (
	files: readonly WithUriValue<Object>[],
	options: IAttachPromptOptions,
	alt: boolean,
): Promise<IChatWidget> => {
	const widget = await getChatWidgetObject(options, alt);

	for (const file of files) {
		widget
			.attachmentModel
			.promptInstructions
			.add(file.value);
	}

	return widget;
};

/**
 * Gets a chat widget based on the provided {@link IChatAttachPromptActionOptions.widget widget}
 * reference. If no widget reference is provided, the function will reveal a `chat panel` by default
 * (either a last focused, or a new one), but if the {@link altOption} is set to `true`, a `chat edits`
 * panel will be revealed instead (likewise either a last focused, or a new one).
 *
 * @throws if failed to reveal a chat widget.
 */
const getChatWidgetObject = async (
	options: IAttachPromptOptions,
	alt: boolean,
): Promise<IChatWidget> => {
	const { widget, inNewChat } = options;

	if (inNewChat === true) {
		return await openNewChat(options, alt);
	}

	// if no widget reference is present, the command was triggered from outside of
	// an active chat input, so we reveal a chat widget window based on the `alt`
	// key modifier state when a prompt was selected from the picker UI dialog
	if (!widget) {
		return await showExistingChat(options);
	}

	return widget;
};

/**
 * Opens a new chat session based on the `unified chat view` mode
 * enablement, and provided `edits` flag.
 */
const openNewChat = async (
	options: IAttachPromptOptions,
	edits: boolean,
): Promise<IChatWidget> => {
	const { commandService, viewsService } = options;

	// the `unified chat view` mode does not have a separate `edits` view
	// therefore we always open a new default chat session in this mode
	await commandService.executeCommand(ACTION_ID_NEW_CHAT);
	const widget = await showChatView(viewsService);

	assertDefined(
		widget,
		'Chat widget must be defined.',
	);

	return widget;
};

/**
 * Shows an existing chat view based on the `unified chat view` mode
 * enablement, and provided `edits` flag.
 */
const showExistingChat = async (
	options: IAttachPromptOptions,
	edits: boolean,
): Promise<IChatWidget> => {
	const { viewsService } = options;

	const widget = await showChatView(viewsService);

	assertDefined(
		widget,
		'Revealed chat widget must be defined.',
	);

	return widget;
};
