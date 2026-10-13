/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHHostKeyTrustService, type ISSHTrustedHost } from '../../../../../platform/agentHost/common/sshHostKeyTrust.js';
import { CHAT_CATEGORY } from '../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';

export const ForgetSSHHostKeyCommandId = 'workbench.action.chat.forgetSSHHostKey';

interface ITrustedHostPickItem extends IQuickPickItem {
	readonly trustedHost: ISSHTrustedHost;
}

/**
 * Build the quick pick entries for the stored hosts. The description carries
 * the key types and fingerprints so the user can confirm they are forgetting
 * the host they meant to — the whole point of this command is recovering from
 * a key change, and doing that blindly would defeat the verification it exists
 * to support.
 */
export function toTrustedHostPickItems(hosts: readonly ISSHTrustedHost[]): ITrustedHostPickItem[] {
	return hosts
		.slice()
		.sort((a, b) => a.host.localeCompare(b.host) || a.port - b.port)
		.map(trustedHost => {
			const alias = trustedHost.keys.find(key => key.alias)?.alias;
			const label = trustedHost.port === 22 ? trustedHost.host : `${trustedHost.host}:${trustedHost.port}`;
			return {
				label: alias && alias !== trustedHost.host ? `${alias} (${label})` : label,
				description: trustedHost.keys.map(key => `${key.keyType} ${key.fingerprint}`).join(', '),
				trustedHost,
			};
		});
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ForgetSSHHostKeyCommandId,
			title: localize2('forgetSSHHostKey', "Forget SSH Host Key"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.equals(`config.${RemoteAgentHostsEnabledSettingId}`, true),
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const hostKeyTrustService = accessor.get(ISSHHostKeyTrustService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);

		const hosts = hostKeyTrustService.listTrustedHosts();
		if (hosts.length === 0) {
			notificationService.info(localize('forgetSSHHostKey.none', "No SSH host keys have been saved yet."));
			return;
		}

		const picked = await quickInputService.pick<ITrustedHostPickItem>(
			toTrustedHostPickItems(hosts),
			{
				placeHolder: localize('forgetSSHHostKey.placeholder', "Select the hosts whose saved SSH host keys should be forgotten"),
				canPickMany: true,
			},
		);
		if (!picked?.length) {
			return;
		}

		for (const item of picked) {
			hostKeyTrustService.forgetHost(item.trustedHost.host, item.trustedHost.port);
		}

		notificationService.info(picked.length === 1
			? localize('forgetSSHHostKey.forgotOne', "Forgot the saved SSH host key for '{0}'. You'll be asked to verify it the next time you connect.", picked[0].trustedHost.host)
			: localize('forgetSSHHostKey.forgotMany', "Forgot saved SSH host keys for {0} hosts. You'll be asked to verify them the next time you connect.", picked.length));
	}
});
