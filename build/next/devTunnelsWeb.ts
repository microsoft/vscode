/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';

const REPO_ROOT = path.dirname(path.dirname(import.meta.dirname));
const ENTRY_POINT = path.join(REPO_ROOT, 'build', 'next', 'devTunnelsWebEntry.js');
const SHIMS_ROOT = path.join(REPO_ROOT, 'build', 'next', 'devTunnelsShims');
const NODE_MODULES_ROOT = path.join(REPO_ROOT, 'node_modules');
const BUFFER_GLOBAL_SHIM = path.join(SHIMS_ROOT, 'buffer.js');
const VSCODE_JSONRPC_SHIM = path.join(SHIMS_ROOT, 'vscodeJsonrpc.cjs');
const SSH_ALGORITHMS_ROOT = path.join(REPO_ROOT, 'node_modules', '@microsoft', 'dev-tunnels-ssh', 'algorithms');
const WEB_MODULE_OUT_DIR = path.join('vs', 'sessions', 'contrib', 'providers', 'remoteAgentHost', 'browser');
const WEB_DEV_OUT_DIR = path.join('out', WEB_MODULE_OUT_DIR);
const nodeRequire = createRequire(import.meta.url);
const allowedImporterRoots = [
	path.join(NODE_MODULES_ROOT, '@microsoft', 'dev-tunnels-ssh'),
	path.join(NODE_MODULES_ROOT, '@microsoft', 'dev-tunnels-ssh-tcp'),
	path.join(NODE_MODULES_ROOT, '@microsoft', 'dev-tunnels-connections'),
	path.join(NODE_MODULES_ROOT, '@microsoft', 'dev-tunnels-management'),
	path.join(NODE_MODULES_ROOT, '@microsoft', 'dev-tunnels-contracts'),
];
const nodeBuiltinNames = ['net', 'os', 'path', 'crypto', 'child_process', 'fs', 'http', 'https', 'tls', 'dns', 'zlib'];
const nodeBuiltinFilter = new RegExp(`^(?:node:)?(?:${nodeBuiltinNames.join('|')}|stream|buffer)$`);
const vscodeJsonrpcEventsPath = resolveDevTunnelsJsonRpcModule('events');
const vscodeJsonrpcCancellationPath = resolveDevTunnelsJsonRpcModule('cancellation');

/**
 * Builds the browser-only Dev Tunnels SDK bundle loaded through a dynamic ESM import.
 */
export async function bundleDevTunnelsWeb(options: { minify?: boolean; outDir: string }): Promise<void> {
	const outDir = path.resolve(REPO_ROOT, options.outDir);
	const t1 = Date.now();
	await fs.promises.mkdir(outDir, { recursive: true });

	console.log(`[dev-tunnels-web] ${path.relative(REPO_ROOT, ENTRY_POINT)} → ${path.relative(REPO_ROOT, outDir) || '.'}${options.minify ? ' (minify)' : ''}`);
	await esbuild.build({
		entryPoints: [ENTRY_POINT],
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: ['es2024'],
		define: {
			// Some browser entry points in the SDK's dependency graph still use
			// the Browserify-era `global` alias (for example randombytes).
			global: 'globalThis',
		},
		inject: [
			BUFFER_GLOBAL_SHIM,
			path.join(SHIMS_ROOT, 'process.js'),
		],
		minify: options.minify,
		sourcemap: 'linked',
		outfile: path.join(outDir, 'devTunnelsModule.js'),
		plugins: [devTunnelsBrowserShimPlugin()],
		logLevel: 'warning',
	});
	console.log(`[dev-tunnels-web] Done in ${Date.now() - t1}ms`);
}

/**
 * Resolves Dev Tunnels' browser dependencies without changing unrelated bundle resolution.
 */
export function devTunnelsBrowserShimPlugin(): esbuild.Plugin {
	return {
		name: 'dev-tunnels-browser-shims',
		setup(build) {
			build.onResolve({ filter: nodeBuiltinFilter }, args => {
				const specifier = args.path.startsWith('node:') ? args.path.slice('node:'.length) : args.path;
				if (specifier === 'stream') {
					// Stream changes the SDK transport; other Node modules only receive standard browser polyfills.
					if (isAllowedImporter(args.importer)) {
						return { path: path.join(NODE_MODULES_ROOT, 'readable-stream', 'readable-browser.js') };
					}
					if (isNodeModulesImporter(args.importer)) {
						return;
					}
					return nodeBuiltinError(args);
				}

				if (!isNodeModulesImporter(args.importer) && args.importer !== BUFFER_GLOBAL_SHIM) {
					return nodeBuiltinError(args);
				}

				return specifier === 'buffer'
					? { path: path.join(NODE_MODULES_ROOT, 'buffer', 'index.js') }
					: { path: path.join(SHIMS_ROOT, 'empty.cjs') };
			});

			build.onResolve({ filter: /^node-rsa$/ }, args => {
				if (!isAllowedImporter(args.importer)) {
					return;
				}
				return { path: path.join(SHIMS_ROOT, 'empty.cjs') };
			});

			build.onResolve({ filter: /^websocket$/ }, args => {
				if (!isAllowedImporter(args.importer)) {
					return;
				}
				return { path: path.join(SHIMS_ROOT, 'empty.cjs') };
			});

			build.onResolve({ filter: /^\.[\\/]node[\\/]/ }, args => {
				if (!isSshNodeAlgorithmImport(args)) {
					return;
				}
				return { path: path.join(SHIMS_ROOT, 'empty.cjs') };
			});

			build.onResolve({ filter: /^vscode-jsonrpc$/ }, args => {
				if (!isAllowedImporter(args.importer)) {
					return;
				}
				return { path: path.join(SHIMS_ROOT, 'vscodeJsonrpc.cjs') };
			});

			build.onResolve({ filter: /^vscode-jsonrpc\/lib\/(?:events|cancellation)$/ }, args => {
				if (args.importer !== VSCODE_JSONRPC_SHIM) {
					return;
				}
				return {
					path: args.path.endsWith('/events') ? vscodeJsonrpcEventsPath : vscodeJsonrpcCancellationPath
				};
			});
		}
	};
}

function isAllowedImporter(importer: string): boolean {
	if (importer === ENTRY_POINT) {
		return true;
	}

	return allowedImporterRoots.some(root => {
		return isPathWithin(root, importer);
	});
}

function isNodeModulesImporter(importer: string): boolean {
	return isPathWithin(NODE_MODULES_ROOT, importer);
}

function isSshNodeAlgorithmImport(args: esbuild.OnResolveArgs): boolean {
	return isPathWithin(SSH_ALGORITHMS_ROOT, args.importer);
}

function isPathWithin(root: string, filePath: string): boolean {
	const relative = path.relative(root, filePath);
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function nodeBuiltinError(args: esbuild.OnResolveArgs): esbuild.OnResolveResult {
	return {
		errors: [{
			text: `Refusing to shim Node builtin '${args.path}' requested outside node_modules by '${args.importer || '<entry point>'}'.`
		}]
	};
}

function resolveDevTunnelsJsonRpcModule(moduleName: 'events' | 'cancellation'): string {
	return nodeRequire.resolve(`vscode-jsonrpc/lib/${moduleName}`, {
		paths: [path.join(NODE_MODULES_ROOT, '@microsoft', 'dev-tunnels-ssh')]
	});
}

function getArgValue(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index !== -1 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
	try {
		await bundleDevTunnelsWeb({
			minify: process.argv.includes('--minify'),
			outDir: getArgValue('--out') ?? WEB_DEV_OUT_DIR,
		});
	} catch (error) {
		console.error('Dev Tunnels web bundle failed:', error);
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
