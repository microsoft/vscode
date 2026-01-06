/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function createTimeoutPromise<T>(timeout: number, defaultValue: T): Promise<T> {
	return new Promise(resolve => setTimeout(() => resolve(defaultValue), timeout));
}
