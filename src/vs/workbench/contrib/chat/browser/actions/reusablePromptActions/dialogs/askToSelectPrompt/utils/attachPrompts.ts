/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget, showChatView } from '../../../../../chat.js';
import { ACTION_ID_NEW_CHAT } from '../../../../chatClearActions.js';
import { IChatAttachPromptActionOptions } from '../../../chatAttachPromptAction.js';
import { assertDefined, WithUriValue } from '../../../../../../../../../base/common/types.js';
import { IViewsService } from '../../../../../../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../../../../../../platform/commands/common/commands.js';

/**
 * Options for the {@link attachPrompts} function.
 */
export interface IAttachPromptOptions {
	/**
	 * Chat widget instance to attach the prompt to.
	 */
	readonly widget?: IChatWidget;
	/**
	 * Whether to create a new chat session and
	 * attach the prompt to it.
	 */
	readonly inNewChat?: boolean;

	readonly viewsService: IViewsService;
	readonly commandService: ICommandService;
}

/**
 * Attaches provided prompts to a chat input.
 */
export const attachPrompts = async (
	files: readonly WithUriValue<Object>[],
	options: IAttachPromptOptions,
): Promise<IChatWidget> => {
	const widget = await getChatWidgetObject(options);

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
 * reference and the `inNewChat` flag.
 *
 * @throws if failed to reveal a chat widget.
 */
const getChatWidgetObject = async (
	options: IAttachPromptOptions,
): Promise<IChatWidget> => {
	const { widget, inNewChat } = options;

	// if a new chat sessions needs to be created, or there is no
	// chat widget reference provided, show a chat view, otherwise
	// re-use the existing chat widget
	if ((inNewChat === true) || (widget === undefined)) {
		return await showChat(options, inNewChat);
	}

	return widget;
};

/**
 * Opens a chat session, or reveals an existing one.
 */
const showChat = async (
	options: IAttachPromptOptions,
	createNew: boolean = false,
): Promise<IChatWidget> => {
	const { commandService, viewsService } = options;

	if (createNew === true) {
		await commandService.executeCommand(ACTION_ID_NEW_CHAT);
	}

	const widget = await showChatView(viewsService);

	assertDefined(
		widget,
		'Chat widget must be defined.',
	);

	return widget;
};
