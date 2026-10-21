/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { computeNodeModulesCacheKey, type NodeModulesCachePart } from './cacheKeys.ts';

// Usage: node computeNodeModulesCacheKey.ts [--part=native|js] ARGS...
const args = process.argv.slice(2);
let part: NodeModulesCachePart = 'all';
const match = /^--part=(native|js)$/.exec(args[0] ?? '');
if (match) {
	part = match[1] as NodeModulesCachePart;
	args.shift();
}

process.stdout.write(computeNodeModulesCacheKey(args, undefined, part));
