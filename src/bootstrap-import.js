/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

// *********************************************************************
// *                                                                   *
// *  We need this to redirect to node_modules from the remote-folder. *
// *  This ONLY applies  when running out of source.                   *
// *                                                                   *
// *********************************************************************

import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises } from 'node:fs';
import { join } from 'node:path';

// SEE https://nodejs.org/docs/latest/api/module.html#initialize

/**
 * @type {Object.<string, string>}
 */
const _specifierToUrl = {};

/**
 * @param {string} injectPath
 */
export async function initialize(injectPath) {
	// populate mappings

	const injectPackageJSONPath = fileURLToPath(new URL('../package.json', pathToFileURL(injectPath)));
	const packageJSON = JSON.parse(String(await promises.readFile(injectPackageJSONPath)));

	for (const [name] of Object.entries(packageJSON.dependencies)) {
		try {
			const path = join(injectPackageJSONPath, `../node_modules/${name}/package.json`);
			let { main } = JSON.parse(String(await promises.readFile(path)));

			if (!main) {
				main = 'index.js';
			}
			if (!main.endsWith('.js')) {
				main += '.js';
			}
			const mainPath = join(injectPackageJSONPath, `../node_modules/${name}/${main}`);
			_specifierToUrl[name] = pathToFileURL(mainPath).href;

		} catch (err) {
			console.error(name);
			console.error(err);
		}
	}

	console.log(`[bootstrap-import] Initialized node_modules redirector for: ${injectPath}`);
}

/**
 * @param {string | number} specifier
 * @param {any} context
 * @param {(arg0: any, arg1: any) => any} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {

	const newSpecifier = _specifierToUrl[specifier];
	if (newSpecifier !== undefined) {
		// console.log('[HOOKS]', specifier, '--->', newSpecifier);
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
