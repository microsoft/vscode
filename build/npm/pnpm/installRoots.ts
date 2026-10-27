/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { workspaceMembers, separateRoots, standaloneRoots, npmFolders } from '../dirs.ts';
import { parseNpmLockfile } from './npmLockfile.ts';
import type { NpmSource } from './npmSource.ts';
import { computeWorkspaceSettings, dependencyPatches, pnpmfileName, pnpmVersion, renderWorkspaceYaml, type ConfigNote, type NpmFolder, type PackageJson, type WorkspaceSettings } from './workspaceConfig.ts';
import type { Satisfies } from './checks.ts';

/**
 * Folders whose `package.json` has no dependencies at all. They are not install roots; their
 * (empty) `package-lock.json` is deleted.
 */
export const noDependencyFolders = [
	'extensions/copilot/src/extension/typescriptContext/serverPlugin',
];

/**
 * An install root: one `pnpm-workspace.yaml` and one `pnpm-lock.yaml`.
 */
export interface InstallRoot {
	/** Folder relative to the base directory (the repository, or a distro checkout). */
	readonly folder: string;
	/** The root project first, then the workspace members, relative to the base directory. */
	readonly projects: readonly NpmFolder[];
	readonly settings: WorkspaceSettings;
	readonly notes: readonly ConfigNote[];
}

/**
 * Returns the folders of each install root of the repository, in a fixed order: the main
 * workspace (root project first, then its members in `dirs.ts` order), then the separate roots,
 * then the standalone roots.
 */
export function getInstallRootFolders(): string[][] {
	return [
		workspaceMembers,
		...separateRoots.map(folder => [folder]),
		...standaloneRoots.map(folder => [folder]),
	];
}

/**
 * Returns the install root folders of a distro checkout, relative to the checkout.
 */
export function getDistroRootFolders(): string[][] {
	return [['npm'], ['npm/remote'], ['npm/remote/web']];
}

/**
 * Every folder with an npm lockfile that counts for the universe check, relative to the repository.
 */
export function getAllNpmLockfileFolders(): string[] {
	return [...workspaceMembers, ...separateRoots, ...standaloneRoots, ...npmFolders];
}

function readRequired(source: NpmSource, relativePath: string): string {
	const content = source.readFile(relativePath);
	if (content === undefined) {
		throw new Error(`Missing ${relativePath} in the npm state (${source.description}).`);
	}
	return content;
}

/**
 * Reads the npm `package.json` and `package-lock.json` of a folder.
 */
export function loadNpmFolder(source: NpmSource, folder: string): NpmFolder {
	return {
		folder,
		packageJson: JSON.parse(readRequired(source, path.posix.join(folder, 'package.json'))) as PackageJson,
		lockfile: parseNpmLockfile(readRequired(source, path.posix.join(folder, 'package-lock.json'))),
	};
}

/**
 * Loads an install root and computes its intended `pnpm-workspace.yaml` settings. Roots that have
 * a `.pnpmfile.mjs` in `baseDir` (those that build native modules) get the `pnpmfile` setting.
 * `isRepositoryRoot` marks roots of the repository (not of a distro checkout): they get the
 * repository's dependency patches, and the main workspace's postinstall installs the other roots.
 */
export function loadInstallRoot(source: NpmSource, folders: readonly string[], satisfies: Satisfies | undefined, baseDir: string, isRepositoryRoot = false): InstallRoot {
	const projects = folders.map(folder => loadNpmFolder(source, folder));
	const notes: ConfigNote[] = [];
	// Without semver (not installed yet), an override value only matches its exact version.
	const settings = computeWorkspaceSettings(projects, notes, satisfies ?? ((version, range) => version === range), {
		hasPnpmfile: fs.existsSync(path.join(baseDir, folders[0], pnpmfileName)),
		installsOtherRoots: isRepositoryRoot && folders[0] === '',
		dependencyPatches: isRepositoryRoot ? dependencyPatches : undefined,
	});
	return { folder: folders[0], projects, settings, notes };
}

export function renderInstallRootYaml(root: InstallRoot): string {
	return renderWorkspaceYaml(root.settings);
}

/**
 * Rewrites a `package.json` for pnpm, keeping its formatting: removes the npm-only `overrides`
 * and `allowScripts` (unless `keepNpmFields`), and sets `packageManager` for install roots.
 */
export function convertPackageJsonText(text: string, options: { readonly isInstallRoot: boolean; readonly keepNpmFields?: boolean }): string {
	const json = JSON.parse(text) as Record<string, unknown>;
	const result: Record<string, unknown> = {};
	let inserted = false;
	const insertAfter = Object.hasOwn(json, 'version') ? 'version' : Object.hasOwn(json, 'name') ? 'name' : undefined;
	if (options.isInstallRoot && !insertAfter) {
		result.packageManager = `pnpm@${pnpmVersion}`;
		inserted = true;
	}
	for (const [key, value] of Object.entries(json)) {
		if (key === 'packageManager' || (!options.keepNpmFields && (key === 'overrides' || key === 'allowScripts'))) {
			continue;
		}
		result[key] = value;
		if (options.isInstallRoot && !inserted && key === insertAfter) {
			result.packageManager = `pnpm@${pnpmVersion}`;
			inserted = true;
		}
	}
	const indent = /^([ \t]+)"/m.exec(text)?.[1] ?? '\t';
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	return JSON.stringify(result, null, indent).replace(/\n/g, eol) + (text.endsWith('\n') ? eol : '');
}
