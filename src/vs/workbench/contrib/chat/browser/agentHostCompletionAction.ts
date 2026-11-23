/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ResolveSessionConfigResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { getAvailableSessionApprovalValues, getSessionApprovalProperty, readSessionApprovalLevel, writeSessionApprovalLevel } from '../../../../platform/agentHost/common/sessionConfigProperties.js';
import { IAgentHostCompletionAction } from '../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js';
import { isAutoApprovePolicyRestricted, usesHostApprovalPolicy } from '../common/agentHostConfigPolicy.js';
import { maybeConfirmElevatedPermissionLevel } from '../common/chatPermissionWarnings.js';
import { ChatConfiguration, ChatPermissionLevel, isChatPermissionLevel } from '../common/constants.js';
import { localize } from '../../../../nls.js';

function getCompletionConfig(action: IAgentHostCompletionAction, sessionConfig: ResolveSessionConfigResult | undefined): Readonly<Record<string, string>> | undefined {
	const config = action.applyConfig;
	const approval = getSessionApprovalProperty(sessionConfig?.schema);
	if (!config || approval?.key !== 'approvalMode' || config[SessionConfigKey.AutoApprove] === undefined) {
		return config;
	}
	const { autoApprove, ...rest } = config;
	const value = rest.approvalMode ?? writeSessionApprovalLevel(approval, autoApprove);
	if (value === undefined) {
		throw new Error(localize('chat.approvalModeUnavailable', "The selected permission mode is not available."));
	}
	return { ...rest, approvalMode: value };
}

/**
 * Applies a Copilot agent-host completion {@link IAgentHostCompletionAction}
 * (a permission/mode session-config toggle carried on a `/command` completion's
 * `_meta`). Shared by both the editor-window and Agents-window completion accept
 * paths — the per-window difference (how the config change is dispatched to the
 * active session) is supplied via {@link apply}.
 *
 * Before applying, an elevated `autoApprove` change (Allow all / Assisted) is
 * gated by the same {@link maybeConfirmElevatedPermissionLevel} confirmation the
 * permission pickers use, so the slash-command path is not a bypass. Mode-axis
 * changes are applied without confirmation.
 *
 * @returns `true` when the change was applied (or there was nothing to apply),
 * `false` when the user cancelled the elevated-permission confirmation.
 */
export async function applyAgentHostCompletionAction(
	action: IAgentHostCompletionAction,
	dialogService: IDialogService,
	storageService: IStorageService,
	apply: (config: Readonly<Record<string, string>>) => void | Promise<void>,
	sessionConfig?: ResolveSessionConfigResult,
): Promise<boolean> {
	const config = getCompletionConfig(action, sessionConfig);
	if (!config || Object.keys(config).length === 0) {
		return true;
	}

	const approval = getSessionApprovalProperty(sessionConfig?.schema);
	const value = approval && config[approval.key];
	if (approval && sessionConfig && value !== undefined && !getAvailableSessionApprovalValues(approval, sessionConfig.schema, sessionConfig.values).includes(value)) {
		throw new Error(localize('chat.approvalModeUnavailable', "The selected permission mode is not available."));
	}
	const elevatedLevel = getElevatedAutoApproveLevel(approval && value !== undefined ? readSessionApprovalLevel(approval, value) : config[SessionConfigKey.AutoApprove]);
	if (elevatedLevel !== undefined) {
		const confirmed = await maybeConfirmElevatedPermissionLevel(elevatedLevel, dialogService, storageService, {
			defaultSettingKey: ChatConfiguration.DefaultConfiguration,
		});
		if (!confirmed) {
			return false;
		}
	}

	await apply(config);
	return true;
}

/**
 * Maps an `autoApprove` config value to the {@link ChatPermissionLevel} whose
 * elevated-permission warning should be shown, or `undefined` when the value is
 * not elevated (Default) or not a recognized level.
 */
function getElevatedAutoApproveLevel(value: string | undefined): ChatPermissionLevel | undefined {
	if (value === undefined || value === ChatPermissionLevel.Default) {
		return undefined;
	}
	if (!isChatPermissionLevel(value)) {
		return undefined;
	}
	return value === ChatPermissionLevel.AutoApprove || value === ChatPermissionLevel.Assisted || value === ChatPermissionLevel.Autopilot ? value : undefined;
}

/**
 * Filters permission changes against the advertised approval binding and available modes.
 * Hosts without a policy report retain the legacy client-policy guard.
 */
export function isPolicyBlockedCompletionAction(action: IAgentHostCompletionAction, configurationService: IConfigurationService, config?: ResolveSessionConfigResult): boolean {
	const mode = action.applyConfig?.[SessionConfigKey.AutoApprove];
	const approval = getSessionApprovalProperty(config?.schema);
	const value = approval && (action.applyConfig?.[approval.key] ?? (mode !== undefined ? writeSessionApprovalLevel(approval, mode) : undefined));
	if (usesHostApprovalPolicy(config?.schema) && (mode !== undefined || value !== undefined)) {
		return !config || !approval || value === undefined || !getAvailableSessionApprovalValues(approval, config.schema, config.values).includes(value);
	}
	return getElevatedAutoApproveLevel(approval && value !== undefined ? readSessionApprovalLevel(approval, value) : mode) !== undefined
		&& isAutoApprovePolicyRestricted(configurationService);
}
