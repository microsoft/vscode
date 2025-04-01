/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DOCS_OPTION } from './constants.js';
import { IChatWidget } from '../../../../chat.js';
import { attachPrompts } from './utils/attachPrompts.js';
import { handleButtonClick } from './utils/handleButtonClick.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { IChatService } from '../../../../../common/chatService.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { createPromptPickItem } from './utils/createPromptPickItem.js';
import { createPlaceholderText } from './utils/createPlaceholderText.js';
import { extUri } from '../../../../../../../../base/common/resources.js';
import { WithUriValue } from '../../../../../../../../base/common/types.js';
import { IPromptPath } from '../../../../../common/promptSyntax/service/types.js';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { IViewsService } from '../../../../../../../services/views/common/viewsService.js';
import { IDialogService } from '../../../../../../../../platform/dialogs/common/dialogs.js';
import { ICommandService } from '../../../../../../../../platform/commands/common/commands.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Options for the {@link askToSelectPrompt} function.
 */
export interface ISelectPromptOptions {
	/**
	 * Prompt resource `URI` to attach to the chat input, if any.
	 * If provided the resource will be pre-selected in the prompt picker dialog,
	 * otherwise the dialog will show the prompts list without any pre-selection.
	 */
	readonly resource?: URI;

	/**
	 * Target chat widget reference to attach the prompt to. If not provided, the command
	 * attaches the prompt to a `chat panel` widget by default (either the last focused,
	 * or a new one). If the `alt` (`option` on mac) key was pressed when the prompt is
	 * selected, the `edits` widget is used instead (likewise, either the last focused,
	 * or a new one).
	 */
	readonly widget?: IChatWidget;

	/**
	 * List of prompt files to show in the selection dialog.
	 */
	readonly promptFiles: readonly IPromptPath[];

	readonly fileService: IFileService;
	readonly chatService: IChatService;
	readonly labelService: ILabelService;
	readonly viewsService: IViewsService;
	readonly openerService: IOpenerService;
	readonly dialogService: IDialogService;
	readonly commandService: ICommandService;
	readonly quickInputService: IQuickInputService;
}

/**
 * Shows the prompt selection dialog to the user that allows to select a prompt file(s).
 *
 * If {@link ISelectPromptOptions.resource resource} is provided, the dialog will have
 * the resource pre-selected in the prompts list.
 */
export const askToSelectPrompt = async (
	options: ISelectPromptOptions,
): Promise<void> => {
	const { promptFiles, resource, quickInputService, labelService } = options;

	const fileOptions = promptFiles.map((promptFile) => {
		return createPromptPickItem(promptFile, labelService);
	});

	/**
	 * Add a link to the documentation to the end of prompts list.
	 */
	fileOptions.push(DOCS_OPTION);

	// if a resource is provided, create an `activeItem` for it to pre-select
	// it in the UI, and sort the list so the active item appears at the top
	let activeItem: WithUriValue<IQuickPickItem> | undefined;
	if (resource) {
		activeItem = fileOptions.find((file) => {
			return extUri.isEqual(file.value, resource);
		});

		// if no item for the `resource` was found, it means that the resource is not
		// in the list of prompt files, so add a new item for it; this ensures that
		// the currently active prompt file is always available in the selection dialog,
		// even if it is not included in the prompts list otherwise(from location setting)
		if (!activeItem) {
			activeItem = createPromptPickItem({
				uri: resource,
				// "user" prompts are always registered in the prompts list, hence it
				// should be safe to assume that `resource` is not "user" prompt here
				type: 'local',
			}, labelService);
			fileOptions.push(activeItem);
		}

		fileOptions.sort((file1, file2) => {
			if (extUri.isEqual(file1.value, resource)) {
				return -1;
			}

			if (extUri.isEqual(file2.value, resource)) {
				return 1;
			}

			return 0;
		});
	}

	/**
	 * If still no active item present, fall back to the first item in the list.
	 * This can happen only if command was invoked not from a focused prompt file
	 * (hence the `resource` is not provided in the options).
	 *
	 * Fixes the two main cases:
	 *  - when no prompt files found it, pre-selects the documentation link
	 *  - when there is only a single prompt file, pre-selects it
	 */
	if (!activeItem) {
		activeItem = fileOptions[0];
	}

	// otherwise show the prompt file selection dialog
	const quickPick = quickInputService.createQuickPick<WithUriValue<IQuickPickItem>>();
	quickPick.activeItems = activeItem ? [activeItem] : [];
	quickPick.placeholder = createPlaceholderText(options);
	quickPick.canAcceptInBackground = true;
	quickPick.matchOnDescription = true;
	quickPick.items = fileOptions;

	const { openerService } = options;
	return await new Promise<void>(resolve => {
		const disposables = new DisposableStore();

		let lastActiveWidget = options.widget;

		// then the dialog is hidden or disposed for other reason,
		// dispose everything and resolve the main promise
		disposables.add({
			dispose() {
				quickPick.dispose();
				resolve();
				// if something was attached (lastActiveWidget is set), focus on the target chat input
				lastActiveWidget?.focusInput();
			},
		});

		// handle the prompt `accept` event
		disposables.add(quickPick.onDidAccept(async (event) => {
			const { selectedItems } = quickPick;

			// sanity check to confirm our expectations
			assert(
				selectedItems.length === 1,
				`Only one item can be accepted, got '${selectedItems.length}'.`,
			);

			const selectedOption = selectedItems[0];

			// whether user selected the docs link option
			const docsSelected = (selectedOption === DOCS_OPTION);

			// if documentation item was selected, open its link in a browser
			if (docsSelected) {
				// note that opening a file in editor also hides(disposes) the dialog
				await openerService.open(selectedOption.value);
				return;
			}

			// otherwise attach the selected prompt to a chat input
			lastActiveWidget = await attachPrompts(selectedItems, options, quickPick.keyMods);

			// if user submitted their selection, close the dialog
			if (!event.inBackground) {
				disposables.dispose();
			}
		}));

		// handle the `button click` event on a list item (edit, delete, etc.)
		disposables.add(quickPick.onDidTriggerItemButton(
			handleButtonClick.bind(null, { quickPick, ...options }),
		));

		// when the dialog is hidden, dispose everything
		disposables.add(quickPick.onDidHide(
			disposables.dispose.bind(disposables),
		));

		// finally, reveal the dialog
		quickPick.show();
	});
};
