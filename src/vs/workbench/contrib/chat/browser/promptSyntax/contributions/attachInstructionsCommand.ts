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
import { runAttachInstructionsAction } from '../../actions/promptActions/index.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { INSTRUCTIONS_LANGUAGE_ID } from '../../../common/promptSyntax/constants.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';

/**
 * Command ID of the "Attach Instructions" command.
 */
export const INSTRUCTIONS_COMMAND_ID = 'workbench.command.instructions.attach';

/**
 * Keybinding of the "Use Instructions" command.
 * The `cmd + /` is the current keybinding for 'attachment', so we use
 * the `alt` key modifier to convey the "instructions attachment" action.
 */
const INSTRUCTIONS_COMMAND_KEY_BINDING = KeyMod.CtrlCmd | KeyCode.Slash | KeyMod.Alt;

/**
 * Implementation of the "Use Instructions" command. The command works in the following way.
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

	await runAttachInstructionsAction(commandService, {
		resource: getActiveInstructionsFileUri(accessor),
		widget: getFocusedChatWidget(accessor),
	});
};

/**
 * Get chat widget reference to attach instructions to.
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
 * Gets `URI` of a instructions file open in an active editor instance, if any.
 */
export const getActiveInstructionsFileUri = (
	accessor: ServicesAccessor,
): URI | undefined => {
	const codeEditorService = accessor.get(ICodeEditorService);
	const model = codeEditorService.getActiveCodeEditor()?.getModel();
	if (model?.getLanguageId() === INSTRUCTIONS_LANGUAGE_ID) {
		return model.uri;
	}
	return undefined;
};

/**
 * Register the "Attach Instructions" command with its keybinding.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: INSTRUCTIONS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: INSTRUCTIONS_COMMAND_KEY_BINDING,
	handler: command,
	when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled),
});

/**
 * Register the "Use Instructions" command in the `command palette`.
 */
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: INSTRUCTIONS_COMMAND_ID,
		title: localize('attach-instructions.capitalized.ellipses', "Attach Instructions..."),
		category: CHAT_CATEGORY
	},
	when: ContextKeyExpr.and(PromptsConfig.enabledCtx, ChatContextKeys.enabled)
});
