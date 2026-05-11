/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ILogService } from '../../log/common/logService';
import { IHeaders } from '../../networking/common/fetcherService';
import { CopilotUserQuotaInfo, IChatQuota, IChatQuotaService, QuotaSnapshots } from './chatQuotaService';

// DEV: Mock quota-tester server URL (test/quota-tester)
const QUOTA_TESTER_DECREMENT_URL = 'http://localhost:4000/api/decrement';

export class ChatQuotaService extends Disposable implements IChatQuotaService {
	declare readonly _serviceBrand: undefined;

	private _quotaInfo: IChatQuota | undefined;
	private _rateLimitInfo: { session: IChatQuota | undefined; weekly: IChatQuota | undefined };
	private readonly _turnCredits = new Map<string, number>();

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._rateLimitInfo = { session: undefined, weekly: undefined };
		this._register(this._authService.onDidAuthenticationChange(() => {
			this._processUserInfoQuotaSnapshot(this._authService.copilotToken?.quotaInfo);
			// DEV: Override with mock quota-tester state if the server is running
			this._syncMockQuotaState();
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

	// DEV: Set when mock quota-tester returns 403 (quota exhausted)
	mockQuotaExceededError: { code: string; message: string } | undefined;

	// DEV: Overrides copilotToken.copilotPlan for error wording. Synced from mock entitlements.
	mockCopilotPlan: string | undefined;

	getCreditsForTurn(turnId: string): number | undefined {
		return this._turnCredits.get(turnId);
	}

	setLastCopilotUsage(totalNanoAiu: number, turnId: string): void {
		// Convert nano-AIUs to AIC credits: 1 AIC = 1_000_000_000 nano-AIU
		const aic = totalNanoAiu / 1_000_000_000;
		if (aic > 0) {
			this._turnCredits.set(turnId, (this._turnCredits.get(turnId) ?? 0) + aic);
		}
	}

	resetTurnCredits(turnId: string): void {
		this._turnCredits.delete(turnId);
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
		this._logService.trace(`[ChatQuota] processQuotaHeaders: ${JSON.stringify(quotaInfo)}`);
		const sessionRateLimitHeader = headers.get('x-usage-ratelimit-session');
		const weeklyRateLimitHeader = headers.get('x-usage-ratelimit-weekly');
		this._rateLimitInfo.session = sessionRateLimitHeader ? this._processHeaderValue(sessionRateLimitHeader) : undefined;
		this._rateLimitInfo.weekly = weeklyRateLimitHeader ? this._processHeaderValue(weeklyRateLimitHeader) : undefined;
		this._onDidChange.fire();

		// DEV: auto-decrement mock quota-tester server
		this._decrementMockQuota();
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
				resetDate,
			};
			this._logService.trace(`[ChatQuota] processQuotaSnapshots: ${JSON.stringify(this._quotaInfo)}`);
			this._onDidChange.fire();
		} catch (error) {
			console.error('Failed to process quota snapshots', error);
		}

		// DEV: auto-decrement mock quota-tester server
		this._decrementMockQuota();
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
				resetDate,
			};
		} catch (error) {
			console.error('Failed to parse quota header', error);
			return undefined;
		}
	}

	/**
	 * DEV: Fetch the mock quota-tester's current state and override _quotaInfo.
	 * Called on auth change so the UI reflects the mock state from startup.
	 * Non-blocking — silently ignored when the mock server isn't running.
	 */
	private _syncMockQuotaState(): void {
		fetch('http://localhost:4000/copilot_internal/user')
			.then(async res => {
				if (!res.ok) {
					return;
				}
				const entitlements = await res.json();
				this._updateQuotaFromMockEntitlements(entitlements);

				// Also check if the mock is already in exhausted state
				const isMockFree = entitlements?.access_type_sku === 'free_limited_copilot';
				const snapshot = isMockFree
					? entitlements?.quota_snapshots?.chat
					: entitlements?.quota_snapshots?.premium_interactions;
				if (snapshot && !snapshot.unlimited && snapshot.percent_remaining <= 0) {
					const code = isMockFree ? 'free_quota_exceeded' : 'quota_exceeded';
					this.mockQuotaExceededError = {
						code,
						message: isMockFree
							? 'You have exceeded your free tier quota. Please upgrade to Copilot Pro.'
							: 'You have exceeded your included quota for this billing cycle.',
					};
				}
			})
			.catch(() => {
				// Mock server not running — ignore
			});
	}

	/**
	 * DEV: Call the mock quota-tester's decrement endpoint after each chat request.
	 * This keeps the mock server's quota state in sync so that the core's entitlement
	 * fetch (from /copilot_internal/user) reflects decremented quota on the next poll.
	 * Non-blocking — silently swallows errors when the mock server isn't running.
	 */
	private _decrementMockQuota(): void {
		fetch(QUOTA_TESTER_DECREMENT_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		}).then(async res => {
			const body = await res.json();
			if (res.status === 403) {
				const error = body?.error;
				this._logService.trace(`[ChatQuota] Mock quota-tester: quota exhausted (${error?.code})`);

				// Store the error so the fetcher can produce a fake QuotaExceeded on the next request
				this.mockQuotaExceededError = {
					code: error?.code ?? 'quota_exceeded',
					message: error?.message ?? 'Mock quota exhausted',
				};

				// Sync the mock plan from the entitlements in the error response (normalize like CopilotToken.copilotPlan)
				if (body?.entitlements?.access_type_sku === 'free_limited_copilot') {
					this.mockCopilotPlan = 'free';
				} else if (body?.entitlements?.copilot_plan) {
					this.mockCopilotPlan = body.entitlements.copilot_plan;
				}

				// Update quota info to reflect exhaustion
				if (this._quotaInfo) {
					this._quotaInfo = { ...this._quotaInfo, percentRemaining: 0 };
				}
				this._onDidChange.fire();
			} else {
				this._logService.trace('[ChatQuota] Mock quota-tester: decremented');
				// Clear any previous mock exhaustion
				this.mockQuotaExceededError = undefined;

				// Update quota info from the mock's response so threshold notifications fire
				this._updateQuotaFromMockEntitlements(body);
			}
		}).catch(() => {
			// Mock server not running — ignore
		});
	}

	/**
	 * DEV: Parse the mock entitlements response and update _quotaInfo so that
	 * threshold notifications (50%, 75%, 90%) fire correctly.
	 */
	private _updateQuotaFromMockEntitlements(entitlements: Record<string, any>): void {
		if (!entitlements?.quota_snapshots) {
			return;
		}
		// Use the mock's access_type_sku to determine which snapshot, not the real token
		const isMockFree = entitlements.access_type_sku === 'free_limited_copilot';
		const snapshot = isMockFree
			? entitlements.quota_snapshots.chat
			: entitlements.quota_snapshots.premium_interactions;
		if (!snapshot) {
			return;
		}

		// Sync the mock plan for error wording (normalize like CopilotToken.copilotPlan does)
		if (isMockFree) {
			this.mockCopilotPlan = 'free';
		} else if (entitlements.copilot_plan) {
			this.mockCopilotPlan = entitlements.copilot_plan;
		}

		const entitlement = snapshot.entitlement ?? 0;
		const resetDate = entitlements.quota_reset_date
			? new Date(entitlements.quota_reset_date)
			: entitlements.quota_reset_date_utc
				? new Date(entitlements.quota_reset_date_utc)
				: (this._quotaInfo?.resetDate ?? new Date());

		this._quotaInfo = {
			quota: entitlement,
			unlimited: snapshot.unlimited ?? false,
			percentRemaining: Math.min(100, Math.max(0, snapshot.percent_remaining ?? 0)),
			additionalUsageUsed: snapshot.overage_count ?? 0,
			additionalUsageEnabled: snapshot.overage_permitted ?? false,
			resetDate,
		};
		this._logService.trace(`[ChatQuota] Mock quota-tester: updated quotaInfo: ${JSON.stringify(this._quotaInfo)}`);
		this._onDidChange.fire();
	}

	private _processUserInfoQuotaSnapshot(quotaInfo: CopilotUserQuotaInfo | undefined) {
		if (!quotaInfo || !quotaInfo.quota_snapshots || !quotaInfo.quota_reset_date) {
			return;
		}
		const snapshot = this._authService.copilotToken?.isFreeUser
			? quotaInfo.quota_snapshots.chat
			: quotaInfo.quota_snapshots.premium_interactions;
		this._quotaInfo = {
			unlimited: snapshot.unlimited,
			additionalUsageEnabled: snapshot.overage_permitted,
			additionalUsageUsed: snapshot.overage_count,
			quota: snapshot.entitlement,
			resetDate: new Date(quotaInfo.quota_reset_date),
			percentRemaining: snapshot.percent_remaining,
		};
		this._logService.trace(`[ChatQuota] processUserInfoQuotaSnapshot: ${JSON.stringify(this._quotaInfo)}`);
		this._onDidChange.fire();
	}
}
