/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IAgentHostCompletionAction } from '../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js';
import { isAutoApprovePolicyRestricted } from '../common/agentHostConfigPolicy.js';
import { maybeConfirmElevatedPermissionLevel } from '../common/chatPermissionWarnings.js';
import { ChatConfiguration, ChatPermissionLevel, isChatPermissionLevel } from '../common/constants.js';

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
): Promise<boolean> {
	const config = action.applyConfig;
	if (!config || Object.keys(config).length === 0) {
		return true;
	}

	const elevatedLevel = getElevatedAutoApproveLevel(config[SessionConfigKey.AutoApprove]);
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
 * Whether a completion {@link IAgentHostCompletionAction} would set an elevated
 * `autoApprove` level (Allow all / Assisted) that enterprise policy currently
 * blocks. Completion consumers use this to omit such items entirely when global
 * auto-approval is policy-disabled — rather than offering an item that would
 * show an elevated-permission warning and then be silently clamped to Default.
 * The node producer cannot see the (client-side) policy, so this gating lives on
 * the client, mirroring how the permission pickers disable elevated levels.
 */
export function isPolicyBlockedCompletionAction(action: IAgentHostCompletionAction, configurationService: IConfigurationService): boolean {
	return getElevatedAutoApproveLevel(action.applyConfig?.[SessionConfigKey.AutoApprove]) !== undefined
		&& isAutoApprovePolicyRestricted(configurationService);
}
