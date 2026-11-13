/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// *********************************************************************
// *                                                                   *
// *  We need this to redirect to node_modules from the remote-folder. *
// *  This ONLY applies when running out of source.                   *
// *                                                                   *
// *********************************************************************

import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises } from 'node:fs';
import { dirname, join } from 'node:path';

// SEE https://nodejs.org/docs/latest/api/module.html#initialize

const _specifierToUrl: Record<string, string> = {};
const _specifierToFormat: Record<string, string> = {};

/**
 * Returns the `type` of the `package.json` closest to `entryDir`, stopping at the
 * package root. Like Node.js, this honors nested `package.json` files that mark only
 * a subfolder as ESM (e.g. `@hpke/core`'s `esm/` folder).
 */
async function getNearestPackageType(entryDir: string, packageRoot: string, rootType: unknown): Promise<unknown> {
	for (let dir = entryDir; dir !== packageRoot && dir.startsWith(packageRoot); dir = dirname(dir)) {
		try {
			return JSON.parse(String(await promises.readFile(join(dir, 'package.json')))).type;
		} catch {
			// no package.json in this folder, continue with the parent
		}
	}
	return rootType;
}

export async function initialize(injectPath: string): Promise<void> {
	// populate mappings

	const injectPackageJSONPath = fileURLToPath(new URL('../package.json', pathToFileURL(injectPath)));
	const packageJSON = JSON.parse(String(await promises.readFile(injectPackageJSONPath)));

	for (const [name] of Object.entries(packageJSON.dependencies)) {
		try {
			const path = join(injectPackageJSONPath, `../node_modules/${name}/package.json`);
			const pkgJson = JSON.parse(String(await promises.readFile(path)));

			// Determine the entry point: prefer exports["."].import for ESM, then main.
			// Handle conditional export targets where exports["."].import/default
			// can be a string or an object with a string `default` field.
			// (Added for copilot-sdk)
			let main: string | undefined;
			if (pkgJson.exports?.['.']) {
				const dotExport = pkgJson.exports['.'];
				if (typeof dotExport === 'string') {
					main = dotExport;
				} else if (typeof dotExport === 'object' && dotExport !== null) {
					const resolveCondition = (v: unknown): string | undefined => {
						if (typeof v === 'string') {
							return v;
						}
						if (typeof v === 'object' && v !== null) {
							const d = (v as { default?: unknown }).default;
							if (typeof d === 'string') {
								return d;
							}
						}
						return undefined;
					};
					main = resolveCondition(dotExport.import) ?? resolveCondition(dotExport.default);
				}
			}
			if (typeof main !== 'string') {
				main = typeof pkgJson.main === 'string' ? pkgJson.main : undefined;
			}

			if (!main) {
				main = 'index.js';
			}
			if (!main.endsWith('.js') && !main.endsWith('.mjs') && !main.endsWith('.cjs')) {
				main += '.js';
			}
			// Use the real path like Node.js does, so that ESM entries can resolve their
			// own dependencies next to symlinked (e.g. pnpm) packages.
			const packageRoot = await promises.realpath(join(injectPackageJSONPath, `../node_modules/${name}`));
			const mainPath = join(packageRoot, main);
			_specifierToUrl[name] = pathToFileURL(mainPath).href;
			// Determine module format: .mjs is always ESM, .cjs always CJS, otherwise check the nearest type field
			const isModule = main.endsWith('.mjs')
				? true
				: main.endsWith('.cjs')
					? false
					: await getNearestPackageType(dirname(mainPath), packageRoot, pkgJson.type) === 'module';
			_specifierToFormat[name] = isModule ? 'module' : 'commonjs';

		} catch (err) {
			console.error(name);
			console.error(err);
		}
	}

	console.log(`[bootstrap-import] Initialized node_modules redirector for: ${injectPath}`);
}

export async function resolve(specifier: string | number, context: unknown, nextResolve: (arg0: unknown, arg1: unknown) => unknown) {

	const newSpecifier = _specifierToUrl[specifier];
	if (newSpecifier !== undefined) {
		return {
			format: _specifierToFormat[specifier] ?? 'commonjs',
			shortCircuit: true,
			url: newSpecifier
		};
	}

	// Defer to the next hook in the chain, which would be the
	// Node.js default resolve if this is the last user-specified loader.
	return nextResolve(specifier, context);
}
