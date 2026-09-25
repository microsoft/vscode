/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { CancellationError } from '../../../base/common/errors.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IGitNetworkOptions, IGitPullOptions, ILocalGitService } from '../common/localGitService.js';

export class LocalGitService implements ILocalGitService {
	declare readonly _serviceBrand: undefined;

	private _runningProcesses = new Map<string, cp.ChildProcess>();
	private _supportsAuthenticationEnvironment = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
		private readonly _execFile: typeof cp.execFile = cp.execFile,
	) { }

	private async _exec(operationId: string, args: string[], cwd?: string, options?: IGitNetworkOptions): Promise<string> {
		if (options?.authentication && !this._supportsAuthenticationEnvironment) {
			const version = await this._exec(operationId, ['--version']);
			const match = /^git version (?<major>\d+)\.(?<minor>\d+)/.exec(version);
			const major = Number(match?.groups?.major);
			const minor = Number(match?.groups?.minor);
			if (!(major > 2 || (major === 2 && minor >= 31))) {
				throw new Error(localize('gitAuthenticationRequiresNewerGit', "JustRide GitHub authentication requires Git 2.31 or later. Update Git and retry."));
			}
			this._supportsAuthenticationEnvironment = true;
		}
		return new Promise((resolve, reject) => {
			this._logService.trace(`[LocalGitService] git ${args.join(' ')}${cwd ? ` (cwd: ${cwd})` : ''}`);
			const proc = this._execFile('git', args, { cwd, encoding: 'utf8', env: this._getEnvironment(options) }, (err, stdout, stderr) => {
				if (!this._runningProcesses.delete(operationId)) {
					reject(new CancellationError());
					return;
				}
				if (err) {
					const gitError = err as cp.ExecFileException & { stderr?: string };
					gitError.stderr ??= stderr;
					const header = options?.authentication?.authorizationHeader;
					if (header) {
						for (const secret of [header, header.replace(/^Authorization:\s*\S+\s+/i, '')]) {
							if (secret) {
								gitError.message = gitError.message.replaceAll(secret, '[redacted]');
								gitError.stderr = gitError.stderr.replaceAll(secret, '[redacted]');
								gitError.stack = gitError.stack?.replaceAll(secret, '[redacted]');
							}
						}
					}
					if (options?.logErrors !== false) {
						this._logGitError(args, err);
					}
					reject(err);
					return;
				}
				resolve(stdout);
			});

			this._runningProcesses.set(operationId, proc);
		});
	}

	private _logGitError(args: string[], error: cp.ExecFileException & { stderr?: string }): void {
		this._logService.error(`[LocalGitService] git ${args[0]} failed:`, error.message, error.stderr ?? '');
	}

	private _getEnvironment(options: IGitNetworkOptions | undefined): NodeJS.ProcessEnv | undefined {
		const authentication = options?.authentication;
		if (!authentication) {
			return undefined;
		}

		const environment = { ...process.env };
		const environmentNames = new Map(Object.keys(environment).map(key => [key.toUpperCase(), key]));
		const configuredCountName = environmentNames.get('GIT_CONFIG_COUNT');
		const configuredCount = Number.parseInt(configuredCountName ? environment[configuredCountName] ?? '' : '', 10);
		const inheritedConfig: { key: string; value: string }[] = [];
		if (Number.isInteger(configuredCount) && configuredCount >= 0) {
			for (let index = 0; index < configuredCount; index++) {
				const keyName = environmentNames.get(`GIT_CONFIG_KEY_${index}`);
				const valueName = environmentNames.get(`GIT_CONFIG_VALUE_${index}`);
				const key = keyName ? environment[keyName] : undefined;
				const value = valueName ? environment[valueName] : undefined;
				if (key !== undefined && value !== undefined && !/^http\..+\.extraheader$/i.test(key)) {
					inheritedConfig.push({ key, value });
				}
			}
		}
		for (const key of Object.keys(environment)) {
			const normalizedKey = key.toUpperCase();
			if (
				normalizedKey.startsWith('GIT_TRACE')
				|| normalizedKey === 'GIT_CURL_VERBOSE'
				|| normalizedKey === 'GIT_CONFIG_PARAMETERS'
				|| normalizedKey === 'GIT_CONFIG_COUNT'
				|| /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(normalizedKey)
			) {
				delete environment[key];
			}
		}
		// Explicit values also override Trace2 targets configured outside the environment.
		environment.GIT_TRACE2 = '0';
		environment.GIT_TRACE2_EVENT = '0';
		environment.GIT_TRACE2_PERF = '0';
		environment.GIT_TRACE_REDACT = '1';
		for (const [index, entry] of inheritedConfig.entries()) {
			environment[`GIT_CONFIG_KEY_${index}`] = entry.key;
			environment[`GIT_CONFIG_VALUE_${index}`] = entry.value;
		}
		const index = inheritedConfig.length;
		environment.GIT_CONFIG_COUNT = String(index + 2);
		environment[`GIT_CONFIG_KEY_${index}`] = `http.${authentication.url}.extraHeader`;
		environment[`GIT_CONFIG_VALUE_${index}`] = '';
		environment[`GIT_CONFIG_KEY_${index + 1}`] = `http.${authentication.url}.extraHeader`;
		environment[`GIT_CONFIG_VALUE_${index + 1}`] = authentication.authorizationHeader;
		return environment;
	}

	async clone(operationId: string, cloneUrl: string, targetPath: string, ref?: string, options?: IGitNetworkOptions): Promise<void> {
		const args = ['clone'];
		if (ref) {
			args.push('--branch', ref);
		}
		args.push('--', cloneUrl, targetPath);
		await this._exec(operationId, args, undefined, options);
	}

	async pull(operationId: string, repoPath: string, options?: IGitPullOptions): Promise<boolean> {
		const before = (await this._exec(operationId, ['rev-parse', 'HEAD'], repoPath)).trim();

		try {
			await this._exec(operationId, ['pull', '--ff-only'], repoPath, options);
		} catch (err) {
			if (!this._isFastForwardPullFailure(err)) {
				throw err;
			}

			const error = err as { message?: string };
			this._logService.warn(`[LocalGitService] Fast-forward pull failed for ${repoPath}: ${error?.message ?? String(err)}. Retrying after fetch.`);
			await this._exec(operationId, ['fetch', '--prune'], repoPath, options);

			try {
				await this._exec(operationId, ['pull', '--ff-only'], repoPath, options);
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

	async checkoutCommit(operationId: string, repoPath: string, commit: string): Promise<void> {
		const expectedCommit = commit.trim().toLowerCase();
		if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
			throw new Error(localize('pluginsInvalidPinnedCommit', "Pinned plugin commit '{0}' is not a full SHA-1 hash.", commit));
		}

		const resolvedCommit = (await this._exec(operationId, ['rev-parse', `${expectedCommit}^{commit}`], repoPath)).trim().toLowerCase();
		if (resolvedCommit !== expectedCommit) {
			throw new Error(localize('pluginsPinnedCommitResolutionMismatch', "Pinned plugin commit '{0}' resolved to a different commit '{1}'.", commit, resolvedCommit));
		}

		await this._exec(operationId, ['checkout', '--detach', resolvedCommit], repoPath);
		const checkedOutCommit = (await this._exec(operationId, ['rev-parse', 'HEAD'], repoPath)).trim().toLowerCase();
		if (checkedOutCommit !== expectedCommit) {
			throw new Error(localize('pluginsPinnedCommitCheckoutMismatch', "Pinned plugin commit '{0}' was not checked out. The repository is at commit '{1}'.", commit, checkedOutCommit));
		}
	}

	async revParse(repoPath: string, ref: string): Promise<string> {
		return (await this._exec(generateUuid(), ['rev-parse', ref], repoPath)).trim();
	}

	async getRemoteUrl(operationId: string, repoPath: string, options?: IGitNetworkOptions): Promise<string> {
		return (await this._exec(operationId, ['remote', 'get-url', 'origin'], repoPath, options)).trim();
	}

	async fetch(operationId: string, repoPath: string, options?: IGitNetworkOptions): Promise<void> {
		await this._exec(operationId, ['fetch'], repoPath, options);
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
