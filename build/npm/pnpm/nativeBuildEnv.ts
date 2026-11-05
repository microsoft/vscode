/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

/**
 * How an install root builds its native modules: the `nativeBuild` field of its `package.json`.
 * This is the one place that describes the field. For example, in the root `package.json`:
 *
 * ```json
 * "nativeBuild": {
 *   "runtime": "electron",
 *   "target": "43.8.3",
 *   "disturl": "https://electronjs.org/headers",
 *   "msBuildId": "15784459",
 *   "buildFromSource": true
 * }
 * ```
 *
 * The fields are the node-gyp and prebuild-install settings that npm used to read from the
 * root's `.npmrc`. pnpm doesn't pass its configuration to install scripts as `npm_config_*`
 * variables, and fails on unknown settings in `pnpm-workspace.yaml`, so the `.pnpmfile.mjs` of
 * the root passes them to every install script instead (see {@link createNativeBuildHooks}).
 *
 * The root `package.json` has the Electron version (read with `getElectronVersion()` of
 * `build/lib/electronVersion.ts`), `remote/package.json` the Node.js version of the server (read
 * with `getServerNodeVersion()` of `build/lib/node.ts`), and `build/package.json` has no `target`:
 * its native modules are built for the Node.js that runs the install. An Electron or Node.js
 * update changes `target`, `msBuildId` and the checksums in `build/checksums/`.
 */
export interface NativeBuildConfig {
	/** The runtime that the native modules run in (`npm_config_runtime`). */
	readonly runtime: 'electron' | 'node';
	/** The version of the runtime, without a `v` prefix (`npm_config_target`). */
	readonly target?: string;
	/** Where node-gyp downloads the headers of the runtime from (`npm_config_disturl`). */
	readonly disturl: string;
	/**
	 * The build of the runtime in Microsoft's internal feeds (`npm_config_ms_build_id`): product
	 * builds download Electron and the server's Node.js of this build.
	 */
	readonly msBuildId?: string;
	/** Build native modules from source instead of downloading prebuilt binaries (`npm_config_build_from_source`). */
	readonly buildFromSource?: boolean;
	/**
	 * Use `process.config` for node-gyp (`npm_config_force_process_config`), for roots that build
	 * for Node.js. Only applies on macOS, where it gives node-gyp the clang settings it needs; keep
	 * the version check in preinstall.ts in sync with this, because `process.config` only has them
	 * since https://github.com/nodejs/node/commit/6e0a2bb54c5bbeff0e9e33e1a0c683ed980a8a0f.
	 */
	readonly forceProcessConfig?: boolean;
}

/**
 * The `npm_config_*` keys (without the prefix) that configure native module builds, set from the
 * fields of {@link NativeBuildConfig}.
 */
export const nativeBuildKeys = ['disturl', 'target', 'ms_build_id', 'runtime', 'build_from_source', 'force_process_config'] as const;

const nativeBuildFields: Readonly<Record<keyof NativeBuildConfig, 'string' | 'boolean'>> = {
	runtime: 'string',
	target: 'string',
	disturl: 'string',
	msBuildId: 'string',
	buildFromSource: 'boolean',
	forceProcessConfig: 'boolean',
};

/**
 * Reads the `nativeBuild` field of the `package.json` in `rootDir`, or `undefined` when it has
 * none. Throws when the field is not a valid {@link NativeBuildConfig}.
 */
export function readNativeBuildConfig(rootDir: string): NativeBuildConfig | undefined {
	const file = path.join(rootDir, 'package.json');
	const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8')).nativeBuild;
	if (value === undefined) {
		return undefined;
	}
	const fail = (message: string) => new Error(`Invalid nativeBuild field in ${file}: ${message}. See NativeBuildConfig in build/npm/pnpm/nativeBuildEnv.ts.`);
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw fail('expected an object');
	}
	for (const [key, fieldValue] of Object.entries(value)) {
		const type = Object.hasOwn(nativeBuildFields, key) ? nativeBuildFields[key as keyof NativeBuildConfig] : undefined;
		if (!type) {
			throw fail(`unknown property "${key}"`);
		}
		if (typeof fieldValue !== type) {
			throw fail(`"${key}" must be a ${type}`);
		}
	}
	const config = value as NativeBuildConfig;
	if (config.runtime !== 'electron' && config.runtime !== 'node') {
		throw fail('"runtime" must be "electron" or "node"');
	}
	if (config.disturl === undefined) {
		throw fail('"disturl" is required');
	}
	return config;
}

/**
 * Options of an install root that builds native modules.
 */
export interface NativeBuildOptions {
	/** Build for the architecture of the running Node.js, ignoring `npm_config_arch`. */
	readonly hostArch?: boolean;
	/**
	 * Build for the version of the running Node.js (`npm_config_target`), for roots whose native
	 * modules run in the Node.js that installs them (build scripts) and whose `nativeBuild` field
	 * has no `target`.
	 */
	readonly runningNodeTarget?: boolean;
}

/**
 * Returns the `npm_config_*` variables for native module builds in the install root `rootDir`:
 * the fields of the `nativeBuild` field of its `package.json`, with the native build keys that it
 * doesn't set removed (so that they aren't inherited from another root). `undefined` means "unset".
 *
 * `npm_config_node_gyp` is not set: install scripts build with the node-gyp bundled with pnpm, as
 * they built with the one bundled with npm, which ignores the variable. The node-gyp of
 * `build/npm/gyp` only installs the Electron and Node.js headers (see preinstall.ts).
 */
export function getNativeBuildEnv(rootDir: string, options: NativeBuildOptions = {}, platform: string = process.platform, arch: string = process.arch, nodeVersion: string = process.versions.node): Record<string, string | undefined> {
	const config = readNativeBuildConfig(rootDir);
	const values: Record<(typeof nativeBuildKeys)[number], string | undefined> = {
		disturl: config?.disturl,
		target: config?.target,
		ms_build_id: config?.msBuildId,
		runtime: config?.runtime,
		build_from_source: config?.buildFromSource === undefined ? undefined : String(config.buildFromSource),
		force_process_config: config?.forceProcessConfig && platform === 'darwin' ? 'true' : undefined,
	};
	const result: Record<string, string | undefined> = Object.fromEntries(nativeBuildKeys.map(key => [`npm_config_${key}`, values[key]]));

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
 *   `nativeBuild` field doesn't set is set to an empty value instead, so that a value inherited
 *   from the caller (such as the root's Electron settings, when the root postinstall installs
 *   `build`) is not used. node-gyp treats an empty value like a missing one: it tests `force_process_config`
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
