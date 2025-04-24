/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget, showChatView } from '../../../../../chat.js';
import { URI } from '../../../../../../../../../base/common/uri.js';
import { ACTION_ID_NEW_CHAT } from '../../../../chatClearActions.js';
import { assertDefined } from '../../../../../../../../../base/common/types.js';
import { IAttachInstructionsActionOptions } from '../../../chatAttachInstructionsAction.js';
import { IViewsService } from '../../../../../../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../../../../../../platform/commands/common/commands.js';

/**
 * Options for the {@link attachInstructionsFiles} function.
 */
export interface IAttachOptions {
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
 * Return value of the {@link attachInstructionsFiles} function.
 */
interface IAttachResult {
	/**
	 * Chat widget instance files were attached to.
	 */
	readonly widget: IChatWidget;

	/**
	 * List of instruction files that were already
	 * attached to the chat input.
	 */
	readonly alreadyAttached: readonly URI[];
}

/**
 * Attaches provided instructions to a chat input.
 */
export const attachInstructionsFiles = async (
	files: URI[],
	options: IAttachOptions,
): Promise<IAttachResult> => {

	const widget = await getChatWidgetObject(options);

	const alreadyAttached: URI[] = [];

	for (const file of files) {
		if (widget.attachmentModel.promptInstructions.add(file)) {
			alreadyAttached.push(file);
			continue;
		}
	}

	return { widget, alreadyAttached };
};

/**
 * Gets a chat widget based on the provided {@link IAttachInstructionsActionOptions.widget widget}
 * reference and the `inNewChat` flag.
 *
 * @throws if failed to reveal a chat widget.
 */
export const getChatWidgetObject = async (
	options: IAttachOptions,
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
 * Reveals an existing one or creates a new one based on
 * the provided `createNew` flag.
 */
const showChat = async (
	options: IAttachOptions,
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
