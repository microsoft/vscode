/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IHeaders } from '../../networking/common/fetcherService';
import { CopilotUserQuotaInfo, IChatQuota, IChatQuotaService, IRateLimitWarning, QuotaSnapshots } from './chatQuotaService';

export class ChatQuotaService extends Disposable implements IChatQuotaService {
	declare readonly _serviceBrand: undefined;
	private static readonly _RATE_LIMIT_THRESHOLDS = [50, 75, 90, 95];
	private _quotaInfo: IChatQuota | undefined;
	private _rateLimitInfo: { session: IChatQuota | undefined; weekly: IChatQuota | undefined };
	private readonly _shownSessionThresholds = new Set<number>();
	private readonly _shownWeeklyThresholds = new Set<number>();
	private _pendingRateLimitWarning: IRateLimitWarning | undefined;

	constructor(@IAuthenticationService private readonly _authService: IAuthenticationService) {
		super();
		this._rateLimitInfo = { session: undefined, weekly: undefined };
		this._register(this._authService.onDidAuthenticationChange(() => {
			this.processUserInfoQuotaSnapshot(this._authService.copilotToken?.quotaInfo);
		}));
	}

	get quotaExhausted(): boolean {
		if (!this._quotaInfo) {
			return false;
		}
		return this._quotaInfo.percentRemaining <= 0 && !this._quotaInfo.overageEnabled && !this._quotaInfo.unlimited;
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

	private _processHeaderValue(header: string): IChatQuota | undefined {
		try {
			// Parse URL encoded string into key-value pairs
			const params = new URLSearchParams(header);

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

			return {
				quota: entitlement,
				unlimited: entitlement === -1,
				percentRemaining,
				overageUsed,
				overageEnabled,
				resetDate
			};
		} catch (error) {
			console.error('Failed to parse quota header', error);
			return undefined;
		}
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
		this._clearStaleThresholds(this._rateLimitInfo.session, this._shownSessionThresholds);
		this._clearStaleThresholds(this._rateLimitInfo.weekly, this._shownWeeklyThresholds);
		this._pendingRateLimitWarning = this._computeRateLimitWarning() ?? this._pendingRateLimitWarning;
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
				overageUsed: snapshot.overage_count,
				overageEnabled: snapshot.overage_permitted,
				resetDate
			};
		} catch (error) {
			console.error('Failed to process quota snapshots', error);
		}
	}

	consumeRateLimitWarning(): IRateLimitWarning | undefined {
		const warning = this._pendingRateLimitWarning;
		this._pendingRateLimitWarning = undefined;
		return warning;
	}

	private _computeRateLimitWarning(): IRateLimitWarning | undefined {
		// Session rate limit takes priority over weekly
		const sessionWarning = this._checkThreshold(this._rateLimitInfo.session, this._shownSessionThresholds, 'session');
		if (sessionWarning) {
			return sessionWarning;
		}
		return this._checkThreshold(this._rateLimitInfo.weekly, this._shownWeeklyThresholds, 'weekly');
	}

	private _clearStaleThresholds(info: IChatQuota | undefined, shownThresholds: Set<number>): void {
		if (!info) {
			shownThresholds.clear();
			return;
		}
		const percentUsed = 100 - info.percentRemaining;
		for (const threshold of shownThresholds) {
			if (percentUsed < threshold) {
				shownThresholds.delete(threshold);
			}
		}
	}

	private _checkThreshold(info: IChatQuota | undefined, shownThresholds: Set<number>, type: 'session' | 'weekly'): IRateLimitWarning | undefined {
		if (!info || info.unlimited) {
			return undefined;
		}
		const percentUsed = 100 - info.percentRemaining;
		// Walk thresholds highest-first so we report the most severe crossed threshold
		for (let i = ChatQuotaService._RATE_LIMIT_THRESHOLDS.length - 1; i >= 0; i--) {
			const threshold = ChatQuotaService._RATE_LIMIT_THRESHOLDS[i];
			if (percentUsed >= threshold && !shownThresholds.has(threshold)) {
				// Mark this and all lower thresholds as shown
				for (let j = 0; j <= i; j++) {
					shownThresholds.add(ChatQuotaService._RATE_LIMIT_THRESHOLDS[j]);
				}
				return { percentUsed: Math.round(percentUsed), type, resetDate: info.resetDate };
			}
		}
		return undefined;
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
			percentRemaining: quotaInfo.quota_snapshots.premium_interactions.percent_remaining,
		};
	}
}
