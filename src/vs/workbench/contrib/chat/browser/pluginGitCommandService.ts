/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IPluginGitService } from '../common/plugins/pluginGitService.js';

function notSupported(): never {
	throw new Error(localize('pluginsNotSupported', 'Agent plugins are not available in this environment'));
}

/**
 * Stub implementation of {@link IPluginGitService} that throws on
 * every call. On desktop the native implementation is registered instead;
 * this exists only so the browser layer has a default registration.
 */
export class BrowserPluginGitCommandService implements IPluginGitService {
	declare readonly _serviceBrand: undefined;

	async cloneRepository(_cloneUrl: string, _targetDir: URI, _ref?: string, _token?: CancellationToken): Promise<void> { notSupported(); }
	async pull(_repoDir: URI, _token?: CancellationToken): Promise<boolean> { notSupported(); }
	async checkout(_repoDir: URI, _treeish: string, _detached?: boolean, _token?: CancellationToken): Promise<void> { notSupported(); }
	async revParse(_repoDir: URI, _ref: string): Promise<string> { notSupported(); }
	async fetch(_repoDir: URI, _token?: CancellationToken): Promise<void> { notSupported(); }
	async fetchRepository(_repoDir: URI, _token?: CancellationToken): Promise<void> { notSupported(); }
	async revListCount(_repoDir: URI, _fromRef: string, _toRef: string): Promise<number> { notSupported(); }
}
