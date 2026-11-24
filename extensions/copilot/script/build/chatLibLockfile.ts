/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DependencyKind = 'dependencies' | 'devDependencies' | 'optionalDependencies';

const dependencyKinds: readonly DependencyKind[] = ['dependencies', 'devDependencies', 'optionalDependencies'];

interface ImporterDependency {
	specifier: string;
	version: string;
}

/**
 * The parts of a `pnpm-lock.yaml` file (lockfile version 9) that the chat-lib extraction reads and
 * writes. Other properties are kept as they are.
 */
export interface PnpmLockfile {
	importers: Record<string, Partial<Record<DependencyKind, Record<string, ImporterDependency>>>>;
	packages?: Record<string, unknown>;
	snapshots?: Record<string, { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>;
}

function isLocal(version: string): boolean {
	return version.startsWith('link:') || version.startsWith('file:');
}

/**
 * Whether a dependency links to a project of the workspace, which has no entries in `packages` and
 * `snapshots`. A `file:` dependency has entries (`name@file:path`).
 */
function isLink(version: string): boolean {
	return version.startsWith('link:');
}

/**
 * Returns the `snapshots` key of a dependency: `name@version`, or the version itself for an npm
 * alias (`npm:other@^1` is locked as `other@1.2.3`). Both may end with resolved peers in parentheses.
 */
function toSnapshotKey(name: string, version: string): string {
	return version.split('(')[0].includes('@') ? version : `${name}@${version}`;
}

function toPackageKey(snapshotKey: string): string {
	return snapshotKey.replace(/\(.*$/, '');
}

/**
 * Splits the contents of a `pnpm-lock.yaml` file into the lockfile of the projects, which is the
 * last YAML document, and the documents before it, which lock the pnpm version that
 * `packageManager` pins (https://pnpm.io/lockfile). `leadingDocuments` ends with the `---` line
 * that starts the lockfile of the projects, and is empty if the file has a single document.
 */
export function splitLockfileDocuments(content: string): { leadingDocuments: string; lockfile: string } {
	const lastSeparator = [...content.matchAll(/^---(?:\r?\n|$)/gm)].at(-1);
	const end = lastSeparator ? lastSeparator.index + lastSeparator[0].length : 0;
	return { leadingDocuments: content.substring(0, end), lockfile: content.substring(end) };
}

/**
 * Updates the chat-lib project (importer `chatLibImporterId`) of the repository's lockfile after the
 * extraction changed the dependencies in chat-lib's `package.json` to Copilot's, without resolving
 * anything: chat-lib and Copilot are members of the root pnpm workspace, so both share one lockfile.
 *
 * - Each changed dependency is locked to the version that Copilot's project (importer
 *   `copilotImporterId`) locks. Its entries are already in the lockfile.
 * - Removed dependencies are dropped, and so is every entry that no project uses anymore.
 *
 * Throws if Copilot's project doesn't lock a changed dependency, or if an entry is missing.
 *
 * @param changed The changed dependencies of chat-lib, with the section they are in.
 * @param removed The dependencies that were removed from chat-lib's `package.json`.
 * @returns The number of dependencies locked to Copilot's version.
 */
export function lockChatLibDependencies(lockfile: PnpmLockfile, copilotImporterId: string, chatLibImporterId: string, changed: ReadonlyMap<string, DependencyKind>, removed: ReadonlySet<string>): number {
	const copilotImporter = lockfile.importers[copilotImporterId] ?? {};
	const chatLibImporter = lockfile.importers[chatLibImporterId];
	if (!chatLibImporter) {
		throw new Error(`pnpm-lock.yaml has no project ${chatLibImporterId}.`);
	}
	const packages = lockfile.packages ??= {};
	const snapshots = lockfile.snapshots ??= {};

	for (const kind of dependencyKinds) {
		for (const name of removed) {
			delete chatLibImporter[kind]?.[name];
		}
	}

	for (const [name, kind] of changed) {
		const dependency = dependencyKinds.map(section => copilotImporter[section]?.[name]).find(entry => entry);
		if (!dependency || isLocal(dependency.version)) {
			throw new Error(`Copilot's project in pnpm-lock.yaml doesn't lock a version of ${name} that chat-lib can use${dependency ? ` (${dependency.version})` : ''}.`);
		}
		for (const section of dependencyKinds) {
			if (section !== kind) {
				delete chatLibImporter[section]?.[name];
			}
		}
		(chatLibImporter[kind] ??= {})[name] = { specifier: dependency.specifier, version: dependency.version };
	}
	for (const kind of dependencyKinds) {
		if (chatLibImporter[kind] && Object.keys(chatLibImporter[kind]).length === 0) {
			delete chatLibImporter[kind];
		}
	}

	// Drop the entries that no project reaches anymore, and check that none is missing
	const reachable = new Set<string>();
	const missing: string[] = [];
	const pending = Object.values(lockfile.importers)
		.flatMap(importer => dependencyKinds.flatMap(kind => Object.entries(importer[kind] ?? {})))
		.filter(([, dependency]) => !isLink(dependency.version))
		.map(([name, dependency]) => toSnapshotKey(name, dependency.version));
	while (pending.length > 0) {
		const key = pending.pop()!;
		if (reachable.has(key)) {
			continue;
		}
		reachable.add(key);
		const snapshot = snapshots[key];
		if (!snapshot || !packages[toPackageKey(key)]) {
			missing.push(key);
			continue;
		}
		for (const dependencies of [snapshot.dependencies, snapshot.optionalDependencies]) {
			for (const [name, version] of Object.entries(dependencies ?? {})) {
				if (!isLink(version)) {
					pending.push(toSnapshotKey(name, version));
				}
			}
		}
	}
	if (missing.length > 0) {
		throw new Error(`pnpm-lock.yaml has no entries for ${missing.sort().join(', ')}.`);
	}
	const reachablePackages = new Set([...reachable].map(toPackageKey));
	for (const key of Object.keys(snapshots)) {
		if (!reachable.has(key)) {
			delete snapshots[key];
		}
	}
	for (const key of Object.keys(packages)) {
		if (!reachablePackages.has(key)) {
			delete packages[key];
		}
	}
	return changed.size;
}
