/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { createPromptFile } from './utils/createPromptFile.js';
import { CHAT_CATEGORY } from '../../../actions/chatActions.js';
import { askForPromptName } from './dialogs/askForPromptName.js';
import { askForPromptSourceFolder } from './dialogs/askForPromptSourceFolder.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { IPromptPath, IPromptsService } from '../../../../common/promptSyntax/service/types.js';
import { appendToCommandPalette } from '../../../../../files/browser/fileActions.contribution.js';
import { IQuickInputService } from '../../../../../../../platform/quickinput/common/quickInput.js';
import { ServicesAccessor } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../../platform/keybinding/common/keybindingsRegistry.js';

/**
 * Base command ID prefix.
 */
const BASE_COMMAND_ID = 'workbench.command.prompts.create';

/**
 * Command ID for creating a 'local' prompt.
 */
const LOCAL_COMMAND_ID = `${BASE_COMMAND_ID}.local`;

/**
 * Command ID for creating a 'global' prompt.
 */
const GLOBAL_COMMAND_ID = `${BASE_COMMAND_ID}.global`;

/**
 * Title of the 'create local prompt' command.
 */
const LOCAL_COMMAND_TITLE = localize('commands.prompts.create.title.local', "Create prompt");

/**
 * Title of the 'create global prompt' command.
 */
const GLOBAL_COMMAND_TITLE = localize('commands.prompts.create.title.global', "Create prompt (global)");

/**
 * The command implementation.
 */
const command = async (
	accessor: ServicesAccessor,
	type: IPromptPath['type'],
): Promise<void> => {
	const fileService = accessor.get(IFileService);
	const labelService = accessor.get(ILabelService);
	const openerService = accessor.get(IOpenerService);
	const promptsService = accessor.get(IPromptsService);
	const quickInputService = accessor.get(IQuickInputService);
	const workspaceService = accessor.get(IWorkspaceContextService);

	const fileName = await askForPromptName(type, quickInputService);
	if (!fileName) {
		return;
	}

	const selectedFolder = await askForPromptSourceFolder({
		type: type,
		labelService,
		openerService,
		promptsService,
		workspaceService,
		quickInputService,
	});

	if (!selectedFolder) {
		return;
	}

	const content = localize(
		'workbench.command.prompts.create.initial-content',
		"Add prompt contents..",
	);
	const promptUri = await createPromptFile({
		fileName,
		folder: selectedFolder,
		content,
		fileService,
	});

	await openerService.open(promptUri);
};

/**
 * Factory for creating the command handler with specific prompt `type`.
 */
const commandFactory = (type: 'local' | 'global') => {
	return async (accessor: ServicesAccessor): Promise<void> => {
		return command(accessor, type);
	};
};

/**
 * Register the "Create Local Prompt" command.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: LOCAL_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	handler: commandFactory('local'),
});

/**
 * Register the "Create Global Prompt" command.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: GLOBAL_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	handler: commandFactory('global'),
});

/**
 * Register the "Create Local Prompt" command in the command palette.
 */
appendToCommandPalette(
	{
		id: LOCAL_COMMAND_ID,
		title: LOCAL_COMMAND_TITLE,
		category: CHAT_CATEGORY,
	},
);

/**
 * Register the "Create Global Prompt" command in the command palette.
 */
appendToCommandPalette(
	{
		id: GLOBAL_COMMAND_ID,
		title: GLOBAL_COMMAND_TITLE,
		category: CHAT_CATEGORY,
	},
);
