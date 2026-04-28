/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IHeaders } from '../../networking/common/fetcherService';
import { CopilotUserQuotaInfo, IChatQuota, IChatQuotaService, QuotaSnapshots } from './chatQuotaService';

export class ChatQuotaService extends Disposable implements IChatQuotaService {
	declare readonly _serviceBrand: undefined;

	private _quotaInfo: IChatQuota | undefined;
	private _rateLimitInfo: { session: IChatQuota | undefined; weekly: IChatQuota | undefined };

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(@IAuthenticationService private readonly _authService: IAuthenticationService) {
		super();
		this._rateLimitInfo = { session: undefined, weekly: undefined };
		this._register(this._authService.onDidAuthenticationChange(() => {
			this._processUserInfoQuotaSnapshot(this._authService.copilotToken?.quotaInfo);
		}));
	}

	get quotaInfo(): IChatQuota | undefined {
		return this._quotaInfo;
	}

	get rateLimitInfo(): { readonly session: IChatQuota | undefined; readonly weekly: IChatQuota | undefined } {
		return this._rateLimitInfo;
	}

	get quotaExhausted(): boolean {
		if (!this._quotaInfo) {
			return false;
		}
		return this._quotaInfo.percentRemaining <= 0 && !this._quotaInfo.additionalUsageEnabled && !this._quotaInfo.unlimited;
	}

	get additionalUsageEnabled(): boolean {
		if (!this._quotaInfo) {
			return false;
		}
		return this._quotaInfo.additionalUsageEnabled;
	}

	clearQuota(): void {
		this._quotaInfo = undefined;
	}

	processQuotaHeaders(headers: IHeaders): void {
		const quotaHeader = this._authService.copilotToken?.isFreeUser ? headers.get('x-quota-snapshot-chat') : headers.get('x-quota-snapshot-premium_models') || headers.get('x-quota-snapshot-premium_interactions');
		if (!quotaHeader) {
			return;
		}
		const quotaInfo = this._processHeaderValue(quotaHeader);
		if (!quotaInfo) {
			return;
		}
		this._quotaInfo = quotaInfo;
		const sessionRateLimitHeader = headers.get('x-usage-ratelimit-session');
		const weeklyRateLimitHeader = headers.get('x-usage-ratelimit-weekly');
		this._rateLimitInfo.session = sessionRateLimitHeader ? this._processHeaderValue(sessionRateLimitHeader) : undefined;
		this._rateLimitInfo.weekly = weeklyRateLimitHeader ? this._processHeaderValue(weeklyRateLimitHeader) : undefined;
		this._onDidChange.fire();
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

			this._quotaInfo = {
				quota: entitlement,
				unlimited: entitlement === -1,
				percentRemaining: snapshot.percent_remaining,
				additionalUsageUsed: snapshot.overage_count,
				additionalUsageEnabled: snapshot.overage_permitted,
				resetDate
			};
			this._onDidChange.fire();
		} catch (error) {
			console.error('Failed to process quota snapshots', error);
		}
	}

	private _processHeaderValue(header: string): IChatQuota | undefined {
		try {
			// Parse URL encoded string into key-value pairs
			const params = new URLSearchParams(header);

			// Extract values with fallbacks to ensure type safety
			const entitlement = parseInt(params.get('ent') || '0', 10);
			const additionalUsageUsed = parseFloat(params.get('ov') || '0.0');
			const additionalUsageEnabled = params.get('ovPerm') === 'true';
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

			return {
				quota: entitlement,
				unlimited: entitlement === -1,
				percentRemaining,
				additionalUsageUsed,
				additionalUsageEnabled,
				resetDate
			};
		} catch (error) {
			console.error('Failed to parse quota header', error);
			return undefined;
		}
	}

	private _processUserInfoQuotaSnapshot(quotaInfo: CopilotUserQuotaInfo | undefined) {
		if (!quotaInfo || !quotaInfo.quota_snapshots || !quotaInfo.quota_reset_date) {
			return;
		}
		this._quotaInfo = {
			unlimited: quotaInfo.quota_snapshots.premium_interactions.unlimited,
			additionalUsageEnabled: quotaInfo.quota_snapshots.premium_interactions.overage_permitted,
			additionalUsageUsed: quotaInfo.quota_snapshots.premium_interactions.overage_count,
			quota: quotaInfo.quota_snapshots.premium_interactions.entitlement,
			resetDate: new Date(quotaInfo.quota_reset_date),
			percentRemaining: quotaInfo.quota_snapshots.premium_interactions.percent_remaining,
		};
		this._onDidChange.fire();
	}
}
