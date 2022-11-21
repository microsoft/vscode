/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
import * as _minimist from 'minimist';
// ESM-comment-end

// ESM-uncomment-begin
// const _minimist = globalThis._VSCODE_NODE_MODULES.minimist;
// ESM-uncomment-end

// console.log('HEHEHE', typeof _minimist, Object.keys(_minimist), _minimist.minimist);

export default function minimist(...args: Parameters<typeof _minimist>) {
	return _minimist.apply(_minimist, args);
}
