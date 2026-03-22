/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IPluginGitCommandService = createDecorator<IPluginGitCommandService>('pluginGitCommandService');

/**
 * Abstracts git operations used by the agent plugin system. When connected
 * to a remote (WSL, SSH, etc.), a native implementation routes file-scheme
 * URIs to a local git binary instead of the remote git extension.
 */
export interface IPluginGitCommandService {
	readonly _serviceBrand: undefined;

	cloneRepository(cloneUrl: string, targetDir: URI, ref?: string): Promise<void>;
	pull(repoDir: URI): Promise<boolean>;
	checkout(repoDir: URI, treeish: string, detached?: boolean): Promise<void>;
	revParse(repoDir: URI, ref: string): Promise<string>;
	fetch(repoDir: URI): Promise<void>;
	openRepository(repoDir: URI): Promise<void>;
	fetchRepository(repoDir: URI): Promise<void>;
	revListCount(repoDir: URI, fromRef: string, toRef: string): Promise<number>;
}
