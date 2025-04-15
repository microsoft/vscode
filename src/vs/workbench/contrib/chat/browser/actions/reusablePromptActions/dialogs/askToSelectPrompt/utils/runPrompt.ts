/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget } from '../../../../../chat.js';
import { URI } from '../../../../../../../../../base/common/uri.js';
import { assertDefined } from '../../../../../../../../../base/common/types.js';
import { IViewsService } from '../../../../../../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../../../../../../platform/commands/common/commands.js';
import { detachPrompt } from './detachPrompt.js';
import { getChatWidgetObject } from './attachInstructions.js';
import { extUri } from '../../../../../../../../../base/common/resources.js';


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
