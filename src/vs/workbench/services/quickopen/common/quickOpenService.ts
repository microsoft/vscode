/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import {IQuickNavigateConfiguration, IAutoFocus, IEntryRunContext} from 'vs/base/parts/quickopen/common/quickOpen';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';

export interface IPickOpenEntry {
	id?: string;
	label: string;
	description?: string;
	detail?: string;
	separator?: ISeparator;
	run?: (context: IEntryRunContext) => void;
}

export interface ISeparator {
	border?: boolean;
	label?: string;
}

export interface IPickOptions {

	/**
	 * an optional string to show as place holder in the input box to guide the user what she picks on
	 */
	placeHolder?: string;

	/**
	 * optional auto focus settings
	 */
	autoFocus?: IAutoFocus;

	/**
	 * an optional flag to include the description when filtering the picks
	 */
	matchOnDescription?: boolean;

	/**
	 * an optional flag to include the detail when filtering the picks
	 */
	matchOnDetail?: boolean;
}

export interface IInputOptions {

	/**
	 * the value to prefill in the input box
	 */
	value?: string;

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

	/**
	 * an optional function that is used to validate user input.
	 */
	validateInput?: (input: string) => TPromise<string>;
}

export interface IShowOptions {
	quickNavigateConfiguration?: IQuickNavigateConfiguration;
}

export var IQuickOpenService = createDecorator<IQuickOpenService>('quickOpenService');

export interface IQuickOpenService {

	_serviceBrand: any;

	/**
	 * Asks the container to show the quick open control with the optional prefix set. If the optional parameter
	 * is set for quick navigation mode, the quick open control will quickly navigate when the quick navigate
	 * key is pressed and will run the selection after the ctrl key is released.
	 *
	 * The returned promise completes when quick open is closing.
	 */
	show(prefix?: string, options?: IShowOptions): TPromise<void>;

	/**
	 * Refreshes the quick open control. No-op, if the control is hidden.
	 * If an input is provided, then the operation will only succeed if that same input is still
	 * in the quick open control.
	 */
	refresh(input?: string): TPromise<void>;

	/**
	 * A convenient way to bring up quick open as a picker with custom elements. This bypasses the quick open handler
	 * registry and just leverages the quick open widget to select any kind of entries.
	 *
	 * Passing in a promise will allow you to resolve the elements in the background while quick open will show a
	 * progress bar spinning.
	 */
	pick(picks: TPromise<string[]>, options?: IPickOptions): TPromise<string>;
	pick<T extends IPickOpenEntry>(picks: TPromise<T[]>, options?: IPickOptions): TPromise<T>;
	pick(picks: string[], options?: IPickOptions): TPromise<string>;
	pick<T extends IPickOpenEntry>(picks: T[], options?: IPickOptions): TPromise<T>;

	/**
	 * Should not be used by clients. Will cause any opened quick open widget to navigate in the result set.
	 */
	quickNavigate(configuration: IQuickNavigateConfiguration, next: boolean): void;

	/**
	 * Opens the quick open box for user input and returns a promise with the user typed value if any.
	 */
	input(options?: IInputOptions): TPromise<string>;

	/**
	 * Allows to register on the event that quick open is showing
	 */
	onShow: Event<void>;

	/**
	 * Allows to register on the event that quick open is hiding
	 */
	onHide: Event<void>;
}