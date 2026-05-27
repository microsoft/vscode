/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { chat, commands, env, Uri } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatQuotaService } from '../../../platform/chat/common/chatQuotaService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';

export class ChatQuotaContribution extends Disposable implements IExtensionContribution {
	public readonly id = 'chat.quota';

	constructor(
		@IChatQuotaService chatQuotaService: IChatQuotaService,
		@IAuthenticationService authService: IAuthenticationService,
	) {
		super();
		this._register(commands.registerCommand('chat.enableAdditionalUsage', () => {
			// Clear quota before opening the page to ensure that if the user enabled additional usage,
			// the next request they send won't try to downgrade them to the base model.
			chatQuotaService.clearQuota();
			env.openExternal(Uri.parse('https://aka.ms/github-copilot-manage-overage'));
		}));

		// Extension → Core: push updated quota state to core whenever it changes
		// (e.g. from response headers, quota snapshots, or copilot token refresh).
		// Skip the first event — it fires from the cached copilot token during
		// startup and may carry stale data that briefly overrides core's fresh
		// entitlements fetch, causing the notification to flicker.
		let initialized = false;
		this._register(chatQuotaService.onDidChange(() => {
			if (!initialized) {
				initialized = true;
				return;
			}

			const info = chatQuotaService.quotaInfo;
			if (!info) {
				return;
			}

			const isFree = !!authService.copilotToken?.isFreeUser;
			const snapshot = {
				percentRemaining: info.percentRemaining,
				unlimited: info.unlimited,
				hasQuota: info.hasQuota,
				entitlement: info.quota,
			};

			const quotas = {
				usageBasedBilling: !!authService.copilotToken?.isUsageBasedBilling,
				chat: isFree ? snapshot : undefined,
				premiumChat: isFree ? undefined : snapshot,
				additionalUsageEnabled: info.additionalUsageEnabled,
				additionalUsageCount: info.additionalUsageUsed,
			};

			chat.updateQuotas(quotas);
		}));
	}
}
