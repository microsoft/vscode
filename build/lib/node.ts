/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { readNativeBuildConfig } from '../npm/pnpm/nativeBuildEnv.ts';

const root = path.dirname(path.dirname(import.meta.dirname));

/**
 * The Node.js version of the server, and its build in Microsoft's internal feeds: the `target` and
 * `msBuildId` of the `nativeBuild` field of `remote/package.json`.
 */
export interface ServerNodeVersion {
	readonly nodeVersion: string;
	readonly internalNodeVersion: string;
}

export function getServerNodeVersion(rootDir: string = root): ServerNodeVersion {
	const remote = path.join(rootDir, 'remote');
	const config = readNativeBuildConfig(remote);
	if (config?.runtime !== 'node' || !config.target || !config.msBuildId) {
		throw new Error(`The nativeBuild field of ${path.join(remote, 'package.json')} must have the runtime "node", a target and an msBuildId.`);
	}
	return { nodeVersion: config.target, internalNodeVersion: config.msBuildId };
}

/**
 * Where the server's Node.js for this platform goes (see `gulp node`).
 */
export function getServerNodePath(rootDir: string = root): string {
	const node = process.platform === 'win32' ? 'node.exe' : 'node';
	return path.join(rootDir, '.build', 'node', `v${getServerNodeVersion(rootDir).nodeVersion}`, `${process.platform}-${process.arch}`, node);
}

if (import.meta.main) {
	console.log(getServerNodePath());
}
