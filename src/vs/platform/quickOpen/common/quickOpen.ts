/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import Event from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IQuickNavigateConfiguration, IAutoFocus, IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IFilePickOpenEntry extends IPickOpenEntry {
	resource: uri;
	isFolder?: boolean;
}

export interface IPickOpenEntry {
	id?: string;
	label: string;
	description?: string;
	detail?: string;
	separator?: ISeparator;
	alwaysShow?: boolean;
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

	/**
	 * an optional flag to not close the picker on focus lost
	 */
	ignoreFocusLost?: boolean;
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

	ignoreFocusLost?: boolean;

	/**
	 * an optional function that is used to validate user input.
	 */
	validateInput?: (input: string) => TPromise<string>;
}

export interface IShowOptions {
	quickNavigateConfiguration?: IQuickNavigateConfiguration;
}

export const IQuickOpenService = createDecorator<IQuickOpenService>('quickOpenService');

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
	 * A convenient way to bring up quick open as a picker with custom elements. This bypasses the quick open handler
	 * registry and just leverages the quick open widget to select any kind of entries.
	 *
	 * Passing in a promise will allow you to resolve the elements in the background while quick open will show a
	 * progress bar spinning.
	 */
	pick(picks: TPromise<string[]>, options?: IPickOptions, token?: CancellationToken): TPromise<string>;
	pick<T extends IPickOpenEntry>(picks: TPromise<T[]>, options?: IPickOptions, token?: CancellationToken): TPromise<T>;
	pick(picks: string[], options?: IPickOptions, token?: CancellationToken): TPromise<string>;
	pick<T extends IPickOpenEntry>(picks: T[], options?: IPickOptions, token?: CancellationToken): TPromise<T>;

	/**
	 * Allows to navigate from the outside in an opened picker.
	 */
	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void;

	/**
	 * Opens the quick open box for user input and returns a promise with the user typed value if any.
	 */
	input(options?: IInputOptions, token?: CancellationToken): TPromise<string>;

	/**
	 * Accepts the selected value in quick open if visible.
	 */
	accept(): void;

	/**
	 * Focus into the quick open if visible.
	 */
	focus(): void;

	/**
	 * Closes any opened quick open.
	 */
	close(): void;

	/**
	 * Allows to register on the event that quick open is showing
	 */
	onShow: Event<void>;

	/**
	 * Allows to register on the event that quick open is hiding
	 */
	onHide: Event<void>;
}