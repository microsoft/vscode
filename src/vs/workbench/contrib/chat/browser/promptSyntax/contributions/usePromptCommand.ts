/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { KeyMod, KeyCode } from '../../../../../../base/common/keyCodes.js';
import { isPromptFile } from '../../../../../../platform/prompts/common/constants.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { appendToCommandPalette } from '../../../../files/browser/fileActions.contribution.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IActiveCodeEditor, isCodeEditor, isDiffEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { IChatAttachPromptActionOptions, ATTACH_PROMPT_ACTION_ID } from '../../actions/chatAttachPromptAction.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';

/**
 * Keybinding for the "Use Prompt" command.
 */
const USE_COMMAND_KEY_BINDING = KeyMod.Alt | KeyMod.Shift | KeyCode.KeyE;

/**
 * Command ID for the "Use Prompt" command.
 */
const USE_PROMPT_COMMAND_ID = 'use-prompt';

/**
 * Implementation of the "Use Prompt" command. The command works in the following way.
 *
 * When executed, it tries to see if a `prompt file` was open in the active code editor
 * (see {@link IChatAttachPromptActionOptions.resource resource}), and if a chat input
 * is focused (see {@link IChatAttachPromptActionOptions.widget widget}).
 *
 * Then the command shows prompt selection dialog to the user. If an active prompt file
 * was detected, it is pre-selected in the dialog. User can confirm (`enter`) or select
 * a different prompt file in the dialog.
 *
 * When a prompt file is selected by the user (or confirmed), the command attaches
 * the selected prompt to the focused chat input, if present. If no focused chat input
 * is present, the command would attach the prompt to a `chat panel` input by default
 * (either the last focused instance, or a new one). If the `alt` (`option` on mac) key
 * was pressed when the prompt was selected, a `chat edits` panel is used instead
 * (likewise either the last focused or a new one).
 */
const usePromptCommand = async (
	accessor: ServicesAccessor,
): Promise<void> => {
	const commandService = accessor.get(ICommandService);

	const options: IChatAttachPromptActionOptions = {
		resource: getActivePromptUri(accessor),
		widget: getFocusedChatWidget(accessor),
	};

	await commandService.executeCommand(ATTACH_PROMPT_ACTION_ID, options);
};

/**
 * Register the "Use Prompt" command with its keybinding.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: USE_COMMAND_KEY_BINDING,
	handler: usePromptCommand,
});

/**
 * Register the "Use Prompt" command in the `command palette`.
 */
appendToCommandPalette(
	{
		id: USE_PROMPT_COMMAND_ID,
		title: localize('commands.prompts.use-prompt', "Use Prompt"),
		category: CHAT_CATEGORY,
	},
);

/**
 * Get chat widget reference to attach prompt to.
 */
export function getFocusedChatWidget(accessor: ServicesAccessor): IChatWidget | undefined {
	const chatWidgetService = accessor.get(IChatWidgetService);

	const { lastFocusedWidget } = chatWidgetService;
	if (!lastFocusedWidget) {
		return undefined;
	}

	// the widget input `must` be focused at the time when command run
	if (!lastFocusedWidget.hasInputFocus()) {
		return undefined;
	}

	return lastFocusedWidget;
}

/**
 * Gets active editor instance, if any.
 */
export function getActiveCodeEditor(accessor: ServicesAccessor): IActiveCodeEditor | undefined {
	const editorService = accessor.get(IEditorService);
	const { activeTextEditorControl } = editorService;

	if (isCodeEditor(activeTextEditorControl) && activeTextEditorControl.hasModel()) {
		return activeTextEditorControl;
	}

	if (isDiffEditor(activeTextEditorControl)) {
		const originalEditor = activeTextEditorControl.getOriginalEditor();
		if (!originalEditor.hasModel()) {
			return undefined;
		}

		return originalEditor;
	}

	return undefined;
}

/**
 * Gets `URI` of a prompt file open in an active editor instance, if any.
 */
const getActivePromptUri = (
	accessor: ServicesAccessor,
): URI | undefined => {
	const activeEditor = getActiveCodeEditor(accessor);
	if (!activeEditor) {
		return undefined;
	}

	const { uri } = activeEditor.getModel();
	if (isPromptFile(uri)) {
		return uri;
	}

	return undefined;
};
