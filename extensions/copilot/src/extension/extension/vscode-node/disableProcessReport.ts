/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

if (process.report) {
	try {
		Object.defineProperty(process.report, 'getReport', {
			value: () => undefined,
			writable: true,
			configurable: true,
			enumerable: true
		});
	} catch (err) {

	}
}
