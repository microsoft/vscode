/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../nls.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { basename } from '../../../../../../../../base/common/resources.js';
import { WithUriValue } from '../../../../../../../../base/common/types.js';
import { DOCUMENTATION_URL } from '../../../../../common/promptSyntax/constants.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { IPromptPath, IPromptsService } from '../../../../../common/promptSyntax/service/types.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Utility to create {@link IQuickPickItem}s for a provided prompt source folders.
 */
const asFolderListItem = (
	labelService: ILabelService,
): (({ uri }: IPromptPath) => WithUriValue<IQuickPickItem>) => {
	return ({ uri }) => {
		// TODO: @legomushroom - fix multi-root workspace labels
		let label = basename(uri);
		let description = labelService.getUriLabel(uri, { relative: true, noPrefix: true });

		// if the resulting `fullPath` is empty, the folder points to the root
		// of the current workspace, so use the appropriate label and description
		if (!description) {
			label = localize(
				'commands.prompts.create.source-folder.current-workspace',
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
			'commands.prompts.create.ask-folder.no-folders-found.learn-more',
			'Learn how to configure reusable prompts',
		),
		description: DOCUMENTATION_URL,
		tooltip: DOCUMENTATION_URL,
		value: URI.parse(DOCUMENTATION_URL),
	};

	const result = await quickInputService.pick(
		[docsQuickPick],
		{
			placeHolder: localize(
				'commands.prompts.create.ask-folder.no-folders-found.placeholder',
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

/**
 * Options for {@link askForPromptFolder} dialog.
 */
interface IAskForPromptFolderOptions {
	/**
	 * Prompt type.
	 */
	readonly type: 'local' | 'global';

	readonly labelService: ILabelService;
	readonly openerService: IOpenerService;
	readonly promptsService: IPromptsService;
	readonly quickInputService: IQuickInputService;
}

/**
 * Asks the user for a specific prompt folder, if multiple folders provided.
 * Returns immediately if only one folder available.
 */
export const askForPromptFolder = async (
	options: IAskForPromptFolderOptions,
): Promise<URI | undefined> => {
	const { type, promptsService, quickInputService, labelService, openerService } = options;

	// get prompts source folders based on the prompt type
	const folders = promptsService.getSourceFolders(type);

	// if no source folders found, show 'learn more' dialog
	// note! this is a temporary solution and must be replaced with a dialog to select
	//       a custom folder path, or switch to a different prompt type
	if (folders.length === 0) {
		return await showNoFoldersDialog(quickInputService, openerService);
	}

	// if there is only one folder, no need to ask
	if (folders.length === 1) {
		return folders[0].uri;
	}

	const pickOptions: IPickOptions<WithUriValue<IQuickPickItem>> = {
		placeHolder: localize(
			'commands.prompts.create.ask-folder.placeholder',
			"Select a prompt source folder",
		),
		canPickMany: false,
		matchOnDescription: true,
	};

	const foldersList = folders.map(asFolderListItem(labelService));

	const answer = await quickInputService.pick(foldersList, pickOptions);
	if (!answer) {
		return;
	}

	return answer.value;
};
