/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace } from 'vscode';

let _fetch: typeof fetch;

const useElectronFetch = workspace.getConfiguration('github-authentication').get<boolean>('useElectronFetch', true);
if (useElectronFetch) {
	try {
		_fetch = require('electron').net.fetch;
	} catch {
		_fetch = fetch;
	}
} else {
	_fetch = fetch;
}

export const fetching = _fetch;
