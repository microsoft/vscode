/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { constants, enableCompileCache, flushCompileCache, getCompileCacheDir } from 'node:module';
import { getHeapCodeStatistics } from 'node:v8';
import { isEqualOrParent } from '../common/extpath.js';
import { join } from '../common/path.js';

declare module 'node:module' {
	interface EnableCompileCacheOptions {
		readOnly?: boolean;
		eager?: boolean | { moduleIdentifiers: string[] };
	}
}

export const nodeCompileCacheKinds = ['main', 'extension-host', 'shared-process', 'pty-host', 'agent-host'] as const;
export type NodeCompileCacheKind = typeof nodeCompileCacheKinds[number];

let enabledKind: NodeCompileCacheKind | undefined;
let didLogNodeCompileCacheStatus = false;

interface INodeCompileCacheStatus {
	readonly kind: NodeCompileCacheKind;
	readonly status: 'development' | 'missing' | 'enabled' | 'already-enabled' | 'disabled' | 'failed' | 'unexpected-directory';
	readonly configuredDirectory: string;
	readonly activeDirectory?: string;
	readonly isPackagedCacheEnabled: boolean;
	readonly message?: string;
}

const processWithNodeCompileCacheStatus = process as NodeJS.Process & {
	_vscodeNodeCompileCacheStatus?: INodeCompileCacheStatus;
};

const utilityProcessCacheKinds: Readonly<Record<string, NodeCompileCacheKind | undefined>> = {
	extensionHost: 'extension-host',
	'shared-process': 'shared-process',
	ptyHost: 'pty-host',
	agentHost: 'agent-host'
};

export function getNodeCompileCacheKindForUtilityProcess(type: string): NodeCompileCacheKind | undefined {
	return utilityProcessCacheKinds[type];
}

export function enableNodeCompileCache(kind: NodeCompileCacheKind): boolean {
	enabledKind = kind;
	process.env['VSCODE_NODE_COMPILE_CACHE_ROOT'] = getNodeCompileCacheRoot();
	const cacheDirectory = getNodeCompileCacheDirectory(kind);

	if (process.env['VSCODE_DEV']) {
		setNodeCompileCacheStatus({
			kind,
			status: 'development',
			configuredDirectory: cacheDirectory,
			isPackagedCacheEnabled: false
		});
		return false;
	}

	// TODO: Re-enable POSIX caches once the runtime fixes portable caching with eager/read-only options.
	if (process.platform !== 'win32') {
		setNodeCompileCacheStatus({
			kind,
			status: 'disabled',
			configuredDirectory: cacheDirectory,
			isPackagedCacheEnabled: false
		});
		return false;
	}

	const isGeneratingCache = process.env['VSCODE_GENERATE_NODE_COMPILE_CACHE'] === '1';
	const runtimeCachePrefix = `${process.version}-${process.arch}-`;
	const hasRuntimeCache = fs.existsSync(cacheDirectory) && fs.readdirSync(cacheDirectory).some(entry => entry.startsWith(runtimeCachePrefix));

	if (!isGeneratingCache && !hasRuntimeCache) {
		setNodeCompileCacheStatus({
			kind,
			status: 'missing',
			configuredDirectory: cacheDirectory,
			isPackagedCacheEnabled: false,
			message: `No cache matching ${runtimeCachePrefix} was found.`
		});
		return false;
	}

	const result = enableCompileCache({
		directory: cacheDirectory,
		portable: true,
		readOnly: !isGeneratingCache,
		...isGeneratingCache && {
			// Include inner functions so code invoked after startup also benefits.
			eager: true
		}
	});

	const activeDirectory = getCompileCacheDir() ?? result.directory;
	const isEnabled = result.status === constants.compileCacheStatus.ENABLED || result.status === constants.compileCacheStatus.ALREADY_ENABLED;
	const isPackagedCacheEnabled = Boolean(isEnabled && activeDirectory && isEqualOrParent(activeDirectory, cacheDirectory, process.platform === 'win32'));
	const status = result.status === constants.compileCacheStatus.ENABLED
		? 'enabled'
		: result.status === constants.compileCacheStatus.ALREADY_ENABLED
			? (isPackagedCacheEnabled ? 'already-enabled' : 'unexpected-directory')
			: result.status === constants.compileCacheStatus.DISABLED
				? 'disabled'
				: 'failed';
	setNodeCompileCacheStatus({
		kind,
		status,
		configuredDirectory: cacheDirectory,
		activeDirectory,
		isPackagedCacheEnabled,
		message: result.message
	});

	if (!isPackagedCacheEnabled) {
		const message = result.status === constants.compileCacheStatus.FAILED
			? `Unable to enable the packaged Node.js compile cache for ${kind}: ${result.message ?? 'unknown error'}`
			: `The packaged Node.js compile cache for ${kind} is not active (status: ${status}, configured: ${cacheDirectory}, active: ${activeDirectory ?? 'none'}).`;
		if (isGeneratingCache) {
			throw new Error(message);
		}
		console.warn(message);
		return false;
	}

	process.env['VSCODE_NODE_COMPILE_CACHE_KIND'] = kind;
	return isGeneratingCache;
}

export function logNodeCompileCacheStatus(log: (message: string) => void = console.log): void {
	const nodeCompileCacheStatus = processWithNodeCompileCacheStatus._vscodeNodeCompileCacheStatus;
	if (didLogNodeCompileCacheStatus || !nodeCompileCacheStatus) {
		return;
	}

	didLogNodeCompileCacheStatus = true;
	const status = nodeCompileCacheStatus;
	log(`[node-compile-cache] ${status.kind}: ${status.isPackagedCacheEnabled ? 'packaged cache enabled' : 'packaged cache inactive'} (status: ${status.status}, configured: ${status.configuredDirectory}, active: ${status.activeDirectory ?? 'none'})`);
}

export function markNodeCompileCacheReady(log?: (message: string) => void): void {
	logNodeCompileCacheStatus(log);

	const kind = enabledKind ?? process.env['VSCODE_NODE_COMPILE_CACHE_KIND'] as NodeCompileCacheKind | undefined;
	if (!kind || !nodeCompileCacheKinds.includes(kind)) {
		return;
	}

	if (process.env['VSCODE_GENERATE_NODE_COMPILE_CACHE'] === '1') {
		flushCompileCache();
		fs.writeFileSync(getNodeCompileCacheReadyMarkerPath(kind), '');
	}

	const measurementsDirectory = process.env['VSCODE_NODE_COMPILE_CACHE_MEASUREMENTS'];
	if (measurementsDirectory) {
		const nodeCompileCacheStatus = processWithNodeCompileCacheStatus._vscodeNodeCompileCacheStatus;
		if (!nodeCompileCacheStatus) {
			throw new Error(`Node.js compile cache status is unavailable for ${kind}.`);
		}
		fs.mkdirSync(measurementsDirectory, { recursive: true });
		fs.writeFileSync(join(measurementsDirectory, `${kind}.json`), JSON.stringify({
			kind,
			pid: process.pid,
			nodeCompileCache: nodeCompileCacheStatus,
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

function setNodeCompileCacheStatus(status: INodeCompileCacheStatus): void {
	processWithNodeCompileCacheStatus._vscodeNodeCompileCacheStatus = status;
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
