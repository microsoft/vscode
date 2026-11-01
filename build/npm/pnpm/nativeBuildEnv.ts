/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

/**
 * `.npmrc` keys that configure native module builds (node-gyp, prebuild-install, ...). pnpm
 * ignores them in `.npmrc` and doesn't export its configuration as `npm_config_*` variables to
 * install scripts, so the `.pnpmfile.mjs` of each install root passes them to pnpm instead.
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
 * Options of the pnpmfile hooks of an install root that builds native modules.
 */
export interface NativeBuildHookOptions extends NativeBuildOptions {
	/**
	 * Pass the frozen lockfile of `pnpm ci` on to the separate install roots that the root
	 * postinstall installs (see {@link getNativeBuildExtraEnv}).
	 */
	readonly exportFrozenLockfileOfCi?: boolean;
}

/**
 * The part of pnpm's configuration that the `updateConfig` hook of the pnpmfiles changes.
 */
export interface PnpmConfig {
	/** Environment variables that pnpm adds to every script it runs, install scripts included. */
	readonly extraEnv?: Readonly<Record<string, string>>;
	readonly [setting: string]: unknown;
}

/**
 * The hooks of the `.pnpmfile.mjs` of an install root that builds native modules.
 */
export interface NativeBuildHooks {
	updateConfig(config: PnpmConfig): PnpmConfig;
}

/**
 * Returns the hooks of the `.pnpmfile.mjs` of the install root `rootDir`. pnpm runs pnpmfiles in
 * a separate Node.js process, so a pnpmfile can't change the environment of pnpm or of the scripts
 * it runs. Instead, `updateConfig` returns the native module build variables as `extraEnv`, which
 * pnpm passes to every dependency install script and every lifecycle script of the root.
 */
export function createNativeBuildHooks(rootDir: string, options: NativeBuildHookOptions = {}): NativeBuildHooks {
	return {
		updateConfig: config => ({ ...config, extraEnv: getNativeBuildExtraEnv(rootDir, options, config.extraEnv) }),
	};
}

/**
 * Returns pnpm's `extraEnv` with the variables of {@link getNativeBuildEnv} added:
 * - `extraEnv` can only set variables, not remove them. A native build key that the root's
 *   `.npmrc` doesn't set is set to an empty value instead, so that a value inherited from the
 *   caller (such as the root's Electron settings, when the root postinstall installs `build`) is
 *   not used. node-gyp treats an empty value like a missing one: it tests `force_process_config`
 *   for truthiness and doesn't read `ms_build_id`.
 * - With {@link NativeBuildHookOptions.exportFrozenLockfileOfCi}, `pnpm ci` (and its aliases, which
 *   pnpm reports as the command `ci` in `npm_command`) sets `pnpm_config_frozen_lockfile`, so the
 *   installs of the separate install roots are frozen too. pnpm passes neither its command line
 *   nor `--frozen-lockfile` to pnpmfiles or scripts, so a local `pnpm install --frozen-lockfile`
 *   can't be passed on: use `pnpm ci` or `PNPM_CONFIG_FROZEN_LOCKFILE=true` (inherited by the nested
 *   installs). In CI, pnpm's default freezes every install.
 */
export function getNativeBuildExtraEnv(rootDir: string, options: NativeBuildHookOptions = {}, extraEnv: Readonly<Record<string, string>> = {}, platform: string = process.platform, arch: string = process.arch, nodeVersion: string = process.versions.node): Record<string, string> {
	const result: Record<string, string> = { ...extraEnv };
	for (const [key, value] of Object.entries(getNativeBuildEnv(rootDir, options, platform, arch, nodeVersion))) {
		result[key] = value ?? '';
	}
	if (options.exportFrozenLockfileOfCi && result.npm_command === 'ci') {
		result.pnpm_config_frozen_lockfile = 'true';
	}
	return result;
}
