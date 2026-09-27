/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IGitAuthentication, ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { parseGitHubCloneUrl } from '../browser/githubRepoFetcher.js';
import { getExistingGitHubAuthenticationToken } from '../browser/pluginGitHubAuthentication.js';
import { IPluginGitService } from '../common/plugins/pluginGitService.js';

type GitProcessError = Error & { code?: number | string; stderr?: string };

function isCanonicalGitHubCloneUrl(cloneUrl: string): boolean {
	if (!parseGitHubCloneUrl(cloneUrl)) {
		return false;
	}
	const url = new URL(cloneUrl);
	return url.hostname.toLowerCase() === 'github.com' && !url.port;
}

/**
 * Desktop implementation that always runs git locally via the shared process.
 * The plugin cache is always on the local machine, so there is no need to
 * delegate to the git extension (which may be running on a remote host).
 *
 * Cancellation tokens are mapped to operation IDs so that cancel requests
 * survive the IPC boundary to the shared process (tokens don't serialise).
 */
export class NativePluginGitCommandService implements IPluginGitService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILocalGitService private readonly _localGitService: ILocalGitService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) { }

	private _withCancel<T>(token: CancellationToken | undefined, fn: (operationId: string) => Promise<T>): Promise<T> {
		const operationId = generateUuid();
		const listener = token?.onCancellationRequested(() => {
			this._localGitService.cancel(operationId).catch(() => { /* ignore */ });
		});
		return fn(operationId).finally(() => listener?.dispose());
	}

	async cloneRepository(cloneUrl: string, targetDir: URI, ref?: string, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, id => this._withGitHubAuthenticationFallback(
			'clone',
			cloneUrl,
			token,
			() => this._localGitService.clone(id, cloneUrl, targetDir.fsPath, ref, { logErrors: false }),
			authentication => this._localGitService.clone(id, cloneUrl, targetDir.fsPath, ref, { authentication }),
			async () => {
				if (await this._fileService.exists(targetDir)) {
					await this._fileService.del(targetDir, { recursive: true, useTrash: false });
				}
			},
		));
	}

	async pull(repoDir: URI, token?: CancellationToken): Promise<boolean> {
		return this._withCancel(token, async id => {
			const remoteUrl = await this._localGitService.getRemoteUrl(id, repoDir.fsPath, { logErrors: false }).catch(() => undefined);
			this._throwIfCancelled(token);
			return this._withGitHubAuthenticationFallback(
				'pull',
				remoteUrl,
				token,
				() => this._localGitService.pull(id, repoDir.fsPath, {
					allowHardResetOnDivergence: true,
					logErrors: false,
				}),
				authentication => this._localGitService.pull(id, repoDir.fsPath, {
					allowHardResetOnDivergence: true,
					authentication,
				}),
			);
		});
	}

	async checkout(repoDir: URI, treeish: string, detached?: boolean, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, id => this._localGitService.checkout(id, repoDir.fsPath, treeish, detached));
	}

	async checkoutCommit(repoDir: URI, commit: string, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, id => this._localGitService.checkoutCommit(id, repoDir.fsPath, commit));
	}

	async revParse(repoDir: URI, ref: string): Promise<string> {
		return this._localGitService.revParse(repoDir.fsPath, ref);
	}

	async fetch(repoDir: URI, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, async id => {
			const remoteUrl = await this._localGitService.getRemoteUrl(id, repoDir.fsPath, { logErrors: false }).catch(() => undefined);
			this._throwIfCancelled(token);
			await this._withGitHubAuthenticationFallback(
				'fetch',
				remoteUrl,
				token,
				() => this._localGitService.fetch(id, repoDir.fsPath, { logErrors: false }),
				authentication => this._localGitService.fetch(id, repoDir.fsPath, { authentication }),
			);
		});
	}

	async fetchRepository(repoDir: URI, token?: CancellationToken): Promise<void> {
		await this.fetch(repoDir, token);
	}

	async revListCount(repoDir: URI, fromRef: string, toRef: string): Promise<number> {
		return this._localGitService.revListCount(repoDir.fsPath, fromRef, toRef);
	}

	private async _withGitHubAuthenticationFallback<T>(
		operation: string,
		remoteUrl: string | undefined,
		token: CancellationToken | undefined,
		runNative: () => Promise<T>,
		runWithAuthentication: (authentication: IGitAuthentication) => Promise<T>,
		beforeRetry?: () => Promise<void>,
	): Promise<T> {
		const canUseEditorAuthentication = remoteUrl !== undefined && isCanonicalGitHubCloneUrl(remoteUrl);
		let authentication: IGitAuthentication | undefined;
		this._throwIfCancelled(token);

		try {
			return await runNative();
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			const isAuthenticationFailure = this._isAuthenticationFailure(error);
			if (isAuthenticationFailure && !authentication && canUseEditorAuthentication) {
				authentication = await this._getGitHubAuthentication(remoteUrl, token);
				this._throwIfCancelled(token);
			}
			if (!authentication || !isAuthenticationFailure) {
				this._logGitError(operation, error);
				throw error;
			}

			this._throwIfCancelled(token);
			this._logService.debug(`[NativePluginGitCommandService] Native Git authentication failed for '${operation}'. Retrying with VS Code authentication.`);
			await beforeRetry?.();
			this._throwIfCancelled(token);
			return runWithAuthentication(authentication);
		}
	}

	private async _getGitHubAuthentication(url: string, cancellationToken: CancellationToken | undefined): Promise<IGitAuthentication | undefined> {
		const accessToken = await getExistingGitHubAuthenticationToken(this._authenticationService, this._logService, ['repo']);
		if (cancellationToken?.isCancellationRequested) {
			throw new CancellationError();
		}
		return accessToken ? {
			url,
			authorizationHeader: `Authorization: Basic ${encodeBase64(VSBuffer.fromString(`x-access-token:${accessToken}`))}`,
		} : undefined;
	}

	private _isAuthenticationFailure(error: unknown): boolean {
		const candidate = error as GitProcessError | undefined;
		if (candidate?.code !== undefined && candidate.code !== 128 && candidate.code !== '128') {
			return false;
		}
		const details = `${candidate?.stderr ?? ''}\n${candidate?.message ?? ''}`;
		return /authentication failed|invalid username or token|(?:could not read|unable to get) (?:username|password)|terminal prompts disabled|requested URL returned error:\s*(?:401|403)\b/i.test(details);
	}

	private _logGitError(operation: string, error: unknown): void {
		const candidate = error as GitProcessError | undefined;
		this._logService.error(`[NativePluginGitCommandService] git ${operation} failed:`, candidate?.message ?? String(error), candidate?.stderr ?? '');
	}

	private _throwIfCancelled(token: CancellationToken | undefined): void {
		if (token?.isCancellationRequested) {
			throw new CancellationError();
		}
	}
}
