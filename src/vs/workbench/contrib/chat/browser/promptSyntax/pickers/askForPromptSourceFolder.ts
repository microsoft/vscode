/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { PROMPT_DOCUMENTATION_URL, PromptsType, getSourceDescription } from '../../../common/promptSyntax/promptTypes.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';


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
	const instantiationService = accessor.get(IInstantiationService);
	const quickInputService = accessor.get(IQuickInputService);
	const promptsService = accessor.get(IPromptsService);
	const labelService = accessor.get(ILabelService);
	const workspaceService = accessor.get(IWorkspaceContextService);

	// get resolved source folders with full metadata (source, isDefault, displayPath)
	const resolvedFolders = await promptsService.getResolvedSourceFolders(type);

	// if no source folders found, show 'learn more' dialog
	// note! this is a temporary solution and must be replaced with a dialog to select
	//       a custom folder path, or switch to a different prompt type
	if (resolvedFolders.length === 0) {
		await instantiationService.invokeFunction(accessor => showNoFoldersDialog(accessor, type));
		return;
	}

	const pickOptions: IPickOptions<IFolderQuickPickItem> = {
		placeHolder: existingFolder ? getPlaceholderStringforMove(type, isMove) : getPlaceholderStringforNew(type),
		canPickMany: false,
		matchOnDescription: true,
	};

	// The first folder in the resolved list is the default for new files
	const defaultFolder = !existingFolder ? resolvedFolders[0] : undefined;

	const { folders: workspaceFolders } = workspaceService.getWorkspace();
	const isMultiRoot = workspaceFolders.length > 1;

	// create list of source folder locations
	const foldersList = resolvedFolders.map<IFolderQuickPickItem>(resolved => {
		const folderUri = resolved.parent;
		const isDefault = defaultFolder && isEqual(folderUri, defaultFolder.parent);
		const sourceDescription = getSourceDescription(resolved.source);
		const detail = (existingFolder && isEqual(folderUri, existingFolder)) ? localize('current.folder', "Current Location") : undefined;

		// In multi-root workspaces, use workspace-relative labels (which include
		// the workspace folder name prefix). Otherwise use displayPath.
		const basePath = (isMultiRoot && resolved.storage === PromptsStorage.local)
			? labelService.getUriLabel(folderUri, { relative: true })
			: resolved.displayPath ?? labelService.getUriLabel(folderUri, { relative: resolved.storage === PromptsStorage.local });
		const label = isDefault ? localize('pathWithDefault', "{0} (default)", basePath) : basePath;

		const folder: IPromptPath = { uri: folderUri, storage: resolved.storage, type };

		return {
			type: 'item' as const,
			label,
			description: sourceDescription,
			detail,
			tooltip: labelService.getUriLabel(folderUri),
			picked: isDefault,
			folder,
		};
	});

	// In multi-root workspaces, sort so items from the same workspace folder
	// are grouped together instead of being interleaved by source type.
	if (isMultiRoot) {
		const getWorkspaceFolderIndex = (uri: URI, storage: PromptsStorage): number => {
			if (storage !== PromptsStorage.local) {
				return workspaceFolders.length; // global items go last
			}
			const wsFolder = workspaceService.getWorkspaceFolder(uri);
			return wsFolder?.index ?? workspaceFolders.length;
		};

		foldersList.sort((a, b) => {
			const aIndex = getWorkspaceFolderIndex(a.folder.uri, a.folder.storage);
			const bIndex = getWorkspaceFolderIndex(b.folder.uri, b.folder.storage);
			return aIndex - bIndex;
		});
	}

	const answer = await quickInputService.pick(foldersList, pickOptions);
	if (!answer) {
		return;
	}

	return answer.folder;
}

function getPlaceholderStringforNew(type: PromptsType): string {
	switch (type) {
		case PromptsType.instructions:
			return localize('workbench.command.instructions.create.location.placeholder', "Select a location to create the instructions file");
		case PromptsType.prompt:
			return localize('workbench.command.prompt.create.location.placeholder', "Select a location to create the prompt file");
		case PromptsType.agent:
			return localize('workbench.command.agent.create.location.placeholder', "Select a location to create the agent file");
		case PromptsType.skill:
			return localize('workbench.command.skill.create.location.placeholder', "Select a location to create the skill");
		case PromptsType.hook:
			return localize('workbench.command.hook.create.location.placeholder', "Select a location to create the hook file");
		default:
			throw new Error('Unknown prompt type');
	}
}

function getPlaceholderStringforMove(type: PromptsType, isMove: boolean): string {
	if (isMove) {
		switch (type) {
			case PromptsType.instructions:
				return localize('instructions.move.location.placeholder', "Select a location to move the instructions file to");
			case PromptsType.prompt:
				return localize('prompt.move.location.placeholder', "Select a location to move the prompt file to");
			case PromptsType.agent:
				return localize('agent.move.location.placeholder', "Select a location to move the agent file to");
			case PromptsType.skill:
				return localize('skill.move.location.placeholder', "Select a location to move the skill to");
			case PromptsType.hook:
				throw new Error('Hooks cannot be moved');
			default:
				throw new Error('Unknown prompt type');
		}
	}
	switch (type) {
		case PromptsType.instructions:
			return localize('instructions.copy.location.placeholder', "Select a location to copy the instructions file to");
		case PromptsType.prompt:
			return localize('prompt.copy.location.placeholder', "Select a location to copy the prompt file to");
		case PromptsType.agent:
			return localize('agent.copy.location.placeholder', "Select a location to copy the agent file to");
		case PromptsType.skill:
			return localize('skill.copy.location.placeholder', "Select a location to copy the skill to");
		case PromptsType.hook:
			throw new Error('Hooks cannot be copied');
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
		case PromptsType.skill:
			return localize('commands.skill.create.ask-folder.empty.docs-label', 'Learn how to configure skills');
		case PromptsType.hook:
			return localize('commands.hook.create.ask-folder.empty.docs-label', 'Learn how to configure hooks');
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
		case PromptsType.skill:
			return localize('commands.skill.create.ask-folder.empty.placeholder', 'No skill source folders found.');
		case PromptsType.hook:
			return localize('commands.hook.create.ask-folder.empty.placeholder', 'No hook source folders found.');
		default:
			throw new Error('Unknown prompt type');
	}
}
