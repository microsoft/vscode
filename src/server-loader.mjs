/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

// NOTE
// NOTE: We need this to redirect to node_modules from the remote-folder. This ONLY applies
// NOTE: when running out of source.
// NOTE

import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises } from 'node:fs';
import { join } from 'node:path';

// SEE https://nodejs.org/docs/latest/api/module.html#initialize

const _specifierToUrl = {};

export async function initialize() {
	// populate mappings

	const serverPackageJSONPath = fileURLToPath(new URL('../remote/package.json', import.meta.url));
	const packageJSON = JSON.parse(String(await promises.readFile(serverPackageJSONPath)));

	for (const [name] of Object.entries(packageJSON.dependencies)) {
		try {
			const path = join(serverPackageJSONPath, `../node_modules/${name}/package.json`);
			let { main } = JSON.parse(String(await promises.readFile(path)));

			if (!main) {
				main = 'index.js';
			}
			if (!main.endsWith('.js')) {
				main += '.js';
			}
			const mainPath = join(serverPackageJSONPath, `../node_modules/${name}/${main}`);
			_specifierToUrl[name] = pathToFileURL(mainPath).href;

		} catch (err) {
			console.error(name);
			console.error(err);
		}
	}

	console.log('[DEV] Initialized node_modules redirector');
}

export async function resolve(specifier, context, nextResolve) {

	const newSpecifier = _specifierToUrl[specifier];
	if (newSpecifier !== undefined) {
		// console.log('[ESM_LOADER]', specifier, '--->', newSpecifier);
		return {
			format: 'commonjs',
			shortCircuit: true,
			url: newSpecifier
		};
	}

	// Defer to the next hook in the chain, which would be the
	// Node.js default resolve if this is the last user-specified loader.
	return nextResolve(specifier, context);
}
