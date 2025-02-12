/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { assert } from '../../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { KeyMod, KeyCode } from '../../../../../../base/common/keyCodes.js';
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

/**
 * Keybinding of the command.
 */
const COMMAND_KEY_BINDING = KeyMod.Alt | KeyMod.Shift | KeyCode.KeyC; // TODO: @legomushroom - validate the keybinding more

/**
 * ID of the command.
 */
const COMMAND_ID = 'create-prompt';

/**
 * Title of the command.
 */
const COMMAND_TITLE = localize('commands.prompts.create.name', "Create Prompt");

/**
 * Asks the user for a prompt name.
 */
const askForPromptName = async (
	quickInputService: IQuickInputService,
): Promise<string | undefined> => {
	const result = await quickInputService.input(
		{
			placeHolder: localize(
				'commands.prompts.create.ask-name.placeholder',
				"{0}: Provide a prompt name",
				COMMAND_TITLE,
			),
		});

	if (!result) {
		return undefined;
	}

	const trimmedName = result.trim();
	if (!trimmedName) {
		// TODO: @legomushroom - show warning message?
		return undefined;
	}

	// TODO: @legomushroom - handle other file extensions too
	const cleanName = (trimmedName.endsWith(PROMPT_FILE_EXTENSION))
		? trimmedName
		: `${trimmedName}${PROMPT_FILE_EXTENSION}`;

	return cleanName;
};

/**
 * TODO: @legomushroom - reuse a common one
 * Type for an {@link IQuickPickItem} with its `value` property being a `URI`.
 */
type WithUriValue<T extends IQuickPickItem> = T & { value: URI };

/**
 * Creates a {@link IQuickPickItem} for a prompt location.
 */
const createLocationPickItem = (
	{ uri }: IPrompt,
	labelService: ILabelService,
): WithUriValue<IQuickPickItem> => {
	const fileBasename = basename(uri);
	const fileWithoutExtension = fileBasename.replace(PROMPT_FILE_EXTENSION, '');

	return {
		type: 'item',
		label: fileWithoutExtension,
		description: labelService.getUriLabel(uri, { relative: true }),
		tooltip: uri.fsPath,
		value: uri,
	};
};

/**
 * Asks the user for a prompt location, if multiple locations provided.
 * Returns immediately if only one location is provided.
 *
 * @throws if no prompt locations are provided.
 */
const askForPromptLocation = async (
	promptLocations: readonly IPrompt[],
	quickInputService: IQuickInputService,
	labelService: ILabelService,
): Promise<URI | undefined> => {
	assert(
		promptLocations.length > 0,
		'No prompt locations found.',
	);

	// if there is only one location, return it
	if (promptLocations.length === 1) {
		return promptLocations[0].uri;
	}

	const pickOptions: IPickOptions<WithUriValue<IQuickPickItem>> = {
		placeHolder: localize(
			'commands.prompts.create.ask-location.placeholder',
			"{0}: Select a prompt location",
			COMMAND_TITLE,
		), // TODO: @legomushroom - should include the selected "source" name in the placeholder?
		canPickMany: false,
		matchOnDescription: true,
	};

	const locations = promptLocations.map((location) => {
		return createLocationPickItem(location, labelService);
	});

	const answer = await quickInputService.pick(locations, pickOptions);
	if (!answer) {
		return undefined;
	}

	return answer.value;
};

/**
 * TODO: @legomushroom
 */
const createPromptCommand = async (
	accessor: ServicesAccessor,
): Promise<null> => {
	const fileService = accessor.get(IFileService);
	const labelService = accessor.get(ILabelService);
	const openerService = accessor.get(IOpenerService);
	const promptsService = accessor.get(IPromptsService);
	const quickInputService = accessor.get(IQuickInputService);

	const promptName = await askForPromptName(quickInputService);
	if (!promptName) {
		return null;
	}

	// TODO: @legomushroom - receive locations as this function parameter instead
	let promptLocations: readonly IPrompt[] | undefined;
	if (!promptLocations) {
		promptLocations = promptsService.getPromptsLocation('global');
	}

	const promptLocation = await askForPromptLocation(promptLocations, quickInputService, labelService);
	if (!promptLocation) {
		return null;
	}

	// TODO: @legomushroom - get real initial content
	// TODO: @legomushroom - localize the initial content
	const promptContent = 'Add prompt contents..';
	const promptUri = await createPromptFile(
		promptName,
		promptLocation,
		promptContent,
		fileService,
	);

	await openerService.open(promptUri);

	return null;
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
 * Register the "Create Prompt" command with its keybinding.
 */
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: COMMAND_KEY_BINDING,
	handler: createPromptCommand,
});

/**
 * Register the "Create Prompt" command in the `command palette`.
 */
appendToCommandPalette(
	{
		id: COMMAND_ID,
		title: COMMAND_TITLE,
		category: CHAT_CATEGORY,
	},
);
