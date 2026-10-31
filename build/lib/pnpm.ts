/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

/**
 * How to spawn pnpm: run `command` with `args` followed by the pnpm arguments.
 */
export interface PnpmCommand {
	readonly command: string;
	readonly args: readonly string[];
	readonly shell: boolean;
}

/**
 * How to spawn pnpm. Prefers the pnpm that runs the current script (`npm_execpath`), so nested
 * installs also work when pnpm is not on `PATH` (`corepack pnpm` without `corepack enable`,
 * `npx pnpm@<version>`, an absolute path): a JavaScript entry runs with the current Node.js, a
 * native executable runs directly (`pnpm`, which the npm package installs, or `pnpm-native`, which
 * Corepack downloads). Otherwise pnpm from `PATH`; on Windows that is a `.cmd` shim, which Node.js
 * only runs with a shell (CVE-2024-27980 hardening).
 */
export function getPnpmCommand(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, nodePath: string = process.execPath, realpath: (file: string) => string = fs.realpathSync.native): PnpmCommand {
	const execPath = env.npm_execpath;
	if (execPath) {
		let file: string | undefined;
		try {
			// npm and pnpm install pnpm's bin as a symlink to bin/pnpm.mjs
			file = realpath(execPath);
		} catch {
			file = undefined;
		}
		const name = file && (platform === 'win32' ? path.win32 : path.posix).basename(file).toLowerCase();
		if (file && name && /^pnpm\.[cm]?js$/.test(name)) {
			return { command: nodePath, args: [file], shell: false };
		}
		if (file && name && (platform === 'win32' ? ['pnpm.exe', 'pnpm-native.exe'] : ['pnpm', 'pnpm-native']).includes(name)) {
			return { command: file, args: [], shell: false };
		}
	}
	return platform === 'win32' ? { command: 'pnpm.cmd', args: [], shell: true } : { command: 'pnpm', args: [], shell: false };
}

/**
 * Returns the pnpm version pinned by the `packageManager` field of the root `package.json`, or
 * `undefined` if it doesn't pin pnpm.
 */
export function getPinnedPnpmVersion(root: string = path.join(import.meta.dirname, '..', '..')): string | undefined {
	try {
		const packageManager = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).packageManager;
		return typeof packageManager === 'string' ? /^pnpm@(\d+\.\d+\.\d+)/.exec(packageManager)?.[1] : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Checks the package manager that runs an install script, from `npm_config_user_agent`. Returns an
 * error message, or `undefined` if the package manager is fine (or unknown, for example when the
 * script runs directly with Node.js).
 */
export function checkPackageManager(userAgent: string | undefined, pinnedVersion: string | undefined): string | undefined {
	if (!userAgent) {
		return undefined;
	}
	const match = /^pnpm\/(\d+)\.(\d+)\.(\d+)/.exec(userAgent);
	if (!match) {
		return 'This repository uses pnpm. Run `pnpm install`.';
	}
	const version = match.slice(1, 4).map(Number);
	const pinned = (pinnedVersion ?? '12.0.0').split('.').map(Number);
	const older = version[0] === pinned[0] && (version[1] < pinned[1] || (version[1] === pinned[1] && version[2] < pinned[2]));
	if (version[0] !== pinned[0] || older) {
		return `This repository uses pnpm ${pinnedVersion ?? '12'} (\`packageManager\` in package.json) or a newer pnpm ${pinned[0]} release. Currently using pnpm ${version.join('.')}.`;
	}
	return undefined;
}
