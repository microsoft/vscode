/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assert } from '../../../../../../base/common/assert.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IPromptPath, IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { dirname, extUri, joinPath } from '../../../../../../base/common/resources.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { getCleanPromptName } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType, INSTRUCTIONS_DOCUMENTATION_URL, MODE_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL } from '../../../common/promptSyntax/promptTypes.js';
import { NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_MODE_COMMAND_ID } from '../newPromptFileActions.js';
import { IKeyMods, IQuickInputButton, IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator } from '../../../../../../platform/quickinput/common/quickInput.js';
import { askForPromptFileName } from './askForPromptName.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { UILabelProvider } from '../../../../../../base/common/keybindingLabels.js';
import { OS } from '../../../../../../base/common/platform.js';
import { askForPromptSourceFolder } from './askForPromptSourceFolder.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';

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

	readonly type: PromptsType;

	readonly optionNew?: boolean;
	readonly optionEdit?: boolean;
	readonly optionDelete?: boolean;
	readonly optionRename?: boolean;
	readonly optionCopy?: boolean;
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
 * Button that opens the documentation.
 */
const HELP_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize('help', "Help"),
	iconClass: ThemeIcon.asClassName(Codicon.question),
});

interface IPromptPickerQuickPickItem extends IQuickPickItem {
	/**
	 * The command ID to execute when the item is selected.
	 */
	commandId?: string;

	/**
	 * The URI of the prompt file or the documentation to open.
	 */
	value: URI;
}

type IPromptQuickPick = IQuickPick<IPromptPickerQuickPickItem, { useSeparators: true }>;

/**
 * A quick pick item that starts the 'New Prompt File' command.
 */
const NEW_PROMPT_FILE_OPTION: IPromptPickerQuickPickItem = Object.freeze({
	type: 'item',
	label: `$(plus) ${localize(
		'commands.new-promptfile.select-dialog.label',
		'New prompt file...'
	)}`,
	value: URI.parse(PROMPT_DOCUMENTATION_URL),
	pickable: false,
	alwaysShow: true,
	buttons: [HELP_BUTTON],
	commandId: NEW_PROMPT_COMMAND_ID,
});

/**
 * A quick pick item that starts the 'New Instructions File' command.
 */
const NEW_INSTRUCTIONS_FILE_OPTION: IPromptPickerQuickPickItem = Object.freeze({
	type: 'item',
	label: `$(plus) ${localize(
		'commands.new-instructionsfile.select-dialog.label',
		'New instruction file...',
	)}`,
	value: URI.parse(INSTRUCTIONS_DOCUMENTATION_URL),
	pickable: false,
	alwaysShow: true,
	buttons: [HELP_BUTTON],
	commandId: NEW_INSTRUCTIONS_COMMAND_ID,
});

/**
 * A quick pick item that starts the 'Update Instructions' command.
 */
const UPDATE_INSTRUCTIONS_OPTION: IPromptPickerQuickPickItem = Object.freeze({
	type: 'item',
	label: `$(refresh) ${localize(
		'commands.update-instructions.select-dialog.label',
		'Generate agent instructions...',
	)}`,
	value: URI.parse(INSTRUCTIONS_DOCUMENTATION_URL),
	pickable: false,
	alwaysShow: true,
	buttons: [HELP_BUTTON],
	commandId: 'workbench.action.chat.generateInstructions',
});

/**
 * A quick pick item that starts the 'New Instructions File' command.
 */
const NEW_MODE_FILE_OPTION: IPromptPickerQuickPickItem = Object.freeze({
	type: 'item',
	label: `$(plus) ${localize(
		'commands.new-modefile.select-dialog.label',
		'Create new custom chat mode file...',
	)}`,
	value: URI.parse(MODE_DOCUMENTATION_URL),
	pickable: false,
	alwaysShow: true,
	buttons: [HELP_BUTTON],
	commandId: NEW_MODE_COMMAND_ID,
});


/**
 * Button that opens a prompt file in the editor.
 */
const EDIT_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize('open', "Open in Editor"),
	iconClass: ThemeIcon.asClassName(Codicon.edit),
});

/**
 * Button that deletes a prompt file.
 */
const DELETE_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize('delete', "Delete"),
	iconClass: ThemeIcon.asClassName(Codicon.trash),
});

/**
 * Button that renames a prompt file.
 */
const RENAME_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize('rename', "Rename"),
	iconClass: ThemeIcon.asClassName(Codicon.replace),
});

/**
 * Button that copies a prompt file.
 */
const COPY_BUTTON: IQuickInputButton = Object.freeze({
	tooltip: localize('copy', "Copy or Move (press {0})", UILabelProvider.modifierLabels[OS].ctrlKey),
	iconClass: ThemeIcon.asClassName(Codicon.copy),
});

export class PromptFilePickers {
	constructor(
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IFileService private readonly _fileService: IFileService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ICommandService private readonly _commandService: ICommandService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
	}

	/**
	 * Shows the prompt file selection dialog to the user that allows to run a prompt file(s).
	 *
	 * If {@link ISelectOptions.resource resource} is provided, the dialog will have
	 * the resource pre-selected in the prompts list.
	 */
	async selectPromptFile(options: ISelectOptions): Promise<ISelectPromptResult | undefined> {
		const quickPick: IPromptQuickPick = this._quickInputService.createQuickPick<IPromptPickerQuickPickItem>({ useSeparators: true });
		quickPick.busy = true;
		quickPick.placeholder = localize('searching', 'Searching file system...');
		try {
			const fileOptions = await this._createPromptPickItems(options);
			const activeItem = options.resource && fileOptions.find(f => f.type === 'item' && extUri.isEqual(f.value, options.resource)) as IPromptPickerQuickPickItem | undefined;
			if (activeItem) {
				quickPick.activeItems = [activeItem];
			}
			quickPick.placeholder = options.placeholder;
			quickPick.canAcceptInBackground = true;
			quickPick.matchOnDescription = true;
			quickPick.items = fileOptions;
		} finally {
			quickPick.busy = false;
		}

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
				if (selectedItem.commandId) {
					await this._commandService.executeCommand(selectedItem.commandId);
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
				e => this._handleButtonClick(quickPick, e, options))
			);

			// when the dialog is hidden, dispose everything
			disposables.add(quickPick.onDidHide(
				disposables.dispose.bind(disposables),
			));

			// finally, reveal the dialog
			quickPick.show();
		});
	}


	private async _createPromptPickItems(options: ISelectOptions): Promise<(IPromptPickerQuickPickItem | IQuickPickSeparator)[]> {
		const buttons: IQuickInputButton[] = [];
		if (options.optionEdit !== false) {
			buttons.push(EDIT_BUTTON);
		}
		if (options.optionCopy !== false) {
			buttons.push(COPY_BUTTON);
		}
		if (options.optionRename !== false) {
			buttons.push(RENAME_BUTTON);
		}
		if (options.optionDelete !== false) {
			buttons.push(DELETE_BUTTON);
		}
		const result: (IPromptPickerQuickPickItem | IQuickPickSeparator)[] = [];
		const newItems = options.optionNew !== false ? this._getNewItems(options.type) : [];
		if (newItems.length > 0) {
			result.push(...newItems);
		}
		const locals = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.local, CancellationToken.None);
		if (locals.length) {
			result.push({ type: 'separator', label: localize('separator.workspace', "Workspace") });
			result.push(...locals.map(l => this._createPromptPickItem(l, buttons)));
		}
		const exts = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.extension, CancellationToken.None);
		if (exts.length) {
			result.push({ type: 'separator', label: localize('separator.extensions', "Extensions") });
			result.push(...exts.map(e => this._createPromptPickItem(e, undefined)));
		}
		const users = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.user, CancellationToken.None);
		if (users.length) {
			result.push({ type: 'separator', label: localize('separator.user', "User Data") });
			result.push(...users.map(u => this._createPromptPickItem(u, buttons)));
		}
		return result;
	}

	private _getNewItems(type: PromptsType): IPromptPickerQuickPickItem[] {
		switch (type) {
			case PromptsType.prompt:
				return [NEW_PROMPT_FILE_OPTION];
			case PromptsType.instructions:
				return [NEW_INSTRUCTIONS_FILE_OPTION, UPDATE_INSTRUCTIONS_OPTION];
			case PromptsType.mode:
				return [NEW_MODE_FILE_OPTION];
			default:
				throw new Error(`Unknown prompt type '${type}'.`);
		}
	}

	private _createPromptPickItem(promptFile: IPromptPath, buttons: IQuickInputButton[] | undefined): IPromptPickerQuickPickItem {
		const promptName = promptFile.name ?? getCleanPromptName(promptFile.uri);

		let tooltip: string | undefined;

		switch (promptFile.storage) {
			case PromptsStorage.extension:
				tooltip = promptFile.extension.displayName ?? promptFile.extension.id;
				break;
			case PromptsStorage.local:
				tooltip = this._labelService.getUriLabel(dirname(promptFile.uri), { relative: true });
				break;
			case PromptsStorage.user:
				tooltip = undefined;
				break;
		}
		return {
			id: promptFile.uri.toString(),
			type: 'item',
			label: promptName,
			description: promptFile.description,
			tooltip,
			value: promptFile.uri,
			buttons: buttons
		};
	}

	private async keepQuickPickOpen(quickPick: IPromptQuickPick, work: () => Promise<void>): Promise<void> {
		const previousIgnoreFocusOut = quickPick.ignoreFocusOut;
		quickPick.ignoreFocusOut = true;
		try {
			await work();
		} finally {
			quickPick.ignoreFocusOut = previousIgnoreFocusOut;
		}

	}

	private async _handleButtonClick(quickPick: IPromptQuickPick, context: IQuickPickItemButtonEvent<IPromptPickerQuickPickItem>, options: ISelectOptions): Promise<void> {
		const { item, button } = context;
		const { value, } = item;

		// `edit` button was pressed, open the prompt file in editor
		if (button === EDIT_BUTTON) {
			await this._openerService.open(value);
			return;
		}

		// `copy` button was pressed, open the prompt file in editor
		if (button === COPY_BUTTON) {
			const currentFolder = dirname(value);
			const isMove = quickPick.keyMods.ctrlCmd;
			const newFolder = await this._instaService.invokeFunction(askForPromptSourceFolder, options.type, currentFolder, isMove);
			if (!newFolder) {
				return;
			}
			const newName = await this._instaService.invokeFunction(askForPromptFileName, options.type, newFolder.uri, item.label);
			if (!newName) {
				return;
			}
			const newFile = joinPath(newFolder.uri, newName);
			if (isMove) {
				await this._fileService.move(value, newFile);
			} else {
				await this._fileService.copy(value, newFile);
			}

			await this._openerService.open(newFile);

			return;
		}

		// `rename` button was pressed, open a rename dialog
		if (button === RENAME_BUTTON) {
			const currentFolder = dirname(value);
			const newName = await this._instaService.invokeFunction(askForPromptFileName, options.type, currentFolder, item.label);
			if (newName) {
				const newFile = joinPath(currentFolder, newName);
				await this._fileService.move(value, newFile);
				await this._openerService.open(newFile);
			}
			return;
		}

		// `delete` button was pressed, delete the prompt file
		if (button === DELETE_BUTTON) {
			// sanity check to confirm our expectations
			assert(
				(quickPick.activeItems.length < 2),
				`Expected maximum one active item, got '${quickPick.activeItems.length}'.`,
			);

			// sanity checks - prompt file exists and is not a folder
			const info = await this._fileService.stat(value);
			assert(
				info.isDirectory === false,
				`'${value.fsPath}' points to a folder.`,
			);

			// don't close the main prompt selection dialog by the confirmation dialog
			await this.keepQuickPickOpen(quickPick, async () => {

				const filename = getCleanPromptName(value);
				const { confirmed } = await this._dialogService.confirm({
					message: localize(
						'commands.prompts.use.select-dialog.delete-prompt.confirm.message',
						"Are you sure you want to delete '{0}'?",
						filename,
					),
				});

				// if prompt deletion was not confirmed, nothing to do
				if (!confirmed) {
					return;
				}

				// prompt deletion was confirmed so delete the prompt file
				await this._fileService.del(value);

				const newEntries = this._createPromptPickItems(options);
				quickPick.items = await newEntries;

			});
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
