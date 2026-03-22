/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { ILocalGitService } from '../common/localGitService.js';
import { ILogService } from '../../log/common/log.js';

export class LocalGitService implements ILocalGitService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) { }

	private _exec(args: string[], cwd?: string): Promise<string> {
		return new Promise((resolve, reject) => {
			this._logService.trace(`[LocalGitService] git ${args.join(' ')}${cwd ? ` (cwd: ${cwd})` : ''}`);
			cp.execFile('git', args, { cwd, encoding: 'utf8', timeout: 120_000 }, (err, stdout, stderr) => {
				if (err) {
					this._logService.error(`[LocalGitService] git ${args[0]} failed:`, err.message, stderr);
					reject(err);
					return;
				}
				resolve(stdout);
			});
		});
	}

	async clone(cloneUrl: string, targetPath: string, ref?: string): Promise<void> {
		const args = ['clone', cloneUrl, targetPath];
		if (ref) {
			args.push('--branch', ref);
		}
		await this._exec(args);
	}

	async pull(repoPath: string): Promise<boolean> {
		const before = (await this._exec(['rev-parse', 'HEAD'], repoPath)).trim();
		await this._exec(['pull'], repoPath);
		const after = (await this._exec(['rev-parse', 'HEAD'], repoPath)).trim();
		return before !== after;
	}

	async checkout(repoPath: string, treeish: string, detached?: boolean): Promise<void> {
		const args = detached
			? ['checkout', '--detach', treeish]
			: ['checkout', treeish];
		await this._exec(args, repoPath);
	}

	async revParse(repoPath: string, ref: string): Promise<string> {
		return (await this._exec(['rev-parse', ref], repoPath)).trim();
	}

	async fetch(repoPath: string): Promise<void> {
		await this._exec(['fetch'], repoPath);
	}

	async revListCount(repoPath: string, fromRef: string, toRef: string): Promise<number> {
		const result = await this._exec(['rev-list', '--count', `${fromRef}..${toRef}`], repoPath);
		return Number(result.trim()) || 0;
	}
}
