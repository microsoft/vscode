/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as nls from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
// import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { ChatAgentLocation } from '../../../common/chatAgents.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ResourceContextKey } from '../../../../../common/contextkeys.js';
import { IChatUsePromptActionOptions, USE_PROMPT_ACTION_ID } from '../../actions/chatContextActions.js';
import { KeyMod, KeyCode } from '../../../../../../base/common/keyCodes.js';
import { PROMPT_FILE_EXTENSION } from '../../../common/promptSyntax/constants.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
// import { MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IActiveCodeEditor, isCodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
// import { appendEditorTitleContextMenuItem, appendToCommandPalette } from '../../../../files/browser/fileActions.contribution.js';

/**
 * TODO: @legomushroom
 *  - current file support (preselection)
 *  - inline edits support
 *  - file tree context support
 *  - chat input support
 *  - chat edits support
 *  - no file support
 *  - what to do with the "current file" context when using a current file as a prompt?
 */

export const USE_PROMPT_COMMAND_ID = 'usePrompt';
// const USE_PROMPT_LABEL = nls.localize2(USE_PROMPT_COMMAND_ID, "Use Prompt");
const USE_PROMPT_WHEN_CONTEXT = ContextKeyExpr.or(
	ResourceContextKey.Scheme.isEqualTo(Schemas.file),
	ResourceContextKey.Extension.isEqualTo(PROMPT_FILE_EXTENSION),
);

const USE_PROMPT_IN_EDITS_COMMAND_ID = 'usePromptInEdits';
// const USE_PROMPT_IN_EDITS_LABEL = nls.localize2(USE_PROMPT_IN_EDITS_COMMAND_ID, "Use Prompt in Edits");

/**
 * Gets active editor instance, if any.
 */
export function getActiveEditor(accessor: ServicesAccessor): IActiveCodeEditor | null {
	const activeTextEditorControl = accessor.get(IEditorService).activeTextEditorControl;

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
 * Gets `URI` of an active editor instance, if any.
 */
// TODO: @legomushroom - do we need to `getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));`?
const getActiveResource = (
	resource: URI | undefined,
	accessor: ServicesAccessor,
): URI | undefined => {
	if (resource) {
		return resource;
	}

	const activeEditor = getActiveEditor(accessor);
	if (!activeEditor) {
		return undefined;
	}

	// TODO: @legomushroom - active aditor must not be the chat input
	return activeEditor.getModel().uri;
};

/**
 * Implementation of the "Use Prompt" command.
 */
const usePromptCommand = async (
	location: ChatAgentLocation,
	accessor: ServicesAccessor,
	resource?: URI,
): Promise<void> => {
	const commandService = accessor.get(ICommandService);

	const options: IChatUsePromptActionOptions = {
		location,
		resource: getActiveResource(resource, accessor),
	};

	await commandService.executeCommand(USE_PROMPT_ACTION_ID, options);
};

const usePromptCommandFactory = (
	location: ChatAgentLocation,
) => {
	return async (accessor: ServicesAccessor, resource?: URI): Promise<void> => {
		return await usePromptCommand(location, accessor, resource);
	};
};

// Key bindings

const BASE_KEYS = KeyMod.Alt | KeyMod.Shift;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: BASE_KEYS | KeyCode.KeyR,
	handler: usePromptCommandFactory(ChatAgentLocation.Panel),
	when: USE_PROMPT_WHEN_CONTEXT,
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_IN_EDITS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: BASE_KEYS | KeyCode.KeyE,
	handler: usePromptCommandFactory(ChatAgentLocation.EditingSession),
	when: USE_PROMPT_WHEN_CONTEXT,
});

// // Command Palette

// appendToCommandPalette({
// 	id: USE_PROMPT_COMMAND_ID,
// 	title: USE_PROMPT_LABEL,
// 	category: CHAT_CATEGORY,
// });

// appendToCommandPalette({
// 	id: USE_PROMPT_IN_EDITS_COMMAND_ID,
// 	title: USE_PROMPT_IN_EDITS_LABEL,
// 	category: CHAT_CATEGORY,
// });

// // File editor context menu

// appendEditorTitleContextMenuItem(USE_PROMPT_COMMAND_ID, USE_PROMPT_LABEL.value, USE_PROMPT_WHEN_CONTEXT, '2_files', false, 0);

// // Menu registration - explorer

// MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
// 	group: 'navigation',
// 	order: 20,
// 	command: {
// 		id: USE_PROMPT_COMMAND_ID,
// 		title: USE_PROMPT_LABEL.value
// 	},
// 	when: USE_PROMPT_WHEN_CONTEXT
// });
