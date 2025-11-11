/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig, Plugin } from 'vite';
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
		transform(code, id) {
			if (id.endsWith('.ts')) {
				if (code.includes('createHotClass')) {
					code = code + `\n
if (import.meta.hot) {
	import.meta.hot.accept();
}`;
				}
				return code;
			}
			return undefined;
		},
	};
}

export default defineConfig({
	plugins: [
		urlToEsmPlugin(),
		injectBuiltinExtensionsPlugin(),
		createHotClassSupport()
	],
	esbuild: {
		target: 'es6', // to fix property initialization issues, not needed when loading monaco-editor from npm package
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
