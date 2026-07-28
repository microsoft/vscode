/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { CancellationError } from '../../../base/common/errors.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IGitPullOptions, ILocalGitService } from '../common/localGitService.js';
import { ILogService } from '../../log/common/log.js';

export class LocalGitService implements ILocalGitService {
	declare readonly _serviceBrand: undefined;

	private _runningProcesses = new Map<string, cp.ChildProcess>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		private readonly _execFile: typeof cp.execFile = cp.execFile,
	) { }

	private _exec(operationId: string, args: string[], cwd?: string): Promise<string> {
		return new Promise((resolve, reject) => {
			this._logService.trace(`[LocalGitService] git ${args.join(' ')}${cwd ? ` (cwd: ${cwd})` : ''}`);
			const proc = this._execFile('git', args, { cwd, encoding: 'utf8' }, (err, stdout, stderr) => {
				if (!this._runningProcesses.delete(operationId)) {
					reject(new CancellationError());
					return;
				}
				if (err) {
					this._logService.error(`[LocalGitService] git ${args[0]} failed:`, err.message, stderr);
					reject(err);
					return;
				}
				resolve(stdout);
			});

			this._runningProcesses.set(operationId, proc);
		});
	}

	async clone(operationId: string, cloneUrl: string, targetPath: string, ref?: string): Promise<void> {
		const args = ['clone'];
		if (ref) {
			args.push('--branch', ref);
		}
		args.push('--', cloneUrl, targetPath);
		await this._exec(operationId, args);
	}

	async pull(operationId: string, repoPath: string, options?: IGitPullOptions): Promise<boolean> {
		const before = (await this._exec(operationId, ['rev-parse', 'HEAD'], repoPath)).trim();

		try {
			await this._exec(operationId, ['pull', '--ff-only'], repoPath);
		} catch (err) {
			if (!this._isFastForwardPullFailure(err)) {
				throw err;
			}

			const error = err as { message?: string };
			this._logService.warn(`[LocalGitService] Fast-forward pull failed for ${repoPath}: ${error?.message ?? String(err)}. Retrying after fetch.`);
			await this._exec(operationId, ['fetch', '--prune'], repoPath);

			try {
				await this._exec(operationId, ['pull', '--ff-only'], repoPath);
			} catch (retryErr) {
				if (!this._isFastForwardPullFailure(retryErr)) {
					throw retryErr;
				}

				if (!options?.allowHardResetOnDivergence) {
					throw retryErr;
				}

				const upstream = await this._getSafeHardResetTarget(operationId, repoPath);
				if (!upstream) {
					throw retryErr;
				}

				this._logService.warn(`[LocalGitService] Pull retries exhausted for ${repoPath}. Performing hard reset to ${upstream}.`);
				await this._exec(operationId, ['reset', '--hard', upstream], repoPath);
			}
		}

		const after = (await this._exec(operationId, ['rev-parse', 'HEAD'], repoPath)).trim();
		return before !== after;
	}

	private _isFastForwardPullFailure(err: unknown): err is cp.ExecFileException & { stderr?: string } {
		const error = err as (cp.ExecFileException & { stderr?: string; message?: string }) | undefined;
		if (error?.code !== 128) {
			return false;
		}

		const details = `${error.stderr ?? ''}\n${error.message ?? ''}`;
		return /not possible to fast-forward|non-fast-forward/i.test(details);
	}

	private async _getSafeHardResetTarget(operationId: string, repoPath: string): Promise<string | undefined> {
		const status = (await this._exec(operationId, ['status', '--porcelain'], repoPath)).trim();
		if (status.length > 0) {
			return undefined;
		}

		let upstream: string;
		try {
			upstream = (await this._exec(operationId, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoPath)).trim();
		} catch {
			return undefined;
		}

		const behind = await this._revListCount(operationId, repoPath, 'HEAD', '@{u}');
		const ahead = await this._revListCount(operationId, repoPath, '@{u}', 'HEAD');
		if (ahead === undefined || behind === undefined || ahead <= 0 || behind <= 0) {
			return undefined;
		}

		return upstream;
	}

	private async _revListCount(operationId: string, repoPath: string, fromRef: string, toRef: string): Promise<number | undefined> {
		const result = await this._exec(operationId, ['rev-list', '--count', `${fromRef}..${toRef}`], repoPath);
		const parsed = Number(result.trim());
		if (!Number.isFinite(parsed)) {
			this._logService.warn(`[LocalGitService] Failed to parse rev-list count for ${fromRef}..${toRef} in ${repoPath}: ${result}`);
			return undefined;
		}

		return parsed;
	}

	async checkout(operationId: string, repoPath: string, treeish: string, detached?: boolean): Promise<void> {
		const args = detached
			? ['checkout', '--detach', treeish]
			: ['checkout', treeish];
		await this._exec(operationId, args, repoPath);
	}

	async revParse(repoPath: string, ref: string): Promise<string> {
		return (await this._exec(generateUuid(), ['rev-parse', ref], repoPath)).trim();
	}

	async fetch(operationId: string, repoPath: string): Promise<void> {
		await this._exec(operationId, ['fetch'], repoPath);
	}

	async revListCount(repoPath: string, fromRef: string, toRef: string): Promise<number> {
		const result = await this._exec(generateUuid(), ['rev-list', '--count', `${fromRef}..${toRef}`], repoPath);
		return Number(result.trim()) || 0;
	}

	async cancel(operationId: string): Promise<void> {
		const proc = this._runningProcesses.get(operationId);
		if (proc) {
			this._runningProcesses.delete(operationId);
			proc.kill();
		}
	}
}
