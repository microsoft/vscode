/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';

export const AgentHostWorktreeCleanupCapabilityMetaKey = 'vscode.worktreeCleanup';
export const ManagedWorktreesCapabilityMetaKey = 'vscode.managedWorktrees';
export const ForceWorktreeCleanupCapabilityMetaKey = 'vscode.forceWorktreeCleanup';

/** Opts into confirmed, destructive `force` cleanup using the current branch, overriding usage references but retaining managed-path and current-branch validation. */
export function supportsForceWorktreeCleanup(result: InitializeResult | undefined): boolean {
	return result?._meta?.[ForceWorktreeCleanupCapabilityMetaKey] === true;
}

export function supportsAgentHostManagedWorktrees(result: InitializeResult | undefined): boolean {
	return result?._meta?.[ManagedWorktreesCapabilityMetaKey] === true;
}

export function supportsAgentHostWorktreeCleanup(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostWorktreeCleanupCapabilityMetaKey] === true;
}
