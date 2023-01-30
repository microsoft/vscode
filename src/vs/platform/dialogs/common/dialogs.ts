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
	readonly showArgs?: IShowDialogArgs;
}

export type IDialogResult = IConfirmationResult | IInputResult | IShowResult;

export interface IConfirmDialogArgs {
	readonly confirmation: IConfirmation;
}

export interface IConfirmation {
	readonly type?: DialogType;

	readonly title?: string;
	readonly message: string;
	readonly detail?: string;

	readonly primaryButton?: string;
	readonly cancelButton?: string;

	readonly checkbox?: ICheckbox;
}

export interface IConfirmationResult extends ICheckboxResult {

	/**
	 * Will be true if the dialog was confirmed with the primary button pressed.
	 */
	readonly confirmed: boolean;
}

export interface IShowDialogArgs {
	readonly severity: Severity;
	readonly message: string;
	readonly buttons?: string[];
	readonly options?: IDialogOptions;
}

export interface IShowResult extends ICheckboxResult {

	/**
	 * Selected choice index. If the user refused to choose,
	 * then a promise with index of `cancelId` option is returned. If there is no such
	 * option then promise with index `0` is returned.
	 */
	readonly choice: number;
}

export interface IInputDialogArgs {
	readonly input: IInput;
}

export interface IInput extends IConfirmation {
	readonly inputs: IInputElement[];
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

export interface IDialogOptions {
	readonly cancelId?: number;
	readonly detail?: string;
	readonly checkbox?: ICheckbox;
	readonly custom?: boolean | ICustomDialogOptions;
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
	 * Present a modal dialog to the user asking for input.
	 *
	 *  @returns A promise with the selected choice index. If the user refused to choose,
	 * then a promise with index of `cancelId` option is returned. If there is no such
	 * option then promise with index `0` is returned. In addition, the values for the
	 * inputs are returned as well.
	 */
	input(input: IInput): Promise<IInputResult>;

	/**
	 * Present a modal dialog to the user.
	 *
	 * @returns A promise with the selected choice index. If the user refused to choose,
	 * then a promise with index of `cancelId` option is returned. If there is no such
	 * option then promise with index `0` is returned.
	 */
	show(severity: Severity, message: string, buttons?: string[], options?: IDialogOptions): Promise<IShowResult>;

	/**
	 * Present the about dialog to the user.
	 */
	about(): Promise<void>;
}

export abstract class AbstractDialogHandler implements IDialogHandler {

	protected toButtons(dialog: IConfirmation | IInput): string[] {
		const buttons: string[] = [];
		if (dialog.primaryButton) {
			buttons.push(dialog.primaryButton);
		} else {
			buttons.push(localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes"));
		}

		if (dialog.cancelButton) {
			buttons.push(dialog.cancelButton);
		} else {
			buttons.push(localize('cancelButton', "Cancel"));
		}

		return buttons;
	}

	abstract confirm(confirmation: IConfirmation): Promise<IConfirmationResult>;
	abstract input(input: IInput): Promise<IInputResult>;
	abstract show(severity: Severity, message: string, buttons?: string[] | undefined, options?: IDialogOptions | undefined): Promise<IShowResult>;
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
	 * Present a modal dialog to the user.
	 *
	 * @param severity the severity of the message
	 * @param message the message to show
	 * @param buttons the buttons to show. By convention, the first button should be the
	 * primary action and the last button the "Cancel" action.
	 *
	 * @returns A promise with the selected choice index. If the user refused to choose,
	 * then a promise with index of `cancelId` option is returned. If there is no such
	 * option then promise with index `0` is returned.
	 */
	show(severity: Severity, message: string, buttons?: string[], options?: IDialogOptions): Promise<IShowResult>;

	/**
	 * Present a modal dialog to the user asking for input.
	 *
	 *  @returns A promise with the selected choice index. If the user refused to choose,
	 * then a promise with index of `cancelId` option is returned. If there is no such
	 * option then promise with index `0` is returned. In addition, the values for the
	 * inputs are returned as well.
	 */
	input(input: IInput): Promise<IInputResult>;

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

			const cancelButton = typeof cancelId === 'number' ? buttons[cancelId] : undefined;

			if (isLinux) {
				buttons = buttons.reverse();
				buttonIndeces = buttonIndeces.reverse();

				defaultId = buttons.length - 1;
			}

			if (typeof cancelButton === 'string') {
				cancelId = buttons.indexOf(cancelButton);
				if (cancelId !== buttons.length - 2 /* left to primary action */) {
					buttons.splice(cancelId, 1);
					buttons.splice(buttons.length - 1, 0, cancelButton);

					const buttonIndex = buttonIndeces[cancelId];
					buttonIndeces.splice(cancelId, 1);
					buttonIndeces.splice(buttonIndeces.length - 1, 0, buttonIndex);

					cancelId = buttons.length - 2;
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

			const cancelButton = typeof cancelId === 'number' ? buttons[cancelId] : undefined;

			if (typeof cancelButton === 'string') {
				cancelId = buttons.indexOf(cancelButton);
				if (cancelId !== buttons.length - 1 /* right to primary action */) {
					buttons.splice(cancelId, 1);
					buttons.push(cancelButton);

					const buttonIndex = buttonIndeces[cancelId];
					buttonIndeces.splice(cancelId, 1);
					buttonIndeces.push(buttonIndex);

					cancelId = buttons.length - 1;
				}
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
