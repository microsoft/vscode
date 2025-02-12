/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget } from '../../chat.js';
import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isLinux, isWindows } from '../../../../../../base/common/platform.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { basename, dirname, extUri } from '../../../../../../base/common/resources.js';
import { PromptFilesLocator } from '../../../common/promptSyntax/utils/promptFilesLocator.js';
import { DOCUMENTATION_URL, PROMPT_FILE_EXTENSION } from '../../../common/promptSyntax/constants.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Type for an {@link IQuickPickItem} with its `value` property being a `URI`.
 */
type WithUriValue<T extends IQuickPickItem> = T & { value: URI };

/**
 * Options for the {@link showSelectPromptDialog} function.
 */
export interface ISelectPromptOptions {
	/**
	 * Prompt resource `URI` to attach to the chat input, if any.
	 * If provided the resource will be pre-selected in the prompt picker dialog,
	 * otherwise the dialog will show the prompts list without any pre-selection.
	 */
	resource?: URI;

	/**
	 * Target chat widget reference to attach the prompt to. If not provided, the command
	 * attaches the prompt to a `chat panel` widget by default (either the last focused,
	 * or a new one). If the `alt` (`option` on mac) key was pressed when the prompt is
	 * selected, the `edits` widget is used instead (likewise, either the last focused,
	 * or a new one).
	 */
	widget?: IChatWidget;

	labelService: ILabelService;
	openerService: IOpenerService;
	initService: IInstantiationService;
	quickInputService: IQuickInputService;
}

/**
 * Result of user interaction with the prompt selection dialog.
 */
interface IPromptSelectionResult {
	/**
	 * Selected prompt item in the dialog.
	 */
	selected: WithUriValue<IQuickPickItem>;

	/**
	 * Whether the `alt` (`option` on mac) key was pressed when
	 * the prompt selection was made.
	 */
	altOption: boolean;
}

/**
 * Creates a quick pick item for a prompt.
 */
const createPickItem = (
	promptUri: URI,
	labelService: ILabelService,
): WithUriValue<IQuickPickItem> => {
	const fileBasename = basename(promptUri);
	const fileWithoutExtension = fileBasename.replace(PROMPT_FILE_EXTENSION, '');

	return {
		type: 'item',
		label: fileWithoutExtension,
		description: labelService.getUriLabel(dirname(promptUri), { relative: true }),
		tooltip: promptUri.fsPath,
		value: promptUri,
	};
};

/**
 * Creates a placeholder text to show in the prompt selection dialog.
 */
const createPlaceholderText = (widget?: IChatWidget): string => {
	let text = localize('selectPromptPlaceholder', 'Select a prompt to use');

	// if no widget reference is provided, add the note about
	// the `alt`/`option` key modifier users can use
	if (!widget) {
		const key = (isWindows || isLinux) ? 'alt' : 'option';

		text += ' ' + localize('selectPromptPlaceholder.holdAltOption', '(hold `{0}` to use in Edits)', key);
	}

	return text;
};

/**
 * Shows a prompt selection dialog to the user and waits for a selection.
 *
 * If {@link ISelectPromptOptions.resource resource} is provided, the dialog will have
 * the resource pre-selected in the prompts list.
 */
export const showSelectPromptDialog = async (
	options: ISelectPromptOptions,
): Promise<IPromptSelectionResult | null> => {
	const { resource, initService, labelService } = options;
	const promptsLocator = initService.createInstance(PromptFilesLocator);

	// find all prompt instruction files in the user workspace
	// and present them to the user so they can select one
	const files = await promptsLocator.listFiles([])
		.then((files) => {
			return files.map((file) => {
				return createPickItem(file, labelService);
			});
		});

	const { quickInputService, openerService } = options;

	// if not prompt files found, render the "how to add" message
	// to the user with a link to the documentation
	if (files.length === 0) {
		const docsQuickPick: WithUriValue<IQuickPickItem> = {
			type: 'item',
			label: localize('noPromptFilesFoundTooltipLabel', 'Learn how to create reusable prompts'),
			description: DOCUMENTATION_URL,
			tooltip: DOCUMENTATION_URL,
			value: URI.parse(DOCUMENTATION_URL),
		};

		const result = await quickInputService.pick(
			[docsQuickPick],
			{
				placeHolder: localize('noPromptFilesFoundLabel', 'No prompts found.'),
				canPickMany: false,
			});

		if (!result) {
			return null;
		}

		await openerService.open(result.value);

		return null;
	}

	// if a resource is provided, create an `activeItem` for it to pre-select
	// it in the UI, and sort the list so the active item appears at the top
	let activeItem: WithUriValue<IQuickPickItem> | undefined;
	if (resource) {
		activeItem = files.find((file) => {
			return extUri.isEqual(file.value, resource);
		});

		files.sort((file1, file2) => {
			if (extUri.isEqual(file1.value, resource)) {
				return -1;
			}

			if (extUri.isEqual(file2.value, resource)) {
				return 1;
			}

			return 0;
		});
	}

	// otherwise show the prompt file selection dialog
	const { widget } = options;
	const pickOptions: IPickOptions<WithUriValue<IQuickPickItem>> = {
		placeHolder: createPlaceholderText(widget),
		activeItem,
		canPickMany: false,
		matchOnDescription: true,
	};

	// keep track of whether the `alt` (`option` on mac) key is
	// pressed when a prompt item is selected in the dialog
	let altOption = false;
	if (!location) {
		pickOptions.onKeyMods = (keyMods) => {
			if (keyMods.alt) {
				altOption = true;
			}
		};
	}

	const maybeSelectedFile = await quickInputService.pick(files, pickOptions);

	// if user cancels the dialog, return `null` instead
	if (!maybeSelectedFile) {
		return null;
	}

	return {
		selected: maybeSelectedFile,
		altOption,
	};
};
