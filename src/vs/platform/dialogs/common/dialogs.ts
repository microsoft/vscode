/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ThemeIcon } from 'vs/base/common/themables';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { basename } from 'vs/base/common/resources';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { MessageBoxOptions } from 'vs/base/parts/sandbox/common/electronTypes';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { IProductService } from 'vs/platform/product/common/productService';
import { deepClone } from 'vs/base/common/objects';

export interface IDialogArgs {
	readonly confirmArgs?: IConfirmDialogArgs;
	readonly inputArgs?: IInputDialogArgs;
	readonly promptArgs?: IPromptDialogArgs;
}

export interface IBaseDialogOptions {
	readonly type?: Severity | DialogType;

	readonly title?: string;
	readonly message: string;
	readonly detail?: string;

	readonly checkbox?: ICheckbox;

	/**
	 * Allows to enforce use of custom dialog even in native environments.
	 */
	readonly custom?: boolean | ICustomDialogOptions;
}

export interface IConfirmDialogArgs {
	readonly confirmation: IConfirmation;
}

export interface IConfirmation extends IBaseDialogOptions {

	/**
	 * If not provided, defaults to `Yes`.
	 */
	readonly primaryButton?: string;

	/**
	 * If not provided, defaults to `Cancel`.
	 */
	readonly cancelButton?: string;
}

export interface IConfirmationResult extends ICheckboxResult {

	/**
	 * Will be true if the dialog was confirmed with the primary button pressed.
	 */
	readonly confirmed: boolean;
}

export interface IInputDialogArgs {
	readonly input: IInput;
}

export interface IInput extends IConfirmation {
	readonly inputs: IInputElement[];

	/**
	 * If not provided, defaults to `Ok`.
	 */
	readonly primaryButton?: string;
}

export interface IInputElement {
	readonly type?: 'text' | 'password';
	readonly value?: string;
	readonly placeholder?: string;
}

export interface IInputResult extends IConfirmationResult {

	/**
	 * Values for the input fields as provided by the user or `undefined` if none.
	 */
	readonly values?: string[];
}

export interface IPromptDialogArgs {
	readonly prompt: IPrompt<unknown>;
}

export interface IPromptBaseButton<T> {

	/**
	 * @returns the result of the prompt button will be returned
	 * as result from the `prompt()` call.
	 */
	run(checkbox: ICheckboxResult): T | Promise<T>;
}

export interface IPromptButton<T> extends IPromptBaseButton<T> {
	readonly label: string;
}

export interface IPromptCancelButton<T> extends IPromptBaseButton<T> {

	/**
	 * The cancel button to show in the prompt. Defaults to
	 * `Cancel` if not provided.
	 */
	readonly label?: string;
}

export interface IPrompt<T> extends IBaseDialogOptions {

	/**
	 * The buttons to show in the prompt. Defaults to `OK`
	 * if no buttons or cancel button is provided.
	 */
	readonly buttons?: IPromptButton<T>[];

	/**
	 * The cancel button to show in the prompt. Defaults to
	 * `Cancel` if set to `true`.
	 */
	readonly cancelButton?: IPromptCancelButton<T> | true | string;
}

export interface IPromptWithCustomCancel<T> extends IPrompt<T> {
	readonly cancelButton: IPromptCancelButton<T>;
}

export interface IPromptWithDefaultCancel<T> extends IPrompt<T> {
	readonly cancelButton: true | string;
}

export interface IPromptResult<T> extends ICheckboxResult {

	/**
	 * The result of the `IPromptButton` that was pressed or `undefined` if none.
	 */
	readonly result?: T;
}

export interface IPromptResultWithCancel<T> extends IPromptResult<T> {
	readonly result: T;
}

export type IDialogResult = IConfirmationResult | IInputResult | IPromptResult<unknown>;

export type DialogType = 'none' | 'info' | 'error' | 'question' | 'warning';

export interface ICheckbox {
	readonly label: string;
	readonly checked?: boolean;
}

export interface ICheckboxResult {

	/**
	 * This will only be defined if the confirmation was created
	 * with the checkbox option defined.
	 */
	readonly checkboxChecked?: boolean;
}

export interface IPickAndOpenOptions {
	readonly forceNewWindow?: boolean;
	defaultUri?: URI;
	readonly telemetryExtraData?: ITelemetryData;
	availableFileSystems?: string[];
	remoteAuthority?: string | null;
}

export interface FileFilter {
	readonly extensions: string[];
	readonly name: string;
}

export interface ISaveDialogOptions {

	/**
	 * A human-readable string for the dialog title
	 */
	title?: string;

	/**
	 * The resource the dialog shows when opened.
	 */
	defaultUri?: URI;

	/**
	 * A set of file filters that are used by the dialog. Each entry is a human readable label,
	 * like "TypeScript", and an array of extensions.
	 */
	filters?: FileFilter[];

	/**
	 * A human-readable string for the ok button
	 */
	readonly saveLabel?: string;

	/**
	 * Specifies a list of schemas for the file systems the user can save to. If not specified, uses the schema of the defaultURI or, if also not specified,
	 * the schema of the current window.
	 */
	availableFileSystems?: readonly string[];
}

export interface IOpenDialogOptions {

	/**
	 * A human-readable string for the dialog title
	 */
	readonly title?: string;

	/**
	 * The resource the dialog shows when opened.
	 */
	defaultUri?: URI;

	/**
	 * A human-readable string for the open button.
	 */
	readonly openLabel?: string;

	/**
	 * Allow to select files, defaults to `true`.
	 */
	canSelectFiles?: boolean;

	/**
	 * Allow to select folders, defaults to `false`.
	 */
	canSelectFolders?: boolean;

	/**
	 * Allow to select many files or folders.
	 */
	readonly canSelectMany?: boolean;

	/**
	 * A set of file filters that are used by the dialog. Each entry is a human readable label,
	 * like "TypeScript", and an array of extensions.
	 */
	filters?: FileFilter[];

	/**
	 * Specifies a list of schemas for the file systems the user can load from. If not specified, uses the schema of the defaultURI or, if also not available,
	 * the schema of the current window.
	 */
	availableFileSystems?: readonly string[];
}

export const IDialogService = createDecorator<IDialogService>('dialogService');

export interface ICustomDialogOptions {
	readonly buttonDetails?: string[];
	readonly markdownDetails?: ICustomDialogMarkdown[];
	readonly classes?: string[];
	readonly icon?: ThemeIcon;
	readonly disableCloseAction?: boolean;
}

export interface ICustomDialogMarkdown {
	readonly markdown: IMarkdownString;
	readonly classes?: string[];
}

/**
 * A handler to bring up modal dialogs.
 */
export interface IDialogHandler {

	/**
	 * Ask the user for confirmation with a modal dialog.
	 */
	confirm(confirmation: IConfirmation): Promise<IConfirmationResult>;

	/**
	 * Prompt the user with a modal dialog.
	 */
	prompt<T>(prompt: IPrompt<T>): Promise<IPromptResult<T>>;

	/**
	 * Present a modal dialog to the user asking for input.
	 */
	input(input: IInput): Promise<IInputResult>;

	/**
	 * Present the about dialog to the user.
	 */
	about(): Promise<void>;
}

enum DialogKind {
	Confirmation = 1,
	Prompt,
	Input
}

export abstract class AbstractDialogHandler implements IDialogHandler {

	protected getConfirmationButtons(dialog: IConfirmation): string[] {
		return this.getButtons(dialog, DialogKind.Confirmation);
	}

	protected getPromptButtons(dialog: IPrompt<unknown>): string[] {
		return this.getButtons(dialog, DialogKind.Prompt);
	}

	protected getInputButtons(dialog: IInput): string[] {
		return this.getButtons(dialog, DialogKind.Input);
	}

	private getButtons(dialog: IConfirmation, kind: DialogKind.Confirmation): string[];
	private getButtons(dialog: IPrompt<unknown>, kind: DialogKind.Prompt): string[];
	private getButtons(dialog: IInput, kind: DialogKind.Input): string[];
	private getButtons(dialog: IConfirmation | IInput | IPrompt<unknown>, kind: DialogKind): string[] {

		// We put buttons in the order of "default" button first and "cancel"
		// button last. There maybe later processing when presenting the buttons
		// based on OS standards.

		const buttons: string[] = [];

		switch (kind) {
			case DialogKind.Confirmation: {
				const confirmationDialog = dialog as IConfirmation;

				if (confirmationDialog.primaryButton) {
					buttons.push(confirmationDialog.primaryButton);
				} else {
					buttons.push(localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes"));
				}

				if (confirmationDialog.cancelButton) {
					buttons.push(confirmationDialog.cancelButton);
				} else {
					buttons.push(localize('cancelButton', "Cancel"));
				}

				break;
			}
			case DialogKind.Prompt: {
				const promptDialog = dialog as IPrompt<unknown>;

				if (Array.isArray(promptDialog.buttons) && promptDialog.buttons.length > 0) {
					buttons.push(...promptDialog.buttons.map(button => button.label));
				}

				if (promptDialog.cancelButton) {
					if (promptDialog.cancelButton === true) {
						buttons.push(localize('cancelButton', "Cancel"));
					} else if (typeof promptDialog.cancelButton === 'string') {
						buttons.push(promptDialog.cancelButton);
					} else {
						if (promptDialog.cancelButton.label) {
							buttons.push(promptDialog.cancelButton.label);
						} else {
							buttons.push(localize('cancelButton', "Cancel"));
						}
					}
				}

				if (buttons.length === 0) {
					buttons.push(localize({ key: 'okButton', comment: ['&& denotes a mnemonic'] }, "&&OK"));
				}

				break;
			}
			case DialogKind.Input: {
				const inputDialog = dialog as IInput;

				if (inputDialog.primaryButton) {
					buttons.push(inputDialog.primaryButton);
				} else {
					buttons.push(localize({ key: 'okButton', comment: ['&& denotes a mnemonic'] }, "&&OK"));
				}

				if (inputDialog.cancelButton) {
					buttons.push(inputDialog.cancelButton);
				} else {
					buttons.push(localize('cancelButton', "Cancel"));
				}

				break;
			}
		}

		return buttons;
	}

	protected getDialogType(type: Severity | DialogType | undefined): DialogType | undefined {
		if (typeof type === 'string') {
			return type;
		}

		if (typeof type === 'number') {
			return (type === Severity.Info) ? 'info' : (type === Severity.Error) ? 'error' : (type === Severity.Warning) ? 'warning' : 'none';
		}

		return undefined;
	}

	protected async getPromptResult<T>(prompt: IPrompt<T>, buttonIndex: number, checkboxChecked: boolean | undefined): Promise<IPromptResult<T>> {
		const promptButtons: IPromptBaseButton<T>[] = [...(prompt.buttons ?? [])];
		if (prompt.cancelButton && typeof prompt.cancelButton !== 'string' && typeof prompt.cancelButton !== 'boolean') {
			promptButtons.push(prompt.cancelButton);
		}

		const result = await promptButtons[buttonIndex]?.run({ checkboxChecked });

		return { result, checkboxChecked };
	}

	abstract confirm(confirmation: IConfirmation): Promise<IConfirmationResult>;
	abstract input(input: IInput): Promise<IInputResult>;
	abstract prompt<T>(prompt: IPrompt<T>): Promise<IPromptResult<T>>;
	abstract about(): Promise<void>;
}

/**
 * A service to bring up modal dialogs.
 *
 * Note: use the `INotificationService.prompt()` method for a non-modal way to ask
 * the user for input.
 */
export interface IDialogService {

	readonly _serviceBrand: undefined;

	/**
	 * An event that fires when a dialog is about to show.
	 */
	onWillShowDialog: Event<void>;

	/**
	 * An event that fires when a dialog did show (closed).
	 */
	onDidShowDialog: Event<void>;

	/**
	 * Ask the user for confirmation with a modal dialog.
	 */
	confirm(confirmation: IConfirmation): Promise<IConfirmationResult>;

	/**
	 * Prompt the user with a modal dialog. Provides a bit
	 * more control over the dialog compared to the simpler
	 * `confirm` method. Specifically, allows to show more
	 * than 2 buttons and makes it easier to just show a
	 * message to the user.
	 *
	 * @returns a promise that resolves to the `T` result
	 * from the provided `IPromptButton<T>` or `undefined`.
	 */
	prompt<T>(prompt: IPromptWithCustomCancel<T>): Promise<IPromptResultWithCancel<T>>;
	prompt<T>(prompt: IPromptWithDefaultCancel<T>): Promise<IPromptResult<T>>;
	prompt<T>(prompt: IPrompt<T>): Promise<IPromptResult<T>>;

	/**
	 * Present a modal dialog to the user asking for input.
	 */
	input(input: IInput): Promise<IInputResult>;

	/**
	 * Show a modal info dialog.
	 */
	info(message: string, detail?: string): Promise<void>;

	/**
	 * Show a modal warning dialog.
	 */
	warn(message: string, detail?: string): Promise<void>;

	/**
	 * Show a modal error dialog.
	 */
	error(message: string, detail?: string): Promise<void>;

	/**
	 * Present the about dialog to the user.
	 */
	about(): Promise<void>;
}

export const IFileDialogService = createDecorator<IFileDialogService>('fileDialogService');

/**
 * A service to bring up file dialogs.
 */
export interface IFileDialogService {

	readonly _serviceBrand: undefined;

	/**
	 * The default path for a new file based on previously used files.
	 * @param schemeFilter The scheme of the file path. If no filter given, the scheme of the current window is used.
	 * Falls back to user home in the absence of enough information to find a better URI.
	 */
	defaultFilePath(schemeFilter?: string): Promise<URI>;

	/**
	 * The default path for a new folder based on previously used folders.
	 * @param schemeFilter The scheme of the folder path. If no filter given, the scheme of the current window is used.
	 * Falls back to user home in the absence of enough information to find a better URI.
	 */
	defaultFolderPath(schemeFilter?: string): Promise<URI>;

	/**
	 * The default path for a new workspace based on previously used workspaces.
	 * @param schemeFilter The scheme of the workspace path. If no filter given, the scheme of the current window is used.
	 * Falls back to user home in the absence of enough information to find a better URI.
	 */
	defaultWorkspacePath(schemeFilter?: string): Promise<URI>;

	/**
	 * Shows a file-folder selection dialog and opens the selected entry.
	 */
	pickFileFolderAndOpen(options: IPickAndOpenOptions): Promise<void>;

	/**
	 * Shows a file selection dialog and opens the selected entry.
	 */
	pickFileAndOpen(options: IPickAndOpenOptions): Promise<void>;

	/**
	 * Shows a folder selection dialog and opens the selected entry.
	 */
	pickFolderAndOpen(options: IPickAndOpenOptions): Promise<void>;

	/**
	 * Shows a workspace selection dialog and opens the selected entry.
	 */
	pickWorkspaceAndOpen(options: IPickAndOpenOptions): Promise<void>;

	/**
	 * Shows a save file dialog and save the file at the chosen file URI.
	 */
	pickFileToSave(defaultUri: URI, availableFileSystems?: string[]): Promise<URI | undefined>;

	/**
	 * The preferred folder path to open the dialog at.
	 * @param schemeFilter The scheme of the file path. If no filter given, the scheme of the current window is used.
	 * Falls back to user home in the absence of a setting.
	 */
	preferredHome(schemeFilter?: string): Promise<URI>;

	/**
	 * Shows a save file dialog and returns the chosen file URI.
	 */
	showSaveDialog(options: ISaveDialogOptions): Promise<URI | undefined>;

	/**
	 * Shows a confirm dialog for saving 1-N files.
	 */
	showSaveConfirm(fileNamesOrResources: (string | URI)[]): Promise<ConfirmResult>;

	/**
	 * Shows a open file dialog and returns the chosen file URI.
	 */
	showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined>;
}

export const enum ConfirmResult {
	SAVE,
	DONT_SAVE,
	CANCEL
}

const MAX_CONFIRM_FILES = 10;
export function getFileNamesMessage(fileNamesOrResources: readonly (string | URI)[]): string {
	const message: string[] = [];
	message.push(...fileNamesOrResources.slice(0, MAX_CONFIRM_FILES).map(fileNameOrResource => typeof fileNameOrResource === 'string' ? fileNameOrResource : basename(fileNameOrResource)));

	if (fileNamesOrResources.length > MAX_CONFIRM_FILES) {
		if (fileNamesOrResources.length - MAX_CONFIRM_FILES === 1) {
			message.push(localize('moreFile', "...1 additional file not shown"));
		} else {
			message.push(localize('moreFiles', "...{0} additional files not shown", fileNamesOrResources.length - MAX_CONFIRM_FILES));
		}
	}

	message.push('');
	return message.join('\n');
}

export interface INativeOpenDialogOptions {
	readonly forceNewWindow?: boolean;

	readonly defaultPath?: string;

	readonly telemetryEventName?: string;
	readonly telemetryExtraData?: ITelemetryData;
}

export interface IMassagedMessageBoxOptions {

	/**
	 * OS massaged message box options.
	 */
	readonly options: MessageBoxOptions;

	/**
	 * Since the massaged result of the message box options potentially
	 * changes the order of buttons, we have to keep a map of these
	 * changes so that we can still return the correct index to the caller.
	 */
	readonly buttonIndeces: number[];
}

/**
 * A utility method to ensure the options for the message box dialog
 * are using properties that are consistent across all platforms and
 * specific to the platform where necessary.
 */
export function massageMessageBoxOptions(options: MessageBoxOptions, productService: IProductService): IMassagedMessageBoxOptions {
	const massagedOptions = deepClone(options);

	let buttons = (massagedOptions.buttons ?? []).map(button => mnemonicButtonLabel(button));
	let buttonIndeces = (options.buttons || []).map((button, index) => index);

	let defaultId = 0; // by default the first button is default button
	let cancelId = massagedOptions.cancelId ?? buttons.length - 1; // by default the last button is cancel button

	// Apply HIG per OS when more than one button is used
	if (buttons.length > 1) {
		const cancelButton = typeof cancelId === 'number' ? buttons[cancelId] : undefined;

		if (isLinux || isMacintosh) {

			// Linux: the GNOME HIG (https://developer.gnome.org/hig/patterns/feedback/dialogs.html?highlight=dialog)
			// recommend the following:
			// "Always ensure that the cancel button appears first, before the affirmative button. In left-to-right
			//  locales, this is on the left. This button order ensures that users become aware of, and are reminded
			//  of, the ability to cancel prior to encountering the affirmative button."
			//
			// Electron APIs do not reorder buttons for us, so we ensure a reverse order of buttons and a position
			// of the cancel button (if provided) that matches the HIG

			// macOS: the HIG (https://developer.apple.com/design/human-interface-guidelines/components/presentation/alerts)
			// recommend the following:
			// "Place buttons where people expect. In general, place the button people are most likely to choose on the trailing side in a
			//  row of buttons or at the top in a stack of buttons. Always place the default button on the trailing side of a row or at the
			//  top of a stack. Cancel buttons are typically on the leading side of a row or at the bottom of a stack."
			//
			// However: it seems that older macOS versions where 3 buttons were presented in a row differ from this
			// recommendation. In fact, cancel buttons were placed to the left of the default button and secondary
			// buttons on the far left. To support these older macOS versions we have to manually shuffle the cancel
			// button in the same way as we do on Linux. This will not have any impact on newer macOS versions where
			// shuffling is done for us.

			if (typeof cancelButton === 'string' && buttons.length > 1 && cancelId !== 1) {
				buttons.splice(cancelId, 1);
				buttons.splice(1, 0, cancelButton);

				const cancelButtonIndex = buttonIndeces[cancelId];
				buttonIndeces.splice(cancelId, 1);
				buttonIndeces.splice(1, 0, cancelButtonIndex);

				cancelId = 1;
			}

			if (isLinux && buttons.length > 1) {
				buttons = buttons.reverse();
				buttonIndeces = buttonIndeces.reverse();

				defaultId = buttons.length - 1;
				if (typeof cancelButton === 'string') {
					cancelId = defaultId - 1;
				}
			}
		} else if (isWindows) {

			// Windows: the HIG (https://learn.microsoft.com/en-us/windows/win32/uxguide/win-dialog-box)
			// recommend the following:
			// "One of the following sets of concise commands: Yes/No, Yes/No/Cancel, [Do it]/Cancel,
			//  [Do it]/[Don't do it], [Do it]/[Don't do it]/Cancel."
			//
			// Electron APIs do not reorder buttons for us, so we ensure the position of the cancel button
			// (if provided) that matches the HIG

			if (typeof cancelButton === 'string' && buttons.length > 1 && cancelId !== buttons.length - 1 /* last action */) {
				buttons.splice(cancelId, 1);
				buttons.push(cancelButton);

				const buttonIndex = buttonIndeces[cancelId];
				buttonIndeces.splice(cancelId, 1);
				buttonIndeces.push(buttonIndex);

				cancelId = buttons.length - 1;
			}
		}
	}

	massagedOptions.buttons = buttons;
	massagedOptions.defaultId = defaultId;
	massagedOptions.cancelId = cancelId;
	massagedOptions.noLink = true;
	massagedOptions.title = massagedOptions.title || productService.nameLong;

	return {
		options: massagedOptions,
		buttonIndeces
	};
}
