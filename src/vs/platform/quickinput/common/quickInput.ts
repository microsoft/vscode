/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';

export interface IQuickPickItem {
	type?: 'item';
	id?: string;
	label: string;
	description?: string;
	detail?: string;
	iconClasses?: string[];
	buttons?: IQuickInputButton[];
	picked?: boolean;
	alwaysShow?: boolean;
}

export interface IQuickPickSeparator {
	type: 'separator';
	label?: string;
}

export interface IKeyMods {
	readonly ctrlCmd: boolean;
	readonly alt: boolean;
}

export interface IQuickNavigateConfiguration {
	keybindings: ResolvedKeybinding[];
}

export interface IPickOptions<T extends IQuickPickItem> {

	/**
	 * an optional string to show as place holder in the input box to guide the user what she picks on
	 */
	placeHolder?: string;

	/**
	 * an optional flag to include the description when filtering the picks
	 */
	matchOnDescription?: boolean;

	/**
	 * an optional flag to include the detail when filtering the picks
	 */
	matchOnDetail?: boolean;

	/**
	 * an optional flag to filter the picks based on label. Defaults to true.
	 */
	matchOnLabel?: boolean;

	/**
	 * an option flag to control whether focus is always automatically brought to a list item. Defaults to true.
	 */
	autoFocusOnList?: boolean;

	/**
	 * an optional flag to not close the picker on focus lost
	 */
	ignoreFocusLost?: boolean;

	/**
	 * an optional flag to make this picker multi-select
	 */
	canPickMany?: boolean;

	/**
	 * enables quick navigate in the picker to open an element without typing
	 */
	quickNavigate?: IQuickNavigateConfiguration;

	/**
	 * a context key to set when this picker is active
	 */
	contextKey?: string;

	/**
	 * an optional property for the item to focus initially.
	 */
	activeItem?: Promise<T> | T;

	onKeyMods?: (keyMods: IKeyMods) => void;
	onDidFocus?: (entry: T) => void;
	onDidTriggerItemButton?: (context: IQuickPickItemButtonContext<T>) => void;
}

export interface IInputOptions {

	/**
	 * the value to prefill in the input box
	 */
	value?: string;

	/**
	 * the selection of value, default to the whole word
	 */
	valueSelection?: [number, number];

	/**
	 * the text to display underneath the input box
	 */
	prompt?: string;

	/**
	 * an optional string to show as place holder in the input box to guide the user what to type
	 */
	placeHolder?: string;

	/**
	 * set to true to show a password prompt that will not show the typed value
	 */
	password?: boolean;

	ignoreFocusLost?: boolean;

	/**
	 * an optional function that is used to validate user input.
	 */
	validateInput?: (input: string) => Promise<string | null | undefined>;
}

export interface IQuickInput {

	title: string | undefined;

	step: number | undefined;

	totalSteps: number | undefined;

	enabled: boolean;

	contextKey: string | undefined;

	busy: boolean;

	ignoreFocusOut: boolean;

	show(): void;

	hide(): void;

	onDidHide: Event<void>;

	dispose(): void;
}

export interface IQuickPick<T extends IQuickPickItem> extends IQuickInput {

	value: string;

	placeholder: string | undefined;

	readonly onDidChangeValue: Event<string>;

	readonly onDidAccept: Event<void>;

	ok: boolean;

	readonly onDidCustom: Event<void>;

	customButton: boolean;

	customLabel: string;

	customHover: string;

	buttons: ReadonlyArray<IQuickInputButton>;

	readonly onDidTriggerButton: Event<IQuickInputButton>;

	readonly onDidTriggerItemButton: Event<IQuickPickItemButtonEvent<T>>;

	items: ReadonlyArray<T | IQuickPickSeparator>;

	canSelectMany: boolean;

	matchOnDescription: boolean;

	matchOnDetail: boolean;

	matchOnLabel: boolean;

	autoFocusOnList: boolean;

	quickNavigate: IQuickNavigateConfiguration | undefined;

	activeItems: ReadonlyArray<T>;

	readonly onDidChangeActive: Event<T[]>;

	selectedItems: ReadonlyArray<T>;

	readonly onDidChangeSelection: Event<T[]>;

	readonly keyMods: IKeyMods;

	valueSelection: Readonly<[number, number]> | undefined;

	validationMessage: string | undefined;

	inputHasFocus(): boolean;
}

export interface IInputBox extends IQuickInput {

	value: string;

	valueSelection: Readonly<[number, number]> | undefined;

	placeholder: string | undefined;

	password: boolean;

	readonly onDidChangeValue: Event<string>;

	readonly onDidAccept: Event<void>;

	buttons: ReadonlyArray<IQuickInputButton>;

	readonly onDidTriggerButton: Event<IQuickInputButton>;

	prompt: string | undefined;

	validationMessage: string | undefined;
}

export interface IQuickInputButton {
	/** iconPath or iconClass required */
	iconPath?: { dark: URI; light?: URI; };
	/** iconPath or iconClass required */
	iconClass?: string;
	tooltip?: string;
}

export interface IQuickPickItemButtonEvent<T extends IQuickPickItem> {
	button: IQuickInputButton;
	item: T;
}

export interface IQuickPickItemButtonContext<T extends IQuickPickItem> extends IQuickPickItemButtonEvent<T> {
	removeItem(): void;
}

export const IQuickInputService = createDecorator<IQuickInputService>('quickInputService');

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type QuickPickInput<T = IQuickPickItem> = T | IQuickPickSeparator;

export interface IQuickInputService {

	_serviceBrand: any;

	/**
	 * Opens the quick input box for selecting items and returns a promise with the user selected item(s) if any.
	 */
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[]>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T>;

	/**
	 * Opens the quick input box for text input and returns a promise with the user typed value if any.
	 */
	input(options?: IInputOptions, token?: CancellationToken): Promise<string>;

	backButton: IQuickInputButton;

	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T>;
	createInputBox(): IInputBox;

	focus(): void;

	toggle(): void;

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void;

	accept(): Promise<void>;

	back(): Promise<void>;

	cancel(): Promise<void>;
}
