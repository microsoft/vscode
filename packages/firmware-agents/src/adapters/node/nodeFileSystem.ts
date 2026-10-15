/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import { DirEntry, IFileSystem } from '../../kernel/host';

/** Thrown for paths outside the workspace root, including through symlinks. */
export class PathOutsideWorkspaceError extends Error {
	constructor(requested: string) {
		super(`Path "${requested}" is outside the workspace`);
		this.name = 'PathOutsideWorkspaceError';
	}
}

export function isInside(root: string, candidate: string): boolean {
	const rel = path.relative(root, candidate);
	return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * Resolves `requested` against `root` and proves the result stays inside it, following every
 * symlink: the deepest existing entry (found with `lstat`, so a dangling link counts as
 * existing) is resolved with `realpath`; a link whose target is missing is refused. Components
 * below that entry do not exist yet, so they cannot be links.
 *
 * Remaining gap: a link swapped in between this check and the actual I/O (TOCTOU). Closing it
 * needs `openat`-style APIs Node does not have; the agent, not a concurrent attacker, is the
 * threat this guards against.
 */
export async function resolveInside(root: string, requested: string): Promise<string> {
	const absolute = path.resolve(root, requested);
	if (!isInside(root, absolute)) {
		throw new PathOutsideWorkspaceError(requested);
	}
	const realRoot = await fs.realpath(root);
	let existing = absolute;
	const rest: string[] = [];
	for (; ;) {
		let stat;
		try {
			stat = await fs.lstat(existing);
		} catch {
			const parent = path.dirname(existing);
			if (parent === existing) {
				throw new PathOutsideWorkspaceError(requested);
			}
			rest.unshift(path.basename(existing));
			existing = parent;
			continue;
		}
		let real: string;
		try {
			real = await fs.realpath(existing);
		} catch {
			// Dangling symlink: its target could be anywhere, and writing through it would create it.
			throw new PathOutsideWorkspaceError(requested);
		}
		if (!stat.isSymbolicLink() && !stat.isDirectory() && rest.length) {
			throw new Error(`"${requested}": "${path.relative(root, existing)}" is not a directory`);
		}
		if (!isInside(realRoot, path.join(real, ...rest))) {
			throw new PathOutsideWorkspaceError(requested);
		}
		return absolute;
	}
}

/** Default cap on files read for the model (a firmware source or map file is far below this). */
export const DEFAULT_MAX_READ_BYTES = 8 * 1024 * 1024;

/** {@link IFileSystem} confined to one root directory. */
export class NodeFileSystem implements IFileSystem {
	private readonly root: string;

	constructor(root: string, private readonly maxReadBytes = DEFAULT_MAX_READ_BYTES) {
		this.root = path.resolve(root);
	}

	/** Reads regular files only (a FIFO or device would block or never end). */
	async readFile(p: string): Promise<string> {
		const target = await resolveInside(this.root, p);
		const stat = await fs.stat(target);
		if (!stat.isFile()) {
			throw new Error(`"${p}" is not a regular file`);
		}
		if (stat.size > this.maxReadBytes) {
			throw new Error(`"${p}" is ${stat.size} bytes; the limit is ${this.maxReadBytes}`);
		}
		return fs.readFile(target, 'utf8');
	}

	async writeFile(p: string, content: string): Promise<void> {
		const target = await resolveInside(this.root, p);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await resolveInside(this.root, p); // re-check after creating folders
		await fs.writeFile(target, content, 'utf8');
	}

	async exists(p: string): Promise<boolean> {
		const target = await resolveInside(this.root, p);
		try {
			await fs.access(target);
			return true;
		} catch {
			return false;
		}
	}

	async readDir(p: string): Promise<DirEntry[]> {
		const entries = await fs.readdir(await resolveInside(this.root, p), { withFileTypes: true });
		return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
	}
}
