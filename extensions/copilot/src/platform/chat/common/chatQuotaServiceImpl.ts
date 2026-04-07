/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IHeaders } from '../../networking/common/fetcherService';
import { CopilotUserQuotaInfo, IChatQuota, IChatQuotaService, QuotaSnapshots } from './chatQuotaService';

export class ChatQuotaService extends Disposable implements IChatQuotaService {
	declare readonly _serviceBrand: undefined;
	private _quotaInfo: IChatQuota | undefined;

	constructor(@IAuthenticationService private readonly _authService: IAuthenticationService) {
		super();
		this._register(this._authService.onDidAuthenticationChange(() => {
			this.processUserInfoQuotaSnapshot(this._authService.copilotToken?.quotaInfo);
		}));
	}

	get quotaExhausted(): boolean {
		if (!this._quotaInfo) {
			return false;
		}
		return this._quotaInfo.used >= this._quotaInfo.quota && !this._quotaInfo.overageEnabled && !this._quotaInfo.unlimited;
	}

	get overagesEnabled(): boolean {
		if (!this._quotaInfo) {
			return false;
		}
		return this._quotaInfo.overageEnabled;
	}

	clearQuota(): void {
		this._quotaInfo = undefined;
	}

	processQuotaHeaders(headers: IHeaders): void {
		const quotaHeader = this._authService.copilotToken?.isFreeUser ? headers.get('x-quota-snapshot-chat') : headers.get('x-quota-snapshot-premium_models') || headers.get('x-quota-snapshot-premium_interactions');
		if (!quotaHeader) {
			return;
		}

		try {
			// Parse URL encoded string into key-value pairs
			const params = new URLSearchParams(quotaHeader);

			// Extract values with fallbacks to ensure type safety
			const entitlement = parseInt(params.get('ent') || '0', 10);
			const overageUsed = parseFloat(params.get('ov') || '0.0');
			const overageEnabled = params.get('ovPerm') === 'true';
			const percentRemaining = parseFloat(params.get('rem') || '0.0');
			const resetDateString = params.get('rst');

			let resetDate: Date;
			if (resetDateString) {
				resetDate = new Date(resetDateString);
			} else {
				// Default to one month from now if not provided
				resetDate = new Date();
				resetDate.setMonth(resetDate.getMonth() + 1);
			}

			// Calculate used based on entitlement and remaining
			const used = Math.max(0, entitlement * (1 - percentRemaining / 100));

			// Update quota info
			this._quotaInfo = {
				quota: entitlement,
				unlimited: entitlement === -1,
				used,
				overageUsed,
				overageEnabled,
				resetDate
			};
		} catch (error) {
			console.error('Failed to parse quota header', error);
		}
	}

	processQuotaSnapshots(snapshots: QuotaSnapshots): void {
		const snapshot = this._authService.copilotToken?.isFreeUser
			? snapshots['chat']
			: snapshots['premium_models'] ?? snapshots['premium_interactions'];
		if (!snapshot) {
			return;
		}

		try {
			const entitlement = parseInt(snapshot.entitlement, 10);
			const resetDate = snapshot.reset_date ? new Date(snapshot.reset_date) : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();
			const used = Math.max(0, entitlement * (1 - snapshot.percent_remaining / 100));

			this._quotaInfo = {
				quota: entitlement,
				unlimited: entitlement === -1,
				used,
				overageUsed: snapshot.overage_count,
				overageEnabled: snapshot.overage_permitted,
				resetDate
			};
		} catch (error) {
			console.error('Failed to process quota snapshots', error);
		}
	}

	private processUserInfoQuotaSnapshot(quotaInfo: CopilotUserQuotaInfo | undefined) {
		if (!quotaInfo || !quotaInfo.quota_snapshots || !quotaInfo.quota_reset_date) {
			return;
		}
		this._quotaInfo = {
			unlimited: quotaInfo.quota_snapshots.premium_interactions.unlimited,
			overageEnabled: quotaInfo.quota_snapshots.premium_interactions.overage_permitted,
			overageUsed: quotaInfo.quota_snapshots.premium_interactions.overage_count,
			quota: quotaInfo.quota_snapshots.premium_interactions.entitlement,
			resetDate: new Date(quotaInfo.quota_reset_date),
			used: Math.max(0, quotaInfo.quota_snapshots.premium_interactions.entitlement * (1 - quotaInfo.quota_snapshots.premium_interactions.percent_remaining / 100)),
		};
	}
}