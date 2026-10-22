/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { computeNodeModulesCacheKey, type NodeModulesCachePart } from './cacheKeys.ts';

// Usage: node computeNodeModulesCacheKey.ts [--part=native|js] ARGS...
let part: NodeModulesCachePart = 'all';
const args: string[] = [];
for (const arg of process.argv.slice(2)) {
	const match = /^--part=(native|js)$/.exec(arg);
	if (match) {
		part = match[1] as NodeModulesCachePart;
	} else if (arg.startsWith('--')) {
		throw new Error(`Unknown option: ${arg}`);
	} else {
		args.push(arg);
	}
}

process.stdout.write(computeNodeModulesCacheKey(args, undefined, part));
