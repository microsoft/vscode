/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { KeyMod, KeyCode } from '../../../../../../base/common/keyCodes.js';
import { PROMPT_LANGUAGE_ID } from '../../../common/promptSyntax/constants.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { isPromptFile } from '../../../../../../platform/prompts/common/constants.js';
import { runAttachPromptAction } from '../../actions/reusablePromptActions/index.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IActiveCodeEditor, isCodeEditor, isDiffEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';

/**
 * Command ID of the "Use Prompt" command.
 */
export const COMMAND_ID = 'workbench.command.prompts.use';

/**
 * Keybinding of the "Use Prompt" command.
 * The `cmd + /` is the current keybinding for 'attachment', so we use
 * the `alt` key modifier to convey the "prompt attachment" action.
 */
const COMMAND_KEY_BINDING = KeyMod.CtrlCmd | KeyCode.Slash | KeyMod.Alt;

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
const command = async (
	accessor: ServicesAccessor,
): Promise<void> => {
	const commandService = accessor.get(ICommandService);

	await runAttachPromptAction({
		resource: getActivePromptUri(accessor),
		widget: getFocusedChatWidget(accessor),
	}, commandService);
};

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
export const getActivePromptUri = (
	accessor: ServicesAccessor,
): URI | undefined => {
	const activeEditor = getActiveCodeEditor(accessor);
	if (!activeEditor) {
		return undefined;
	}

	const model = activeEditor.getModel();
	if (model.getLanguageId() === PROMPT_LANGUAGE_ID) {
		return model.uri;
	}

	if (isPromptFile(model.uri)) {
		return model.uri;
	}

	return undefined;
};

/**
 * Register the "Use Prompt" command with its keybinding.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: COMMAND_KEY_BINDING,
	handler: command,
	when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
});

/**
 * Register the "Use Prompt" command in the `command palette`.
 */
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: COMMAND_ID,
		title: localize('commands.prompts.use.title', "Use Prompt"),
		category: CHAT_CATEGORY
	},
	when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled)
});
