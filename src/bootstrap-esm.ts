/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import { createRequire, isBuiltin, registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

	let trace: ((message: string) => void) | undefined;
	const traceSink = process.env['VSCODE_ASAR_TRACE'] || undefined;
	if (traceSink) {
		// Known truthy values trace to stderr; any other value is a file path.
		const prefix = '[asar-resolve] ';
		if (traceSink === '1' || traceSink === 'true' || traceSink === 'on' || traceSink === 'stderr') {
			trace = message => { try { process.stderr.write(`${prefix}${message}\n`); } catch { /* ignore */ } };
		} else {
			trace = message => { try { fs.appendFileSync(traceSink, `${prefix}${message}\n`); } catch { /* ignore */ } };
		}
	}

	const normalizeDriveLetter = (path: string): string => {
		if (
			process.platform === 'win32' &&
			path.length >= 2 &&
			(path.charCodeAt(0) >= 65 && path.charCodeAt(0) <= 90 || path.charCodeAt(0) >= 97 && path.charCodeAt(0) <= 122) &&
			path.charCodeAt(1) === 58
		) {
			return path[0].toLowerCase() + path.slice(1);
		}
		return path;
	};

	const isBarePackageSpecifier = (specifier: string): boolean => {
		if (specifier === '') { return false; }
		const c = specifier[0];
		if (c === '.' || c === '/' || c === '#') { return false; }
		return !URL.canParse(specifier);
	};

	const packageNameOf = (specifier: string): string => {
		if (specifier[0] === '@') {
			const firstSlash = specifier.indexOf('/');
			if (firstSlash === -1) { return specifier; }
			const secondSlash = specifier.indexOf('/', firstSlash + 1);
			return secondSlash === -1 ? specifier : specifier.slice(0, secondSlash);
		}
		const slash = specifier.indexOf('/');
		return slash === -1 ? specifier : specifier.slice(0, slash);
	};

	const appRoot = dirname(import.meta.dirname);
	const resourcesPath = process.env['VSCODE_DEV'] ? undefined : normalizeDriveLetter(appRoot);
	// Root require.resolve() inside the archive; the leading './' below avoids a node_modules walk.
	const asarRequire = resourcesPath ? createRequire(join(appRoot, 'node_modules.asar', 'x.js')) : undefined;
	trace?.(`tracing enabled (node ${process.versions.node}); resourcesPath=${resourcesPath}`);

	let commonJSConditions: readonly string[] | undefined;
	let captureCommonJSConditions = true;

	registerHooks({
		resolve(specifier, context, nextResolve) {
			if (captureCommonJSConditions) {
				captureCommonJSConditions = false;
				commonJSConditions = [...context.conditions];
				return nextResolve(specifier, context);
			}

			// Node 24 omits CJS import attributes; calibrated conditions avoid user-spoofable "require" membership.
			const cjsConditions = commonJSConditions;
			const isCommonJS = context.importAttributes === undefined || (
				cjsConditions !== undefined &&
				context.conditions.length === cjsConditions.length &&
				context.conditions.every((condition, index) => condition === cjsConditions[index])
			);
			if (isCommonJS) {
				return nextResolve(specifier, context);
			}
			if (specifier === 'fs') {
				trace?.(`map "fs" -> node:original-fs (from ${context.parentURL})`);
				return {
					format: 'builtin',
					shortCircuit: true,
					url: 'node:original-fs'
				};
			}

			if (asarRequire && resourcesPath && context.parentURL && isBarePackageSpecifier(specifier) && !isBuiltin(specifier) && specifier !== 'electron' && !specifier.startsWith('electron/')) {
				let parentPath: string | undefined;
				try { parentPath = normalizeDriveLetter(fileURLToPath(context.parentURL)); } catch { parentPath = undefined; }
				if (parentPath && parentPath.startsWith(resourcesPath)) {
					trace?.(`resolve "${specifier}" from "${context.parentURL}"`);
					let defaultResult;
					let defaultError: Error | undefined;
					// A closer dependency bundled by the importer takes precedence over the application archive.
					try {
						defaultResult = nextResolve(specifier, context);
					} catch (error) {
						defaultError = error instanceof Error ? error : new Error(String(error));
					}

					if (defaultResult) {
						let resolvedPath: string | undefined;
						try { resolvedPath = normalizeDriveLetter(fileURLToPath(defaultResult.url)); } catch { resolvedPath = undefined; }
						// Reject a default resolution that escaped into an outer checkout's node_modules.
						if (!resolvedPath || resolvedPath.startsWith(resourcesPath)) {
							trace?.(`  default -> ${defaultResult.url} (in app, ACCEPT)`);
							return defaultResult;
						}
						trace?.(`  default -> ${defaultResult.url} (outside app, reject)`);
					} else {
						trace?.(`  default -> <none> (${defaultError?.message})`);
					}

					let packageJsonPath: string;
					try {
						// Locate the archived package independent of its exports conditions.
						packageJsonPath = asarRequire.resolve(`./${packageNameOf(specifier)}/package.json`);
					} catch {
						trace?.(`  archive: package "${packageNameOf(specifier)}" NOT in archive -> throw`);
						throw defaultError ?? new Error(`Cannot find package '${specifier}' within the application resources`);
					}
					trace?.(`  archive pkg.json -> ${packageJsonPath}`);

					try {
						// Re-run ESM resolution as a package self-reference to honor exports and import conditions.
						const selfRef = nextResolve(specifier, { ...context, parentURL: pathToFileURL(packageJsonPath).href });
						let selfRefPath: string | undefined;
						try { selfRefPath = normalizeDriveLetter(fileURLToPath(selfRef.url)); } catch { selfRefPath = undefined; }
						if (selfRefPath && selfRefPath.startsWith(resourcesPath)) {
							trace?.(`  self-ref -> ${selfRef.url} (in app, ACCEPT)`);
							return selfRef;
						}
						trace?.(`  self-ref -> ${selfRef.url} (escaped app, reject)`);
					} catch (error) {
						trace?.(`  self-ref -> <throw> (${error instanceof Error ? error.message : String(error)})`);
					}
					// Packages without exports do not self-reference; resolve directly without allowing an escape.
					const resolved = asarRequire.resolve(`./${specifier}`);
					const url = pathToFileURL(resolved).href;
					trace?.(`  direct -> ${url} (ACCEPT)`);
					return { url, shortCircuit: true };
				}
				trace?.(`defer "${specifier}" (parent outside app resources: ${context.parentURL})`);
			}

			return nextResolve(specifier, context);
		}
	});

	try {
		createRequire(import.meta.url).resolve('node:fs');
	} finally {
		captureCommonJSConditions = false;
	}
	if (!commonJSConditions) {
		throw new Error('Failed to identify CommonJS module resolution conditions');
	}
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
