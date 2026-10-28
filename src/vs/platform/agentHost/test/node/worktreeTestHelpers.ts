/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NullAgentHostWorktreeIsolation, type IAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';

/**
 * Worktree isolation that never reports a pending working directory and leaves
 * restored turns untouched. Lives in the node layer because
 * {@link IAgentHostWorktreeIsolation} is a node-layer service.
 */
export function createNoopWorktreeIsolation(): IAgentHostWorktreeIsolation {
	return new NullAgentHostWorktreeIsolation();
}
