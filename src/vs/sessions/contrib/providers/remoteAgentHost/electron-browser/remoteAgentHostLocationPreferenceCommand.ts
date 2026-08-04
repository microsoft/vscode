/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import {
	getEntryAddress,
	IRemoteAgentHostEntry,
	IRemoteAgentHostService,
	RemoteAgentHostEntryType,
	RemoteAgentHostsEnabledSettingId,
} from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICachedTunnel, ITunnelAgentHostService, TUNNEL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { promptRemoteAgentHostLocationPreference } from '../../../../../platform/agentHost/common/remoteAgentHostLocationPreferenceDialog.js';
import { CHAT_CATEGORY } from '../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';

/** A remote host that can have a preferred agent run location, deduplicated by its stable preference key. */
export interface IRemoteAgentHostLocationTarget {
	readonly key: string;
	readonly label: string;
}

/**
 * Enumerate the known SSH and tunnel remote hosts as preference targets,
 * deduplicated by stable preference key. WebSocket/WSL/cloud-sandbox entries
 * are not yet supported preference targets.
 */
export function collectRemoteAgentHostLocationTargets(
	sshEntries: readonly IRemoteAgentHostEntry[],
	cachedTunnels: readonly ICachedTunnel[],
): IRemoteAgentHostLocationTarget[] {
	const targets = new Map<string, IRemoteAgentHostLocationTarget>();

	for (const entry of sshEntries) {
		if (entry.connection.type !== RemoteAgentHostEntryType.SSH) {
			continue;
		}
		const key = getEntryAddress(entry);
		if (!targets.has(key)) {
			targets.set(key, { key, label: entry.name });
		}
	}

	for (const tunnel of cachedTunnels) {
		const key = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
		if (!targets.has(key)) {
			targets.set(key, { key, label: tunnel.name });
		}
	}

	return [...targets.values()];
}

interface IRemoteAgentHostLocationTargetPickItem extends IQuickPickItem {
	readonly target: IRemoteAgentHostLocationTarget;
}

/**
 * Resolve which host to change the preference for: the sole target if there
 * is exactly one, a quick-pick choice if there are several, or `undefined`
 * if there are none or the user cancels the pick.
 */
export async function pickRemoteAgentHostLocationTarget(
	quickInputService: IQuickInputService,
	targets: readonly IRemoteAgentHostLocationTarget[],
): Promise<IRemoteAgentHostLocationTarget | undefined> {
	if (targets.length <= 1) {
		return targets[0];
	}
	const picked = await quickInputService.pick<IRemoteAgentHostLocationTargetPickItem>(
		targets.map(target => ({ label: target.label, target })),
		{ placeHolder: localize('remoteAgentHostLocation.pickHost', "Select a remote host to change its preferred agent run location") },
	);
	return picked?.target;
}

export const ChangeRemoteAgentHostLocationPreferenceCommandId = 'workbench.action.sessions.changeRemoteAgentHostLocationPreference';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ChangeRemoteAgentHostLocationPreferenceCommandId,
			title: localize2('changeRemoteAgentHostLocationPreference', "Change Preferred Remote Agent Location"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
		const tunnelAgentHostService = accessor.get(ITunnelAgentHostService);
		const locationPreferenceService = accessor.get(IRemoteAgentHostLocationPreferenceService);
		const quickInputService = accessor.get(IQuickInputService);
		const dialogService = accessor.get(IDialogService);
		const notificationService = accessor.get(INotificationService);

		const targets = collectRemoteAgentHostLocationTargets(remoteAgentHostService.configuredEntries, tunnelAgentHostService.getCachedTunnels());
		if (targets.length === 0) {
			notificationService.info(localize('remoteAgentHostLocation.noHosts', "No remote agent hosts are configured yet. Connect to one first, then change its preferred agent run location."));
			return;
		}

		const target = await pickRemoteAgentHostLocationTarget(quickInputService, targets);
		if (!target) {
			return;
		}

		const currentPreference = locationPreferenceService.getPreference(target.key);
		const preference = await promptRemoteAgentHostLocationPreference(dialogService, target.label, currentPreference);
		if (!preference) {
			return;
		}

		locationPreferenceService.setPreference(target.key, preference);
		notificationService.info(localize('remoteAgentHostLocation.saved', "Preference saved for {0}. This takes effect the next time it connects.", target.label));
	}
});
