/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Common build script for extensions.
 */
import esbuild from 'esbuild';
import { runBuild, type RunConfig } from './esbuild-common.mts';

interface ExtensionRunConfig extends RunConfig {
	readonly platform: 'node' | 'browser';
	readonly format?: 'cjs' | 'esm';
}

function resolveBaseOptions(config: ExtensionRunConfig): esbuild.BuildOptions {
	const options: esbuild.BuildOptions = {
		platform: config.platform,
		bundle: true,
		minify: true,
		treeShaking: true,
		sourcemap: true,
		target: ['es2024'],
		external: ['vscode'],
		format: config.format ?? 'cjs',
		logOverride: {
			'import-is-undefined': 'error',
		},
	};

	if (config.platform === 'node') {
		options.mainFields = ['module', 'main'];
		// Resolved at runtime from the shared `extensions/node_modules/` (see
		// `extensions/package.json` + the `getProductionDependencies('extensions/')`
		// copy in `build/lib/extensions.ts`). Web builds inline these — the web
		// packaging path doesn't ship `extensions/node_modules/`.
		options.external = [...options.external!,
			'@octokit/rest',
			'@microsoft/1ds-core-js',
			'@microsoft/1ds-post-js',
			'@vscode/extension-telemetry',
			'dompurify',
			'jsonc-parser',
			'markdown-it',
			'minimatch',
			'picomatch',
			'request-light',
			'tunnel',
			'vscode-languageserver-textdocument',
			'vscode-tas-client',
			'vscode-uri',
			'which',
		];
	} else if (config.platform === 'browser') {
		options.mainFields = ['browser', 'module', 'main'];
		options.alias = {
			'path': 'path-browserify',
		};
		options.define = {
			'process.platform': JSON.stringify('web'),
			'process.env': JSON.stringify({}),
			'process.env.BROWSER_ENV': JSON.stringify('true'),
		};
	}

	return options;
}

export async function run(config: ExtensionRunConfig, args: string[], didBuild?: (outDir: string) => unknown): Promise<void> {
	return runBuild(config, resolveBaseOptions(config), args, didBuild);
}
