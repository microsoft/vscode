/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
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
	for (const platformPackage of getCopilotPlatformPackageCandidates()) {
		const packageUri = URI.joinPath(nodeModulesUri, '@github', `copilot-sdk-${platformPackage}`);
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
	}

	throw new Error(`Unable to resolve @github/copilot SDK runtime paths. Tried: ${tried.join(', ')}`);
}
