/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

// NOTE
// NOTE: replaces the patched electron fs with the original node fs for all AMD code
// NOTE

// SEE https://nodejs.org/docs/latest/api/module.html#resolvespecifier-context-nextresolve

export async function resolve(specifier, context, nextResolve) {

	if (specifier === 'fs') {
		return {
			format: 'builtin',
			shortCircuit: true,
			url: 'node:original-fs'
		};
	}

	// Defer to the next hook in the chain, which would be the
	// Node.js default resolve if this is the last user-specified loader.
	return nextResolve(specifier, context);
}
