/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../nls.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { WithUriValue } from '../../../../../../../../base/common/types.js';
import { basename } from '../../../../../../../../base/common/resources.js';
import { DOCUMENTATION_URL } from '../../../../../common/promptSyntax/constants.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { IPrompt, IPromptsService } from '../../../../../common/promptSyntax/service/types.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Utility to create {@link IQuickPickItem}s for a provided prompt locations.
 */
const asLocationPickItem = (
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
 * Shows a dialog to the user when no prompt locations are found.
 *
 * Note! this is a temporary solution and must be replaced with a dialog to select
 *       a custom folder location, or switch to a different prompts "source" type
 */
const showNoLocationsDialog = async (
	quickInputService: IQuickInputService,
	openerService: IOpenerService,
): Promise<undefined> => {
	const docsQuickPick: WithUriValue<IQuickPickItem> = {
		type: 'item',
		label: localize(
			'commands.prompts.create.ask-location.no-locations-found.learn-more',
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
				'commands.prompts.create.ask-location.no-locations-found.placeholder',
				'No prompt locations found.',
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
 * Asks the user for a prompt location, if multiple locations provided.
 * Returns immediately if only one location is provided.
 *
 * @throws if no prompt locations are provided.
 */
export const askForPromptLocation = async (
	source: IPrompt['source'],
	promptsService: IPromptsService,
	quickInputService: IQuickInputService,
	labelService: ILabelService,
	openerService: IOpenerService,
): Promise<URI | undefined> => {
	const locations = promptsService.getPromptsLocation(source);

	// if no locations found, show 'learn more' dialog
	// note! this is a temporary solution and must be replaced with a dialog to select
	//       a custom folder location, or switch to a different prompts "source" type
	if (locations.length === 0) {
		return await showNoLocationsDialog(quickInputService, openerService);
	}

	// if there is only one location, return it
	if (locations.length === 1) {
		return locations[0].uri;
	}

	const pickOptions: IPickOptions<WithUriValue<IQuickPickItem>> = {
		placeHolder: localize(
			'commands.prompts.create.ask-location.placeholder',
			"Select a prompt location",
		),
		canPickMany: false,
		matchOnDescription: true,
	};

	const locationsList = locations.map(asLocationPickItem(labelService));

	const answer = await quickInputService.pick(locationsList, pickOptions);
	if (!answer) {
		return;
	}

	return answer.value;
};
