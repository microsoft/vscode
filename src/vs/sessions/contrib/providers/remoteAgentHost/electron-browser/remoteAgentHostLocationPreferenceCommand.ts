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
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import {
	getEntryAddress,
	IRemoteAgentHostEntry,
	IRemoteAgentHostService,
	RemoteAgentHostEntryType,
	RemoteAgentHostsEnabledSettingId,
} from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { computeSSHConnectionKey } from '../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ICachedTunnel, ITunnelAgentHostService, TUNNEL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { ChangeRemoteAgentHostLocationPreferenceCommandId } from '../../../../../platform/agentHost/common/remoteAgentHostLocationPreferenceDialog.js';
import { CHAT_CATEGORY } from '../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { changeRemoteAgentHostLocationPreference } from '../browser/remoteHostOptions.js';

/** A remote host that can have a preferred agent run location, deduplicated by its stable preference key. */
export interface IRemoteAgentHostLocationTarget {
	/**
	 * Stable key persisted via {@link IRemoteAgentHostLocationPreferenceService}
	 * and read back by `SSHRemoteAgentHostService`/`TunnelAgentHostService`
	 * (e.g. `ssh:<alias>` from {@link computeSSHConnectionKey}, or
	 * `tunnel:<tunnelId>`). Distinct from {@link address}, which is the
	 * live, connection-specific endpoint.
	 */
	readonly preferenceKey: string;
	/**
	 * The live provider/connection address used to resolve the currently
	 * registered {@link IAgentHostSessionsProvider} (e.g. an SSH host's
	 * forwarded `localhost:<port>` endpoint, or the same value as
	 * {@link preferenceKey} for tunnels).
	 */
	readonly address: string;
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
		const preferenceKey = computeSSHConnectionKey({
			sshConfigHost: entry.connection.sshConfigHost,
			username: entry.connection.user,
			host: entry.connection.hostName,
			port: entry.connection.port,
		});
		if (!targets.has(preferenceKey)) {
			targets.set(preferenceKey, { preferenceKey, address: getEntryAddress(entry), label: entry.name });
		}
	}

	for (const tunnel of cachedTunnels) {
		const preferenceKey = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
		if (!targets.has(preferenceKey)) {
			targets.set(preferenceKey, { preferenceKey, address: preferenceKey, label: tunnel.name });
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

/**
 * Resolve the live {@link IAgentHostSessionsProvider} for `liveAddress`, i.e.
 * an agent host provider (per {@link isAgentHostProvider}) whose
 * `remoteAddress` exactly matches. Pure so provider resolution can be unit
 * tested without a {@link ISessionsProvidersService}. Returns `undefined`
 * when no such provider is currently registered - the exceptional race
 * where a configured/cached target has no corresponding live provider.
 *
 * `liveAddress` is the target's {@link IRemoteAgentHostLocationTarget.address},
 * NOT its {@link IRemoteAgentHostLocationTarget.preferenceKey} - providers
 * are looked up by their live connection address (e.g. an SSH host's
 * forwarded `localhost:<port>` endpoint), which is not the same string as
 * the stable preference key for SSH hosts.
 */
export function findAgentHostProviderForTarget(
	providers: readonly ISessionsProvider[],
	liveAddress: string,
): IAgentHostSessionsProvider | undefined {
	return providers
		.filter(isAgentHostProvider)
		.find(provider => provider.remoteAddress === liveAddress);
}

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
		const productService = accessor.get(IProductService);
		const progressService = accessor.get(IProgressService);
		const sessionsProvidersService = accessor.get(ISessionsProvidersService);

		const targets = collectRemoteAgentHostLocationTargets(remoteAgentHostService.configuredEntries, tunnelAgentHostService.getCachedTunnels());
		if (targets.length === 0) {
			notificationService.info(localize('remoteAgentHostLocation.noHosts', "No remote agent hosts are configured yet. Connect to one first, then change its preferred agent run location."));
			return;
		}

		const target = await pickRemoteAgentHostLocationTarget(quickInputService, targets);
		if (!target) {
			return;
		}

		const provider = findAgentHostProviderForTarget(sessionsProvidersService.getProviders(), target.address);
		await changeRemoteAgentHostLocationPreference({
			preferenceKey: target.preferenceKey,
			hostLabel: target.label,
			productName: productService.nameShort,
			provider,
			dialogService,
			locationPreferenceService,
			notificationService,
			remoteAgentHostService,
			progressService,
		});
	}
});
