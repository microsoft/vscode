/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import cp from 'child_process';

/**
 * Where the npm state of the repository (`package.json` with `overrides`/`allowScripts`, and
 * `package-lock.json`) is read from. The conversion deletes the npm lockfiles, so after it ran
 * they come from git.
 */
export interface NpmSource {
	readonly description: string;
	/** Reads a file given its `/`-separated path relative to the repository root. */
	readFile(relativePath: string): string | undefined;
	/** Optionally reads many files at once, to speed up later `readFile` calls. */
	prefetch?(relativePaths: readonly string[]): void;
}

function git(root: string, args: string[]): { status: number | null; stdout: string } {
	const result = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
	if (result.error) {
		throw result.error;
	}
	return { status: result.status, stdout: result.stdout };
}

function createGitSource(root: string, ref: string, description: string): NpmSource {
	const verified = git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
	if (verified.status !== 0) {
		throw new Error(`Unknown git revision for the npm state: ${ref}`);
	}
	const commit = verified.stdout.trim();
	const cache = new Map<string, string | undefined>();
	return {
		description: `${description} (${commit.substring(0, 11)})`,
		readFile: relativePath => {
			if (!cache.has(relativePath)) {
				prefetch(root, commit, [relativePath], cache);
			}
			return cache.get(relativePath);
		},
		prefetch: relativePaths => prefetch(root, commit, relativePaths.filter(p => !cache.has(p)), cache),
	};
}

/**
 * Reads many files of a commit with a single `git cat-file --batch`.
 */
function prefetch(root: string, commit: string, relativePaths: readonly string[], cache: Map<string, string | undefined>): void {
	if (relativePaths.length === 0) {
		return;
	}
	const result = cp.spawnSync('git', ['cat-file', '--batch'], { cwd: root, input: relativePaths.map(p => `${commit}:${p}`).join('\n') + '\n', maxBuffer: 1024 * 1024 * 1024 });
	if (result.error || result.status !== 0) {
		throw result.error ?? new Error(`git cat-file failed: ${result.stderr}`);
	}
	const output = result.stdout;
	let offset = 0;
	for (const relativePath of relativePaths) {
		const headerEnd = output.indexOf(0x0a, offset);
		const header = output.subarray(offset, headerEnd).toString('utf8');
		if (header.endsWith(' missing')) {
			cache.set(relativePath, undefined);
			offset = headerEnd + 1;
			continue;
		}
		const size = Number(header.split(' ')[2]);
		cache.set(relativePath, output.subarray(headerEnd + 1, headerEnd + 1 + size).toString('utf8'));
		offset = headerEnd + 1 + size + 1;
	}
}

/**
 * Returns the source of the npm state.
 *
 * - With `ref`, files are read from that git revision.
 * - Otherwise, if the root `package-lock.json` exists on disk, files are read from disk (the
 *   repository has not been converted yet).
 * - Otherwise, files are read from the parent of the commit that deleted the root
 *   `package-lock.json`, or from `HEAD` if that deletion is not committed yet.
 */
export function getNpmSource(root: string, ref?: string): NpmSource {
	if (ref) {
		return createGitSource(root, ref, `git revision ${ref}`);
	}
	if (fs.existsSync(path.join(root, 'package-lock.json'))) {
		return {
			description: 'working tree',
			readFile: relativePath => {
				const file = path.join(root, relativePath);
				return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
			}
		};
	}
	const deletion = git(root, ['log', '-1', '--format=%H', '--diff-filter=D', 'HEAD', '--', 'package-lock.json']).stdout.trim();
	return deletion
		? createGitSource(root, `${deletion}^`, 'parent of the commit that deleted package-lock.json')
		: createGitSource(root, 'HEAD', 'HEAD');
}

/**
 * Reads the npm state from a folder on disk (used for distro checkouts, which keep their npm files
 * during the transition).
 */
export function getDiskSource(root: string): NpmSource {
	return {
		description: root,
		readFile: relativePath => {
			const file = path.join(root, relativePath);
			return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
		}
	};
}
