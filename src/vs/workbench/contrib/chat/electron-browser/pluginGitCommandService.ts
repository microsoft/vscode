/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { IPluginGitService } from '../common/plugins/pluginGitService.js';

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
	) { }

	private _withCancel<T>(token: CancellationToken | undefined, fn: (operationId: string) => Promise<T>): Promise<T> {
		const operationId = generateUuid();
		const listener = token?.onCancellationRequested(() => {
			this._localGitService.cancel(operationId).catch(() => { /* ignore */ });
		});
		return fn(operationId).finally(() => listener?.dispose());
	}

	async cloneRepository(cloneUrl: string, targetDir: URI, ref?: string, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, id => this._localGitService.clone(id, cloneUrl, targetDir.fsPath, ref));
	}

	async pull(repoDir: URI, token?: CancellationToken): Promise<boolean> {
		return this._withCancel(token, id => this._localGitService.pull(id, repoDir.fsPath));
	}

	async checkout(repoDir: URI, treeish: string, detached?: boolean, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, id => this._localGitService.checkout(id, repoDir.fsPath, treeish, detached));
	}

	async revParse(repoDir: URI, ref: string): Promise<string> {
		return this._localGitService.revParse(repoDir.fsPath, ref);
	}

	async fetch(repoDir: URI, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, id => this._localGitService.fetch(id, repoDir.fsPath));
	}

	async fetchRepository(repoDir: URI, token?: CancellationToken): Promise<void> {
		await this._withCancel(token, id => this._localGitService.fetch(id, repoDir.fsPath));
	}

	async revListCount(repoDir: URI, fromRef: string, toRef: string): Promise<number> {
		return this._localGitService.revListCount(repoDir.fsPath, fromRef, toRef);
	}
}
