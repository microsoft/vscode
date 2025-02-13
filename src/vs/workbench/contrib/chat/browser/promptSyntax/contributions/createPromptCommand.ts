/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { assert } from '../../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
// import { KeyMod, KeyCode } from '../../../../../../base/common/keyCodes.js';
import { basename, dirname } from '../../../../../../base/common/resources.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { PROMPT_FILE_EXTENSION } from '../../../common/promptSyntax/constants.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IPrompt, IPromptsService } from '../../../common/promptSyntax/service/types.js';
import { appendToCommandPalette } from '../../../../files/browser/fileActions.contribution.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';

// /**
//  * Keybinding of the command.
//  */
// const COMMAND_KEY_BINDING = KeyMod.Alt | KeyMod.Shift | KeyCode.KeyC; // TODO: @legomushroom - validate the keybinding more

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
const LOCAL_COMMAND_TITLE = localize('commands.prompts.create.title.local', "Create prompt (local)");

/**
 * Title of the 'create global prompt' command.
 */
const GLOBAL_COMMAND_TITLE = localize('commands.prompts.create.title.global', "Create prompt (global)");

/**
 * Asks the user for a prompt name.
 */
const askForPromptName = async (
	_source: IPrompt['source'],
	quickInputService: IQuickInputService,
): Promise<string | undefined> => {
	const result = await quickInputService.input(
		{
			placeHolder: localize(
				'commands.prompts.create.ask-name.placeholder',
				"Provide a prompt name",
				PROMPT_FILE_EXTENSION,
			),
		});

	if (!result) {
		return undefined;
	}

	const trimmedName = result.trim();
	if (!trimmedName) {
		return undefined;
	}

	// TODO: @legomushroom - handle other file extensions too?
	const cleanName = (trimmedName.endsWith(PROMPT_FILE_EXTENSION))
		? trimmedName
		: `${trimmedName}${PROMPT_FILE_EXTENSION}`;

	return cleanName;
};

/**
 * TODO: @legomushroom - reuse a common type
 * Type for an {@link IQuickPickItem} with its `value` property being a `URI`.
 */
type WithUriValue<T extends IQuickPickItem> = T & { value: URI };

/**
 * Utility to create {@link IQuickPickItem}s for a provided prompt locations.
 */
const asPickItem = (
	labelService: ILabelService,
): (({ uri }: IPrompt) => WithUriValue<IQuickPickItem>) => {
	return ({ uri }) => {
		// TODO: @legomushroom - fix multi-root workspace labels
		let label = basename(uri);
		let description = labelService.getUriLabel(uri, { relative: true, noPrefix: true });

		// if the resulting `fullPath` is empty, the location points to the root
		// of the current workspace, so use the appropriate label and description
		if (!description) {
			label = localize(
				'commands.prompts.create.location.current-workspace',
				"Current Workspace",
			);

			// use absolute path as the description
			description = labelService.getUriLabel(uri, { relative: false });
		}

		return {
			type: 'item',
			label,
			description,
			tooltip: uri.fsPath,
			value: uri,
		};
	};
};

/**
 * Asks the user for a prompt location, if multiple locations provided.
 * Returns immediately if only one location is provided.
 *
 * @throws if no prompt locations are provided.
 */
// TODO: @legomushroom - add "select different location" option for the "local" source; ask to "add to settings" after prompt was created in this location?
// TODO: @legomushroom - add "create location" option; ask to "add to settings" after prompt was created in this location?
const askForPromptLocation = async (
	source: IPrompt['source'],
	promptsService: IPromptsService,
	quickInputService: IQuickInputService,
	labelService: ILabelService,
): Promise<URI | undefined> => {
	const locations = promptsService.getPromptsLocation(source);

	// TODO: @legomushroom - add create/select location option instead
	assert(
		locations.length > 0,
		'No prompt locations found.',
	);

	// if there is only one location, return it
	if (locations.length === 1) {
		return locations[0].uri;
	}

	const pickOptions: IPickOptions<WithUriValue<IQuickPickItem>> = {
		placeHolder: localize(
			'commands.prompts.create.ask-location.placeholder',
			"Select a prompt location",
		), // TODO: @legomushroom - should include the selected "source" name in the placeholder?
		canPickMany: false,
		matchOnDescription: true,
	};

	// TODO: @legomushroom - sort so the more relevant locations appear first
	const locationsList = locations.map(asPickItem(labelService));

	const answer = await quickInputService.pick(locationsList, pickOptions);
	if (!answer) {
		return undefined;
	}

	return answer.value;
};

/**
 * The command implementation.
 */
const command = async (
	accessor: ServicesAccessor,
	source: IPrompt['source'],
): Promise<null> => {
	const fileService = accessor.get(IFileService);
	const labelService = accessor.get(ILabelService);
	const openerService = accessor.get(IOpenerService);
	const promptsService = accessor.get(IPromptsService);
	const quickInputService = accessor.get(IQuickInputService);

	const name = await askForPromptName(source, quickInputService);
	if (!name) {
		return null;
	}

	const location = await askForPromptLocation(source, promptsService, quickInputService, labelService);
	if (!location) {
		return null;
	}

	// TODO: @legomushroom - get real initial content
	// TODO: @legomushroom - localize the initial content
	const content = 'Add prompt contents..';
	const promptUri = await createPromptFile(
		name,
		location,
		content,
		fileService,
	);

	await openerService.open(promptUri);

	return null;
};

const commandFactory = (source: IPrompt['source']) => {
	return async (accessor: ServicesAccessor): Promise<null> => {
		return command(accessor, source);
	};
};

/**
 * TODO: @legomushroom
 */
const createPromptFile = async (
	promptName: string,
	location: URI,
	content: string,
	fileService: IFileService,
): Promise<URI> => {
	// TODO: @legomushroom - validate the prompt name
	const promptUri = URI.joinPath(location, promptName);

	// if a folder or file with the same name exists, throw an error
	if (await fileService.exists(promptUri)) {
		const promptInfo = await fileService.resolve(promptUri);

		// TODO: @legomushroom - localize the error messages
		if (promptInfo.isDirectory) {
			throw new Error(`Folder already exists at '${promptUri.fsPath}'.`);
		}

		throw new Error(`Prompt file '${promptUri.fsPath}' already exists.`);
	}

	// ensure the parent folder of the prompt file exists
	await fileService.createFolder(dirname(promptUri));

	// create the prompt file
	await fileService.createFile(promptUri, VSBuffer.fromString(content));

	return promptUri;
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
 * Register the "Create Local Prompt" command in the `command palette`.
 */
appendToCommandPalette(
	{
		id: LOCAL_COMMAND_ID,
		title: LOCAL_COMMAND_TITLE,
		category: CHAT_CATEGORY,
	},
);

/**
 * Register the "Create Global Prompt" command in the `command palette`.
 */
appendToCommandPalette(
	{
		id: GLOBAL_COMMAND_ID,
		title: GLOBAL_COMMAND_TITLE,
		category: CHAT_CATEGORY,
	},
);
