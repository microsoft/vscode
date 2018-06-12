/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import URI from 'vs/base/common/uri';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { Event } from 'vs/base/common/event';

export interface IQuickPickItem {
	id?: string;
	label: string;
	description?: string;
	detail?: string;
	picked?: boolean;
}

export interface IQuickNavigateConfiguration {
	keybindings: ResolvedKeybinding[];
}

export interface IPickOptions {

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
	 * an optional flag to not close the picker on focus lost
	 */
	ignoreFocusLost?: boolean;

	/**
	 * an optional flag to make this picker multi-select
	 */
	canPickMany?: boolean;
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
	validateInput?: (input: string) => TPromise<string>;
}

export interface IQuickInput {


	enabled: boolean;

	busy: boolean;

	ignoreFocusOut: boolean;

	show(): void;

	hide(): void;

	onDidHide: Event<void>;

	dispose(): void;
}

export interface IQuickPick extends IQuickInput {

	value: string;

	placeholder: string;

	readonly onDidValueChange: Event<string>;

	readonly onDidAccept: Event<string>;

	buttons: ReadonlyArray<IQuickInputButton>;

	readonly onDidTriggerCommand: Event<IQuickInputButton>;

	items: ReadonlyArray<IQuickPickItem>;

	canSelectMany: boolean;

	matchOnDescription: boolean;

	matchOnDetail: boolean;

	readonly activeItems: ReadonlyArray<IQuickPickItem>;

	readonly onDidChangeActive: Event<IQuickPickItem[]>;

	readonly selectedItems: ReadonlyArray<IQuickPickItem>;

	readonly onDidChangeSelection: Event<IQuickPickItem[]>;
}

export interface IInputBox extends IQuickInput {

	value: string;

	valueSelection: Readonly<[number, number]>;

	placeholder: string;

	password: boolean;

	readonly onDidChangeValue: Event<string>;

	readonly onDidAccept: Event<string>;

	buttons: ReadonlyArray<IQuickInputButton>;

	readonly onDidTriggerButton: Event<IQuickInputButton>;

	prompt: string;

	validationMessage: string;
}

export interface IQuickInputButton {
	iconPath: string | URI | { light: string | URI; dark: string | URI } | ThemeIcon;
	tooltip?: string | undefined;
}

export const IQuickInputService = createDecorator<IQuickInputService>('quickInputService');

export interface IQuickInputService {

	_serviceBrand: any;

	/**
	 * Opens the quick input box for selecting items and returns a promise with the user selected item(s) if any.
	 */
	pick<T extends IQuickPickItem, O extends IPickOptions>(picks: TPromise<T[]>, options?: O, token?: CancellationToken): TPromise<O extends { canPickMany: true } ? T[] : T>;

	/**
	 * Opens the quick input box for text input and returns a promise with the user typed value if any.
	 */
	input(options?: IInputOptions, token?: CancellationToken): TPromise<string>;

	createQuickPick(): IQuickPick;
	createInputBox(): IInputBox;

	focus(): void;

	toggle(): void;

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void;

	accept(): TPromise<void>;

	cancel(): TPromise<void>;
}
