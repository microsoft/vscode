/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function validateSettings(settings: { retries: number; timeout: number }): void {
	if (!Number.isInteger(settings.retries) || settings.retries < 0) {
		throw new Error('Retry count must be a nonnegative integer.');
	}
	if (!Number.isFinite(settings.timeout) || settings.timeout <= 0) {
		throw new Error('Timeout must be a positive number.');
	}
}
