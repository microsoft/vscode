/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Limiter } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { rgDiskPath } from '../../../base/node/ripgrep.js';

/** Maximum number of files cached per working directory. */
const MAX_FILES = 50_000;

/** TTL for a cached file list before we re-enumerate. */
const CACHE_TTL_MS = 30_000;

/** Maximum number of concurrent ripgrep enumerations across all callers. */
const MAX_CONCURRENT_ENUMERATIONS = 4;

const enumerationLimiter = new Limiter<IAgentHostWorkspaceFilesResult>(MAX_CONCURRENT_ENUMERATIONS);

interface ICacheEntry {
	readonly promise: Promise<IAgentHostWorkspaceFilesResult>;
	expiresAt?: number;
}

export interface IAgentHostWorkspaceFilesResult {
	readonly files: readonly URI[];
	readonly isTruncated: boolean;
}

/**
 * Enumerates files under a working directory using ripgrep, with results
 * cached per working directory for a short TTL.
 *
 * Mirrors the workbench's file-search invocation pattern (see
 * `ripgrepFileSearch.ts` in `vs/workbench/services/search/node/`) but does
 * not depend on the workbench layer — the agent host runs in a separate
 * node process that may not import from `vs/workbench/`.
 *
 * Files are returned as absolute {@link URI}s relative to the working
 * directory. `.gitignore` and other `.ignore` files are honoured by
 * ripgrep. Symlinks are followed.
 */
export class AgentHostWorkspaceFiles extends Disposable {

	private readonly _cache = new Map<string, ICacheEntry>();
	/** Active ripgrep child processes, killed on dispose. */
	private readonly _activeChildren = new Set<cp.ChildProcessWithoutNullStreams>();
	private _isDisposed = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	override dispose(): void {
		this._isDisposed = true;
		for (const child of this._activeChildren) {
			try {
				child.kill();
			} catch {
				// ignore
			}
		}
		this._activeChildren.clear();
		this._cache.clear();
		super.dispose();
	}

	/**
	 * Return the list of files under `workingDirectory`. Concurrent calls
	 * with the same working directory share an in-flight enumeration.
	 *
	 * Only `file://` URIs are supported. Other schemes return an empty list.
	 */
	async getFiles(workingDirectory: URI, token: CancellationToken): Promise<IAgentHostWorkspaceFilesResult> {
		if (workingDirectory.scheme !== Schemas.file) {
			return { files: [], isTruncated: false };
		}

		const key = workingDirectory.toString();
		const now = Date.now();
		const existing = this._cache.get(key);
		let shared: Promise<IAgentHostWorkspaceFilesResult>;
		if (existing && (existing.expiresAt === undefined || existing.expiresAt > now)) {
			shared = existing.promise;
		} else {
			shared = enumerationLimiter.queue(() => this._isDisposed ? Promise.resolve({ files: [], isTruncated: false }) : this._enumerate(workingDirectory));
			const entry: ICacheEntry = { promise: shared };
			this._cache.set(key, entry);
			shared.then(() => {
				if (this._cache.get(key) === entry) {
					entry.expiresAt = Date.now() + CACHE_TTL_MS;
				}
			}, () => {
				if (this._cache.get(key) === entry) {
					this._cache.delete(key);
				}
			});
		}

		// Race the shared enumeration against the caller's cancellation
		// token. Only the caller's promise rejects on cancellation; the
		// shared enumeration runs to completion so concurrent callers (and
		// future cache hits within the TTL) still see the result.
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (token === CancellationToken.None) {
			return shared;
		}
		return new Promise<IAgentHostWorkspaceFilesResult>((resolve, reject) => {
			const cancelListener = token.onCancellationRequested(() => {
				cancelListener.dispose();
				reject(new CancellationError());
			});
			shared.then(value => {
				cancelListener.dispose();
				resolve(value);
			}, err => {
				cancelListener.dispose();
				reject(err);
			});
		});
	}

	private async _enumerate(workingDirectory: URI): Promise<IAgentHostWorkspaceFilesResult> {
		const resolvedRgDiskPath = await rgDiskPath();
		return new Promise<IAgentHostWorkspaceFilesResult>((resolve, reject) => {
			const cwd = workingDirectory.fsPath;
			// Mirror the workbench's `ripgrepFileSearch.ts` invocation: pass
			// `--no-config` so a user's global `~/.ripgreprc` cannot change
			// enumeration results (or enable preprocessors etc.).
			const args = ['--files', '--hidden', '--no-require-git', '--follow', '--no-config', '--glob', '!.git'];

			let child: cp.ChildProcessWithoutNullStreams;
			try {
				child = cp.spawn(resolvedRgDiskPath, args, { cwd });
			} catch (err) {
				this._logService.warn(`[AgentHostWorkspaceFiles] Failed to spawn ripgrep: ${err}`);
				reject(err);
				return;
			}
			this._activeChildren.add(child);

			const results: URI[] = [];
			let buffer = '';
			let limitHit = false;
			let settled = false;

			const finish = (files: readonly URI[], error?: Error) => {
				if (settled) {
					return;
				}
				settled = true;
				this._activeChildren.delete(child);
				if (error) {
					reject(error);
				} else {
					resolve({ files, isTruncated: limitHit });
				}
			};

			child.stdout.setEncoding('utf8');
			child.stdout.on('data', (chunk: string) => {
				if (limitHit) {
					return;
				}
				buffer += chunk;
				let newlineIndex: number;
				while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
					const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
					buffer = buffer.slice(newlineIndex + 1);
					if (!line) {
						continue;
					}
					results.push(URI.joinPath(workingDirectory, line));
					if (results.length >= MAX_FILES) {
						limitHit = true;
						this._logService.trace(`[AgentHostWorkspaceFiles] File limit reached while enumerating ${workingDirectory.toString()}`);
						try {
							child.kill();
						} catch {
							// ignore
						}
						break;
					}
				}
			});

			child.stderr.setEncoding('utf8');
			let stderr = '';
			child.stderr.on('data', (chunk: string) => {
				stderr += chunk;
			});

			child.on('error', err => {
				if (this._isDisposed) {
					finish([]);
					return;
				}
				this._logService.warn(`[AgentHostWorkspaceFiles] ripgrep error: ${err}`);
				finish([], err);
			});

			child.on('close', code => {
				if (this._isDisposed) {
					finish([]);
					return;
				}
				// Flush any trailing line still in the buffer.
				if (!limitHit && buffer.length > 0) {
					const line = buffer.replace(/\r$/, '');
					if (line) {
						results.push(URI.joinPath(workingDirectory, line));
					}
					buffer = '';
				}
				if (stderr) {
					this._logService.trace(`[AgentHostWorkspaceFiles] ripgrep stderr: ${stderr}`);
				}
				if (!limitHit && code !== 0 && code !== 1) {
					const error = new Error(`ripgrep exited with code ${code ?? 'unknown'} while enumerating ${workingDirectory.toString()}`);
					this._logService.warn(`[AgentHostWorkspaceFiles] ${error.message}`);
					finish([], error);
					return;
				}
				finish(results);
			});
		});
	}
}
