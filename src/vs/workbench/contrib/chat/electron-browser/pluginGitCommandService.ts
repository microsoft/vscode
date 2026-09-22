/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IGitAuthentication, ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { parseGitHubCloneUrl } from '../browser/githubRepoFetcher.js';
import { getExistingGitHubAuthenticationToken } from '../browser/pluginGitHubAuthentication.js';
import { IPluginGitService } from '../common/plugins/pluginGitService.js';

const GITHUB_HTTPS_URL_PREFIXES = ['https://github.com/', 'https://www.github.com/'];

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
		await this._withCancel(token, async id => {
			const authentication = await this._getGitHubAuthentication(cloneUrl, token);
			await this._localGitService.clone(id, cloneUrl, targetDir.fsPath, ref, { authentication });
		});
	}

	async pull(repoDir: URI, remoteUrl?: string, token?: CancellationToken): Promise<boolean> {
		return this._withCancel(token, async id => this._localGitService.pull(id, repoDir.fsPath, {
			allowHardResetOnDivergence: true,
			authentication: await this._getGitHubAuthentication(remoteUrl, token),
		}));
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

	async fetch(repoDir: URI, remoteUrl?: string, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, async id => this._localGitService.fetch(id, repoDir.fsPath, { authentication: await this._getGitHubAuthentication(remoteUrl, token) }));
	}

	async fetchRepository(repoDir: URI, remoteUrl?: string, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, async id => this._localGitService.fetch(id, repoDir.fsPath, { authentication: await this._getGitHubAuthentication(remoteUrl, token) }));
	}

	async revListCount(repoDir: URI, fromRef: string, toRef: string): Promise<number> {
		return this._localGitService.revListCount(repoDir.fsPath, fromRef, toRef);
	}

	private async _getGitHubAuthentication(remoteUrl: string | undefined, cancellationToken: CancellationToken | undefined): Promise<IGitAuthentication | undefined> {
		if (!remoteUrl || !parseGitHubCloneUrl(remoteUrl)) {
			return undefined;
		}
		const accessToken = await getExistingGitHubAuthenticationToken(this._authenticationService, this._logService);
		if (cancellationToken?.isCancellationRequested) {
			throw new CancellationError();
		}
		return accessToken ? {
			urlPrefixes: GITHUB_HTTPS_URL_PREFIXES,
			authorizationHeader: `Authorization: Basic ${encodeBase64(VSBuffer.fromString(`x-access-token:${accessToken}`))}`,
		} : undefined;
	}
}
