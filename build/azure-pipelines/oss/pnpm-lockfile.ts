/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import { load } from 'js-yaml';

/**
 * A package recorded in a pnpm lockfile (lockfile version 9).
 */
export interface PnpmLockfilePackageEntry {
	readonly name: string;
	readonly version: string;
	/** `os` field of the package, if it is limited to some operating systems. */
	readonly os?: readonly string[];
	/** Whether only devDependencies of the importer reach the package. */
	readonly dev: boolean;
}

interface Lockfile {
	readonly importers?: Record<string, Record<string, Record<string, { readonly version: string }> | undefined>>;
	readonly packages?: Record<string, { readonly os?: string[] }>;
	readonly snapshots?: Record<string, { readonly dependencies?: Record<string, string>; readonly optionalDependencies?: Record<string, string> }>;
}

function splitKey(key: string): { name: string; version: string } {
	const peers = key.indexOf('(');
	const withoutPeers = peers === -1 ? key : key.substring(0, peers);
	const at = withoutPeers.indexOf('@', 1);
	return { name: withoutPeers.substring(0, at), version: withoutPeers.substring(at + 1) };
}

function snapshotKey(name: string, version: string): string | undefined {
	if (version.startsWith('link:')) {
		return undefined;
	}
	const peers = version.indexOf('(');
	const withoutPeers = peers === -1 ? version : version.substring(0, peers);
	const isAlias = withoutPeers.indexOf('@', 1) !== -1 && !/^[a-z+]+:/.test(withoutPeers);
	return isAlias ? version : `${name}@${version}`;
}

function closure(lockfile: Lockfile, roots: Iterable<string>): Set<string> {
	const result = new Set<string>();
	const stack = [...roots];
	while (stack.length > 0) {
		const key = stack.pop()!;
		if (result.has(key)) {
			continue;
		}
		result.add(key);
		const snapshot = lockfile.snapshots?.[key];
		for (const deps of [snapshot?.dependencies, snapshot?.optionalDependencies]) {
			for (const [name, version] of Object.entries(deps ?? {})) {
				const child = snapshotKey(name, version);
				if (child) {
					stack.push(child);
				}
			}
		}
	}
	return result;
}

/**
 * Returns, for each importer (project) of a `pnpm-lock.yaml`, the packages it reaches, each
 * marked `dev` if only its devDependencies reach it.
 */
export function readPnpmLockfileImporters(lockPath: string): Map<string, PnpmLockfilePackageEntry[]> {
	const lockfile = load(fs.readFileSync(lockPath, 'utf8')) as Lockfile;
	const result = new Map<string, PnpmLockfilePackageEntry[]>();
	for (const [importerId, importer] of Object.entries(lockfile.importers ?? {})) {
		const rootsOf = (kinds: string[]) => kinds.flatMap(kind => Object.entries(importer[kind] ?? {}).map(([name, { version }]) => snapshotKey(name, version)).filter((key): key is string => !!key));
		const prod = closure(lockfile, rootsOf(['dependencies', 'optionalDependencies']));
		const all = closure(lockfile, rootsOf(['dependencies', 'optionalDependencies', 'devDependencies']));
		const entries = new Map<string, PnpmLockfilePackageEntry>();
		for (const key of all) {
			const { name, version } = splitKey(key);
			if (/^(file|link):/.test(version)) {
				continue;
			}
			const id = `${name}@${version}`;
			const dev = !prod.has(key);
			const existing = entries.get(id);
			if (!existing || (existing.dev && !dev)) {
				entries.set(id, { name, version, os: lockfile.packages?.[id]?.os, dev });
			}
		}
		result.set(importerId, [...entries.values()]);
	}
	return result;
}
