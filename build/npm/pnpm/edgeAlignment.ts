/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parsePackageKey, parsePnpmLockfile, resolveDependencyVersion, snapshotDependencyKinds, type PnpmLockfile } from '../../lib/pnpmLock.ts';
import { collectNpmEdges } from './checks.ts';
import type { NpmLockfile } from './npmLockfile.ts';

export interface EdgeAlignment {
	readonly text: string;
	/** `name@version -> dependency@version (was …)` for every dependency that now matches npm. */
	readonly aligned: readonly string[];
	/** Dependencies that npm resolves to one other version but that couldn't be aligned, with the reason. */
	readonly skipped: readonly string[];
}

interface Block {
	readonly key: string;
	/** Line index of the entry's first line. */
	readonly start: number;
	/** Line index after the entry's last line. */
	readonly end: number;
}

function unquote(key: string): string {
	return key.startsWith('\'') && key.endsWith('\'') ? key.slice(1, -1).replace(/''/g, '\'') : key;
}

/**
 * Finds the entries of a top-level lockfile section (`packages:` or `snapshots:`).
 */
function findBlocks(lines: readonly string[], section: string): Map<string, Block> {
	const blocks = new Map<string, Block>();
	const sectionStart = lines.indexOf(`${section}:`);
	if (sectionStart === -1) {
		return blocks;
	}
	let current: { key: string; start: number } | undefined;
	let index = sectionStart + 1;
	for (; index < lines.length; index++) {
		const line = lines[index];
		if (/^\S/.test(line)) {
			break;
		}
		const entry = /^ {2}(\S.*?):(?: \{\})?$/.exec(line);
		if (entry) {
			if (current) {
				blocks.set(current.key, { ...current, end: endOfBlock(lines, current.start, index) });
			}
			current = { key: unquote(entry[1]), start: index };
		}
	}
	if (current) {
		blocks.set(current.key, { ...current, end: endOfBlock(lines, current.start, index) });
	}
	return blocks;
}

function endOfBlock(lines: readonly string[], start: number, next: number): number {
	let end = next;
	while (end > start + 1 && lines[end - 1].trim() === '') {
		end--;
	}
	return end;
}

function snapshotKeyOf(alias: string, version: string): string {
	// an npm alias (`real-name@1.0.0`) names the package; a peer suffix (`1.0.0(peer@2.0.0)`) doesn't
	return version.split('(')[0].includes('@') ? version : `${alias}@${version}`;
}

/**
 * Which snapshots are reachable from the importers, and which only through optional dependencies.
 */
function computeReachability(lockfile: PnpmLockfile): { all: Set<string>; required: Set<string> } {
	const all = new Set<string>();
	const required = new Set<string>();
	const visit = (key: string, isRequired: boolean) => {
		const target = isRequired ? required : all;
		if (target.has(key) || !lockfile.snapshots?.[key]) {
			return;
		}
		target.add(key);
		all.add(key);
		const snapshot = lockfile.snapshots[key];
		for (const [alias, version] of Object.entries(snapshot.dependencies ?? {})) {
			visit(snapshotKeyOf(alias, version), isRequired);
		}
		for (const [alias, version] of Object.entries(snapshot.optionalDependencies ?? {})) {
			visit(snapshotKeyOf(alias, version), false);
		}
	};
	for (const importer of Object.values(lockfile.importers)) {
		for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
			for (const [alias, { version }] of Object.entries(importer[kind] ?? {})) {
				if (!version.startsWith('link:')) {
					visit(snapshotKeyOf(alias, version), kind !== 'optionalDependencies');
				}
			}
		}
	}
	// A required visit of a snapshot first seen through an optional path must still mark it required.
	let changed = true;
	while (changed) {
		changed = false;
		for (const key of required) {
			const snapshot = lockfile.snapshots?.[key];
			for (const [alias, version] of Object.entries(snapshot?.dependencies ?? {})) {
				const dependencyKey = snapshotKeyOf(alias, version);
				if (lockfile.snapshots?.[dependencyKey] && !required.has(dependencyKey)) {
					required.add(dependencyKey);
					changed = true;
				}
			}
		}
	}
	return { all, required };
}

/**
 * Makes the dependencies of the packages in a generated lockfile match npm where npm resolves a
 * dependency of a `name@version` to the same version in every location (pnpm records one set of
 * dependencies per package and prefers other versions, for example the one its parent uses). Only
 * versions that the lockfile already has a single snapshot for are used; snapshots that are no
 * longer reachable are removed and the `optional` flags are recomputed. The result keeps pnpm's
 * formatting, so `pnpm install --frozen-lockfile` must accept it unchanged.
 */
export function alignDependencyEdges(text: string, npmLockfiles: readonly NpmLockfile[]): EdgeAlignment {
	const lockfile = parsePnpmLockfile(text);
	const snapshots = lockfile.snapshots ?? {};
	const lines = text.split('\n');
	const snapshotBlocks = findBlocks(lines, 'snapshots');
	const packageBlocks = findBlocks(lines, 'packages');

	// Safety check: the reachability model must reproduce pnpm's own optional flags.
	const before = computeReachability(lockfile);
	for (const [key, snapshot] of Object.entries(snapshots)) {
		const optional = before.all.has(key) && !before.required.has(key);
		if (!before.all.has(key) || optional !== (snapshot.optional === true)) {
			return { text, aligned: [], skipped: [`not aligned: the lockfile's optional flags or reachability differ from the model (${key})`] };
		}
	}

	const npmEdges = collectNpmEdges(npmLockfiles);
	const snapshotsByPackage = new Map<string, string[]>();
	for (const key of Object.keys(snapshots)) {
		const { name, version } = parsePackageKey(key);
		const list = snapshotsByPackage.get(`${name}@${version}`) ?? [];
		list.push(key);
		snapshotsByPackage.set(`${name}@${version}`, list);
	}

	const aligned: string[] = [];
	const skipped: string[] = [];
	const edits: { key: string; kind: string; alias: string; value: string }[] = [];
	for (const [key, snapshot] of Object.entries(snapshots)) {
		const { name, version } = parsePackageKey(key);
		const edges = npmEdges.get(`${name}@${version}`);
		for (const kind of snapshotDependencyKinds) {
			for (const [alias, value] of Object.entries(snapshot[kind] ?? {})) {
				const npmVersions = edges?.get(alias);
				const resolved = resolveDependencyVersion(alias, value);
				if (!npmVersions || npmVersions.size !== 1 || npmVersions.has(`${resolved.name}@${resolved.version}`) || /^[a-z+]+:/.test(resolved.version)) {
					continue;
				}
				const target = [...npmVersions][0];
				const description = `${name}@${version} -> ${target} (pnpm ${resolved.name}@${resolved.version})`;
				const candidates = snapshotsByPackage.get(target) ?? [];
				if (resolved.name !== alias || !target.startsWith(`${alias}@`)) {
					skipped.push(`${description}: aliased dependency`);
				} else if (candidates.length !== 1) {
					skipped.push(`${description}: ${candidates.length} snapshots of ${target}`);
				} else {
					const newValue = candidates[0].substring(alias.length + 1);
					(snapshot[kind] as Record<string, string>)[alias] = newValue;
					edits.push({ key, kind, alias, value: newValue });
					aligned.push(description);
				}
			}
		}
	}
	if (edits.length === 0) {
		return { text, aligned, skipped };
	}

	const output = [...lines];
	for (const { key, kind, alias, value } of edits) {
		const block = snapshotBlocks.get(key)!;
		let inKind = false;
		let done = false;
		for (let i = block.start + 1; i < block.end && !done; i++) {
			if (/^ {4}\S/.test(output[i])) {
				inKind = output[i] === `    ${kind}:`;
				continue;
			}
			const match = /^( {6})(\S.*?): (.*)$/.exec(output[i]);
			if (inKind && match && unquote(match[2]) === alias) {
				output[i] = `${match[1]}${match[2]}: ${value}`;
				done = true;
			}
		}
		if (!done) {
			throw new Error(`Cannot find ${kind}.${alias} in the lockfile snapshot ${key}`);
		}
	}

	const after = computeReachability(lockfile);
	const remove = new Set<number>();
	const removeBlock = (block: Block) => {
		for (let i = block.start; i < block.end; i++) {
			remove.add(i);
		}
		// the blank line that separated the entry from the next one
		if (output[block.end] === '') {
			remove.add(block.end);
		}
	};
	const remainingPackages = new Set<string>();
	for (const [key, block] of snapshotBlocks) {
		if (!after.all.has(key)) {
			removeBlock(block);
			continue;
		}
		const { name, version } = parsePackageKey(key);
		remainingPackages.add(`${name}@${version}`);
		const wantOptional = !after.required.has(key);
		const optionalLine = output.slice(block.start, block.end).indexOf('    optional: true');
		if (wantOptional && optionalLine === -1) {
			if (output[block.start].endsWith(': {}')) {
				output[block.start] = output[block.start].slice(0, -' {}'.length);
			}
			output[block.end - 1] = `${output[block.end - 1]}\n    optional: true`;
		} else if (!wantOptional && optionalLine !== -1) {
			remove.add(block.start + optionalLine);
			if (block.end - block.start === 2) {
				output[block.start] = `${output[block.start]} {}`;
			}
		}
	}
	for (const [key, block] of packageBlocks) {
		if (!remainingPackages.has(key)) {
			removeBlock(block);
		}
	}
	return { text: output.filter((_, i) => !remove.has(i)).join('\n'), aligned, skipped };
}
