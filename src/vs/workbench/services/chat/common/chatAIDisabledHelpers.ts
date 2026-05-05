/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationTarget, IConfigurationValue } from '../../../../platform/configuration/common/configuration.js';
import { EnablementState } from '../../extensionManagement/common/extensionManagement.js';

/** A single targeted update to the `chat.disableAIFeatures` setting. */
export interface IAIDisabledSettingUpdate {
	readonly value: boolean;
	readonly target: ConfigurationTarget;
}

/**
 * Decide how to sync `chat.disableAIFeatures` when the chat extension's enablement state
 * changes. Only writes at workspace scope, and only when the workspace setting explicitly says
 * disabled. User/profile/application scopes are never touched from extension events
 * (https://github.com/microsoft/vscode/issues/309947).
 */
export function computeAIDisabledSyncOnExtensionEnabled(
	extensionEnablementState: EnablementState,
	settingInspect: Pick<IConfigurationValue<boolean>, 'value' | 'workspaceValue'>
): IAIDisabledSettingUpdate | undefined {
	if (extensionEnablementState !== EnablementState.EnabledWorkspace) {
		return undefined;
	}
	if (settingInspect.workspaceValue !== true) {
		return undefined;
	}
	return { value: false, target: ConfigurationTarget.WORKSPACE };
}

/**
 * When opting in to AI features at workspace scope (e.g. "Enable AI Features (Workspace)"),
 * write `false` at workspace scope to make the merged value `false` - regardless of which
 * higher scope currently says disabled. Without this, the per-workspace opt-in does not
 * survive a reload and the extension is disabled again on the next open
 * (https://github.com/microsoft/vscode/issues/311898).
 */
export function computeAIDisabledOverrideForWorkspaceEnable(
	settingInspect: Pick<IConfigurationValue<boolean>, 'value' | 'workspaceValue'>
): IAIDisabledSettingUpdate | undefined {
	if (settingInspect.value !== true) {
		return undefined;
	}
	if (settingInspect.workspaceValue === false) {
		return undefined;
	}
	return { value: false, target: ConfigurationTarget.WORKSPACE };
}

/**
 * When opting in to AI features globally (e.g. "Enable AI Features" or the chat setup
 * trigger), clear every scope that currently has an explicit disable override. We pick targets
 * explicitly per scope to avoid `updateValue`'s implicit scope-walking which causes
 * https://github.com/microsoft/vscode/issues/309947.
 *
 * In remote scenarios the user scope splits into local/remote. We emit those explicitly so
 * that:
 *   - we never duplicate-write to the same underlying settings file (a `USER` target may be
 *     routed to `USER_REMOTE` by `WorkbenchConfigurationService` when a remote value exists);
 *   - we never miss a local override when both local and remote are set.
 */
export function computeAIDisabledClearForGlobalOptIn(
	settingInspect: Pick<IConfigurationValue<boolean>, 'value' | 'applicationValue' | 'userValue' | 'userLocalValue' | 'userRemoteValue' | 'workspaceValue'>
): IAIDisabledSettingUpdate[] {
	if (settingInspect.value !== true) {
		return [];
	}
	const updates: IAIDisabledSettingUpdate[] = [];
	if (settingInspect.applicationValue === true) {
		updates.push({ value: false, target: ConfigurationTarget.APPLICATION });
	}
	const userLocalSet = settingInspect.userLocalValue === true;
	const userRemoteSet = settingInspect.userRemoteValue === true;
	if (userLocalSet) {
		updates.push({ value: false, target: ConfigurationTarget.USER_LOCAL });
	}
	if (userRemoteSet) {
		updates.push({ value: false, target: ConfigurationTarget.USER_REMOTE });
	}
	if (settingInspect.userValue === true && !userLocalSet && !userRemoteSet) {
		// Inspect did not surface a split local/remote value; fall back to the generic target.
		updates.push({ value: false, target: ConfigurationTarget.USER });
	}
	if (settingInspect.workspaceValue === true) {
		updates.push({ value: false, target: ConfigurationTarget.WORKSPACE });
	}
	return updates;
}
