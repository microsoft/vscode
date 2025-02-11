/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../../nls.js';
import { IChatWidgetService } from '../../chat.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { ChatAgentLocation } from '../../../common/chatAgents.js';
import { KeyMod, KeyCode } from '../../../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { BasePromptParser } from '../../../common/promptSyntax/parsers/basePromptParser.js';
import { appendToCommandPalette } from '../../../../files/browser/fileActions.contribution.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IActiveCodeEditor, isCodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { IChatAttachPromptActionOptions, ATTACH_PROMPT_ACTION_ID } from '../../actions/chatAttachPromptAction.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';

/**
 * TODO: @legomushroom
 *  - make the shortcut configurable
 */

/**
 * Command ID for the "Use Prompt" command.
 */
export const USE_PROMPT_COMMAND_ID = 'use-prompt';

/**
 * Get location of a focused chat input, if any.
 */
export function getLocation(accessor: ServicesAccessor): ChatAgentLocation | undefined {
	const chatWidgetService = accessor.get(IChatWidgetService);

	const { lastFocusedWidget } = chatWidgetService;
	if (!lastFocusedWidget) {
		return undefined;
	}

	if (!lastFocusedWidget.hasInputFocus()) {
		return undefined;
	}

	return lastFocusedWidget.location;
}

/**
 * Gets active editor instance, if any.
 */
export function getActiveEditor(accessor: ServicesAccessor): IActiveCodeEditor | null {
	const editorService = accessor.get(IEditorService);

	const activeTextEditorControl = editorService.activeTextEditorControl;

	// TODO: @legomushroom - add diff editor support?
	// if (isDiffEditor(activeTextEditorControl)) {
	// 	if (activeTextEditorControl.getOriginalEditor().hasTextFocus()) {
	// 		activeTextEditorControl = activeTextEditorControl.getOriginalEditor();
	// 	} else {
	// 		activeTextEditorControl = activeTextEditorControl.getModifiedEditor();
	// 	}
	// }

	if (!isCodeEditor(activeTextEditorControl) || !activeTextEditorControl.hasModel()) {
		return null;
	}

	return activeTextEditorControl;
}

/**
 * Gets `URI` of a prompt file if it is an active editor instance.
 */
const getActivePromptUri = (
	resource: URI | undefined,
	accessor: ServicesAccessor,
): URI | undefined => {
	if (resource) {
		// TODO: @legomushroom - check if a prompt resource
		return resource;
	}

	const activeEditor = getActiveEditor(accessor);
	if (!activeEditor) {
		return undefined;
	}

	const { uri } = activeEditor.getModel();
	if (BasePromptParser.isPromptSnippet(uri)) {
		return uri;
	}

	return undefined;
};

/**
 * Implementation of the "Use Prompt" command.
 */
const usePromptCommand = async (
	accessor: ServicesAccessor,
	resource?: URI,
): Promise<void> => {
	const commandService = accessor.get(ICommandService);

	const options: IChatAttachPromptActionOptions = {
		resource: getActivePromptUri(resource, accessor),
		location: getLocation(accessor),
	};

	await commandService.executeCommand(ATTACH_PROMPT_ACTION_ID, options);
};

// Key bindings

const USE_COMMAND_KEY_BINDINGS = KeyMod.Alt | KeyMod.Shift | KeyCode.KeyW;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: USE_COMMAND_KEY_BINDINGS,
	handler: usePromptCommand,
});

// Command Palette

const USE_PROMPT_LABEL = nls.localize2(USE_PROMPT_COMMAND_ID, "Use Prompt");
appendToCommandPalette(
	{
		id: USE_PROMPT_COMMAND_ID,
		title: USE_PROMPT_LABEL,
		category: CHAT_CATEGORY,
	},
);
