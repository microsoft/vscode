/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { dump } from 'js-yaml';
import { getInstalledPackages, isDistTagSpecifier, resolveNpmDependency, type NpmLockfile } from './npmLockfile.ts';

/**
 * The pinned pnpm version (`packageManager` field of the root and of every separate root).
 */
export const pnpmVersion = '11.28.8';

/**
 * The only setting names that the conversion writes to `pnpm-workspace.yaml`, checked against the
 * pnpm 11.28.8 documentation (https://pnpm.io/settings). pnpm 11 only warns about unknown names
 * and ignores them, so `verify-locks.ts` rejects any other name and reads every one of these back
 * with `pnpm config get`.
 */
export const knownSettingNames = [
	'packages',
	'pnpmfile',
	'nodeLinker',
	'strictPeerDependencies',
	'autoInstallPeers',
	'dedupePeerDependents',
	'fetchTimeout',
	'engineStrict',
	'minimumReleaseAge',
	'minimumReleaseAgeExclude',
	'strictDepBuilds',
	'sideEffectsCache',
	'verifyDepsBeforeRun',
	'optimisticRepeatInstall',
	'allowBuilds',
	'overrides',
	'patchedDependencies',
] as const;

export type SettingName = typeof knownSettingNames[number];
export type SettingValue = string | number | boolean | readonly string[] | Readonly<Record<string, string | boolean>>;
export type WorkspaceSettings = Partial<Record<SettingName, SettingValue>>;

/**
 * Settings shared by every pnpm install root.
 */
export const sharedSettings: WorkspaceSettings = {
	// npm: flat node_modules folders. Build scripts, gulp copies and asar packaging rely on it.
	nodeLinker: 'hoisted',
	// npm: legacy-peer-deps=true
	strictPeerDependencies: false,
	autoInstallPeers: false,
	// npm with legacy-peer-deps never installs peer dependencies. pnpm 11 links missing peers to a
	// version resolved elsewhere in the workspace (peer hoisting) unless both autoInstallPeers and
	// dedupePeerDependents are false.
	dedupePeerDependents: false,
	// npm: timeout=180000
	fetchTimeout: 180000,
	// npm: engine-strict=true was only set for extensions/copilot. The root preinstall checks the
	// Node.js version from .nvmrc, which is stricter than copilot's engines field.
	engineStrict: false,
	// npm: min-release-age=7 (days) in build, remote/web, test/monaco and most extensions.
	minimumReleaseAge: 7 * 24 * 60,
	// First-party packages that are bumped on purpose, often to a prerelease published the same day,
	// and the agent SDKs, which build/agent-sdk pins in lockstep with the root (not embargoed).
	minimumReleaseAgeExclude: [
		'@anthropic-ai/*',
		'@github/copilot*',
		'@openai/codex*',
		'@playwright/*',
		'@typescript/*',
		'@vscode/*',
		'@xterm/*',
		'electron',
		'node-pty',
		'playwright*',
		'typescript',
		'vscode-*-languageservice',
	],
	// An install script that is not approved in allowBuilds fails the install.
	strictDepBuilds: true,
	// pnpm keys cached build results by platform, architecture, Node.js major and dependencies, but
	// not by the npm_config_* build variables, so a native module built for Electron would be
	// reused for remote/ (Node.js), after an Electron update, or for another npm_config_arch.
	sideEffectsCache: false,
	// pnpm 11 runs an install before `pnpm run` when it considers dependencies outdated (default
	// `install`). npm never did; CI restores node_modules from caches and runs scripts offline.
	verifyDepsBeforeRun: false,
};

/**
 * Changes to installed packages, by package name, with the patch file relative to the repository.
 * pnpm applies them on install, to a private copy of the package. Scripts must never write into
 * an installed package: with the hoisted layout, pnpm hard-links package files from its shared
 * store (on file systems without copy-on-write clones, such as ext4 and NTFS), so such a write
 * changes the store and every project and worktree that uses it. The key has no version, so a
 * version update keeps the patch and the install fails when it no longer applies.
 */
export const dependencyPatches: Readonly<Record<string, string>> = {
	// libraryPath redirects the shared libraries but not the two N-API addons; packaged builds
	// provision all native files together, so the addons are loaded from libraryPath as well.
	'foundry-local-sdk': 'build/npm/patches/foundry-local-sdk.patch',
};

/**
 * The npm configuration of one folder.
 */
export interface NpmFolder {
	/** Folder relative to the repository root, `''` for the root. */
	readonly folder: string;
	readonly packageJson: PackageJson;
	readonly lockfile: NpmLockfile;
}

export interface PackageJson {
	readonly name?: string;
	readonly version?: string;
	readonly dependencies?: Record<string, string>;
	readonly devDependencies?: Record<string, string>;
	readonly optionalDependencies?: Record<string, string>;
	readonly peerDependencies?: Record<string, string>;
	readonly overrides?: NpmOverrides;
	readonly allowScripts?: Record<string, boolean>;
	readonly packageManager?: string;
}

export interface NpmOverrides {
	readonly [selector: string]: string | NpmOverrides;
}

/**
 * A problem or a noteworthy decision found while computing the configuration.
 */
export interface ConfigNote {
	readonly kind: 'override-merged' | 'override-dropped' | 'override-generated' | 'override-conflict' | 'override-workspace-wide' | 'allow-builds-conflict' | 'allow-builds-git-unresolved' | 'allow-builds-generated' | 'dist-tag-direct';
	readonly folder: string;
	readonly message: string;
}

/**
 * Converts npm `overrides` (including nested selectors) to pnpm `overrides` (`parent>child`).
 */
export function convertNpmOverrides(overrides: NpmOverrides | undefined): Map<string, string> {
	const result = new Map<string, string>();
	const visit = (value: NpmOverrides, parents: string[]) => {
		for (const [selector, target] of Object.entries(value)) {
			if (selector === '.') {
				continue;
			}
			const key = [...parents, selector].join('>');
			if (typeof target === 'string') {
				if (target.startsWith('$')) {
					throw new Error(`npm override references ($) are not supported: ${key}: ${target}`);
				}
				result.set(key, target);
			} else {
				if (typeof target['.'] === 'string') {
					result.set(key, target['.']);
				}
				if (parents.length > 0) {
					throw new Error(`npm overrides nested more than one level are not supported: ${key}`);
				}
				visit(target, [...parents, selector]);
			}
		}
	};
	visit(overrides ?? {}, []);
	return result;
}

/**
 * Splits a pnpm override key such as `parent@1.0.0>child` into its parent selector and the name of
 * the overridden package.
 */
export function parseOverrideKey(key: string): { parent: { name: string; version?: string } | undefined; name: string } {
	const index = key.lastIndexOf('>');
	const child = index === -1 ? key : key.substring(index + 1);
	const childAt = child.indexOf('@', 1);
	const name = childAt === -1 ? child : child.substring(0, childAt);
	if (index === -1) {
		return { parent: undefined, name };
	}
	const parent = key.substring(0, index);
	const parentAt = parent.indexOf('@', 1);
	return { parent: parentAt === -1 ? { name: parent } : { name: parent.substring(0, parentAt), version: parent.substring(parentAt + 1) }, name };
}

/**
 * Returns the versions of the package overridden by `key` in a lockfile: every installed instance
 * of it, or with a parent selector, the instances that the matching parents resolve to.
 */
export function getOverriddenVersions(lockfile: NpmLockfile, key: string): string[] {
	const { parent, name } = parseOverrideKey(key);
	const packages = getInstalledPackages(lockfile);
	const versions = new Set<string>();
	if (!parent) {
		for (const p of packages) {
			if (p.name === name) {
				versions.add(p.version);
			}
		}
	} else {
		for (const p of packages) {
			if (p.name !== parent.name || (parent.version && p.version !== parent.version)) {
				continue;
			}
			const resolved = resolveNpmDependency(lockfile, p.key, name);
			const version = resolved && lockfile.packages[resolved]?.version;
			if (version) {
				versions.add(version);
			}
		}
	}
	return [...versions].sort();
}

/**
 * Returns the overrides that keep npm's resolution where pnpm can't reproduce it from preferred
 * versions: dependencies on a dist-tag (such as `next`), and dependencies that npm satisfied with a
 * `file:` folder of the project instead of a registry package.
 */
export function getGeneratedOverrides(folder: string, lockfile: NpmLockfile, notes: ConfigNote[]): Map<string, string> {
	const result = new Map<string, string>();
	const root = lockfile.packages[''] ?? {};
	for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
		for (const [name, specifier] of Object.entries(root[kind] ?? {})) {
			if (isDistTagSpecifier(specifier)) {
				notes.push({ kind: 'dist-tag-direct', folder, message: `${name}: ${specifier} is a dist-tag; the import uses npm's locked ${lockfile.packages[`node_modules/${name}`]?.version} and the lockfile keeps the specifier` });
			}
		}
	}
	for (const p of getInstalledPackages(lockfile)) {
		for (const kind of ['dependencies', 'optionalDependencies'] as const) {
			for (const [name, specifier] of Object.entries(p.entry[kind] ?? {})) {
				const resolvedKey = resolveNpmDependency(lockfile, p.key, name);
				const resolved = resolvedKey ? lockfile.packages[resolvedKey] : undefined;
				if (!resolved) {
					continue;
				}
				const key = `${p.name}@${p.version}>${name}`;
				if (resolved.link && resolved.resolved && !/^[a-z+]+:/.test(resolved.resolved)) {
					const target = path.posix.join(folder, resolved.resolved);
					result.set(key, `file:${target}`);
					notes.push({ kind: 'override-generated', folder, message: `${key}: file:${target} (npm satisfies ${name}@${specifier} with the project's file: folder)` });
				} else if (isDistTagSpecifier(specifier) && resolved.version) {
					const value = resolved.name && resolved.name !== name ? `npm:${resolved.name}@${resolved.version}` : resolved.version;
					result.set(key, value);
					notes.push({ kind: 'override-generated', folder, message: `${key}: ${value} (npm locked the dist-tag ${specifier})` });
				}
			}
		}
	}
	return result;
}

const gitAllowScriptsKey = /^(?:github:|git\+https:\/\/github\.com\/|https:\/\/github\.com\/|git\+ssh:\/\/git@github\.com\/)(?<repo>[^/#]+\/[^/#]+?)(?:\.git)?#(?<commit>[0-9a-f]{40})$/;

/**
 * pnpm 11 doesn't approve a git dependency by name: an npm `allowScripts` key for a GitHub
 * dependency (`github:owner/repo#sha`) becomes `<name>@git+https://github.com/owner/repo.git#sha`,
 * with the package name from the folder's npm lockfile.
 */
export function toAllowBuildsKey(key: string, folder: NpmFolder): string | undefined {
	const match = gitAllowScriptsKey.exec(key);
	if (!match?.groups) {
		return key;
	}
	const { repo, commit } = match.groups;
	for (const p of getInstalledPackages(folder.lockfile)) {
		if (p.entry.resolved?.includes(`github.com/${repo}`) && p.entry.resolved.includes(commit)) {
			return `${p.name}@git+https://github.com/${repo}.git#${commit}`;
		}
	}
	return undefined;
}

/**
 * Converts npm `allowScripts` to pnpm `allowBuilds`. Both accept `name` and `name@version` keys;
 * git dependency keys are converted with `toAllowBuildsKey`. A folder without `allowScripts` let
 * npm run every install script, while pnpm (`strictDepBuilds`) fails on unapproved ones: its
 * packages with an install script in its npm lockfile are approved by `name@version`, unless a
 * key for the package already decides it (a denial in another folder wins).
 */
export function mergeAllowBuilds(folders: readonly NpmFolder[], notes: ConfigNote[]): Record<string, boolean> {
	const merged = new Map<string, { value: boolean; folder: string }>();
	for (const npmFolder of folders) {
		const { folder, packageJson } = npmFolder;
		for (const [npmKey, value] of Object.entries(packageJson.allowScripts ?? {})) {
			const key = toAllowBuildsKey(npmKey, npmFolder);
			if (key === undefined) {
				notes.push({ kind: 'allow-builds-git-unresolved', folder, message: `${npmKey}: no package in the npm lockfile is installed from this commit; dropped` });
				continue;
			}
			const existing = merged.get(key);
			if (existing && existing.value !== value) {
				notes.push({ kind: 'allow-builds-conflict', folder, message: `${key}: ${value} conflicts with ${existing.value} from ${existing.folder || '.'}; keeping false` });
				merged.set(key, { value: false, folder });
			} else if (!existing) {
				merged.set(key, { value, folder });
			}
		}
	}
	for (const npmFolder of folders) {
		if (npmFolder.packageJson.allowScripts !== undefined) {
			continue;
		}
		for (const pkg of getInstalledPackages(npmFolder.lockfile)) {
			if (!pkg.entry.hasInstallScript) {
				continue;
			}
			const git = pkg.entry.resolved ? gitAllowScriptsKey.exec(pkg.entry.resolved.replace(/^git\+ssh:\/\/git@/, 'git+https://')) : null;
			const key = git?.groups ? `${pkg.name}@git+https://github.com/${git.groups.repo}.git#${git.groups.commit}` : `${pkg.name}@${pkg.version}`;
			if (merged.has(key) || merged.has(pkg.name)) {
				continue;
			}
			notes.push({ kind: 'allow-builds-generated', folder: npmFolder.folder, message: `${key}: true (no allowScripts; npm ran its install script)` });
			merged.set(key, { value: true, folder: npmFolder.folder });
		}
	}
	return Object.fromEntries([...merged.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, { value }]) => [key, value]));
}

/**
 * Merges the overrides of all folders of one install root. The first folder is the install root
 * itself, and its overrides always apply. pnpm applies overrides to the whole install root, while
 * npm applied each folder's overrides to that folder only, so another folder's override is only
 * merged if it doesn't change any locked version in the other folders; otherwise it is dropped and
 * reported. Generated overrides (see {@link getGeneratedOverrides}) are merged the same way.
 */
export function mergeOverrides(folders: readonly NpmFolder[], notes: ConfigNote[], satisfies: (version: string, range: string) => boolean): Record<string, string> {
	const merged = new Map<string, { value: string; folder: string }>();
	const add = (folder: NpmFolder, key: string, value: string, generated: boolean) => {
		const existing = merged.get(key);
		if (existing) {
			if (existing.value !== value) {
				notes.push({ kind: 'override-conflict', folder: folder.folder, message: `${key}: ${value} conflicts with ${existing.value} from ${existing.folder || '.'}; dropped` });
			}
			return;
		}
		const changed = folders.filter(other => other !== folder).flatMap(other => getOverriddenVersions(other.lockfile, key)
			.filter(version => !satisfiesOverride(version, value, satisfies))
			.map(version => `${other.folder || '.'} has ${parseOverrideKey(key).name}@${version}`));
		if (folder === folders[0] && !generated) {
			if (changed.length > 0) {
				notes.push({ kind: 'override-workspace-wide', folder: folder.folder, message: `${key}: ${value} now also applies to ${changed.join(', ')}` });
			}
		} else {
			if (changed.length > 0) {
				notes.push({ kind: 'override-dropped', folder: folder.folder, message: `${key}: ${value} would change other folders (${changed.join(', ')}); dropped` });
				return;
			}
			if (!generated) {
				notes.push({ kind: 'override-merged', folder: folder.folder, message: `${key}: ${value}` });
			}
		}
		merged.set(key, { value, folder: folder.folder });
	};
	for (const folder of folders) {
		for (const [key, value] of convertNpmOverrides(folder.packageJson.overrides)) {
			add(folder, key, value, false);
		}
	}
	for (const folder of folders) {
		for (const [key, value] of getGeneratedOverrides(folder.folder, folder.lockfile, notes)) {
			add(folder, key, value, true);
		}
	}
	return Object.fromEntries([...merged.entries()].map(([key, { value }]) => [key, value]));
}

function satisfiesOverride(version: string, value: string, satisfies: (version: string, range: string) => boolean): boolean {
	if (value.startsWith('file:') || value.startsWith('link:')) {
		return false;
	}
	const range = value.startsWith('npm:') ? value.substring(value.indexOf('@', 5) + 1) : value;
	return version === range || satisfies(version, range);
}

/**
 * The pnpmfile of install roots that build native modules (see build/npm/pnpm/nativeBuildEnv.ts).
 */
export const pnpmfileName = '.pnpmfile.mts';

/**
 * Options of an install root that don't come from its npm configuration.
 */
export interface InstallRootOptions {
	/** The root builds native modules and has a `.pnpmfile.mts` (see nativeBuildEnv.ts). */
	readonly hasPnpmfile?: boolean;
	/**
	 * The root's postinstall installs other install roots. pnpm's optimistic repeat install skips
	 * lifecycle scripts when the workspace itself is unchanged, which would miss changes in those
	 * roots, so it is turned off; the postinstall has its own fast path (installStateHash.ts).
	 */
	readonly installsOtherRoots?: boolean;
	/**
	 * Patches by package name, relative to the base directory (see {@link dependencyPatches}). A
	 * root gets those whose package is in the npm lockfile of one of its projects.
	 */
	readonly dependencyPatches?: Readonly<Record<string, string>>;
}

/**
 * Returns the `patchedDependencies` of an install root: the patches whose package is installed by
 * one of its projects, with the patch file relative to the root.
 */
export function getPatchedDependencies(folders: readonly NpmFolder[], patches: Readonly<Record<string, string>>): Record<string, string> {
	const installed = new Set(folders.flatMap(f => getInstalledPackages(f.lockfile).map(p => p.name)));
	const result: Record<string, string> = {};
	for (const [name, file] of Object.entries(patches).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
		if (installed.has(name)) {
			result[name] = path.posix.relative(folders[0].folder, file);
		}
	}
	return result;
}

/**
 * Computes the `pnpm-workspace.yaml` settings of an install root. `folders[0]` is the root itself;
 * the remaining folders are workspace members.
 */
export function computeWorkspaceSettings(folders: readonly NpmFolder[], notes: ConfigNote[], satisfies: (version: string, range: string) => boolean, options: InstallRootOptions = {}): WorkspaceSettings {
	const members = folders.slice(1).map(f => path.posix.relative(folders[0].folder, f.folder));
	const allowBuilds = mergeAllowBuilds(folders, notes);
	const overrides = mergeOverrides(folders, notes, satisfies);
	const patchedDependencies = getPatchedDependencies(folders, options.dependencyPatches ?? {});
	return {
		...(members.length > 0 ? { packages: members } : {}),
		...(options.hasPnpmfile ? { pnpmfile: pnpmfileName } : {}),
		...sharedSettings,
		...(options.installsOtherRoots ? { optimisticRepeatInstall: false } : {}),
		...(Object.keys(allowBuilds).length > 0 ? { allowBuilds } : {}),
		...(Object.keys(overrides).length > 0 ? { overrides } : {}),
		...(Object.keys(patchedDependencies).length > 0 ? { patchedDependencies } : {}),
	};
}

function renderScalar(value: string | number | boolean): string {
	return dump(value, { lineWidth: -1 }).trimEnd();
}

/**
 * Renders `pnpm-workspace.yaml`, with settings in a fixed order.
 */
export function renderWorkspaceYaml(settings: WorkspaceSettings): string {
	const lines = [
		'# Generated from the npm configuration by build/npm/pnpm/convert.ts during the npm to pnpm migration.',
		'# Setting names must be in knownSettingNames in build/npm/pnpm/workspaceConfig.ts.',
	];
	for (const name of knownSettingNames) {
		const value = settings[name];
		if (value === undefined) {
			continue;
		}
		if (Array.isArray(value)) {
			lines.push(`${name}:`, ...value.map(item => `  - ${renderScalar(item)}`));
		} else if (typeof value === 'object') {
			lines.push(`${name}:`, ...Object.entries(value).map(([key, item]) => `  ${renderScalar(key)}: ${renderScalar(item)}`));
		} else {
			lines.push(`${name}: ${renderScalar(value as string | number | boolean)}`);
		}
	}
	return lines.join('\n') + '\n';
}
