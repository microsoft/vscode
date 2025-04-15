/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget, showChatView } from '../../../../../chat.js';
import { URI } from '../../../../../../../../../base/common/uri.js';
import { ACTION_ID_NEW_CHAT } from '../../../../chatClearActions.js';
import { extUri } from '../../../../../../../../../base/common/resources.js';
import { assertDefined } from '../../../../../../../../../base/common/types.js';
import { IChatAttachInstructionsActionOptions } from '../../../chatAttachPromptAction.js';
import { IViewsService } from '../../../../../../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../../../../../../platform/commands/common/commands.js';
import { detachPrompt } from './detachPrompt.js';

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
	readonly widget: IChatWidget;
	readonly wereAlreadyAttached: readonly URI[];
}

/**
 * Options for the {@link runPromptFile} function.
 */
export interface IRunPromptOptions {
	/**
	 * Chat widget instance to attach the prompt to.
	 */
	readonly widget?: IChatWidget;
	/**
	 * Whether to create a new chat session and
	 * attach the instructions file to it.
	 */
	readonly inNewChat?: boolean;

	readonly viewsService: IViewsService;
	readonly commandService: ICommandService;
}


/**
 * Return value of the {@link runPromptFile} function.
 */
interface IRunPromptResult {
	readonly widget: IChatWidget;
}

/**
 * Check if provided uri is already attached to chat
 * input as an implicit  "current file" context.
 */
const isAttachedAsCurrentPrompt = (
	promptUri: URI,
	widget: IChatWidget,
): boolean => {
	const { implicitContext } = widget.input;
	if (implicitContext === undefined) {
		return false;
	}

	if (implicitContext.isInstructions === false) {
		return false;
	}

	if (implicitContext.enabled === false) {
		return false;
	}

	assertDefined(
		implicitContext.value,
		'Prompt value must always be defined.',
	);

	const uri = URI.isUri(implicitContext.value)
		? implicitContext.value
		: implicitContext.value.uri;

	return extUri.isEqual(promptUri, uri);
};

/**
 * Attaches provided instructions to a chat input.
 */
export const attachInstructionsFiles = async (
	files: URI[],
	options: IAttachOptions,
): Promise<IAttachResult> => {

	const widget = await getChatWidgetObject(options);

	const wereAlreadyAttached: URI[] = [];

	for (const file of files) {
		if (widget.attachmentModel.promptInstructions.add(file)) {
			wereAlreadyAttached.push(file);
			continue;
		}
	}

	return { widget, wereAlreadyAttached };
};

/**
 * Runs the prompt file.
 */
export const runPromptFile = async (
	file: URI,
	options: IRunPromptOptions,
): Promise<IRunPromptResult> => {

	const widget = await getChatWidgetObject(options);

	let wasAlreadyAttached = true;
	if (isAttachedAsCurrentPrompt(file, widget) === false) {
		wasAlreadyAttached = widget
			.attachmentModel
			.promptInstructions
			.add(file);
	}

	// submit the prompt immediately
	await widget.acceptInput();

	// detach the prompt immediately, unless was attached
	// before the action was executed
	if (wasAlreadyAttached === false) {
		await detachPrompt(file, { widget });
	}

	return { widget };
};

/**
 * Gets a chat widget based on the provided {@link IChatAttachInstructionsActionOptions.widget widget}
 * reference and the `inNewChat` flag.
 *
 * @throws if failed to reveal a chat widget.
 */
const getChatWidgetObject = async (
	options: IAttachOptions | IRunPromptOptions,
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
	options: IAttachOptions | IRunPromptOptions,
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
