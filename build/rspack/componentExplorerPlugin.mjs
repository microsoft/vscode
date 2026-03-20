/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

import { globSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EXPLORER_ROUTE = '/___explorer';
const VIRTUAL_PREFIX = 'virtual:component-explorer/';
const VIRTUAL_ENTRY = VIRTUAL_PREFIX + 'entry';
const VIRTUAL_FIXTURES = VIRTUAL_PREFIX + 'fixtures';
const LOADER_PATH = fileURLToPath(import.meta.url);

/**
 * @typedef {{
 *   include: string;
 *   route?: string;
 * }} ComponentExplorerPluginOptions
 */

export class ComponentExplorerPlugin {
	/** @type {string} */
	_include;
	/** @type {string} */
	_route;

	/** @param {ComponentExplorerPluginOptions} options */
	constructor(options) {
		this._include = options.include;
		this._route = options.route ?? EXPLORER_ROUTE;
	}

	/** @param {import('@rspack/core').Compiler} compiler */
	apply(compiler) {
		const include = this._include;
		const route = this._route;

		// Rewrite virtual module IDs to this file + query so rspack can resolve them,
		// then the loader export below generates the actual module content.
		compiler.options.module.rules.push({
			resourceQuery: /\?component-explorer&/,
			use: [{ loader: LOADER_PATH, options: { include } }],
		});

		new compiler.webpack.NormalModuleReplacementPlugin(
			new RegExp('^' + VIRTUAL_PREFIX.replace(/[/.]/g, '\\$&')),
			resource => {
				const id = resource.request.slice(VIRTUAL_PREFIX.length);
				resource.request = `${LOADER_PATH}?component-explorer&id=${id}`;
			},
		).apply(compiler);

		new compiler.webpack.EntryPlugin(compiler.context, VIRTUAL_ENTRY, {
			name: '___explorer',
		}).apply(compiler);

		// Serve explorer HTML in dev server
		if (compiler.options.devServer) {
			const originalSetupMiddlewares = compiler.options.devServer.setupMiddlewares;
			compiler.options.devServer.setupMiddlewares = (middlewares, devServer) => {
				middlewares.unshift({
					name: 'component-explorer',
					path: route,
					middleware: (_req, /** @type {import('http').ServerResponse} */ res) => {
						res.setHeader('Content-Type', 'text/html');
						res.end(getExplorerHtml());
					},
				});
				if (originalSetupMiddlewares) {
					return originalSetupMiddlewares(middlewares, devServer);
				}
				return middlewares;
			};
		}
	}
}

/** @type {import('@rspack/core').LoaderDefinitionFunction} */
export default function componentExplorerLoader() {
	const query = new URLSearchParams(this.resourceQuery.slice(1));
	const id = query.get('id');
	const { include } = this.getOptions();

	if (id === 'entry') {
		return generateEntryModule();
	}
	if (id === 'fixtures') {
		return generateFixturesModule(String(include), this.rootContext);
	}
	throw new Error(`Unknown component-explorer virtual module: ${id}`);
}

function getExplorerHtml() {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Component Explorer</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		html, body, #root { height: 100%; width: 100%; }
	</style>
	<link rel="stylesheet" href="/bundled/___explorer.css">
</head>
<body>
	<div id="root"></div>
	<script type="module" src="/bundled/___explorer.js"></script>
</body>
</html>`;
}

function generateEntryModule() {
	return `
import { ExplorerApp } from '@vscode/component-explorer/viewer';
import fixtures from '${VIRTUAL_FIXTURES}';

const rootElement = document.getElementById('root');
new ExplorerApp(rootElement, { loadFixtures: async () => fixtures });
`;
}

/**
 * @param {string} include
 * @param {string} rootContext
 */
function generateFixturesModule(include, rootContext) {
	const files = globSync(include, { cwd: rootContext });

	const imports = files.map((file, i) => {
		const absolute = path.resolve(rootContext, file).split(path.sep).join('/');
		return `import * as fixture_${i} from '${absolute}';`;
	});

	const entries = files.map((file, i) => {
		const relative = './' + file.split(path.sep).join('/');
		return `  '${relative}': fixture_${i},`;
	});

	return `${imports.join('\n')}

export default {
${entries.join('\n')}
};
`;
}
