/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ILocalGitService = createDecorator<ILocalGitService>('localGitService');

/**
 * Low-level service for executing git commands on the local machine.
 * Used in the shared process where Node.js APIs are available.
 * All path arguments are native file-system paths.
 */
export interface ILocalGitService {
	readonly _serviceBrand: undefined;

	clone(operationId: string, cloneUrl: string, targetPath: string, ref?: string): Promise<void>;
	pull(operationId: string, repoPath: string): Promise<boolean>;
	checkout(operationId: string, repoPath: string, treeish: string, detached?: boolean): Promise<void>;
	revParse(repoPath: string, ref: string): Promise<string>;
	fetch(operationId: string, repoPath: string): Promise<void>;
	revListCount(repoPath: string, fromRef: string, toRef: string): Promise<number>;
	cancel(operationId: string): Promise<void>;
}
