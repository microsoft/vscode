/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { ChatAgentLocation } from '../../../common/chatAgents.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { KeyMod, KeyCode } from '../../../../../../base/common/keyCodes.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { BasePromptParser } from '../../../common/promptSyntax/parsers/basePromptParser.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { appendToCommandPalette } from '../../../../files/browser/fileActions.contribution.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IActiveCodeEditor, isCodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { IChatUsePromptActionOptions, USE_PROMPT_ACTION_ID } from '../../actions/chatContextActions.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';

/**
 * TODO: @legomushroom
 *  - chat panel support
 *  - chat edits support
 *  - inline edits support
 *  - terminal support
 *  - notebooks support
 *  - make the shortcut configurable
 *  - what to do with the "current file" context when using a current file as a prompt?
 */

export const USE_PROMPT_COMMAND_ID = 'use-prompt';
const USE_PROMPT_LABEL = nls.localize2(USE_PROMPT_COMMAND_ID, "Use Prompt");

// import { Schemas } from '../../../../../../base/common/network.js';
// import { ResourceContextKey } from '../../../../../common/contextkeys.js';
// import { PROMPT_FILE_EXTENSION } from '../../../common/promptSyntax/constants.js';
// import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
// const USE_PROMPT_WHEN_CONTEXT = ContextKeyExpr.or(
// 	ResourceContextKey.Scheme.isEqualTo(Schemas.file),
// 	ResourceContextKey.Extension.isEqualTo(PROMPT_FILE_EXTENSION),
// );

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
 * Gets `URI` of a prompt file if it is an active editor instance.
 */
// TODO: @legomushroom - do we need to `getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));`?
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
	location?: ChatAgentLocation,
): Promise<void> => {
	const commandService = accessor.get(ICommandService);

	const options: IChatUsePromptActionOptions = {
		resource: getActivePromptUri(resource, accessor),
		location,
	};

	await commandService.executeCommand(USE_PROMPT_ACTION_ID, options);
};

const usePromptCommandFactory = (
	location: ChatAgentLocation,
) => {
	return async (
		accessor: ServicesAccessor,
		resource?: URI,
	): Promise<void> => {
		return await usePromptCommand(accessor, resource, location);
	};
};

// Key bindings

const USE_COMMAND_KEY_BINDINGS = KeyMod.Alt | KeyMod.Shift | KeyCode.KeyW;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: USE_COMMAND_KEY_BINDINGS,
	handler: usePromptCommand,
	when: ContextKeyExpr.and(
		ChatContextKeys.location.notEqualsTo(ChatAgentLocation.EditingSession),
		ChatContextKeys.location.notEqualsTo(ChatAgentLocation.Editor),
		ChatContextKeys.location.notEqualsTo(ChatAgentLocation.Panel),
		ChatContextKeys.location.notEqualsTo(ChatAgentLocation.Terminal),
		ChatContextKeys.location.notEqualsTo(ChatAgentLocation.Notebook),
	),
});

const USE_PROMPT_IN_EDITS_COMMAND_ID = `${USE_PROMPT_COMMAND_ID}.edits`;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_IN_EDITS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: USE_COMMAND_KEY_BINDINGS,
	handler: usePromptCommandFactory(ChatAgentLocation.EditingSession),
	when: ContextKeyExpr.and(
		ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditingSession),
	),
});

const USE_PROMPT_IN_PANEL_COMMAND_ID = `${USE_PROMPT_COMMAND_ID}.panel`;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_IN_PANEL_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: USE_COMMAND_KEY_BINDINGS,
	handler: usePromptCommandFactory(ChatAgentLocation.Panel),
	when: ContextKeyExpr.and(
		ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel),
	),
});

// TODO: @legomushroom - remove for now?
const USE_PROMPT_IN_TERMINAL_COMMAND_ID = `${USE_PROMPT_COMMAND_ID}.terminal`;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_IN_TERMINAL_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: USE_COMMAND_KEY_BINDINGS,
	handler: usePromptCommandFactory(ChatAgentLocation.Terminal),
	when: ContextKeyExpr.and(
		ChatContextKeys.location.isEqualTo(ChatAgentLocation.Terminal),
	),
});

const USE_PROMPT_IN_INLINE_EDITS_COMMAND_ID = `${USE_PROMPT_COMMAND_ID}.editor`;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_IN_INLINE_EDITS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: USE_COMMAND_KEY_BINDINGS,
	handler: usePromptCommandFactory(ChatAgentLocation.Editor),
	when: ContextKeyExpr.and(
		ChatContextKeys.location.isEqualTo(ChatAgentLocation.Editor),
	),
});

// TODO: @legomushroom - remove for now?
const USE_PROMPT_IN_NOTEBOOKS_COMMAND_ID = `${USE_PROMPT_COMMAND_ID}.editor`;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_IN_NOTEBOOKS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: USE_COMMAND_KEY_BINDINGS,
	handler: usePromptCommandFactory(ChatAgentLocation.Editor),
	when: ContextKeyExpr.and(
		ChatContextKeys.location.isEqualTo(ChatAgentLocation.Editor),
	),
});

// Command Palette

appendToCommandPalette({
	id: USE_PROMPT_COMMAND_ID,
	title: USE_PROMPT_LABEL,
	category: CHAT_CATEGORY,
});

// From an active chat input


// ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Panel)),


// TODO: @legomushroom - do we need this?
// // File editor context menu

// appendEditorTitleContextMenuItem(
// 	USE_PROMPT_COMMAND_ID,
// 	USE_PROMPT_LABEL.value,
// 	USE_PROMPT_WHEN_CONTEXT,
// 	'2_files',
// 	false,
// 	0,
// );

// TODO: @legomushroom - do we need this?
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
