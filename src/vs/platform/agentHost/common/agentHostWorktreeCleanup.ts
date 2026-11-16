/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vArray, vBoolean, vEnum, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';

export const SessionWorktreeCleanupExtensionMethod = 'vscode/sessionWorktreeCleanup';
/** Negotiated preparation persists recovery without removal; prepare every shared owner before archiving any of them. */
export const PrepareSessionWorktreeCleanupExtensionMethod = 'vscode/prepareSessionWorktreeCleanup';
export const prepareSessionWorktreeCleanupParamsValidator = vObj({ session: vString() });
// Send force only after destructive confirmation and negotiation of vscode.forceWorktreeCleanup.
export const sessionWorktreeCleanupParamsValidator = vObj({ session: vString(), retry: vBoolean(), force: vOptionalProp(vBoolean()) });
export const sessionWorktreeCleanupStatusValidator = vObj({
	state: vEnum('unknown', 'pending', 'running', 'inUse', 'skipped', 'failed'),
	message: vOptionalProp(vString()),
});

export type IAgentHostWorktreeCleanupStatus = ValidatorType<typeof sessionWorktreeCleanupStatusValidator>;

export const ListManagedWorktreesExtensionMethod = 'vscode/listManagedWorktrees';
export const CleanupManagedWorktreeExtensionMethod = 'vscode/cleanupManagedWorktree';
export const listManagedWorktreesParamsValidator = vObj({ repositories: vArray(vString()) });
export const cleanupManagedWorktreeParamsValidator = vObj({ repository: vString(), worktree: vString(), branch: vString(), force: vOptionalProp(vBoolean()) });
export const managedWorktreeValidator = vObj({
	repository: vString(),
	worktree: vString(),
	branch: vString(),
	cleanupStatus: sessionWorktreeCleanupStatusValidator,
});
export const managedWorktreesValidator = vArray(managedWorktreeValidator);
export type IAgentHostManagedWorktree = ValidatorType<typeof managedWorktreeValidator>;
