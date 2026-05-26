/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IChatEntitlementService } from '../../services/chat/common/chatEntitlementService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostChatQuotaShape, IQuotaSnapshotsDto, MainContext, MainThreadChatQuotaShape } from '../common/extHost.protocol.js';

function toQuotaSnapshotsDto(service: IChatEntitlementService): IQuotaSnapshotsDto {
	const quotas = service.quotas;
	return {
		resetDate: quotas.resetDate,
		resetDateHasTime: quotas.resetDateHasTime,
		usageBasedBilling: quotas.usageBasedBilling,
		canUpgradePlan: quotas.canUpgradePlan,
		chat: quotas.chat,
		completions: quotas.completions,
		premiumChat: quotas.premiumChat,
		additionalUsageEnabled: quotas.additionalUsageEnabled,
		additionalUsageCount: quotas.additionalUsageCount,
	};
}

@extHostNamedCustomer(MainContext.MainThreadChatQuota)
export class MainThreadChatQuota extends Disposable implements MainThreadChatQuotaShape {

	private readonly _proxy: ExtHostChatQuotaShape;

	constructor(
		extHostContext: IExtHostContext,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatQuota);

		this._register(this._chatEntitlementService.onDidChangeQuotaRemaining(() => {
			this._proxy.$onDidChangeQuotas(toQuotaSnapshotsDto(this._chatEntitlementService));
		}));
	}

	$updateQuotas(quotas: IQuotaSnapshotsDto): void {
		this._chatEntitlementService.acceptQuotas(quotas, { silent: true });
	}
}
