/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { ChatAgentLocation } from '../../../common/chatAgents.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ResourceContextKey } from '../../../../../common/contextkeys.js';
import { KeyMod, KeyCode } from '../../../../../../base/common/keyCodes.js';
import { PROMPT_FILE_EXTENSION } from '../../../common/promptSyntax/constants.js';
import { IListService } from '../../../../../../platform/list/browser/listService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { getMultiSelectedResources, IExplorerService } from '../../../../files/browser/files.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IChatUsePromptActionOptions, USE_PROMPT_ACTION_ID } from '../../actions/chatContextActions.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { appendEditorTitleContextMenuItem, appendToCommandPalette } from '../../../../files/browser/fileActions.contribution.js';

export const USE_PROMPT_COMMAND_ID = 'usePrompt';
const USE_PROMPT_LABEL = nls.localize2(USE_PROMPT_COMMAND_ID, "Use Prompt");
const USE_PROMPT_WHEN_CONTEXT = ContextKeyExpr.or(
	ResourceContextKey.Scheme.isEqualTo(Schemas.file),
	ResourceContextKey.Extension.isEqualTo(PROMPT_FILE_EXTENSION),
);

const USE_PROMPT_IN_EDITS_COMMAND_ID = 'usePromptInEdits';
const USE_PROMPT_IN_EDITS_LABEL = nls.localize2(USE_PROMPT_IN_EDITS_COMMAND_ID, "Use Prompt in Edits");

const handleUsePromptResource = async (
	location: ChatAgentLocation,
	accessor: ServicesAccessor,
	resource?: URI,
) => {
	const commandService = accessor.get(ICommandService);

	const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));

	const options: IChatUsePromptActionOptions = {
		resources,
		location,
	};

	await commandService.executeCommand(USE_PROMPT_ACTION_ID, options);
};

const usePromptCommand = async (
	location: ChatAgentLocation,
	accessor: ServicesAccessor,
	resource?: URI,
): Promise<void> => {
	if (resource) {
		return await handleUsePromptResource(location, accessor, resource);
	}

	const commandService = accessor.get(ICommandService);
	const options: IChatUsePromptActionOptions = {
		location,
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


const BASE_KEYS = KeyMod.CtrlCmd | KeyMod.Shift;
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: BASE_KEYS | KeyCode.KeyR,
	handler: usePromptCommandFactory(ChatAgentLocation.Panel),
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USE_PROMPT_IN_EDITS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: BASE_KEYS | KeyCode.KeyE,
	handler: usePromptCommandFactory(ChatAgentLocation.EditingSession),
});

// Command Palette

appendToCommandPalette({
	id: USE_PROMPT_COMMAND_ID,
	title: USE_PROMPT_LABEL,
	category: CHAT_CATEGORY,
});

appendToCommandPalette({
	id: USE_PROMPT_IN_EDITS_COMMAND_ID,
	title: USE_PROMPT_IN_EDITS_LABEL,
	category: CHAT_CATEGORY,
});

appendEditorTitleContextMenuItem(USE_PROMPT_COMMAND_ID, USE_PROMPT_LABEL.value, USE_PROMPT_WHEN_CONTEXT, '2_files', false, 0);

// Menu registration - explorer

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: 'navigation',
	order: 20,
	command: {
		id: USE_PROMPT_COMMAND_ID,
		title: USE_PROMPT_LABEL.value
	},
	when: USE_PROMPT_WHEN_CONTEXT
});
