/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ILocalGitService = createDecorator<ILocalGitService>('localGitService');

export interface IGitAuthentication {
	readonly url: string;
	readonly authorizationHeader: string;
}

export interface IGitNetworkOptions {
	readonly authentication?: IGitAuthentication;
	readonly logErrors?: boolean;
}

export interface IGitPullOptions extends IGitNetworkOptions {
	readonly allowHardResetOnDivergence?: boolean;
}

/**
 * Low-level service for executing git commands on the local machine.
 * Used in the shared process where Node.js APIs are available.
 * All path arguments are native file-system paths.
 */
export interface ILocalGitService {
	readonly _serviceBrand: undefined;

	clone(operationId: string, cloneUrl: string, targetPath: string, ref?: string, options?: IGitNetworkOptions): Promise<void>;
	pull(operationId: string, repoPath: string, options?: IGitPullOptions): Promise<boolean>;
	checkout(operationId: string, repoPath: string, treeish: string, detached?: boolean): Promise<void>;
	checkoutCommit(operationId: string, repoPath: string, commit: string): Promise<void>;
	revParse(repoPath: string, ref: string): Promise<string>;
	getRemoteUrl(operationId: string, repoPath: string): Promise<string>;
	fetch(operationId: string, repoPath: string, options?: IGitNetworkOptions): Promise<void>;
	revListCount(repoPath: string, fromRef: string, toRef: string): Promise<number>;
	cancel(operationId: string): Promise<void>;
}
