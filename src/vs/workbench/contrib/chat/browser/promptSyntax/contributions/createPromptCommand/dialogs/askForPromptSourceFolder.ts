/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../nls.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { WithUriValue } from '../../../../../../../../base/common/types.js';
import { basename, extUri } from '../../../../../../../../base/common/resources.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { PROMPT_DOCUMENTATION_URL } from '../../../../../common/promptSyntax/constants.js';
import { IWorkspaceContextService } from '../../../../../../../../platform/workspace/common/workspace.js';
import { IPromptPath, IPromptsService, TPromptsType } from '../../../../../common/promptSyntax/service/types.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Options for {@link askForPromptSourceFolder} dialog.
 */
interface IAskForFolderOptions {

	readonly type: TPromptsType;
	readonly placeHolder: string;

	readonly labelService: ILabelService;
	readonly openerService: IOpenerService;
	readonly promptsService: IPromptsService;
	readonly quickInputService: IQuickInputService;
	readonly workspaceService: IWorkspaceContextService;
}

interface IFolderQuickPickItem extends IQuickPickItem {
	readonly folder: IPromptPath;
}

/**
 * Asks the user for a specific prompt folder, if multiple folders provided.
 * Returns immediately if only one folder available.
 */
export const askForPromptSourceFolder = async (
	options: IAskForFolderOptions,
): Promise<IPromptPath | undefined> => {
	const { type, placeHolder, promptsService, quickInputService, labelService, openerService, workspaceService } = options;

	// get prompts source folders based on the prompt type
	const folders = promptsService.getSourceFolders(type);

	// if no source folders found, show 'learn more' dialog
	// note! this is a temporary solution and must be replaced with a dialog to select
	//       a custom folder path, or switch to a different prompt type
	if (folders.length === 0) {
		return await showNoFoldersDialog(quickInputService, openerService);
	}

	// if there is only one folder, no need to ask
	// note! when we add more actions to the dialog, this will have to go
	if (folders.length === 1) {
		return folders[0];
	}

	const pickOptions: IPickOptions<IFolderQuickPickItem> = {
		placeHolder,
		canPickMany: false,
		matchOnDescription: true,
	};

	// create list of source folder locations
	const foldersList = folders.map<IFolderQuickPickItem>(folder => {
		const uri = folder.uri;
		if (folder.storage === 'user') {
			return {
				type: 'item',
				label: localize(
					'commands.prompts.create.source-folder.user',
					"User Data Folder",
				),
				description: labelService.getUriLabel(uri),
				tooltip: uri.fsPath,
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
				label: basename(uri),
				description: labelService.getUriLabel(uri, { relative: true }),
				tooltip: uri.fsPath,
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
			// use absolute path as the description
			description: labelService.getUriLabel(uri, { relative: false }),
			tooltip: uri.fsPath,
			folder,
		};
	});

	const answer = await quickInputService.pick(foldersList, pickOptions);
	if (!answer) {
		return;
	}

	return answer.folder;
};

/**
 * Shows a dialog to the user when no prompt source folders are found.
 *
 * Note! this is a temporary solution and must be replaced with a dialog to select
 *       a custom folder path, or switch to a different prompt type
 */
const showNoFoldersDialog = async (
	quickInputService: IQuickInputService,
	openerService: IOpenerService,
): Promise<undefined> => {
	const docsQuickPick: WithUriValue<IQuickPickItem> = {
		type: 'item',
		label: localize(
			'commands.prompts.create.ask-folder.empty.docs-label',
			'Learn how to configure reusable prompts',
		),
		description: PROMPT_DOCUMENTATION_URL,
		tooltip: PROMPT_DOCUMENTATION_URL,
		value: URI.parse(PROMPT_DOCUMENTATION_URL),
	};

	const result = await quickInputService.pick(
		[docsQuickPick],
		{
			placeHolder: localize(
				'commands.prompts.create.ask-folder.empty.placeholder',
				'No prompt source folders found.',
			),
			canPickMany: false,
		});

	if (!result) {
		return;
	}

	await openerService.open(result.value);

	return;
};
