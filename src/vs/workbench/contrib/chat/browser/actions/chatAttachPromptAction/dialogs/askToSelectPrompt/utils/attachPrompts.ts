/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISelectPromptOptions } from '../askToSelectPrompt.js';
import { IChatWidget, showChatView, showEditsView } from '../../../../../chat.js';
import { IChatAttachPromptActionOptions } from '../../../chatAttachPromptAction.js';
import { assertDefined, WithUriValue } from '../../../../../../../../../base/common/types.js';
import { IQuickPickItem } from '../../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Attaches provided prompts to a chat input.
 */
export const attachPrompts = async (
	files: readonly WithUriValue<IQuickPickItem>[],
	options: ISelectPromptOptions,
	altOption: boolean,
): Promise<IChatWidget> => {
	const widget = await getChatWidgetObject(options, altOption);

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
	options: IChatAttachPromptActionOptions,
	altOption: boolean,
): Promise<IChatWidget> => {
	const { widget, viewsService } = options;

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
