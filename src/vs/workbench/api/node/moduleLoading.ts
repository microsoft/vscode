/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nodeModule from 'node:module';

const require = nodeModule.createRequire(import.meta.url);

/**
 * Node throws these when a module can only be loaded asynchronously: `ERR_REQUIRE_ASYNC_MODULE`
 * when it uses top-level await, `ERR_REQUIRE_ESM` on runtimes that can't require ESM at all.
 */
const asyncOnlyErrorCodes = new Set(['ERR_REQUIRE_ASYNC_MODULE', 'ERR_REQUIRE_ESM']);

/**
 * Loads a module synchronously, including ESM.
 *
 * Nothing else can run during a synchronous load, so a caller timing this call measures that
 * module's own work and nothing else. Returns `undefined` when the module can only be loaded
 * asynchronously, which the caller should follow with `import()`. Nothing has been evaluated
 * in that case, so the module is still safe to import.
 *
 * The result is wrapped so that a module whose exports are `undefined` is still a hit.
 */
export function tryRequireSync<T>(path: string): { readonly module: T } | undefined {
	try {
		return { module: <T>require(path) };
	} catch (err) {
		if (err instanceof Error && 'code' in err && typeof err.code === 'string' && asyncOnlyErrorCodes.has(err.code)) {
			return undefined;
		}
		throw err;
	}
}
