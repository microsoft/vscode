/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Common build script for extensions.
 */
import esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runBuild, type RunConfig } from './esbuild-common.mts';

interface ExtensionRunConfig extends RunConfig {
	readonly platform: 'node' | 'browser';
	readonly format?: 'cjs' | 'esm';
}

/** Shared deps that aren't `require()`d at runtime (kept in `dependencies` for
 *  tooling/postinstall reasons) — must NOT be externalized. */
const BUILD_ONLY_SHARED_DEPS = new Set<string>([
	'typescript',
]);

/** Runtime packages from `extensions/package.json` that resolve from the
 *  shared `extensions/node_modules/` in the product. Source of truth lives
 *  in `extensions/package.json`; this list updates automatically. */
function getSharedRuntimeDeps(): string[] {
	const sharedPackageJsonPath = path.join(import.meta.dirname, 'package.json');
	const dependencies = JSON.parse(fs.readFileSync(sharedPackageJsonPath, 'utf8'))?.dependencies ?? {};
	return Object.keys(dependencies).filter(name => !BUILD_ONLY_SHARED_DEPS.has(name));
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
		// Resolved from `extensions/node_modules/` at runtime (web inlines instead —
		// the web packaging path doesn't ship `extensions/node_modules/`).
		options.external = [...(options.external ?? []), ...getSharedRuntimeDeps()];
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
