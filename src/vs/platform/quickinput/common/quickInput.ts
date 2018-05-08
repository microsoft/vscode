/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import { IPickOptions, IPickOpenEntry, IInputOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { CancellationToken } from 'vs/base/common/cancellation';

export const IQuickInputService = createDecorator<IQuickInputService>('quickInputService');

export interface IQuickInputService {

	_serviceBrand: any;

	/**
	 * Opens the quick input box for selecting items and returns a promise with the user selected item(s) if any.
	 */
	pick<T extends IPickOpenEntry, O extends IPickOptions>(picks: TPromise<T[]>, options?: O, token?: CancellationToken): TPromise<O extends { canPickMany: true } ? T[] : T>;

	/**
	 * Opens the quick input box for text input and returns a promise with the user typed value if any.
	 */
	input(options?: IInputOptions, token?: CancellationToken): TPromise<string>;

	focus(): void;

	navigate(next: boolean): void;

	accept(): TPromise<void>;

	cancel(): TPromise<void>;
}
