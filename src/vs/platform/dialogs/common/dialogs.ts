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
	readonly promptArgs?: IPromptDialogArgs;
}

export type IDialogResult = IConfirmationResult | IInputResult | IOneButtonPromptResult | ITwoButtonPromptResult | IThreeButtonPromptResult | IFourButtonPromptResult | IShowResult;

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

	readonly custom?: boolean | ICustomDialogOptions;
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

export interface IPromptDialogArgs {
	readonly prompt: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt;
}

export interface IBasePrompt {
	readonly severity: Severity;

	readonly message: string;
	readonly detail?: string;

	readonly checkbox?: ICheckbox;

	readonly custom?: boolean | ICustomDialogOptions;
}

export interface IOneButtonPrompt extends IBasePrompt {
	readonly button?: string;
}

export interface ITwoButtonPrompt extends IBasePrompt {
	readonly primaryButton: string;
	readonly cancelButton?: string;
}

export interface IThreeButtonPrompt extends ITwoButtonPrompt {
	readonly secondaryButton: string;
}

export interface IFourButtonPrompt extends IThreeButtonPrompt {
	readonly tertiaryButton: string;
}

export function isOneButtonPrompt(arg: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt): arg is IOneButtonPrompt {
	return !isTwoButtonPrompt(arg) && !isThreeButtonPrompt(arg) && !isFourButtonPrompt(arg);
}

export function isTwoButtonPrompt(arg: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt): arg is ITwoButtonPrompt {
	if (isThreeButtonPrompt(arg) || isFourButtonPrompt(arg)) {
		return false;
	}

	const candidate = arg as ITwoButtonPrompt;

	return typeof candidate.primaryButton === 'string';
}

export function isThreeButtonPrompt(arg: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt): arg is IThreeButtonPrompt {
	if (isFourButtonPrompt(arg)) {
		return false;
	}

	const candidate = arg as IThreeButtonPrompt;

	return typeof candidate.secondaryButton === 'string';
}

export function isFourButtonPrompt(arg: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt): arg is IFourButtonPrompt {
	const candidate = arg as IFourButtonPrompt;

	return typeof candidate.tertiaryButton === 'string';
}

export enum TwoButtonPromptResult {
	Cancel = 0,
	Primary = 1
}

export enum ThreeButtonPromptResult {
	Cancel = 0,
	Primary = 1,
	Secondary = 2
}

export enum FourButtonPromptResult {
	Cancel = 0,
	Primary = 1,
	Secondary = 2,
	Tertiary = 3
}

export interface IBasePromptResult extends ICheckboxResult {

	/**
	 * The button that was pressed by the user from the prompt.
	 */
	readonly choice: TwoButtonPromptResult | ThreeButtonPromptResult | FourButtonPromptResult;
}

export interface IOneButtonPromptResult extends ICheckboxResult { }

export interface ITwoButtonPromptResult extends IBasePromptResult {
	readonly choice: TwoButtonPromptResult;
}

export interface IThreeButtonPromptResult extends IBasePromptResult {
	readonly choice: ThreeButtonPromptResult;
}

export interface IFourButtonPromptResult extends IBasePromptResult {
	readonly choice: FourButtonPromptResult;
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
	 * Prompt the user with a modal dialog.
	 */
	prompt(prompt: IOneButtonPrompt): Promise<IOneButtonPromptResult>;
	prompt(prompt: ITwoButtonPrompt): Promise<ITwoButtonPromptResult>;
	prompt(prompt: IThreeButtonPrompt): Promise<IThreeButtonPromptResult>;
	prompt(prompt: IFourButtonPrompt): Promise<IFourButtonPromptResult>;

	/**
	 * Present a modal dialog to the user asking for input.
	 */
	input(input: IInput): Promise<IInputResult>;

	/**
	 * Present the about dialog to the user.
	 */
	about(): Promise<void>;

	/**
	 * @deprecated use `prompt` instead
	 */
	show(severity: Severity, message: string, buttons?: string[], options?: IDialogOptions): Promise<IShowResult>;
}

enum DialogKind {
	Confirmation = 1,
	Prompt,
	Input
}

export abstract class AbstractDialogHandler implements IDialogHandler {

	protected toConfirmationButtons(dialog: IConfirmation): string[] {
		return this.toButtons(dialog, DialogKind.Confirmation);
	}

	protected toPromptButtons(dialog: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt): string[] {
		return this.toButtons(dialog, DialogKind.Prompt);
	}

	protected toInputButtons(dialog: IInput): string[] {
		return this.toButtons(dialog, DialogKind.Input);
	}

	private toButtons(dialog: IConfirmation, kind: DialogKind.Confirmation): string[];
	private toButtons(dialog: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt, kind: DialogKind.Prompt): string[];
	private toButtons(dialog: IInput, kind: DialogKind.Input): string[];
	private toButtons(dialog: IConfirmation | IInput | IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt, kind: DialogKind): string[] {

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
				const promptDialog = dialog as IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt;

				if (isTwoButtonPrompt(promptDialog) || isThreeButtonPrompt(promptDialog) || isFourButtonPrompt(promptDialog)) {
					buttons.push(promptDialog.primaryButton);

					if (isThreeButtonPrompt(promptDialog) || isFourButtonPrompt(promptDialog)) {
						buttons.push(promptDialog.secondaryButton);
					}

					if (isFourButtonPrompt(promptDialog)) {
						buttons.push(promptDialog.tertiaryButton);
					}

					if (promptDialog.cancelButton) {
						buttons.push(promptDialog.cancelButton);
					} else {
						buttons.push(localize('cancelButton', "Cancel"));
					}
				} else {
					if (promptDialog.button) {
						buttons.push(promptDialog.button);
					} else {
						buttons.push(localize({ key: 'okButton', comment: ['&& denotes a mnemonic'] }, "&&OK"));
					}
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

	protected toPromptResult(prompt: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt, buttonIndex: number): TwoButtonPromptResult | ThreeButtonPromptResult | FourButtonPromptResult {
		let choice: TwoButtonPromptResult | ThreeButtonPromptResult | FourButtonPromptResult;
		if (isThreeButtonPrompt(prompt)) {
			switch (buttonIndex) {
				case 0:
					choice = ThreeButtonPromptResult.Primary;
					break;
				case 1:
					choice = ThreeButtonPromptResult.Secondary;
					break;
				default:
					choice = ThreeButtonPromptResult.Cancel;
			}
		} else if (isFourButtonPrompt(prompt)) {
			switch (buttonIndex) {
				case 0:
					choice = FourButtonPromptResult.Primary;
					break;
				case 1:
					choice = FourButtonPromptResult.Secondary;
					break;
				case 2:
					choice = FourButtonPromptResult.Tertiary;
					break;
				default:
					choice = FourButtonPromptResult.Cancel;
			}
		} else {
			switch (buttonIndex) {
				case 0:
					choice = TwoButtonPromptResult.Primary;
					break;
				default:
					choice = TwoButtonPromptResult.Cancel;
			}
		}

		return choice;
	}

	protected getDialogType(severity: Severity): DialogType {
		return (severity === Severity.Info) ? 'info' : (severity === Severity.Error) ? 'error' : (severity === Severity.Warning) ? 'warning' : 'none';
	}

	abstract confirm(confirmation: IConfirmation): Promise<IConfirmationResult>;
	abstract input(input: IInput): Promise<IInputResult>;
	abstract prompt(prompt: IOneButtonPrompt): Promise<IOneButtonPromptResult>;
	abstract prompt(prompt: ITwoButtonPrompt): Promise<ITwoButtonPromptResult>;
	abstract prompt(prompt: IThreeButtonPrompt): Promise<IThreeButtonPromptResult>;
	abstract prompt(prompt: IFourButtonPrompt): Promise<IFourButtonPromptResult>;
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
	 * Prompt the user with a modal dialog. Provides a bit
	 * more control over the dialog compared to the simpler
	 * `confirm` method. Specifically, allows to show more
	 * than 2 buttons and makes it easier to just show a
	 * message to the user.
	 */
	prompt(prompt: IOneButtonPrompt): Promise<IOneButtonPromptResult>;
	prompt(prompt: ITwoButtonPrompt): Promise<ITwoButtonPromptResult>;
	prompt(prompt: IThreeButtonPrompt): Promise<IThreeButtonPromptResult>;
	prompt(prompt: IFourButtonPrompt): Promise<IFourButtonPromptResult>;

	/**
	 * @deprecated
	 */
	show(severity: Severity, message: string, buttons?: string[], options?: IDialogOptions): Promise<IShowResult>;

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
