/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../../nls.js';
import { DELETE_BUTTON, EDIT_BUTTON } from '../constants.js';
import { assert } from '../../../../../../../../../base/common/assert.js';
import { WithUriValue } from '../../../../../../../../../base/common/types.js';
import { IFileService } from '../../../../../../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../../../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../../../../../../platform/dialogs/common/dialogs.js';
import { getCleanPromptName } from '../../../../../../../../../platform/prompts/common/constants.js';
import { IQuickPick, IQuickPickItem, IQuickPickItemButtonEvent } from '../../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Options for the {@link handleButtonClick} function.
 */
interface IHandleButtonClickOptions {
	quickPick: IQuickPick<WithUriValue<IQuickPickItem>>;
	fileService: IFileService;
	openerService: IOpenerService;
	dialogService: IDialogService;
}

/**
 * Handler for a button click event on a prompt file item in the prompt selection dialog.
 */
export async function handleButtonClick(
	options: IHandleButtonClickOptions,
	context: IQuickPickItemButtonEvent<WithUriValue<IQuickPickItem>>,
) {
	const { quickPick, openerService, fileService, dialogService } = options;
	const { item, button } = context;
	const { value } = item;

	// `edit` button was pressed, open the prompt file in editor
	if (button === EDIT_BUTTON) {
		return await openerService.open(value);
	}

	// `delete` button was pressed, delete the prompt file
	if (button === DELETE_BUTTON) {
		// sanity check to confirm our expectations
		assert(
			(quickPick.activeItems.length < 2),
			`Expected maximum one active item, got '${quickPick.activeItems.length}'.`,
		);

		const activeItem: WithUriValue<IQuickPickItem> | undefined = quickPick.activeItems[0];

		// sanity checks - prompt file exists and is not a folder
		const info = await fileService.stat(value);
		assert(
			info.isDirectory === false,
			`'${value.fsPath}' points to a folder.`,
		);

		// don't close the main prompt selection dialog by the confirmation dialog
		const previousIgnoreFocusOut = quickPick.ignoreFocusOut;
		quickPick.ignoreFocusOut = true;

		const filename = getCleanPromptName(value);
		const { confirmed } = await dialogService.confirm({
			message: localize(
				'commands.prompts.use.select-dialog.delete-prompt.confirm.message',
				"Are you sure you want to delete '{0}'?",
				filename,
			),
		});

		// restore the previous value of the `ignoreFocusOut` property
		quickPick.ignoreFocusOut = previousIgnoreFocusOut;

		// if prompt deletion was not confirmed, nothing to do
		if (!confirmed) {
			return;
		}

		// prompt deletion was confirmed so delete the prompt file
		await fileService.del(value);

		// remove the deleted prompt from the selection dialog list
		let removedIndex = -1;
		quickPick.items = quickPick.items.filter((option, index) => {
			if (option === item) {
				removedIndex = index;

				return false;
			}

			return true;
		});

		// if the deleted item was active item, find a new item to set as active
		if (activeItem && (activeItem === item)) {
			assert(
				removedIndex >= 0,
				'Removed item index must be a valid index.',
			);

			// we set the previous item as new active, or the next item
			// if removed prompt item was in the beginning of the list
			const newActiveItemIndex = Math.max(removedIndex - 1, 0);
			const newActiveItem: WithUriValue<IQuickPickItem> | undefined = quickPick.items[newActiveItemIndex];

			quickPick.activeItems = newActiveItem ? [newActiveItem] : [];
		}

		return;
	}

	throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
}
