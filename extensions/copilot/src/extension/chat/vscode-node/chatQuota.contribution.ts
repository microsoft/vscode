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
		this._register(chatQuotaService.onDidChange(() => {
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

			const { session, weekly } = chatQuotaService.rateLimitInfo;

			const quotas = {
				usageBasedBilling: !!authService.copilotToken?.isUsageBasedBilling,
				chat: isFree ? snapshot : undefined,
				premiumChat: isFree ? undefined : snapshot,
				additionalUsageEnabled: info.additionalUsageEnabled,
				additionalUsageCount: info.additionalUsageUsed,
				sessionRateLimit: session ? { percentRemaining: session.percentRemaining, unlimited: session.unlimited, resetDate: session.resetDate.toISOString() } : undefined,
				weeklyRateLimit: weekly ? { percentRemaining: weekly.percentRemaining, unlimited: weekly.unlimited, resetDate: weekly.resetDate.toISOString() } : undefined,
			};

			chat.updateQuotas(quotas);
		}));
	}
}
