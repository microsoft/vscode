/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vBoolean, vEnum, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';

export const SessionWorktreeCleanupExtensionMethod = 'vscode/sessionWorktreeCleanup';
export const sessionWorktreeCleanupParamsValidator = vObj({ session: vString(), retry: vBoolean() });
export const sessionWorktreeCleanupStatusValidator = vObj({
	state: vEnum('unknown', 'pending', 'running', 'inUse', 'skipped', 'failed'),
	message: vOptionalProp(vString()),
});

export type IAgentHostWorktreeCleanupStatus = ValidatorType<typeof sessionWorktreeCleanupStatusValidator>;
