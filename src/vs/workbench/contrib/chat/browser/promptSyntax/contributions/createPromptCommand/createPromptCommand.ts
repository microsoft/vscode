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
import { PromptsConfig } from '../../../../../../../platform/prompts/common/config.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
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
 * Command ID for creating a 'user' prompt.
 */
const USER_COMMAND_ID = `${BASE_COMMAND_ID}.user`;

/**
 * Title of the 'create local prompt' command.
 */
const LOCAL_COMMAND_TITLE = localize('commands.prompts.create.title.local', "Create Prompt");

/**
 * Title of the 'create user prompt' command.
 */
const USER_COMMAND_TITLE = localize('commands.prompts.create.title.user', "Create User Prompt");

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
	const commandService = accessor.get(ICommandService);
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
		commandService,
	});

	await openerService.open(promptUri);
};

/**
 * Factory for creating the command handler with specific prompt `type`.
 */
const commandFactory = (type: 'local' | 'user') => {
	return async (accessor: ServicesAccessor): Promise<void> => {
		return command(accessor, type);
	};
};

/**
 * Register the "Create Prompt" command.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: LOCAL_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	handler: commandFactory('local'),
	when: PromptsConfig.enabledCtx,
});

/**
 * Register the "Create User Prompt" command.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: USER_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	handler: commandFactory('user'),
	when: PromptsConfig.enabledCtx,
});

/**
 * Register the "Create Prompt" command in the command palette.
 */
appendToCommandPalette(
	{
		id: LOCAL_COMMAND_ID,
		title: LOCAL_COMMAND_TITLE,
		category: CHAT_CATEGORY,
	},
	PromptsConfig.enabledCtx,
);

/**
 * Register the "Create User Prompt" command in the command palette.
 */
appendToCommandPalette(
	{
		id: USER_COMMAND_ID,
		title: USER_COMMAND_TITLE,
		category: CHAT_CATEGORY,
	},
	PromptsConfig.enabledCtx,
);
