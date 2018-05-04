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
	 * For multi-select only. WIP.
	 */
	pick<T extends IPickOpenEntry>(picks: TPromise<T[]>, options?: IPickOptions, token?: CancellationToken): TPromise<T[]>;

	/**
	 * Opens the quick open box for user input and returns a promise with the user typed value if any.
	 */
	input(options?: IInputOptions, token?: CancellationToken): TPromise<string>;

	focus(): void;

	accept(): TPromise<void>;

	cancel(): TPromise<void>;
}
