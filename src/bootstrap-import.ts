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
import { join } from 'node:path';

// SEE https://nodejs.org/docs/latest/api/module.html#initialize

const _specifierToUrl: Record<string, string> = {};
const _specifierToFormat: Record<string, string> = {};
const _nodeModulesPath: string[] = [];

export async function initialize(injectPath: string): Promise<void> {
	// populate mappings

	const injectPackageJSONPath = fileURLToPath(new URL('../package.json', pathToFileURL(injectPath)));
	const packageJSON = JSON.parse(String(await promises.readFile(injectPackageJSONPath)));

	// Remember the node_modules root for subpath resolution
	_nodeModulesPath.push(join(injectPackageJSONPath, `../node_modules`));

	for (const [name] of Object.entries(packageJSON.dependencies)) {
		try {
			const path = join(injectPackageJSONPath, `../node_modules/${name}/package.json`);
			const pkgJson = JSON.parse(String(await promises.readFile(path)));

			// Determine the entry point: prefer exports["."].import for ESM, then main
			let main: string | undefined;
			if (pkgJson.exports?.['.']) {
				const dotExport = pkgJson.exports['.'];
				if (typeof dotExport === 'string') {
					main = dotExport;
				} else if (typeof dotExport === 'object' && dotExport !== null) {
					main = dotExport.import ?? dotExport.default;
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
			const mainPath = join(injectPackageJSONPath, `../node_modules/${name}/${main}`);
			_specifierToUrl[name] = pathToFileURL(mainPath).href;
			// Determine module format: .mjs is always ESM, .cjs always CJS, otherwise check type field
			const isModule = main.endsWith('.mjs')
				? true
				: main.endsWith('.cjs')
					? false
					: pkgJson.type === 'module';
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

	// Handle subpath imports (e.g., 'vscode-jsonrpc/node') by resolving
	// through the redirected node_modules directory, delegating the actual
	// resolution logic to Node's resolver by adjusting parentURL.
	if (_nodeModulesPath.length > 0 && typeof specifier === 'string' && !specifier.startsWith('.') && !specifier.startsWith('node:')) {
		for (const nmPath of _nodeModulesPath) {
			// Construct a synthetic parent URL located above the redirected
			// node_modules folder so that Node's resolver will consider
			// that node_modules when resolving the bare specifier.
			const syntheticParentURL = pathToFileURL(join(nmPath, '..', '__bootstrap_import_resolve__.js')).href;
			const nextContext = typeof context === 'object' && context !== null
				? { ...(context as Record<string, unknown>), parentURL: syntheticParentURL }
				: { parentURL: syntheticParentURL };
			try {
				return await nextResolve(specifier, nextContext);
			} catch {
				// If resolution fails for this node_modules path, try the next one
			}
		}
	}

	// Defer to the next hook in the chain, which would be the
	// Node.js default resolve if this is the last user-specified loader.
	return nextResolve(specifier, context);
}
