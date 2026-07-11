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
	import { appendFileSync } from 'node:fs';

	let asarRequire;
	let resourcesPath;
	let trace;

	function setupTrace(sink) {
		if (!sink) { return; }
		const prefix = '[asar-resolve] ';
		if (sink === '1' || sink === 'true' || sink === 'on' || sink === 'stderr') {
			trace = msg => { try { process.stderr.write(prefix + msg + '\\n'); } catch { /* ignore */ } };
		} else {
			// Any other value is treated as a log file path to append to.
			trace = msg => { try { appendFileSync(sink, prefix + msg + '\\n'); } catch { /* ignore */ } };
		}
		trace('tracing enabled (node ' + process.versions.node + '); resourcesPath=' + resourcesPath);
	}

	// True only for *bare package specifiers* — the exact inputs Node routes to
	// its PACKAGE_RESOLVE (node_modules walk / self-reference / 'exports'/'main').
	//  - relative ('./', '../') and absolute ('/') paths -> new URL(specifier, base)
	//  - '#name' subpath imports                         -> PACKAGE_IMPORTS_RESOLVE
	//  - URL-scheme specifiers ('file:', 'data:', 'node:', 'electron:', ...) -> used verbatim
	function isBarePackageSpecifier(specifier) {
		if (specifier === '') { return false; }
		const c = specifier[0];
		if (c === '.' || c === '/' || c === '#') { return false; }
		return !URL.canParse(specifier);
	}

	// Electron injects a synthetic 'electron' module (also reachable via the
	// 'electron/main', 'electron/common' and 'electron/renderer' aliases) that
	// the loader resolves to the 'electron:' URL scheme rather than a real file.
	// 'node:module#isBuiltin' does not recognize it, so we detect it explicitly
	// and treat it like a Node built-in: it lives in the runtime, never in
	// 'node_modules', and must never be redirected into the archive.
	function isElectronBuiltin(specifier) {
		return specifier === 'electron' || specifier.startsWith('electron/');
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

	export async function initialize({ resourcesPath: resPath, asarPath, traceSink }) {
		if (asarPath) {
			resourcesPath = normalizeDriveLetter(resPath);
			// A require rooted at the archive: 'require.resolve("./<module>")'
			// resolves into '<asarPath>/<module>' (top-level layout). The leading
			// './' is required so resolution is relative to the archive root rather
			// than a bare-specifier node_modules walk (the archive directory is
			// named node_modules.asar, so a bare walk would never find it).
			asarRequire = createRequire(asarPath + '/x.js');
		}
		setupTrace(traceSink);
	}

	export async function resolve(specifier, context, nextResolve) {
		if (specifier === 'fs') {
			if (trace) { trace('map "fs" -> node:original-fs (from ' + context.parentURL + ')'); }
			return {
				format: 'builtin',
				shortCircuit: true,
				url: 'node:original-fs'
			};
		}

		if (asarRequire && context.parentURL && isBarePackageSpecifier(specifier) && !isBuiltin(specifier) && !isElectronBuiltin(specifier)) {
			let parentPath;
			try { parentPath = normalizeDriveLetter(fileURLToPath(context.parentURL)); } catch { parentPath = undefined; }
			if (parentPath && parentPath.startsWith(resourcesPath)) {
				if (trace) { trace('resolve "' + specifier + '" from "' + context.parentURL + '"'); }
				// Try the default resolution first so an importer that ships its own
				// dependencies (e.g. a built-in extension that bundles a different copy
				// of a package) resolves against its own, closer 'node_modules' instead
				// of being redirected into the app archive. The archive stands in for
				// the application's own (farthest) 'node_modules', so it must only be
				// consulted once the default walk has found nothing.
				let defaultResult;
				let defaultError;
				try {
					defaultResult = await nextResolve(specifier, context);
				} catch (err) {
					defaultError = err;
				}

				// Only accept a default resolution that lands INSIDE the application
				// tree (a closer copy under 'resources/app', e.g. one bundled by a
				// built-in extension). A resolution ABOVE the app root must not win
				// over the archive: when the app is nested inside a larger tree (e.g.
				// '@vscode/test-electron' downloads the packaged app under the repo's
				// own 'node_modules'), the default node_modules walk can escape the app
				// and find a stale / ABI-mismatched copy. The archive stands in for the
				// application's own 'node_modules' and must take precedence over
				// anything outside 'resources/app'.
				if (defaultResult) {
					let resolvedPath;
					try { resolvedPath = normalizeDriveLetter(fileURLToPath(defaultResult.url)); } catch { resolvedPath = undefined; }
					if (!resolvedPath || resolvedPath.startsWith(resourcesPath)) {
						if (trace) { trace('  default -> ' + defaultResult.url + ' (in app, ACCEPT)'); }
						return defaultResult;
					}
					if (trace) { trace('  default -> ' + defaultResult.url + ' (outside app, reject)'); }
				} else if (trace) {
					trace('  default -> <none> (' + (defaultError && (defaultError.code || defaultError.message)) + ')');
				}

				// Locate the package inside the archive via its package.json (this is
				// resolution-condition independent), so we can re-root resolution
				// inside it below.
				let packageJsonPath;
				try {
					packageJsonPath = asarRequire.resolve('./' + packageNameOf(specifier) + '/package.json');
				} catch {
					// The package is part of neither 'resources/app' (the default
					// resolution above did not land inside the app) nor the archive.
					// Do NOT fall back to a copy from an outer 'node_modules' (e.g. a
					// parent checkout the app is nested under): the application must
					// resolve its own dependencies exclusively from its own resources.
					// Surface the original resolution error so a missing/misplaced
					// dependency fails loudly instead of silently loading a foreign copy.
					if (trace) { trace('  archive: package "' + packageNameOf(specifier) + '" NOT in archive -> throw'); }
					throw defaultError ?? new Error("Cannot find package '" + specifier + "' within the application resources");
				}
				if (trace) { trace('  archive pkg.json -> ' + packageJsonPath); }
				// Re-run the default ESM resolution rooted *inside* the archived
				// package (via its package.json) so Node resolves the request as a
				// package self-reference, applying the real 'exports'/'main' fields and
				// ESM conditions ('import' over 'require').
				try {
					const selfRef = await nextResolve(specifier, { ...context, parentURL: pathToFileURL(packageJsonPath).href });
					// A package without an 'exports' field does not self-reference: Node
					// falls back to a 'node_modules' walk from the package dir that can
					// climb *out* of the archive into an outer 'node_modules' (e.g. the
					// checkout the app is nested under). Only accept a result that stays
					// inside the app resources; otherwise fall back to the direct,
					// escape-proof archive resolution below.
					let selfRefPath;
					try { selfRefPath = normalizeDriveLetter(fileURLToPath(selfRef.url)); } catch { selfRefPath = undefined; }
					if (selfRefPath && selfRefPath.startsWith(resourcesPath)) {
						if (trace) { trace('  self-ref -> ' + selfRef.url + ' (in app, ACCEPT)'); }
						return selfRef;
					}
					if (trace) { trace('  self-ref -> ' + selfRef.url + ' (escaped app, reject)'); }
				} catch (err) {
					// Fall through to direct resolution below.
					if (trace) { trace('  self-ref -> <throw> (' + (err && (err.code || err.message)) + ')'); }
				}
				const resolved = asarRequire.resolve('./' + specifier);
				const url = pathToFileURL(resolved).href;
				if (trace) { trace('  direct -> ' + url + ' (ACCEPT)'); }
				return { url, shortCircuit: true };
			} else if (trace) {
				trace('defer "' + specifier + '" (parent outside app resources: ' + context.parentURL + ')');
			}
		}

		// Defer to the next hook in the chain, which would be the
		// Node.js default resolve if this is the last user-specified loader.
		return nextResolve(specifier, context);
	}`;

	// Opt-in resolution tracing, off by default. Set VSCODE_ASAR_TRACE to enable:
	//   VSCODE_ASAR_TRACE=1            -> trace to stderr (also '"true"', '"on"', '"stderr"')
	//   VSCODE_ASAR_TRACE=/path/x.log  -> append the trace to that file
	const traceSink = process.env['VSCODE_ASAR_TRACE'] || undefined;

	register(`data:text/javascript;base64,${Buffer.from(jsCode).toString('base64')}`, import.meta.url, {
		data: process.env['VSCODE_DEV'] ? {} : {
			resourcesPath: `${process.resourcesPath}${sep}app`,
			asarPath: `${process.resourcesPath}${sep}app${sep}node_modules.asar`,
			traceSink,
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
