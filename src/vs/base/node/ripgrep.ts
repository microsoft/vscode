/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from '../common/lazy.js';

const _rgDiskPath = new Lazy(async () => {
	const m = await import('@vscode/ripgrep-universal');
	return m.rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');
});

export function rgDiskPath(): Promise<string> {
	return _rgDiskPath.value;
}
