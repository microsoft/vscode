/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { constants, enableCompileCache, flushCompileCache } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getHeapCodeStatistics } from 'node:v8';
import { join } from '../common/path.js';

export const nodeCompileCacheKinds = ['main', 'extension-host', 'shared-process', 'pty-host', 'agent-host'] as const;
export type NodeCompileCacheKind = typeof nodeCompileCacheKinds[number];

let enabledGenerationKind: NodeCompileCacheKind | undefined;
let enabledKind: NodeCompileCacheKind | undefined;

const utilityProcessCacheKinds: Readonly<Record<string, NodeCompileCacheKind | undefined>> = {
	extensionHost: 'extension-host',
	'shared-process': 'shared-process',
	ptyHost: 'pty-host',
	agentHost: 'agent-host'
};

const applicationRoot = join(import.meta.dirname, '..');
const eagerCompileCacheDependencyModuleIdentifiers: Readonly<Record<NodeCompileCacheKind, readonly string[]>> = {
	main: [],
	'extension-host': [
		join(applicationRoot, 'extensions/git/dist/main.js'),
		join(applicationRoot, 'extensions/github-authentication/dist/extension.js'),
		pathToFileURL(join(applicationRoot, 'extensions/github/dist/extension.js')).href,
		join(applicationRoot, 'extensions/merge-conflict/dist/mergeConflictMain.js'),
		join(applicationRoot, 'extensions/emmet/dist/node/emmetNodeMain.js')
	],
	'shared-process': [],
	'pty-host': [],
	'agent-host': [
		join(applicationRoot, 'node_modules.asar/@vscode/tree-sitter-wasm/wasm/tree-sitter.js'),
		join(applicationRoot, 'node_modules.asar/@xterm/headless/lib-headless/xterm-headless.js'),
		pathToFileURL(join(applicationRoot, 'node_modules.asar/@github/copilot-sdk/dist/client.js')).href,
		join(applicationRoot, 'node_modules.asar/vscode-jsonrpc/lib/common/connection.js')
	]
};

export function getNodeCompileCacheKindForUtilityProcess(type: string): NodeCompileCacheKind | undefined {
	return utilityProcessCacheKinds[type];
}

export function enableNodeCompileCache(kind: NodeCompileCacheKind, eagerEntryPointModuleIdentifier: string): boolean {
	enabledKind = kind;
	process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'] = getNodeCompileCacheRoot();
	const cacheDirectory = getNodeCompileCacheDirectory(kind);
	const isGeneratingCache = process.env['VSCODE_GENERATE_NODE_COMPILE_CACHE'] === '1';
	const runtimeCachePrefix = `${process.version}-${process.arch}-`;
	const hasRuntimeCache = fs.existsSync(cacheDirectory) && fs.readdirSync(cacheDirectory).some(entry => entry.startsWith(runtimeCachePrefix));

	if (process.env['VSCODE_DEV'] || (!isGeneratingCache && !hasRuntimeCache)) {
		return false;
	}

	if (isGeneratingCache) {
		delete process.env['NODE_COMPILE_CACHE_READONLY'];
	} else {
		process.env['NODE_COMPILE_CACHE_READONLY'] = '1';
	}

	const result = enableCompileCache({
		directory: cacheDirectory,
		portable: true,
		...isGeneratingCache && {
			manifest: join(cacheDirectory, 'manifest.jsonl'),
			eager: {
				moduleIdentifiers: [
					eagerEntryPointModuleIdentifier,
					...eagerCompileCacheDependencyModuleIdentifiers[kind]
				]
			}
		}
	});

	if (result.status === constants.compileCacheStatus.FAILED) {
		const message = `Unable to enable the packaged Node.js compile cache for ${kind}: ${result.message ?? 'unknown error'}`;
		if (isGeneratingCache) {
			throw new Error(message);
		}
		console.warn(message);
		return false;
	}

	enabledGenerationKind = isGeneratingCache ? kind : undefined;
	process.env['VSCODE_NODE_COMPILE_CACHE_KIND'] = kind;
	return isGeneratingCache;
}

export function markNodeCompileCacheReady(): void {
	const kind = enabledKind ?? enabledGenerationKind ?? process.env['VSCODE_NODE_COMPILE_CACHE_KIND'] as NodeCompileCacheKind | undefined;
	if (!kind || !nodeCompileCacheKinds.includes(kind)) {
		return;
	}

	if (process.env['VSCODE_GENERATE_NODE_COMPILE_CACHE'] === '1') {
		flushCompileCache();
		fs.writeFileSync(getNodeCompileCacheReadyMarkerPath(kind), '');
	}

	const measurementsDirectory = process.env['VSCODE_NODE_COMPILE_CACHE_MEASUREMENTS'];
	if (measurementsDirectory) {
		fs.writeFileSync(join(measurementsDirectory, `${kind}.json`), JSON.stringify({
			kind,
			pid: process.pid,
			heapCodeStatistics: getHeapCodeStatistics(),
			memoryUsage: process.memoryUsage(),
			resourceUsage: process.resourceUsage()
		}));
	}
}

export async function waitForNodeCompileCacheReady(): Promise<void> {
	const pendingKinds = new Set(nodeCompileCacheKinds);
	while (pendingKinds.size > 0) {
		for (const kind of pendingKinds) {
			if (fs.existsSync(getNodeCompileCacheReadyMarkerPath(kind))) {
				pendingKinds.delete(kind);
			}
		}
		if (pendingKinds.size > 0) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
	}
}

function getNodeCompileCacheDirectory(kind: NodeCompileCacheKind): string {
	return join(getNodeCompileCacheRoot(), kind);
}

function getNodeCompileCacheReadyMarkerPath(kind: NodeCompileCacheKind): string {
	return join(getNodeCompileCacheDirectory(kind), '.ready');
}

function getNodeCompileCacheRoot(): string {
	return process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'] ?? join(import.meta.dirname, '..', 'node-compile-cache');
}
