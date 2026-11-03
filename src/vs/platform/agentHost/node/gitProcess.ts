/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constants as fsConstants } from 'fs';
import * as fsPromises from 'fs/promises';
import { LRUCache } from '../../../base/common/map.js';
import { getCaseInsensitive } from '../../../base/common/objects.js';
import * as path from '../../../base/common/path.js';
import { isWindows, type IProcessEnvironment } from '../../../base/common/platform.js';

/** What a spawn of bare `git` runs when no executable could be resolved: the spawn searches `PATH` itself. */
const BARE_GIT = 'git';

/**
 * The filesystem operations used to find git and to probe for repositories.
 * `fs/promises` implements it; tests substitute an in-memory fake.
 */
export interface IGitFileSystem {
	stat(fsPath: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;
	lstat(fsPath: string): Promise<unknown>;
	realpath(fsPath: string): Promise<string>;
	access(fsPath: string, mode: number): Promise<void>;
}

/**
 * The process-level dependencies of running git.
 */
export interface IGitProcessEnvironment {
	/** The environment git processes inherit. */
	readonly env: IProcessEnvironment;
	readonly fileSystem: IGitFileSystem;
	readonly executable: GitExecutableResolver;
}

/**
 * Resolves the executable that a spawn of bare `git` would run, once per `PATH`.
 *
 * A spawn by bare name searches `PATH` every time. On Windows that probes
 * `git.com` and `git.exe` in the working directory and in every `PATH` entry,
 * which is slow on machines with long `PATH`s.
 *
 * The search mirrors the spawn's own lookup instead of using `findExecutable`,
 * which also accepts `PATHEXT` matches such as `git.cmd` that `execFile` cannot
 * run without a shell, extensionless or non-executable files, and files relative
 * to this process's working directory. Whenever the result could differ from
 * the spawn's — no `PATH`, or a relative or empty entry before git's directory —
 * it falls back to bare `git`. `PATHEXT` is not part of the cache key because
 * the spawn ignores it. The one intended difference is that on Windows a `git`
 * in the spawn's working directory no longer takes precedence over `PATH`.
 */
export class GitExecutableResolver {

	private readonly _resolved = new LRUCache<string, Promise<string>>(8);

	constructor(
		private readonly _isWindows: boolean,
		private readonly _fileSystem: Pick<IGitFileSystem, 'stat' | 'lstat' | 'access'>,
	) { }

	/**
	 * The absolute path of git for a spawn with environment `env`, or bare `git`
	 * if it cannot be resolved.
	 */
	resolve(env: IProcessEnvironment): Promise<string> {
		const envPath = this._getPath(env);
		if (envPath === undefined) {
			return Promise.resolve(BARE_GIT);
		}
		let resolved = this._resolved.get(envPath);
		if (!resolved) {
			resolved = this._find(envPath).then(executable => executable ?? BARE_GIT, () => BARE_GIT);
			this._resolved.set(envPath, resolved);
		}
		return resolved;
	}

	/**
	 * Reports that spawning `executable`, as resolved for `env`, failed with
	 * `error`. A missing executable is searched for again on the next spawn in
	 * case git was moved or uninstalled.
	 */
	handleSpawnError(env: IProcessEnvironment, executable: string, error: unknown): void {
		const envPath = this._getPath(env);
		if (envPath !== undefined && executable !== BARE_GIT && (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
			this._resolved.delete(envPath);
		}
	}

	private _getPath(env: IProcessEnvironment): string | undefined {
		// Windows environment variable names are case-insensitive.
		const envPath = this._isWindows ? getCaseInsensitive(env, 'PATH') : env.PATH;
		return typeof envPath === 'string' ? envPath : undefined;
	}

	private async _find(envPath: string): Promise<string | undefined> {
		const pathLib = this._isWindows ? path.win32 : path.posix;
		const names = this._isWindows ? ['git.com', 'git.exe'] : [BARE_GIT];
		for (const rawEntry of envPath.split(pathLib.delimiter)) {
			// On Windows the spawn skips empty entries and accepts quoted ones; other quoting falls back below.
			const entry = this._isWindows ? rawEntry.replace(/^"(?<unquoted>[^"]*)"$/, '$<unquoted>') : rawEntry;
			if (this._isWindows && !entry) {
				continue;
			}
			// Relative entries, and empty ones outside Windows, depend on each spawn's working directory.
			if (!this._isFullyQualified(entry)) {
				return undefined;
			}
			for (const name of names) {
				// Windows resolves `..` lexically, like `join`; POSIX resolves it after following symbolic links,
				// so the entry must reach the file system as the spawn's own lookup passes it.
				const candidate = this._isWindows ? path.win32.join(entry, name) : `${entry.replace(/\/+$/, '')}/${name}`;
				if (await this._isExecutableFile(candidate)) {
					return candidate;
				}
			}
		}
		return undefined;
	}

	private _isFullyQualified(entry: string): boolean {
		if (!this._isWindows) {
			return path.posix.isAbsolute(entry);
		}
		// `\dir` is relative to the current drive, so require a drive letter or a UNC root.
		return path.win32.isAbsolute(entry) && path.win32.parse(entry).root.length > 1;
	}

	private async _isExecutableFile(fsPath: string): Promise<boolean> {
		try {
			const stat = await this._fileSystem.stat(fsPath);
			if (this._isWindows) {
				return !stat.isDirectory();
			}
			if (!stat.isFile()) {
				return false;
			}
			await this._fileSystem.access(fsPath, fsConstants.X_OK);
			return true;
		} catch (error) {
			if (!this._isWindows || isNotFoundError(error)) {
				return false;
			}
			// App execution aliases are reparse points that `stat` cannot follow but that can be spawned.
			try {
				await this._fileSystem.lstat(fsPath);
				return true;
			} catch {
				return false;
			}
		}
	}
}

/**
 * Whether git might find a repository for the existing directory `fsPath`:
 * the environment names one explicitly, or `fsPath`, the path it resolves to,
 * or one of their ancestors has a `.git` entry (a directory, or the file that
 * linked worktrees and submodules use). Reports `true` whenever unsure.
 *
 * Unlike caching git's "not a git repository" answer, this notices a `git init`
 * or a new worktree immediately.
 */
export async function mayBeInGitRepository(fsPath: string, env: IProcessEnvironment, fileSystem: Pick<IGitFileSystem, 'lstat' | 'realpath'>): Promise<boolean> {
	if (getCaseInsensitive(env, 'GIT_DIR') !== undefined || getCaseInsensitive(env, 'GIT_WORK_TREE') !== undefined) {
		return true;
	}

	let physicalPath: string;
	try {
		// Git searches upwards from the physical working directory, which has symbolic links resolved.
		physicalPath = await fileSystem.realpath(fsPath);
	} catch {
		return true;
	}

	const directories = new Set([...selfAndAncestors(physicalPath), ...selfAndAncestors(fsPath)]);
	for (const directory of directories) {
		if (await hasEntry(fileSystem, path.join(directory, '.git'))) {
			return true;
		}
	}
	return false;
}

function* selfAndAncestors(fsPath: string): Iterable<string> {
	let directory = path.resolve(fsPath);
	while (true) {
		yield directory;
		const parent = path.dirname(directory);
		if (parent === directory) {
			return;
		}
		directory = parent;
	}
}

async function hasEntry(fileSystem: Pick<IGitFileSystem, 'lstat'>, fsPath: string): Promise<boolean> {
	try {
		await fileSystem.lstat(fsPath);
		return true;
	} catch (error) {
		// Anything but a definite "not found" (e.g. `EACCES`) leaves the decision to git.
		return !isNotFoundError(error);
	}
}

function isNotFoundError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | undefined)?.code;
	return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * This process's environment, shared so that git is resolved once per process.
 */
export const nodeGitProcessEnvironment: IGitProcessEnvironment = {
	get env() {
		return process.env;
	},
	fileSystem: fsPromises,
	executable: new GitExecutableResolver(isWindows, fsPromises),
};
