/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

/**
 * `.npmrc` keys that configure native module builds (node-gyp, prebuild-install, ...). pnpm 11
 * ignores them in `.npmrc` and no longer exports its configuration as `npm_config_*` variables to
 * install scripts, so the `.pnpmfile.mts` of each install root exports them instead.
 */
export const nativeBuildKeys = ['disturl', 'target', 'ms_build_id', 'runtime', 'build_from_source', 'force_process_config'] as const;

/**
 * Options of an install root that builds native modules.
 */
export interface NativeBuildOptions {
	/**
	 * Use `process.config` for node-gyp on macOS (`npm_config_force_process_config`), for roots
	 * that build for Node.js. The clang settings of `process.config` are only correct for the
	 * Node.js version checked by the preinstall.
	 */
	readonly forceProcessConfigOnDarwin?: boolean;
	/** Build for the architecture of the running Node.js, ignoring `npm_config_arch`. */
	readonly hostArch?: boolean;
	/**
	 * Build for the version of the running Node.js (`npm_config_target`), for roots whose native
	 * modules run in the Node.js that installs them (build scripts) and whose `.npmrc` has no `target`.
	 */
	readonly runningNodeTarget?: boolean;
}

/**
 * Reads the `key=value` lines of an `.npmrc` file, without surrounding quotes.
 */
export function readNpmrc(file: string): Map<string, string> {
	const result = new Map<string, string>();
	if (!fs.existsSync(file)) {
		return result;
	}
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
			continue;
		}
		const eq = trimmed.indexOf('=');
		if (eq <= 0) {
			continue;
		}
		result.set(trimmed.substring(0, eq).trim(), trimmed.substring(eq + 1).trim().replace(/^"(.*)"$/, '$1'));
	}
	return result;
}

/**
 * Returns the `npm_config_*` variables for native module builds in the install root `rootDir`:
 * every key of its `.npmrc`, and the known native build keys it doesn't set removed (so that they
 * aren't inherited from another root). `undefined` means "unset".
 *
 * `npm_config_node_gyp` is not set: install scripts build with the node-gyp bundled with pnpm, as
 * they built with the one bundled with npm, which ignores the variable. The node-gyp of
 * `build/npm/gyp` only installs the Electron and Node.js headers (see preinstall.ts).
 */
export function getNativeBuildEnv(rootDir: string, options: NativeBuildOptions = {}, platform: string = process.platform, arch: string = process.arch, nodeVersion: string = process.versions.node): Record<string, string | undefined> {
	const result: Record<string, string | undefined> = {};
	for (const key of nativeBuildKeys) {
		result[`npm_config_${key}`] = undefined;
	}
	for (const [key, value] of readNpmrc(path.join(rootDir, '.npmrc'))) {
		result[`npm_config_${key}`] = value;
	}

	// Keep the version check in preinstall.ts in sync with this: process.config must have the
	// clang settings that node-gyp needs (https://github.com/nodejs/node/commit/6e0a2bb54c5bbeff0e9e33e1a0c683ed980a8a0f).
	result.npm_config_force_process_config = options.forceProcessConfigOnDarwin && platform === 'darwin' ? 'true' : undefined;

	if (options.hostArch) {
		result.npm_config_arch = arch;
	}

	if (options.runningNodeTarget) {
		result.npm_config_target = nodeVersion;
	}

	return result;
}

/**
 * Applies {@link getNativeBuildEnv} to `process.env`. Called by the `.pnpmfile.mts` of each
 * install root that builds native modules: pnpm loads the pnpmfile in its own process, so the
 * values reach every dependency install script of that root.
 */
export function applyNativeBuildEnv(rootDir: string, options: NativeBuildOptions = {}): void {
	for (const [key, value] of Object.entries(getNativeBuildEnv(rootDir, options))) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

/**
 * The pnpm commands that install with a frozen lockfile: `pnpm ci` and its aliases.
 */
const frozenLockfileCommands = new Set(['ci', 'clean-install', 'ic', 'install-clean']);

/**
 * Exports the `--frozen-lockfile` option of the running pnpm command as `pnpm_config_frozen_lockfile`,
 * so that the `pnpm install` that the root postinstall runs in each separate install root follows
 * it. `pnpm ci` (and its aliases) counts as `--frozen-lockfile`, unless the option turns it off.
 * pnpm passes neither its command line options nor its CI default to install scripts, but the
 * root `.pnpmfile.mts` runs in the pnpm process, whose `argv` is pnpm's command line. Without the
 * option, nothing is exported: in CI the nested installs are frozen by pnpm's own default, and a
 * `pnpm_config_frozen_lockfile` set by the caller is inherited.
 */
export function exportFrozenLockfileOption(argv: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env): void {
	let frozen: boolean | undefined;
	let command: string | undefined;
	// argv[0] is Node.js and argv[1] pnpm's script
	for (let i = 2; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--') {
			break;
		}
		if (arg === '--frozen-lockfile' || arg === '--frozen-lockfile=true') {
			frozen = true;
		} else if (arg === '--no-frozen-lockfile' || arg === '--frozen-lockfile=false') {
			frozen = false;
		} else if (arg === '-C' || arg === '--dir') {
			i++; // the folder, as in `pnpm -C <folder> ci`
		} else if (command === undefined && !arg.startsWith('-')) {
			command = arg;
		}
	}
	if (frozen === undefined && command !== undefined && frozenLockfileCommands.has(command)) {
		frozen = true;
	}
	if (frozen !== undefined) {
		env.pnpm_config_frozen_lockfile = String(frozen);
	}
}
