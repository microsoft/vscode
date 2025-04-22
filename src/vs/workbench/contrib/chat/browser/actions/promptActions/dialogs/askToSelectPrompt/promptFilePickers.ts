/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../nls.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { OS } from '../../../../../../../../base/common/platform.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { Codicon } from '../../../../../../../../base/common/codicons.js';
import { WithUriValue } from '../../../../../../../../base/common/types.js';
import { ThemeIcon } from '../../../../../../../../base/common/themables.js';
import { IPromptPath } from '../../../../../common/promptSyntax/service/types.js';
import { dirname, extUri } from '../../../../../../../../base/common/resources.js';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { UILabelProvider } from '../../../../../../../../base/common/keybindingLabels.js';
import { IDialogService } from '../../../../../../../../platform/dialogs/common/dialogs.js';
import { getCleanPromptName } from '../../../../../../../../platform/prompts/common/constants.js';
import { INSTRUCTIONS_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL } from '../../../../../common/promptSyntax/constants.js';
import { IKeyMods, IQuickInputButton, IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickItemButtonEvent } from '../../../../../../../../platform/quickinput/common/quickInput.js';
import { ICommandService } from '../../../../../../../../platform/commands/common/commands.js';
import { NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID } from '../../../../promptSyntax/contributions/createPromptCommand/createPromptCommand.js';

/**
 * Options for the {@link askToSelectInstructions} function.
 */
export interface ISelectOptions {

	/**
	 * The text shows as placeholder in the selection dialog.
	 */
	readonly placeholder: string;

	/**
	 * Prompt resource `URI` to attach to the chat input, if any.
	 * If provided the resource will be pre-selected in the prompt picker dialog,
	 * otherwise the dialog will show the prompts list without any pre-selection.
	 */
	readonly resource?: URI;

	/**
	 * List of prompt files to show in the selection dialog.
	 */
	readonly promptFiles: readonly IPromptPath[];
}

export interface ISelectPromptResult {
	/**
	 * The selected prompt file.
	 */
	readonly promptFile: URI;

	/**
	 * The key modifiers that were pressed when the prompt was selected.
	 */
	readonly keyMods: IKeyMods;
}

/**
 * Button that opems the documentation.
 */
const HELP_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize('help', "help"),
	iconClass: ThemeIcon.asClassName(Codicon.question),
});

/**
 * A quick pick item that starts the 'New Prompt File' command.
 */
const NEW_PROMPT_FILE_OPTION: WithUriValue<IQuickPickItem> = Object.freeze({
	type: 'item',
	label: `$(plus) ${localize(
		'commands.new-promptfile.select-dialog.label',
		'New prompt file...'
	)}`,
	value: URI.parse(PROMPT_DOCUMENTATION_URL),
	pickable: false,
	buttons: [HELP_BUTTON],
});

/**
 * A quick pick item that starts the 'New Instructions File' command.
 */
const NEW_INSTRUCTIONS_FILE_OPTION: WithUriValue<IQuickPickItem> = Object.freeze({
	type: 'item',
	label: `$(plus) ${localize(
		'commands.new-instructionsfile.select-dialog.label',
		'New instructions file...',
	)}`,
	value: URI.parse(INSTRUCTIONS_DOCUMENTATION_URL),
	pickable: false,
	buttons: [HELP_BUTTON],
});


/**
 * Button that opens a prompt file in the editor.
 */
const EDIT_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize(
		'commands.prompts.use.select-dialog.open-button.tooltip',
		"edit ({0}-key + enter)",
		UILabelProvider.modifierLabels[OS].ctrlKey
	),
	iconClass: ThemeIcon.asClassName(Codicon.edit),
});

/**
 * Button that deletes a prompt file.
 */
const DELETE_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize('delete', "delete"),
	iconClass: ThemeIcon.asClassName(Codicon.trash),
});


export class PromptFilePickers {
	constructor(
		@ILabelService private readonly _labelService: ILabelService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IFileService private readonly _fileService: IFileService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
	}
	/**
	 * Shows the instructions selection dialog to the user that allows to select a instructions file(s).
	 *
	 * If {@link ISelectOptions.resource resource} is provided, the dialog will have
	 * the resource pre-selected in the prompts list.
	 */
	public async selectInstructionsFiles(options: ISelectOptions): Promise<URI[] | undefined> {

		const fileOptions = this._createPromptPickItems(options);
		fileOptions.splice(0, 0, NEW_INSTRUCTIONS_FILE_OPTION);

		const quickPick = this._quickInputService.createQuickPick<WithUriValue<IQuickPickItem>>();
		quickPick.activeItems = fileOptions.length ? [fileOptions[0]] : [];
		quickPick.placeholder = options.placeholder;
		quickPick.canAcceptInBackground = true;
		quickPick.matchOnDescription = true;
		quickPick.items = fileOptions;
		quickPick.canSelectMany = true;

		return new Promise<URI[] | undefined>(resolve => {
			const disposables = new DisposableStore();

			let isResolved = false;

			// then the dialog is hidden or disposed for other reason,
			// dispose everything and resolve the main promise
			disposables.add({
				dispose() {
					quickPick.dispose();
					if (!isResolved) {
						resolve(undefined);
						isResolved = true;
					}
				},
			});

			// handle the prompt `accept` event
			disposables.add(quickPick.onDidAccept(async (event) => {
				const { selectedItems } = quickPick;

				if (selectedItems[0] === NEW_INSTRUCTIONS_FILE_OPTION) {
					await this._commandService.executeCommand(NEW_INSTRUCTIONS_COMMAND_ID);
					return;
				}

				resolve(selectedItems.map(item => item.value));
				isResolved = true;

				// if user submitted their selection, close the dialog
				if (!event.inBackground) {
					disposables.dispose();
				}
			}));

			// handle the `button click` event on a list item (edit, delete, etc.)
			disposables.add(quickPick.onDidTriggerItemButton(
				e => this._handleButtonClick(quickPick, e))
			);

			// when the dialog is hidden, dispose everything
			disposables.add(quickPick.onDidHide(
				disposables.dispose.bind(disposables),
			));

			// finally, reveal the dialog
			quickPick.show();
		});
	}

	/**
	 * Shows the instructions selection dialog to the user that allows to select a instructions file(s).
	 *
	 * If {@link ISelectOptions.resource resource} is provided, the dialog will have
	 * the resource pre-selected in the prompts list.
	 */
	public async selectPromptFile(options: ISelectOptions): Promise<ISelectPromptResult | undefined> {

		const fileOptions = this._createPromptPickItems(options);
		fileOptions.splice(0, 0, NEW_PROMPT_FILE_OPTION);

		const quickPick = this._quickInputService.createQuickPick<WithUriValue<IQuickPickItem>>();
		quickPick.activeItems = fileOptions.length ? [fileOptions[0]] : [];
		quickPick.placeholder = options.placeholder;
		quickPick.canAcceptInBackground = true;
		quickPick.matchOnDescription = true;
		quickPick.items = fileOptions;

		return new Promise<ISelectPromptResult | undefined>(resolve => {
			const disposables = new DisposableStore();

			let isResolved = false;

			// then the dialog is hidden or disposed for other reason,
			// dispose everything and resolve the main promise
			disposables.add({
				dispose() {
					quickPick.dispose();
					if (!isResolved) {
						resolve(undefined);
						isResolved = true;
					}
				},
			});

			// handle the prompt `accept` event
			disposables.add(quickPick.onDidAccept(async (event) => {
				const { selectedItems } = quickPick;
				const { keyMods } = quickPick;

				const selectedItem = selectedItems[0];
				if (selectedItem === NEW_PROMPT_FILE_OPTION) {
					await this._commandService.executeCommand(NEW_PROMPT_COMMAND_ID);
					return;
				}

				if (selectedItem) {
					resolve({ promptFile: selectedItem.value, keyMods: { ...keyMods } });
					isResolved = true;
				}

				// if user submitted their selection, close the dialog
				if (!event.inBackground) {
					disposables.dispose();
				}
			}));

			// handle the `button click` event on a list item (edit, delete, etc.)
			disposables.add(quickPick.onDidTriggerItemButton(
				e => this._handleButtonClick(quickPick, e))
			);

			// when the dialog is hidden, dispose everything
			disposables.add(quickPick.onDidHide(
				disposables.dispose.bind(disposables),
			));

			// finally, reveal the dialog
			quickPick.show();
		});
	}

	private _createPromptPickItems(options: ISelectOptions): WithUriValue<IQuickPickItem>[] {
		const { promptFiles, resource } = options;

		const fileOptions = promptFiles.map((promptFile) => {
			return this._createPromptPickItem(promptFile);
		});

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
				activeItem = this._createPromptPickItem({
					uri: resource,
					// "user" prompts are always registered in the prompts list, hence it
					// should be safe to assume that `resource` is not "user" prompt here
					storage: 'local',
					type: 'instructions',
				});
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
		return fileOptions;
	}

	private _createPromptPickItem(promptFile: IPromptPath): WithUriValue<IQuickPickItem> {
		const { uri, storage } = promptFile;
		const fileWithoutExtension = getCleanPromptName(uri);

		// if a "user" prompt, don't show its filesystem path in
		// the user interface, but do that for all the "local" ones
		const description = (storage === 'user')
			? localize(
				'user-prompt.capitalized',
				'User prompt',
			)
			: this._labelService.getUriLabel(dirname(uri), { relative: true });

		const tooltip = (storage === 'user')
			? description
			: uri.fsPath;

		return {
			id: uri.toString(),
			type: 'item',
			label: fileWithoutExtension,
			description,
			tooltip,
			value: uri,
			buttons: [EDIT_BUTTON, DELETE_BUTTON],
		};
	}

	private async _handleButtonClick(quickPick: IQuickPick<WithUriValue<IQuickPickItem>>, context: IQuickPickItemButtonEvent<WithUriValue<IQuickPickItem>>) {
		const { item, button } = context;
		const { value } = item;

		// `edit` button was pressed, open the prompt file in editor
		if (button === EDIT_BUTTON) {
			return await this._openerService.open(value);
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
			const info = await this._fileService.stat(value);
			assert(
				info.isDirectory === false,
				`'${value.fsPath}' points to a folder.`,
			);

			// don't close the main prompt selection dialog by the confirmation dialog
			const previousIgnoreFocusOut = quickPick.ignoreFocusOut;
			quickPick.ignoreFocusOut = true;

			const filename = getCleanPromptName(value);
			const { confirmed } = await this._dialogService.confirm({
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
			await this._fileService.del(value);

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

		if (button === HELP_BUTTON) {
			// open the documentation
			await this._openerService.open(item.value);
			return;
		}

		throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
	}

}

