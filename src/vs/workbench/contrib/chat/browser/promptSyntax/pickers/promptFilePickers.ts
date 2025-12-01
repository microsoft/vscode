/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { URI } from '../../../../../../base/common/uri.js';
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
import { PromptsType, INSTRUCTIONS_DOCUMENTATION_URL, AGENT_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL } from '../../../common/promptSyntax/promptTypes.js';
import { NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID } from '../newPromptFileActions.js';
import { IKeyMods, IQuickInputButton, IQuickInputService, IQuickPick, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator } from '../../../../../../platform/quickinput/common/quickInput.js';
import { askForPromptFileName } from './askForPromptName.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { askForPromptSourceFolder } from './askForPromptSourceFolder.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { PromptsConfig } from '../../../common/promptSyntax/config/config.js';
import { PromptFileRewriter } from '../promptFileRewriter.js';

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
	readonly optionVisibility?: boolean;
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
function newHelpButton(type: PromptsType): IQuickInputButton & { helpURI: URI } {
	const iconClass = ThemeIcon.asClassName(Codicon.question);
	switch (type) {
		case PromptsType.prompt:
			return {
				tooltip: localize('help.prompt', "Show help on prompt files"),
				helpURI: URI.parse(PROMPT_DOCUMENTATION_URL),
				iconClass
			};
		case PromptsType.instructions:
			return {
				tooltip: localize('help.instructions', "Show help on instruction files"),
				helpURI: URI.parse(INSTRUCTIONS_DOCUMENTATION_URL),
				iconClass
			};
		case PromptsType.agent:
			return {
				tooltip: localize('help.agent', "Show help on custom agent files"),
				helpURI: URI.parse(AGENT_DOCUMENTATION_URL),
				iconClass
			};
	}
}

function isHelpButton(button: IQuickInputButton): button is IQuickInputButton & { helpURI: URI } {
	return (<{ helpURI: URI }>button).helpURI !== undefined;
}

interface IPromptPickerQuickPickItem extends IQuickPickItem {

	type: 'item';

	/**
	 * The URI of the prompt file.
	 */
	promptFileUri?: URI;

	/**
	 * The command ID to execute when this item is selected.
	 */
	commandId?: string;
}

function isPromptFileItem(item: IPromptPickerQuickPickItem | IQuickPickSeparator): item is IPromptPickerQuickPickItem & { promptFileUri: URI } {
	return item.type === 'item' && !!item.promptFileUri;
}

type IPromptQuickPick = IQuickPick<IPromptPickerQuickPickItem, { useSeparators: true }>;

/**
 * A quick pick item that starts the 'New Prompt File' command.
 */
const NEW_PROMPT_FILE_OPTION: IPromptPickerQuickPickItem = {
	type: 'item',
	label: `$(plus) ${localize(
		'commands.new-promptfile.select-dialog.label',
		'New prompt file...'
	)}`,
	pickable: false,
	alwaysShow: true,
	buttons: [newHelpButton(PromptsType.prompt)],
	commandId: NEW_PROMPT_COMMAND_ID,
};

/**
 * A quick pick item that starts the 'New Instructions File' command.
 */
const NEW_INSTRUCTIONS_FILE_OPTION: IPromptPickerQuickPickItem = {
	type: 'item',
	label: `$(plus) ${localize(
		'commands.new-instructionsfile.select-dialog.label',
		'New instruction file...',
	)}`,
	pickable: false,
	alwaysShow: true,
	buttons: [newHelpButton(PromptsType.instructions)],
	commandId: NEW_INSTRUCTIONS_COMMAND_ID,
};

/**
 * A quick pick item that starts the 'Update Instructions' command.
 */
const UPDATE_INSTRUCTIONS_OPTION: IPromptPickerQuickPickItem = {
	type: 'item',
	label: `$(refresh) ${localize(
		'commands.update-instructions.select-dialog.label',
		'Generate agent instructions...',
	)}`,
	pickable: false,
	alwaysShow: true,
	buttons: [newHelpButton(PromptsType.instructions)],
	commandId: 'workbench.action.chat.generateInstructions',
};

/**
 * A quick pick item that starts the 'New Agent File' command.
 */
const NEW_AGENT_FILE_OPTION: IPromptPickerQuickPickItem = {
	type: 'item',
	label: `$(plus) ${localize(
		'commands.new-agentfile.select-dialog.label',
		'Create new custom agent...',
	)}`,
	pickable: false,
	alwaysShow: true,
	buttons: [newHelpButton(PromptsType.agent)],
	commandId: NEW_AGENT_COMMAND_ID,
};

/**
 * Button that opens a prompt file in the editor.
 */
const EDIT_BUTTON: IQuickInputButton = {
	tooltip: localize('open', "Open in Editor"),
	iconClass: ThemeIcon.asClassName(Codicon.fileCode),
};

/**
 * Button that deletes a prompt file.
 */
const DELETE_BUTTON: IQuickInputButton = {
	tooltip: localize('delete', "Delete"),
	iconClass: ThemeIcon.asClassName(Codicon.trash),
};

/**
 * Button that renames a prompt file.
 */
const RENAME_BUTTON: IQuickInputButton = {
	tooltip: localize('rename', "Move and/or Rename"),
	iconClass: ThemeIcon.asClassName(Codicon.replace),
};

/**
 * Button that copies a prompt file.
 */
const COPY_BUTTON: IQuickInputButton = {
	tooltip: localize('copy', "Copy"),
	iconClass: ThemeIcon.asClassName(Codicon.copy),
};

/**
 * Button that sets a prompt file to be visible.
 */
const MAKE_VISIBLE_BUTTON: IQuickInputButton = {
	tooltip: localize('makeVisible', "Hidden from chat view agent picker. Click to show."),
	iconClass: ThemeIcon.asClassName(Codicon.eyeClosed),
	alwaysVisible: true,
};

/**
 * Button that sets a prompt file to be invisible.
 */
const MAKE_INVISIBLE_BUTTON: IQuickInputButton = {
	tooltip: localize('makeInvisible', "Hide from agent picker"),
	iconClass: ThemeIcon.asClassName(Codicon.eyeClosed),
};

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
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
	}

	/**
	 * Shows the prompt file selection dialog to the user that allows to run a prompt file(s).
	 *
	 * If {@link ISelectOptions.resource resource} is provided, the dialog will have
	 * the resource pre-selected in the prompts list.
	 */
	async selectPromptFile(options: ISelectOptions): Promise<ISelectPromptResult | undefined> {

		const cts = new CancellationTokenSource();
		const quickPick: IPromptQuickPick = this._quickInputService.createQuickPick<IPromptPickerQuickPickItem>({ useSeparators: true });
		quickPick.busy = true;
		quickPick.placeholder = localize('searching', 'Searching file system...');

		try {
			const fileOptions = await this._createPromptPickItems(options, cts.token);
			const activeItem = options.resource && fileOptions.find(f => f.type === 'item' && extUri.isEqual(f.promptFileUri, options.resource)) as IPromptPickerQuickPickItem | undefined;
			if (activeItem) {
				quickPick.activeItems = [activeItem];
			}
			quickPick.placeholder = options.placeholder;
			quickPick.matchOnDescription = true;
			quickPick.items = fileOptions;
		} finally {
			quickPick.busy = false;
		}

		return new Promise<ISelectPromptResult | undefined>(resolve => {
			const disposables = new DisposableStore();

			let isResolved = false;
			let isClosed = false;

			disposables.add(quickPick);
			disposables.add(cts);

			const refreshItems = async () => {
				const active = quickPick.activeItems;
				const newItems = await this._createPromptPickItems(options, CancellationToken.None);
				quickPick.items = newItems;
				quickPick.activeItems = active;
			};

			// handle the prompt `accept` event
			disposables.add(quickPick.onDidAccept(async () => {
				const { selectedItems } = quickPick;
				const { keyMods } = quickPick;

				const selectedItem = selectedItems[0];
				if (isPromptFileItem(selectedItem)) {
					resolve({ promptFile: selectedItem.promptFileUri, keyMods: { ...keyMods } });
					isResolved = true;
				} else {
					if (selectedItem.commandId) {
						await this._commandService.executeCommand(selectedItem.commandId);
						return;
					}
				}

				quickPick.hide();
			}));

			// handle the `button click` event on a list item (edit, delete, etc.)
			disposables.add(quickPick.onDidTriggerItemButton(async e => {
				const shouldRefresh = await this._handleButtonClick(quickPick, e, options);
				if (!isClosed && shouldRefresh) {
					await refreshItems();
				}
			}));

			disposables.add(quickPick.onDidHide(() => {
				if (!quickPick.ignoreFocusOut) {
					disposables.dispose();
					isClosed = true;
					if (!isResolved) {
						resolve(undefined);
						isResolved = true;
					}
				}
			}));

			// finally, reveal the dialog
			quickPick.show();
		});
	}


	private async _createPromptPickItems(options: ISelectOptions, token: CancellationToken): Promise<(IPromptPickerQuickPickItem | IQuickPickSeparator)[]> {
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
		if (options.optionNew !== false) {
			result.push(...this._getNewItems(options.type));
		}

		let getVisibility: (p: IPromptPath) => boolean | undefined = () => undefined;
		if (options.optionVisibility) {
			const disabled = this._promptsService.getDisabledPromptFiles(options.type);
			getVisibility = p => !disabled.has(p.uri);
		}

		const locals = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.local, token);
		if (locals.length) {
			result.push({ type: 'separator', label: localize('separator.workspace', "Workspace") });
			result.push(...await Promise.all(locals.map(l => this._createPromptPickItem(l, buttons, getVisibility(l), token))));
		}

		// Agent instruction files (copilot-instructions.md and AGENTS.md) are added here and not included in the output of
		// listPromptFilesForStorage() because that function only handles *.instructions.md files (under `.github/instructions/`, etc.)
		let agentInstructionFiles: IPromptPath[] = [];
		if (options.type === PromptsType.instructions) {
			const useNestedAgentMD = this._configurationService.getValue(PromptsConfig.USE_NESTED_AGENT_MD);
			const agentInstructionUris = [
				...await this._promptsService.listCopilotInstructionsMDs(token),
				...await this._promptsService.listAgentMDs(token, !!useNestedAgentMD)
			];
			agentInstructionFiles = agentInstructionUris.map(uri => {
				const folderName = this._labelService.getUriLabel(dirname(uri), { relative: true });
				// Don't show the folder path for files under .github folder (namely, copilot-instructions.md) since that is only defined once per repo.
				const shouldShowFolderPath = folderName?.toLowerCase() !== '.github';
				return {
					uri,
					description: shouldShowFolderPath ? folderName : undefined,
					storage: PromptsStorage.local,
					type: options.type
				} satisfies IPromptPath;
			});
		}
		if (agentInstructionFiles.length) {
			const agentButtons = buttons.filter(b => b !== RENAME_BUTTON);
			result.push({ type: 'separator', label: localize('separator.workspace-agent-instructions', "Agent Instructions") });
			result.push(...await Promise.all(agentInstructionFiles.map(l => this._createPromptPickItem(l, agentButtons, getVisibility(l), token))));
		}

		const exts = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.extension, token);
		if (exts.length) {
			result.push({ type: 'separator', label: localize('separator.extensions', "Extensions") });
			const extButtons: IQuickInputButton[] = [];
			if (options.optionEdit !== false) {
				extButtons.push(EDIT_BUTTON);
			}
			if (options.optionCopy !== false) {
				extButtons.push(COPY_BUTTON);
			}
			result.push(...await Promise.all(exts.map(e => this._createPromptPickItem(e, extButtons, getVisibility(e), token))));
		}
		const users = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.user, token);
		if (users.length) {
			result.push({ type: 'separator', label: localize('separator.user', "User Data") });
			result.push(...await Promise.all(users.map(u => this._createPromptPickItem(u, buttons, getVisibility(u), token))));
		}
		return result;
	}

	private _getNewItems(type: PromptsType): IPromptPickerQuickPickItem[] {
		switch (type) {
			case PromptsType.prompt:
				return [NEW_PROMPT_FILE_OPTION];
			case PromptsType.instructions:
				return [NEW_INSTRUCTIONS_FILE_OPTION, UPDATE_INSTRUCTIONS_OPTION];
			case PromptsType.agent:
				return [NEW_AGENT_FILE_OPTION];
			default:
				throw new Error(`Unknown prompt type '${type}'.`);
		}
	}

	private async _createPromptPickItem(promptFile: IPromptPath, buttons: IQuickInputButton[] | undefined, visibility: boolean | undefined, token: CancellationToken): Promise<IPromptPickerQuickPickItem> {
		const parsedPromptFile = await this._promptsService.parseNew(promptFile.uri, token).catch(() => undefined);
		let promptName = parsedPromptFile?.header?.name ?? promptFile.name ?? getCleanPromptName(promptFile.uri);
		const promptDescription = parsedPromptFile?.header?.description ?? promptFile.description;

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
		let iconClass: string | undefined;
		if (visibility === false) {
			buttons = (buttons ?? []).concat(MAKE_VISIBLE_BUTTON);
			promptName = localize('hiddenLabelInfo', "{0} (hidden)", promptName);
			tooltip = localize('hiddenInAgentPicker', "Hidden from chat view agent picker");
		} else if (visibility === true) {
			buttons = (buttons ?? []).concat(MAKE_INVISIBLE_BUTTON);
		}
		return {
			id: promptFile.uri.toString(),
			type: 'item',
			label: promptName,
			description: promptDescription,
			iconClass,
			tooltip,
			promptFileUri: promptFile.uri,
			buttons,
		} satisfies IPromptPickerQuickPickItem;
	}


	private async keepQuickPickOpen<T>(quickPick: IPromptQuickPick, work: () => Promise<T>): Promise<T> {
		const previousIgnoreFocusOut = quickPick.ignoreFocusOut;
		quickPick.ignoreFocusOut = true;
		try {
			return await work();
		} finally {
			quickPick.ignoreFocusOut = previousIgnoreFocusOut;
			quickPick.show();
		}
	}

	private async _handleButtonClick(quickPick: IPromptQuickPick, context: IQuickPickItemButtonEvent<IPromptPickerQuickPickItem>, options: ISelectOptions): Promise<boolean> {
		const { item, button } = context;
		if (!isPromptFileItem(item)) {
			if (isHelpButton(button)) {
				await this._openerService.open(button.helpURI);
				return false;
			}
			throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
		}
		const value = item.promptFileUri;

		// `edit` button was pressed, open the prompt file in editor
		if (button === EDIT_BUTTON) {
			await this._openerService.open(value);
			return false;
		}

		// `copy` button was pressed, make a copy of the prompt file, open the copy in editor
		if (button === RENAME_BUTTON || button === COPY_BUTTON) {
			return await this.keepQuickPickOpen(quickPick, async () => {
				const currentFolder = dirname(value);
				const isMove = button === RENAME_BUTTON && quickPick.keyMods.ctrlCmd;
				const newFolder = await this._instaService.invokeFunction(askForPromptSourceFolder, options.type, currentFolder, isMove);
				if (!newFolder) {
					return false;
				}
				const newName = await this._instaService.invokeFunction(askForPromptFileName, options.type, newFolder.uri, item.label);
				if (!newName) {
					return false;
				}
				const newFile = joinPath(newFolder.uri, newName);
				if (isMove) {
					await this._fileService.move(value, newFile);
				} else {
					await this._fileService.copy(value, newFile);
				}

				await this._openerService.open(newFile);
				await this._instaService.createInstance(PromptFileRewriter).openAndRewriteName(newFile, getCleanPromptName(newFile), CancellationToken.None);

				return true;
			});
		}

		// `delete` button was pressed, delete the prompt file
		if (button === DELETE_BUTTON) {
			// don't close the main prompt selection dialog by the confirmation dialog
			return await this.keepQuickPickOpen(quickPick, async () => {

				const filename = getCleanPromptName(value);
				const message = localize('commands.prompts.use.select-dialog.delete-prompt.confirm.message', "Are you sure you want to delete '{0}'?", filename);
				const { confirmed } = await this._dialogService.confirm({ message });
				// if prompt deletion was not confirmed, nothing to do
				if (!confirmed) {
					return false;
				}

				// prompt deletion was confirmed so delete the prompt file
				await this._fileService.del(value);
				return true;
			});

		}

		if (button === MAKE_VISIBLE_BUTTON || button === MAKE_INVISIBLE_BUTTON) {
			const disabled = this._promptsService.getDisabledPromptFiles(options.type);
			if (button === MAKE_VISIBLE_BUTTON) {
				disabled.delete(value);
			} else {
				disabled.add(value);
			}
			this._promptsService.setDisabledPromptFiles(options.type, disabled);
			return true;
		}

		throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
	}

	// --- Enablement Configuration -------------------------------------------------------

	/**
	 * Shows a multi-select (checkbox) quick pick to configure which prompt files of the given
	 * type are enabled. Currently only used for agent prompt files.
	 */
	async managePromptFiles(type: PromptsType, placeholder: string): Promise<boolean> {
		const cts = new CancellationTokenSource();
		const quickPick: IPromptQuickPick = this._quickInputService.createQuickPick<IPromptPickerQuickPickItem>({ useSeparators: true });
		quickPick.placeholder = placeholder;
		quickPick.canSelectMany = true;
		quickPick.matchOnDescription = true;
		quickPick.sortByLabel = false;
		quickPick.busy = true;

		const options: ISelectOptions = {
			placeholder: '',
			type,
			optionNew: true,
			optionEdit: true,
			optionDelete: true,
			optionRename: true,
			optionCopy: true,
			optionVisibility: false
		};

		try {
			const items = await this._createPromptPickItems(options, cts.token);
			quickPick.items = items;
		} finally {
			quickPick.busy = false;
		}

		return new Promise<boolean>(resolve => {
			const disposables = new DisposableStore();
			disposables.add(quickPick);
			disposables.add(cts);

			let isClosed = false;
			let isResolved = false;

			const refreshItems = async () => {
				const active = quickPick.activeItems;
				const newItems = await this._createPromptPickItems(options, CancellationToken.None);
				quickPick.items = newItems;
				quickPick.activeItems = active;
			};

			disposables.add(quickPick.onDidAccept(async () => {
				const clickedItem = quickPick.activeItems;
				if (clickedItem.length === 1 && clickedItem[0].commandId) {
					const commandId = clickedItem[0].commandId;
					await this.keepQuickPickOpen(quickPick, async () => {
						await this._commandService.executeCommand(commandId);
					});
					if (!isClosed) {
						await refreshItems();
					}
					return;
				}
				isResolved = true;
				resolve(true);
				quickPick.hide();
			}));

			disposables.add(quickPick.onDidTriggerItemButton(async e => {
				const shouldRefresh = await this._handleButtonClick(quickPick, e, options);
				if (!isClosed && shouldRefresh) {
					await refreshItems();
				}
			}));

			disposables.add(quickPick.onDidHide(() => {
				if (!quickPick.ignoreFocusOut) {
					disposables.dispose();
					isClosed = true;
					if (!isResolved) {
						resolve(false);
						isResolved = true;
					}
				}
			}));

			quickPick.show();
		});
	}

}
