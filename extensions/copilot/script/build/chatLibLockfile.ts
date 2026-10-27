/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DependencyKind = 'dependencies' | 'devDependencies' | 'optionalDependencies';

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
 * Updates chat-lib's lockfile after the extraction changed the dependencies in chat-lib's
 * `package.json` to Copilot's, without resolving anything (like the former npm implementation):
 *
 * - Each changed dependency is locked to the version that Copilot's lockfile locks, and Copilot's
 *   entries for that version and everything it depends on replace chat-lib's entries with the same
 *   key, so that the dependency's whole subtree matches Copilot's (also after a rollback).
 * - Removed dependencies are dropped, and so is every entry that chat-lib no longer uses.
 *
 * Throws if Copilot's lockfile doesn't lock a changed dependency, or if an entry is missing.
 *
 * @param changed The changed dependencies of chat-lib, with the section they are in.
 * @param removed The dependencies that were removed from chat-lib's `package.json`.
 * @returns The number of entries copied from Copilot's lockfile.
 */
export function copyLockedDependencies(copilotLockfile: PnpmLockfile, chatLibLockfile: PnpmLockfile, changed: ReadonlyMap<string, DependencyKind>, removed: ReadonlySet<string>): number {
	const copilotImporter = copilotLockfile.importers['.'] ?? {};
	const chatLibImporter = chatLibLockfile.importers['.'] ??= {};
	const packages = chatLibLockfile.packages ??= {};
	const snapshots = chatLibLockfile.snapshots ??= {};

	for (const kind of Object.keys(chatLibImporter) as DependencyKind[]) {
		const dependencies = chatLibImporter[kind] ?? {};
		for (const name of removed) {
			delete dependencies[name];
		}
		if (Object.keys(dependencies).length === 0) {
			delete chatLibImporter[kind];
		}
	}

	const queue: string[] = [];
	for (const [name, kind] of changed) {
		const dependency = (['dependencies', 'devDependencies', 'optionalDependencies'] as const).map(section => copilotImporter[section]?.[name]).find(entry => entry);
		if (!dependency || isLocal(dependency.version)) {
			throw new Error(`Copilot's pnpm-lock.yaml doesn't lock a version of ${name} that chat-lib can use${dependency ? ` (${dependency.version})` : ''}.`);
		}
		(chatLibImporter[kind] ??= {})[name] = { specifier: dependency.specifier, version: dependency.version };
		queue.push(toSnapshotKey(name, dependency.version));
	}

	let copied = 0;
	const visited = new Set<string>();
	while (queue.length > 0) {
		const key = queue.shift()!;
		if (visited.has(key)) {
			continue;
		}
		visited.add(key);
		const snapshot = copilotLockfile.snapshots?.[key];
		const packageEntry = copilotLockfile.packages?.[toPackageKey(key)];
		if (!snapshot || !packageEntry) {
			throw new Error(`Copilot's pnpm-lock.yaml has no entry for ${key}.`);
		}
		snapshots[key] = snapshot;
		packages[toPackageKey(key)] = packageEntry;
		copied++;
		for (const dependencies of [snapshot.dependencies, snapshot.optionalDependencies]) {
			for (const [name, version] of Object.entries(dependencies ?? {})) {
				if (!isLocal(version)) {
					queue.push(toSnapshotKey(name, version));
				}
			}
		}
	}

	// Drop the entries that chat-lib's dependencies no longer reach, and check that none is missing
	const reachable = new Set<string>();
	const missing: string[] = [];
	const pending = Object.values(chatLibImporter).flatMap(dependencies => Object.entries(dependencies ?? {}))
		.filter(([, dependency]) => !isLocal(dependency.version))
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
				if (!isLocal(version)) {
					pending.push(toSnapshotKey(name, version));
				}
			}
		}
	}
	if (missing.length > 0) {
		throw new Error(`chat-lib's pnpm-lock.yaml has no entries for ${missing.sort().join(', ')}.`);
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
	return copied;
}
