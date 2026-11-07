/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { dirname } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';

export interface ICopilotRuntimePaths {
	readonly runtimePath: string;
	readonly sdkPath: string;
	readonly extensionSdkPath?: string;
	readonly extensionBootstrapPath?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function isLinuxMuslRuntime(): boolean {
	if (process.platform !== 'linux') {
		return false;
	}

	const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
	return report?.header?.glibcVersionRuntime === undefined;
}

function getCopilotPlatformPackageCandidates(): string[] {
	const platformArch = `${process.platform}-${process.arch}`;
	if (process.platform !== 'linux') {
		return [platformArch];
	}

	const linuxCandidates = [`linux-${process.arch}`, `linuxmusl-${process.arch}`];
	return isLinuxMuslRuntime() ? linuxCandidates.reverse() : linuxCandidates;
}

/**
 * Resolves the release-aligned runtime, SDK, and extension bootstrap assets.
 */
export async function resolveCopilotRuntimePaths(nodeModulesUri: URI): Promise<ICopilotRuntimePaths> {
	const tried: string[] = [];
	for (const scopeUri of await getCopilotSdkScopeCandidates(nodeModulesUri)) {
		for (const platformPackage of getCopilotPlatformPackageCandidates()) {
			const result = await resolveCopilotRuntimePathsInPackage(URI.joinPath(scopeUri, `copilot-sdk-${platformPackage}`), platformPackage, tried);
			if (result) {
				return result;
			}
		}
	}

	throw new Error(`Unable to resolve @github/copilot SDK runtime paths. Tried: ${tried.join(', ')}`);
}

/**
 * Returns the folders that may hold the platform packages of `@github/copilot-sdk`: the `@github`
 * folder of `nodeModulesUri`, where the product build and a flat `node_modules` put them, and the
 * folder that holds the real path of `@github/copilot-sdk`, where a symlinked `node_modules` (pnpm's
 * isolated layout) puts the optional dependencies of that package.
 */
async function getCopilotSdkScopeCandidates(nodeModulesUri: URI): Promise<URI[]> {
	const scopeUri = URI.joinPath(nodeModulesUri, '@github');
	try {
		const realScopeUri = URI.file(dirname(await fs.realpath(URI.joinPath(scopeUri, 'copilot-sdk').fsPath)));
		if (realScopeUri.fsPath !== scopeUri.fsPath) {
			return [scopeUri, realScopeUri];
		}
	} catch {
		// No @github/copilot-sdk in this node_modules (for example in the packaged product's
		// node_modules.asar.unpacked); only the platform packages are there.
	}
	return [scopeUri];
}

/**
 * Returns the runtime paths in the platform package at `packageUri`, or `undefined` if it doesn't
 * have them. Adds the checked paths to `tried`.
 */
async function resolveCopilotRuntimePathsInPackage(packageUri: URI, platformPackage: string, tried: string[]): Promise<ICopilotRuntimePaths | undefined> {
	const prebuildsUri = URI.joinPath(packageUri, 'prebuilds', platformPackage);
	const runtimePath = URI.joinPath(prebuildsUri, process.platform === 'win32' ? 'copilot-runtime.exe' : 'copilot-runtime').fsPath;
	const nativePath = URI.joinPath(prebuildsUri, 'runtime.node').fsPath;
	const extensionSdkUri = URI.joinPath(packageUri, 'copilot-sdk');
	const sdkPath = URI.joinPath(extensionSdkUri, 'index.js').fsPath;
	const extensionPath = URI.joinPath(extensionSdkUri, 'extension.js').fsPath;
	const extensionBootstrapPath = URI.joinPath(packageUri, 'preloads', 'extension_bootstrap.mjs').fsPath;
	tried.push(`${runtimePath} with ${nativePath}, ${sdkPath}, ${extensionPath}, and ${extensionBootstrapPath}`);
	const [runtimeExists, nativeExists, sdkExists, extensionExists, extensionBootstrapExists] = await Promise.all([
		fileExists(runtimePath),
		fileExists(nativePath),
		fileExists(sdkPath),
		fileExists(extensionPath),
		fileExists(extensionBootstrapPath),
	]);
	if (runtimeExists && nativeExists && sdkExists) {
		return {
			runtimePath,
			sdkPath,
			...(extensionExists && extensionBootstrapExists ? {
				extensionSdkPath: extensionSdkUri.fsPath,
				extensionBootstrapPath,
			} : {}),
		};
	}
	return undefined;
}
