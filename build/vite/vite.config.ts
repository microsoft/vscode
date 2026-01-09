/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createLogger, defineConfig, Plugin } from 'vite';
import path, { join } from 'path';
/// @ts-ignore
import { urlToEsmPlugin } from './rollup-url-to-module-plugin/index.mjs';
import { statSync } from 'fs';
import { pathToFileURL } from 'url';

function injectBuiltinExtensionsPlugin(): Plugin {
	let builtinExtensionsCache: unknown[] | null = null;

	function replaceAllOccurrences(str: string, search: string, replace: string): string {
		return str.split(search).join(replace);
	}

	async function loadBuiltinExtensions() {
		if (!builtinExtensionsCache) {
			builtinExtensionsCache = await getScannedBuiltinExtensions(path.resolve(__dirname, '../../'));
			console.log(`Found ${builtinExtensionsCache!.length} built-in extensions.`);
		}
		return builtinExtensionsCache;
	}

	function asJSON(value: unknown): string {
		return escapeHtmlByReplacingCharacters(JSON.stringify(value));
	}

	function escapeHtmlByReplacingCharacters(str: string) {
		if (typeof str !== 'string') {
			return '';
		}

		const escapeCharacter = (match: string) => {
			switch (match) {
				case '&': return '&amp;';
				case '<': return '&lt;';
				case '>': return '&gt;';
				case '"': return '&quot;';
				case '\'': return '&#039;';
				case '`': return '&#096;';
				default: return match;
			}
		};

		return str.replace(/[&<>"'`]/g, escapeCharacter);
	}

	const prebuiltExtensionsLocation = '.build/builtInExtensions';
	async function getScannedBuiltinExtensions(vsCodeDevLocation: string) {
		// use the build utility as to not duplicate the code
		const extensionsUtil = await import(pathToFileURL(path.join(vsCodeDevLocation, 'build', 'lib', 'extensions.js')).toString());
		const localExtensions = extensionsUtil.scanBuiltinExtensions(path.join(vsCodeDevLocation, 'extensions'));
		const prebuiltExtensions = extensionsUtil.scanBuiltinExtensions(path.join(vsCodeDevLocation, prebuiltExtensionsLocation));
		for (const ext of localExtensions) {
			let browserMain = ext.packageJSON.browser;
			if (browserMain) {
				if (!browserMain.endsWith('.js')) {
					browserMain = browserMain + '.js';
				}
				const browserMainLocation = path.join(vsCodeDevLocation, 'extensions', ext.extensionPath, browserMain);
				if (!fileExists(browserMainLocation)) {
					console.log(`${browserMainLocation} not found. Make sure all extensions are compiled (use 'yarn watch-web').`);
				}
			}
		}
		return localExtensions.concat(prebuiltExtensions);
	}

	function fileExists(path: string): boolean {
		try {
			return statSync(path).isFile();
		} catch (err) {
			return false;
		}
	}

	return {
		name: 'inject-builtin-extensions',
		transformIndexHtml: {
			order: 'pre',
			async handler(html) {
				const search = '{{WORKBENCH_BUILTIN_EXTENSIONS}}';
				if (html.indexOf(search) === -1) {
					return html;
				}

				const extensions = await loadBuiltinExtensions();
				const h = replaceAllOccurrences(html, search, asJSON(extensions));
				return h;
			}
		}
	};
}

function createHotClassSupport(): Plugin {
	return {
		name: 'createHotClassSupport',
		transform: {
			order: 'pre',
			handler: (code, id) => {
				if (id.endsWith('.ts')) {
					let needsHMRAccept = false;
					const hasCreateHotClass = code.includes('createHotClass');
					const hasDomWidget = code.includes('DomWidget');

					if (!hasCreateHotClass && !hasDomWidget) {
						return undefined;
					}

					if (hasCreateHotClass) {
						needsHMRAccept = true;
					}

					if (hasDomWidget) {
						const matches = code.matchAll(/class\s+([a-zA-Z0-9_]+)\s+extends\s+DomWidget/g);
						/// @ts-ignore
						for (const match of matches) {
							const className = match[1];
							code = code + `\n${className}.registerWidgetHotReplacement(${JSON.stringify(id + '#' + className)});`;
							needsHMRAccept = true;
						}
					}

					if (needsHMRAccept) {
						code = code + `\n
if (import.meta.hot) {
	import.meta.hot.accept();
}`;
					}
					return code;
				}
				return undefined;
			},
		}
	};
}

const logger = createLogger();
const loggerWarn = logger.warn;

logger.warn = (msg, options) => {
	// amdX and the baseUrl code cannot be analyzed by vite.
	// However, they are not needed, so it is okay to silence the warning.
	if (msg.indexOf('vs/amdX.ts') !== -1) {
		return;
	}
	if (msg.indexOf('await import(new URL(`vs/workbench/workbench.desktop.main.js`, baseUrl).href)') !== -1) {
		return;
	}
	if (msg.indexOf('const result2 = await import(workbenchUrl);') !== -1) {
		return;
	}

	// See https://github.com/microsoft/vscode/issues/278153
	if (msg.indexOf('marked.esm.js.map') !== -1 || msg.indexOf('purify.es.mjs.map') !== -1) {
		return;
	}

	loggerWarn(msg, options);
};

export default defineConfig({
	plugins: [
		urlToEsmPlugin(),
		injectBuiltinExtensionsPlugin(),
		createHotClassSupport()
	],
	customLogger: logger,
	esbuild: {
		tsconfigRaw: {
			compilerOptions: {
				experimentalDecorators: true,
			}
		}
	},
	root: '../..', // To support /out/... paths
	server: {
		cors: true,
		port: 5199,
		origin: 'http://localhost:5199',
		fs: {
			allow: [
				// To allow loading from sources, not needed when loading monaco-editor from npm package
				/// @ts-ignore
				join(import.meta.dirname, '../../../')
			]
		}
	}
});
