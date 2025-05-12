/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget } from '../../../../../chat.js';
import { getChatWidgetObject } from './attachInstructions.js';
import { URI } from '../../../../../../../../../base/common/uri.js';
import { IViewsService } from '../../../../../../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../../../../../../platform/commands/common/commands.js';
import { getPromptCommandName } from '../../../../../../common/promptSyntax/service/promptsService.js';

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

	widget.setInput(`/${getPromptCommandName(file.path)}`);
	// submit the prompt immediately
	await widget.acceptInput();


	return { widget };
};
