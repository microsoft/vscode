/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

let _fetch: typeof fetch;
try {
	_fetch = require('electron').net.fetch;
} catch {
	_fetch = fetch;
}
export const fetching = _fetch;
