/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUri, isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { localize } from '../../../../../../nls.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { PROMPT_DOCUMENTATION_URL, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';


interface IFolderQuickPickItem extends IQuickPickItem {
	readonly folder: IPromptPath;
}

/**
 * Asks the user for a specific prompt folder, if multiple folders provided.
 */
export async function askForPromptSourceFolder(
	accessor: ServicesAccessor,
	type: PromptsType,
	existingFolder?: URI | undefined,
	isMove: boolean = false,
): Promise<IPromptPath | undefined> {
	const quickInputService = accessor.get(IQuickInputService);
	const promptsService = accessor.get(IPromptsService);
	const labelService = accessor.get(ILabelService);
	const workspaceService = accessor.get(IWorkspaceContextService);

	// get prompts source folders based on the prompt type
	const folders = promptsService.getSourceFolders(type);

	// if no source folders found, show 'learn more' dialog
	// note! this is a temporary solution and must be replaced with a dialog to select
	//       a custom folder path, or switch to a different prompt type
	if (folders.length === 0) {
		await showNoFoldersDialog(accessor, type);
		return;
	}

	const pickOptions: IPickOptions<IFolderQuickPickItem> = {
		placeHolder: existingFolder ? getPlaceholderStringforMove(type, isMove) : getPlaceholderStringforNew(type),
		canPickMany: false,
		matchOnDescription: true,
	};

	// create list of source folder locations
	const foldersList = folders.map<IFolderQuickPickItem>(folder => {
		const uri = folder.uri;
		const detail = (existingFolder && isEqual(uri, existingFolder)) ? localize('current.folder', "Current Location") : undefined;
		if (folder.storage !== PromptsStorage.local) {
			return {
				type: 'item',
				label: promptsService.getPromptLocationLabel(folder),
				detail,
				tooltip: labelService.getUriLabel(uri),
				folder
			};
		}

		const { folders } = workspaceService.getWorkspace();
		const isMultirootWorkspace = (folders.length > 1);

		const firstFolder = folders[0];

		// if multi-root or empty workspace, or source folder `uri` does not point to
		// the root folder of a single-root workspace, return the default label and description
		if (isMultirootWorkspace || !firstFolder || !extUri.isEqual(firstFolder.uri, uri)) {
			return {
				type: 'item',
				label: labelService.getUriLabel(uri, { relative: true }),
				detail,
				tooltip: labelService.getUriLabel(uri),
				folder,
			};
		}

		// if source folder points to the root of this single-root workspace,
		// use appropriate label and description strings to prevent confusion
		return {
			type: 'item',
			label: localize(
				'commands.prompts.create.source-folder.current-workspace',
				"Current Workspace",
			),
			detail,
			tooltip: labelService.getUriLabel(uri),
			folder,
		};
	});

	const answer = await quickInputService.pick(foldersList, pickOptions);
	if (!answer) {
		return;
	}

	return answer.folder;
}

function getPlaceholderStringforNew(type: PromptsType): string {
	switch (type) {
		case PromptsType.instructions:
			return localize('workbench.command.instructions.create.location.placeholder', "Select a location to create the instructions file in...");
		case PromptsType.prompt:
			return localize('workbench.command.prompt.create.location.placeholder', "Select a location to create the prompt file in...");
		case PromptsType.agent:
			return localize('workbench.command.agent.create.location.placeholder', "Select a location to create the agent file in...");
		default:
			throw new Error('Unknown prompt type');
	}
}

function getPlaceholderStringforMove(type: PromptsType, isMove: boolean): string {
	if (isMove) {
		switch (type) {
			case PromptsType.instructions:
				return localize('instructions.move.location.placeholder', "Select a location to move the instructions file to...");
			case PromptsType.prompt:
				return localize('prompt.move.location.placeholder', "Select a location to move the prompt file to...");
			case PromptsType.agent:
				return localize('agent.move.location.placeholder', "Select a location to move the agent file to...");
			default:
				throw new Error('Unknown prompt type');
		}
	}
	switch (type) {
		case PromptsType.instructions:
			return localize('instructions.copy.location.placeholder', "Select a location to copy the instructions file to...");
		case PromptsType.prompt:
			return localize('prompt.copy.location.placeholder', "Select a location to copy the prompt file to...");
		case PromptsType.agent:
			return localize('agent.copy.location.placeholder', "Select a location to copy the agent file to...");
		default:
			throw new Error('Unknown prompt type');
	}
}

/**
 * Shows a dialog to the user when no prompt source folders are found.
 *
 * Note! this is a temporary solution and must be replaced with a dialog to select
 *       a custom folder path, or switch to a different prompt type
 */
async function showNoFoldersDialog(accessor: ServicesAccessor, type: PromptsType): Promise<void> {
	const quickInputService = accessor.get(IQuickInputService);
	const openerService = accessor.get(IOpenerService);

	const docsQuickPick: IQuickPickItem & { value: URI } = {
		type: 'item',
		label: getLearnLabel(type),
		description: PROMPT_DOCUMENTATION_URL,
		tooltip: PROMPT_DOCUMENTATION_URL,
		value: URI.parse(PROMPT_DOCUMENTATION_URL),
	};

	const result = await quickInputService.pick(
		[docsQuickPick],
		{
			placeHolder: getMissingSourceFolderString(type),
			canPickMany: false,
		});

	if (result) {
		await openerService.open(result.value);
	}
}

function getLearnLabel(type: PromptsType): string {
	switch (type) {
		case PromptsType.prompt:
			return localize('commands.prompts.create.ask-folder.empty.docs-label', 'Learn how to configure reusable prompts');
		case PromptsType.instructions:
			return localize('commands.instructions.create.ask-folder.empty.docs-label', 'Learn how to configure reusable instructions');
		case PromptsType.agent:
			return localize('commands.agent.create.ask-folder.empty.docs-label', 'Learn how to configure custom agents');
		default:
			throw new Error('Unknown prompt type');
	}
}

function getMissingSourceFolderString(type: PromptsType): string {
	switch (type) {
		case PromptsType.instructions:
			return localize('commands.instructions.create.ask-folder.empty.placeholder', 'No instruction source folders found.');
		case PromptsType.prompt:
			return localize('commands.prompts.create.ask-folder.empty.placeholder', 'No prompt source folders found.');
		case PromptsType.agent:
			return localize('commands.agent.create.ask-folder.empty.placeholder', 'No agent source folders found.');
		default:
			throw new Error('Unknown prompt type');
	}
}
