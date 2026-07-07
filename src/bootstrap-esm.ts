/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import { register } from 'node:module';
import { sep } from 'node:path';
import { product, pkg } from './bootstrap-meta.js';
import './bootstrap-node.js';
import * as performance from './vs/base/common/performance.js';
import { INLSConfiguration } from './vs/nls.js';

// Prepare globals that are needed for running
globalThis._VSCODE_PRODUCT_JSON = { ...product };
globalThis._VSCODE_PACKAGE_JSON = { ...pkg };
globalThis._VSCODE_FILE_ROOT = import.meta.dirname;

// Install a hook to ESM module resolution that
// 1) maps 'fs' to 'original-fs' (the ASAR-unaware Node.js `fs`), and
// 2) resolves bare module specifiers into our `node_modules.asar` archive.
//
// The archive keeps the same top-level layout as `node_modules`
// (`node_modules.asar/<module>`). Node's default ESM resolver only ever looks
// into directories literally named `node_modules`, so it cannot find modules at
// the archive's top level on its own. We therefore locate the target package
// inside the archive (via its `package.json`) and re-run the default resolution
// rooted inside that package so Node resolves it as a package self-reference,
// applying the package's real `exports`/`main` fields and ESM conditions. This
// top-level layout is what allows extensions (e.g. Dev Containers) that reach
// into `${appRoot}/node_modules.asar/<module>` to keep working.
//
// The archive stands in for the application's own `node_modules` folder, which
// is the *farthest* directory Node would walk to. We therefore always try the
// default resolution first: an importer that ships its own dependencies (e.g. a
// built-in extension under `${appRoot}/extensions/<ext>` that bundles a
// different copy of a package) must resolve against its own, closer
// `node_modules` — exactly as it would without the archive. Only when the
// default resolution finds nothing do we consult the archive.
function enableASARSupport(): void {
	if (!process.env['ELECTRON_RUN_AS_NODE'] && !process.versions['electron']) {
		return; // only on Electron / Electron-as-node
	}

	const jsCode = `
	import { createRequire, isBuiltin } from 'node:module';
	import { pathToFileURL, fileURLToPath } from 'node:url';

	let asarRequire;
	let resourcesPath;

	function isRelativeSpecifier(specifier) {
		if (specifier[0] === '.') {
			if (specifier.length === 1 || specifier[1] === '/') { return true; }
			if (specifier[1] === '.') {
				if (specifier.length === 2 || specifier[2] === '/') { return true; }
			}
		}
		return false;
	}

	function normalizeDriveLetter(path) {
		if (process.platform === 'win32'
			&& path.length >= 2
			&& (path.charCodeAt(0) >= 65 && path.charCodeAt(0) <= 90 || path.charCodeAt(0) >= 97 && path.charCodeAt(0) <= 122)
			&& path.charCodeAt(1) === 58) {
			return path[0].toLowerCase() + path.slice(1);
		}
		return path;
	}

	// Extract the package name from a bare specifier, e.g.
	// 'foo/lib/x.js' -> 'foo', '@scope/bar/baz' -> '@scope/bar'.
	function packageNameOf(specifier) {
		if (specifier[0] === '@') {
			const firstSlash = specifier.indexOf('/');
			if (firstSlash === -1) { return specifier; }
			const secondSlash = specifier.indexOf('/', firstSlash + 1);
			return secondSlash === -1 ? specifier : specifier.slice(0, secondSlash);
		}
		const slash = specifier.indexOf('/');
		return slash === -1 ? specifier : specifier.slice(0, slash);
	}

	export async function initialize({ resourcesPath: resPath, asarPath }) {
		if (asarPath) {
			resourcesPath = normalizeDriveLetter(resPath);
			// A require rooted at the archive: 'require.resolve("./<module>")'
			// resolves into '<asarPath>/<module>' (top-level layout). The leading
			// './' is required so resolution is relative to the archive root rather
			// than a bare-specifier node_modules walk (the archive directory is
			// named node_modules.asar, so a bare walk would never find it).
			asarRequire = createRequire(asarPath + '/x.js');
		}
	}

	export async function resolve(specifier, context, nextResolve) {
		if (specifier === 'fs') {
			return {
				format: 'builtin',
				shortCircuit: true,
				url: 'node:original-fs'
			};
		}

		if (asarRequire && context.parentURL && !isRelativeSpecifier(specifier) && !isBuiltin(specifier)) {
			let parentPath;
			try { parentPath = normalizeDriveLetter(fileURLToPath(context.parentURL)); } catch { parentPath = undefined; }
			if (parentPath && parentPath.startsWith(resourcesPath)) {
				// Try the default resolution first so an importer that ships its own
				// dependencies (e.g. a built-in extension that bundles a different copy
				// of a package) resolves against its own, closer 'node_modules' instead
				// of being redirected into the app archive. The archive stands in for
				// the application's own (farthest) 'node_modules', so it must only be
				// consulted once the default walk has found nothing.
				try {
					return await nextResolve(specifier, context);
				} catch (defaultError) {
					// Locate the package inside the archive via its package.json (this is
					// resolution-condition independent). Then re-run the default ESM
					// resolution rooted *inside* that package so Node resolves the request
					// as a package self-reference. This applies the real 'exports'/'main'
					// fields and ESM conditions ('import' over 'require'), which is required
					// for dual CJS/ESM packages (e.g. 'playwright-core') to load their ESM
					// entry and expose their named exports.
					let packageJsonPath;
					try {
						packageJsonPath = asarRequire.resolve('./' + packageNameOf(specifier) + '/package.json');
					} catch {
						// Not part of the archive either: surface the original resolution
						// error rather than a misleading archive-specific one.
						throw defaultError;
					}
					try {
						return await nextResolve(specifier, { ...context, parentURL: pathToFileURL(packageJsonPath).href });
					} catch {
						// The package has no matching 'exports' entry (or no 'exports' at
						// all). Fall back to direct resolution, which honors 'main' and
						// explicit file subpaths.
						const resolved = asarRequire.resolve('./' + specifier);
						return { url: pathToFileURL(resolved).href, shortCircuit: true };
					}
				}
			}
		}

		// Defer to the next hook in the chain, which would be the
		// Node.js default resolve if this is the last user-specified loader.
		return nextResolve(specifier, context);
	}`;

	register(`data:text/javascript;base64,${Buffer.from(jsCode).toString('base64')}`, import.meta.url, {
		data: process.env['VSCODE_DEV'] ? {} : {
			resourcesPath: `${process.resourcesPath}${sep}app`,
			asarPath: `${process.resourcesPath}${sep}app${sep}node_modules.asar`,
		}
	});
}

enableASARSupport();

//#region NLS helpers

let setupNLSResult: Promise<INLSConfiguration | undefined> | undefined = undefined;

function setupNLS(): Promise<INLSConfiguration | undefined> {
	if (!setupNLSResult) {
		setupNLSResult = doSetupNLS();
	}

	return setupNLSResult;
}

async function doSetupNLS(): Promise<INLSConfiguration | undefined> {
	performance.mark('code/willLoadNls');

	let nlsConfig: INLSConfiguration | undefined = undefined;

	let messagesFile: string | undefined;
	if (process.env['VSCODE_NLS_CONFIG']) {
		try {
			nlsConfig = JSON.parse(process.env['VSCODE_NLS_CONFIG']);
			if (nlsConfig?.languagePack?.messagesFile) {
				messagesFile = nlsConfig.languagePack.messagesFile;
			} else if (nlsConfig?.defaultMessagesFile) {
				messagesFile = nlsConfig.defaultMessagesFile;
			}

			globalThis._VSCODE_NLS_LANGUAGE = nlsConfig?.resolvedLanguage;
		} catch (e) {
			console.error(`Error reading VSCODE_NLS_CONFIG from environment: ${e}`);
		}
	}

	if (
		process.env['VSCODE_DEV'] ||	// no NLS support in dev mode
		!messagesFile					// no NLS messages file
	) {
		return undefined;
	}

	try {
		globalThis._VSCODE_NLS_MESSAGES = JSON.parse((await fs.promises.readFile(messagesFile)).toString());
	} catch (error) {
		console.error(`Error reading NLS messages file ${messagesFile}: ${error}`);

		// Mark as corrupt: this will re-create the language pack cache next startup
		if (nlsConfig?.languagePack?.corruptMarkerFile) {
			try {
				await fs.promises.writeFile(nlsConfig.languagePack.corruptMarkerFile, 'corrupted');
			} catch (error) {
				console.error(`Error writing corrupted NLS marker file: ${error}`);
			}
		}

		// Fallback to the default message file to ensure english translation at least
		if (nlsConfig?.defaultMessagesFile && nlsConfig.defaultMessagesFile !== messagesFile) {
			try {
				globalThis._VSCODE_NLS_MESSAGES = JSON.parse((await fs.promises.readFile(nlsConfig.defaultMessagesFile)).toString());
			} catch (error) {
				console.error(`Error reading default NLS messages file ${nlsConfig.defaultMessagesFile}: ${error}`);
			}
		}
	}

	performance.mark('code/didLoadNls');

	return nlsConfig;
}

//#endregion

export async function bootstrapESM(): Promise<void> {

	// NLS
	await setupNLS();
}
