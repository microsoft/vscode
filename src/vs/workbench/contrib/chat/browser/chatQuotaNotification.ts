/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { safeIntl } from '../../../../base/common/date.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatEntitlement, IChatEntitlementService, IQuotaSnapshot, IRateLimitSnapshot } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from './widget/input/chatInputNotificationService.js';

const QUOTA_NOTIFICATION_ID = 'copilot.quotaStatus';
const THRESHOLDS = [50, 75, 90, 95];

/**
 * Core-side workbench contribution that shows chat input notifications for
 * quota exhaustion and quota-approaching thresholds.
 *
 * Listens to `IChatEntitlementService` quota change events and determines
 * whether a new threshold has been crossed, then shows the highest-priority
 * notification:
 *
 * 1. **Quota exhausted** — info, auto-dismissed on next message.
 * 2. **Quota approaching** — info, auto-dismissed on next message.
 * 3. **Rate-limit warning** — info, auto-dismissed on next message.
 */
export class ChatQuotaNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatQuotaNotification';

	/** Tracks whether the current notification is the quota-exhausted variant. */
	private _showingExhausted = false;

	/**
	 * Previous percent-used for threshold crossing detection.
	 * `undefined` means no data has been seen yet — the first value
	 * establishes a baseline without triggering a notification.
	 */
	private _prevQuotaPercentUsed: number | undefined;
	private _prevAdditionalUsageEnabled: boolean | undefined;
	private _prevSessionPercentUsed: number | undefined;
	private _prevWeeklyPercentUsed: number | undefined;

	constructor(
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
	) {
		super();

		this._register(this._chatEntitlementService.onDidChangeQuotaRemaining(() => this._update()));
		this._register(this._chatEntitlementService.onDidChangeQuotaExceeded(() => this._update()));
		this._register(this._chatEntitlementService.onDidChangeEntitlement(() => this._update()));

		// Check initial state in case quota is already exhausted at startup
		this._update();
	}

	private _getRelevantSnapshot(): IQuotaSnapshot | undefined {
		const quotas = this._chatEntitlementService.quotas;
		const entitlement = this._chatEntitlementService.entitlement;
		if (entitlement === ChatEntitlement.Unknown || entitlement === ChatEntitlement.Free) {
			return quotas.chat ?? quotas.premiumChat;
		}
		return quotas.premiumChat;
	}

	private _isQuotaUsedUp(): boolean {
		const snapshot = this._getRelevantSnapshot();
		if (!snapshot) {
			return false;
		}
		if (snapshot.unlimited) {
			return snapshot.hasQuota === false;
		}
		return snapshot.percentRemaining <= 0;
	}

	private _isUBBEligible(): boolean {
		return this._chatEntitlementService.quotas.usageBasedBilling === true;
	}

	private _update(): void {
		const entitlement = this._chatEntitlementService.entitlement;

		// Skip quota notifications for PRU users — only show for UBB.
		const isQuotaNotificationEligible = entitlement === ChatEntitlement.Unknown || this._isUBBEligible();

		// Priority 1: Quota exhausted or fully used
		if (isQuotaNotificationEligible && this._isQuotaUsedUp()) {
			const quotas = this._chatEntitlementService.quotas;
			const additionalUsageEnabled = quotas.additionalUsageEnabled ?? false;
			const wasAdditionalUsageEnabled = this._prevAdditionalUsageEnabled;
			this._prevAdditionalUsageEnabled = additionalUsageEnabled;

			if (additionalUsageEnabled) {
				// Show overage notification on a live transition to 100%,
				// or when overages are enabled while already at 100%.
				if (this._prevQuotaPercentUsed !== undefined || wasAdditionalUsageEnabled === false) {
					this._showOverageActivationNotification();
				}
			} else {
				this._showExhaustedNotification();
			}
			return;
		}

		// Priority 2: Quota approaching threshold
		if (isQuotaNotificationEligible) {
			const quotaWarning = this._computeQuotaWarning();
			if (quotaWarning) {
				this._showQuotaApproachingWarning(quotaWarning);
				return;
			}
		}

		// Priority 3: Rate-limit warning (session > weekly)
		const rateLimitWarning = this._computeRateLimitWarning();
		if (rateLimitWarning) {
			this._showRateLimitWarning(rateLimitWarning);
			return;
		}

		// Nothing new to show — only hide if the exhausted notification is
		// active and the quota is no longer exhausted (state-driven).
		if (this._showingExhausted && !this._isQuotaUsedUp()) {
			this._hideNotification();
		}
	}

	// --- Threshold crossing detection ----------------------------------------

	private _computeQuotaWarning(): { percentUsed: number } | undefined {
		const snapshot = this._getRelevantSnapshot();
		if (!snapshot || snapshot.unlimited) {
			this._prevQuotaPercentUsed = undefined;
			return undefined;
		}
		const percentUsed = 100 - snapshot.percentRemaining;
		const crossed = this._findCrossedThreshold(percentUsed, this._prevQuotaPercentUsed);
		this._prevQuotaPercentUsed = percentUsed;
		if (crossed !== undefined) {
			return { percentUsed: Math.floor(percentUsed) };
		}
		return undefined;
	}

	/**
	 * Returns the highest threshold that was newly crossed, or `undefined`.
	 */
	private _findCrossedThreshold(current: number, previous: number | undefined): number | undefined {
		if (previous === undefined) {
			return undefined;
		}
		for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
			const threshold = THRESHOLDS[i];
			if (previous < threshold && current >= threshold) {
				return threshold;
			}
		}
		return undefined;
	}

	// --- Quota exhausted ---------------------------------------------------

	private _showExhaustedNotification(): void {
		this._showingExhausted = true;

		const entitlement = this._chatEntitlementService.entitlement;
		const quotas = this._chatEntitlementService.quotas;
		const hadOverage = (quotas.additionalUsageCount ?? 0) > 0;

		let description: string;
		let actions: IChatInputNotification['actions'];

		if (entitlement === ChatEntitlement.Unknown) {
			description = localize('quota.exhausted.anonymous', "Sign in to keep going.");
			actions = [{ label: localize('signIn', "Sign In"), commandId: 'workbench.action.chat.triggerSetup' }];
		} else if (entitlement === ChatEntitlement.Free) {
			description = localize('quota.exhausted.free', "Upgrade to keep going.");
			actions = [{ label: localize('upgrade', "Upgrade"), commandId: 'workbench.action.chat.upgradePlan' }];
		} else if (this._isManagedPlan(entitlement)) {
			description = localize('quota.exhausted.managed', "Contact your admin to increase your limits.");
			actions = [];
		} else if (hadOverage) {
			description = localize('quota.exhausted.hadOverage', "Increase your budget to keep building.");
			actions = [{ label: localize('manageBudget', "Manage Budget"), commandId: 'workbench.action.chat.manageAdditionalSpend' }];
		} else {
			description = localize('quota.exhausted.default', "Manage your budget to keep building.");
			actions = [{ label: localize('manageBudget2', "Manage Budget"), commandId: 'workbench.action.chat.manageAdditionalSpend' }];
		}

		this._setNotification({
			id: QUOTA_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: localize('quota.exhausted.title', "Credit Limit Reached"),
			description,
			actions,
			dismissible: true,
			autoDismissOnMessage: true,
		});
	}

	// --- Overage notification -----------------------------------------------

	private _showOverageActivationNotification(): void {
		this._showingExhausted = true;

		this._setNotification({
			id: QUOTA_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: localize('quota.overage.title', "Credit Limit Reached"),
			description: localize('quota.overage.desc', "Additional budget is now covering extra usage."),
			actions: [],
			dismissible: true,
			autoDismissOnMessage: true,
		});
	}

	// --- Quota approaching --------------------------------------------------

	private _showQuotaApproachingWarning(warning: { percentUsed: number }): void {
		this._showingExhausted = false;

		const entitlement = this._chatEntitlementService.entitlement;
		const quotas = this._chatEntitlementService.quotas;

		let description: string;
		let actions: IChatInputNotification['actions'];

		if (entitlement === ChatEntitlement.Unknown || entitlement === ChatEntitlement.Free) {
			description = localize('quota.approaching.free', "Upgrade to continue past the limit.");
			actions = [{ label: localize('upgrade2', "Upgrade"), commandId: 'workbench.action.chat.upgradePlan' }];
		} else if (this._isManagedPlan(entitlement)) {
			description = localize('quota.approaching.managed', "Contact your admin to increase your limits.");
			actions = [];
		} else if (quotas.additionalUsageEnabled) {
			description = localize('quota.approaching.overageEnabled', "Additional budget is enabled to cover extra usage.");
			actions = [];
		} else {
			description = localize('quota.approaching.default', "Set additional budget to cover extra usage.");
			actions = [{ label: localize('manageBudget3', "Manage Budget"), commandId: 'workbench.action.chat.manageAdditionalSpend' }];
		}

		this._setNotification({
			id: QUOTA_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: localize('quota.approaching.title', "Credits at {0}%", warning.percentUsed),
			description,
			actions,
			dismissible: true,
			autoDismissOnMessage: true,
		});
	}

	// --- Rate-limit warning -------------------------------------------------

	private _computeRateLimitWarning(): { percentUsed: number; type: 'session' | 'weekly'; resetDate: string | undefined } | undefined {
		const quotas = this._chatEntitlementService.quotas;

		const sessionResult = this._checkRateLimitCrossing(quotas.sessionRateLimit, this._prevSessionPercentUsed);
		this._prevSessionPercentUsed = sessionResult.newPrev;

		const weeklyResult = this._checkRateLimitCrossing(quotas.weeklyRateLimit, this._prevWeeklyPercentUsed);
		this._prevWeeklyPercentUsed = weeklyResult.newPrev;

		if (sessionResult.warning) {
			return { ...sessionResult.warning, type: 'session' };
		}
		if (weeklyResult.warning) {
			return { ...weeklyResult.warning, type: 'weekly' };
		}
		return undefined;
	}

	private _checkRateLimitCrossing(
		snapshot: IRateLimitSnapshot | undefined,
		prevPercentUsed: number | undefined,
	): { newPrev: number | undefined; warning?: { percentUsed: number; resetDate: string | undefined } } {
		if (!snapshot || snapshot.unlimited) {
			return { newPrev: undefined };
		}
		const percentUsed = 100 - snapshot.percentRemaining;
		const crossed = this._findCrossedThreshold(percentUsed, prevPercentUsed);
		return {
			newPrev: percentUsed,
			warning: crossed !== undefined
				? { percentUsed: Math.floor(percentUsed), resetDate: snapshot.resetDate }
				: undefined,
		};
	}

	private _showRateLimitWarning(warning: { percentUsed: number; type: 'session' | 'weekly'; resetDate: string | undefined }): void {
		this._showingExhausted = false;

		const message = warning.type === 'session'
			? localize('rateLimit.session', "You've used {0}% of your session rate limit.", warning.percentUsed)
			: localize('rateLimit.weekly', "You've used {0}% of your weekly rate limit.", warning.percentUsed);

		const description = warning.resetDate
			? localize('rateLimit.resets', "Resets on {0}.", this._formatResetDate(warning.resetDate))
			: undefined;

		this._setNotification({
			id: QUOTA_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message,
			description,
			actions: [],
			dismissible: true,
			autoDismissOnMessage: true,
		});
	}

	// --- Helpers ------------------------------------------------------------

	private _isManagedPlan(entitlement: ChatEntitlement): boolean {
		return entitlement === ChatEntitlement.Business || entitlement === ChatEntitlement.Enterprise;
	}

	private _formatResetDate(isoDate: string): string {
		const resetDate = new Date(isoDate);
		const now = new Date();
		const includeYear = resetDate.getFullYear() !== now.getFullYear();
		return safeIntl.DateTimeFormat(undefined, includeYear
			? { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
			: { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }
		).value.format(resetDate);
	}

	private _setNotification(notification: IChatInputNotification): void {
		this._chatInputNotificationService.setNotification(notification);
	}

	private _hideNotification(): void {
		this._showingExhausted = false;
		this._chatInputNotificationService.deleteNotification(QUOTA_NOTIFICATION_ID);
	}
}
