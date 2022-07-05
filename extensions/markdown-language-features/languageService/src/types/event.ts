/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../util/dispose';

/**
 * Represents a typed event.
 */
export interface Event<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}
