/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget } from '../../../../../chat.js';
import { URI } from '../../../../../../../../../base/common/uri.js';

/**
 * Options for the {@link detachPrompt} function.
 */
export interface IDetachPromptOptions {
	/**
	 * Chat widget instance to attach the prompt to.
	 */
	readonly widget: IChatWidget;
}

/**
 * Detaches provided prompts to a chat input.
 */
export const detachPrompt = async (
	file: URI,
	options: IDetachPromptOptions,
): Promise<IChatWidget> => {
	const { widget } = options;

	widget
		.attachmentModel
		.promptInstructions
		.remove(file);

	return widget;
};
