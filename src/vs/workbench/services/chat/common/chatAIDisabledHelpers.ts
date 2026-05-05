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
	if (settingInspect.userValue === true) {
		updates.push({ value: false, target: ConfigurationTarget.USER });
	}
	if (settingInspect.userLocalValue === true && settingInspect.userValue !== true) {
		updates.push({ value: false, target: ConfigurationTarget.USER_LOCAL });
	}
	if (settingInspect.userRemoteValue === true) {
		updates.push({ value: false, target: ConfigurationTarget.USER_REMOTE });
	}
	if (settingInspect.workspaceValue === true) {
		updates.push({ value: false, target: ConfigurationTarget.WORKSPACE });
	}
	return updates;
}

// `setEnablement` throws (in `throwErrorIfEnablementStateCannotBeChanged`) for these states.
// `DisabledByTrustRequirement` is excluded - `setEnablement` handles it via a trust request.
// `DisabledByExtensionDependency` is excluded - it is only conditionally non-changeable.
const NON_CHANGEABLE_ENABLEMENT_STATES: readonly EnablementState[] = [
	EnablementState.DisabledByEnvironment,
	EnablementState.DisabledByMalicious,
	EnablementState.DisabledByVirtualWorkspace,
	EnablementState.DisabledByExtensionKind,
	EnablementState.DisabledByAllowlist,
	EnablementState.DisabledByInvalidExtension,
];

/**
 * Returns true if the extension's current enablement state can be changed via `setEnablement`.
 * Callers driving enablement from external state must skip the call when this returns false to
 * avoid unhandled errors (https://github.com/microsoft/vscode/issues/312381).
 */
export function isExtensionEnablementChangeable(state: EnablementState): boolean {
	return !NON_CHANGEABLE_ENABLEMENT_STATES.includes(state);
}
