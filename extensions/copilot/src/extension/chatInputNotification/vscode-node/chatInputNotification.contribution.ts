/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatQuota, IChatQuotaService } from '../../../platform/chat/common/chatQuotaService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

const QUOTA_NOTIFICATION_ID = 'copilot.quotaStatus';
const THRESHOLDS = [50, 75, 90, 95];

interface IRateLimitWarning {
	percentUsed: number;
	type: 'session' | 'weekly';
	resetDate: Date;
}

interface IQuotaWarning {
	percentUsed: number;
	resetDate: Date;
}

/**
 * Manages a single chat input notification for quota and rate limit status.
 *
 * Listens to `IChatQuotaService.onDidChange` and determines whether a
 * new threshold has been crossed, then shows the highest-priority notification:
 *
 * 1. **Quota exhausted** — info, not auto-dismissed, only dismissible via X.
 * 2. **Quota approaching** — info, auto-dismissed on next message.
 * 3. **Rate-limit warning** — info, auto-dismissed on next message.
 */
export class ChatInputNotificationContribution extends Disposable {

	private _notification: vscode.ChatInputNotification | undefined;
	/** Tracks whether the current notification is the quota-exhausted variant. */
	private _showingExhausted = false;
	/** Whether a copilot token was present on the last {@link _update} call. */
	private _hadCopilotToken = false;

	/**
	 * Previous percent-used values for threshold crossing detection.
	 * `undefined` means no data has been seen yet — the first value
	 * establishes a baseline without triggering a notification.
	 */
	private _prevQuotaPercentUsed: number | undefined;
	private _prevSessionPercentUsed: number | undefined;
	private _prevWeeklyPercentUsed: number | undefined;

	constructor(
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IChatQuotaService private readonly _chatQuotaService: IChatQuotaService,
	) {
		super();
		this._register(this._authService.onDidAuthenticationChange(() => this._update()));
		this._register(this._chatQuotaService.onDidChange(() => this._update()));
	}

	/**
	 * Single entry point that determines the highest-priority notification
	 * to show (or whether to hide).
	 */
	private _update(): void {
		const hasCopilotToken = !!this._authService.copilotToken;
		const wasSignedIn = this._hadCopilotToken;
		this._hadCopilotToken = hasCopilotToken;

		// Detect signed-in → signed-out transition: clear state and hide.
		if (wasSignedIn && !hasCopilotToken) {
			this._prevQuotaPercentUsed = undefined;
			this._prevSessionPercentUsed = undefined;
			this._prevWeeklyPercentUsed = undefined;
			this._hideNotification();
			this._showingExhausted = false;
			return;
		}

		// Skip quota notifications for PRU users — only show for UBB.
		const isQuotaNotificationEligible = !hasCopilotToken
			|| !!this._authService.copilotToken?.isUsageBasedBilling;

		// Priority 1: Quota exhausted — sticky info notification
		if (isQuotaNotificationEligible && this._chatQuotaService.quotaExhausted) {
			this._showExhaustedNotification();
			return;
		}

		// Priority 2: Quota approaching threshold
		if (isQuotaNotificationEligible) {
			const quotaWarning = this._computeQuotaWarning();
			if (quotaWarning) {
				this._fetchAndShowQuotaWarning(quotaWarning);
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
		if (this._showingExhausted && !this._chatQuotaService.quotaExhausted) {
			this._hideNotification();
		}
	}

	// --- Fetch and show quota warning ----------------------------------------

	/**
	 * Fetches up-to-date quota data before showing a threshold notification,
	 * ensuring the displayed percentage reflects the latest server state.
	 */
	private async _fetchAndShowQuotaWarning(fallbackWarning: IQuotaWarning): Promise<void> {
		try {
			await this._chatQuotaService.refreshQuota();
			const freshInfo = this._chatQuotaService.quotaInfo;
			if (freshInfo && !freshInfo.unlimited) {
				this._showQuotaApproachingWarning({
					percentUsed: Math.floor(100 - freshInfo.percentRemaining),
					resetDate: freshInfo.resetDate,
				});
			} else {
				this._showQuotaApproachingWarning(fallbackWarning);
			}
		} catch {
			this._showQuotaApproachingWarning(fallbackWarning);
		}
	}

	// --- Threshold crossing detection ----------------------------------------

	private _computeQuotaWarning(): IQuotaWarning | undefined {
		const info = this._chatQuotaService.quotaInfo;
		if (!info || info.unlimited) {
			this._prevQuotaPercentUsed = undefined;
			return undefined;
		}
		const percentUsed = 100 - info.percentRemaining;
		const crossed = this._findCrossedThreshold(percentUsed, this._prevQuotaPercentUsed);
		this._prevQuotaPercentUsed = percentUsed;
		if (crossed !== undefined) {
			return { percentUsed: Math.floor(percentUsed), resetDate: info.resetDate };
		}
		return undefined;
	}

	private _computeRateLimitWarning(): IRateLimitWarning | undefined {
		const { session, weekly } = this._chatQuotaService.rateLimitInfo;

		// Always update both prev values so neither becomes stale.
		const sessionWarning = this._checkCrossing(session, this._prevSessionPercentUsed);
		this._prevSessionPercentUsed = sessionWarning.newPrev;

		const weeklyWarning = this._checkCrossing(weekly, this._prevWeeklyPercentUsed);
		this._prevWeeklyPercentUsed = weeklyWarning.newPrev;

		if (sessionWarning.warning) {
			return { ...sessionWarning.warning, type: 'session' };
		}
		if (weeklyWarning.warning) {
			return { ...weeklyWarning.warning, type: 'weekly' };
		}
		return undefined;
	}

	private _checkCrossing(
		info: IChatQuota | undefined,
		prevPercentUsed: number | undefined,
	): { newPrev: number | undefined; warning?: { percentUsed: number; resetDate: Date } } {
		if (!info || info.unlimited) {
			return { newPrev: undefined };
		}
		const percentUsed = 100 - info.percentRemaining;
		const crossed = this._findCrossedThreshold(percentUsed, prevPercentUsed);
		return {
			newPrev: percentUsed,
			warning: crossed !== undefined
				? { percentUsed: Math.floor(percentUsed), resetDate: info.resetDate }
				: undefined,
		};
	}

	/**
	 * Returns the highest threshold that was newly crossed, or `undefined`.
	 * A threshold is "crossed" when the previous value was below it and the
	 * current value is at or above it.  When `previous` is `undefined` (first
	 * data arrival), no crossing is detected — only the baseline is stored.
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
		const notification = this._ensureNotification();
		this._showingExhausted = true;

		notification.severity = vscode.ChatInputNotificationSeverity.Info;
		notification.dismissible = true;
		notification.autoDismissOnMessage = false;
		notification.message = vscode.l10n.t('Credit Limit Reached');

		const isAnonymous = !!this._authService.copilotToken?.isNoAuthUser;
		const isFree = !!this._authService.copilotToken?.isFreeUser;
		const isManagedPlan = !!this._authService.copilotToken?.isManagedPlan;
		const quotaInfo = this._chatQuotaService.quotaInfo;
		const hadOverage = quotaInfo ? quotaInfo.additionalUsageUsed > 0 : false;

		if (isAnonymous) {
			notification.description = vscode.l10n.t('Sign in to keep going.');
			notification.actions = [
				{ label: vscode.l10n.t('Sign In'), commandId: 'workbench.action.chat.triggerSetup' },
			];
		} else if (isFree) {
			notification.description = vscode.l10n.t('Upgrade to keep going.');
			notification.actions = [
				{ label: vscode.l10n.t('Upgrade'), commandId: 'workbench.action.chat.upgradePlan' },
			];
		} else if (isManagedPlan) {
			notification.description = vscode.l10n.t('Contact your admin to increase your limits.');
			notification.actions = [];
		} else if (hadOverage) {
			notification.description = vscode.l10n.t('Increase your budget to keep building.');
			notification.actions = [
				{ label: vscode.l10n.t('Manage Budget'), commandId: 'workbench.action.chat.manageAdditionalSpend' },
			];
		} else {
			notification.description = vscode.l10n.t('Manage your budget to keep building.');
			notification.actions = [
				{ label: vscode.l10n.t('Manage Budget'), commandId: 'workbench.action.chat.manageAdditionalSpend' },
			];
		}

		notification.show();
	}

	// --- Quota approaching --------------------------------------------------

	private _showQuotaApproachingWarning(warning: IQuotaWarning): void {
		const notification = this._ensureNotification();
		this._showingExhausted = false;

		notification.severity = vscode.ChatInputNotificationSeverity.Info;
		notification.dismissible = true;
		notification.autoDismissOnMessage = true;
		notification.message = vscode.l10n.t('Credits at {0}%', warning.percentUsed);

		const isAnonymous = !!this._authService.copilotToken?.isNoAuthUser;
		const isFree = !!this._authService.copilotToken?.isFreeUser;
		const isManagedPlan = !!this._authService.copilotToken?.isManagedPlan;

		if (isAnonymous || isFree) {
			notification.description = vscode.l10n.t('Upgrade to continue past the limit.');
			notification.actions = [
				{ label: vscode.l10n.t('Upgrade'), commandId: 'workbench.action.chat.upgradePlan' },
			];
		} else if (isManagedPlan) {
			notification.description = vscode.l10n.t('Contact your admin to increase your limits.');
			notification.actions = [];
		} else if (this._chatQuotaService.additionalUsageEnabled) {
			notification.description = vscode.l10n.t('Additional budget is enabled to cover extra usage.');
			notification.actions = [];
		} else {
			notification.description = vscode.l10n.t('Set additional budget to cover extra usage.');
			notification.actions = [
				{ label: vscode.l10n.t('Manage Budget'), commandId: 'workbench.action.chat.manageAdditionalSpend' },
			];
		}

		notification.show();
	}

	// --- Rate limit warning -------------------------------------------------

	private _showRateLimitWarning(warning: IRateLimitWarning): void {
		const notification = this._ensureNotification();
		this._showingExhausted = false;

		const dateStr = this._formatResetDate(warning.resetDate);
		notification.severity = vscode.ChatInputNotificationSeverity.Info;
		notification.dismissible = true;
		notification.autoDismissOnMessage = true;

		notification.message = warning.type === 'session'
			? vscode.l10n.t("You've used {0}% of your session rate limit.", warning.percentUsed)
			: vscode.l10n.t("You've used {0}% of your weekly rate limit.", warning.percentUsed);
		notification.description = vscode.l10n.t('Resets on {0}.', dateStr);
		notification.actions = [];

		notification.show();
	}

	// --- Helpers ------------------------------------------------------------

	private _formatResetDate(resetDate: Date): string {
		const now = new Date();
		const includeYear = resetDate.getFullYear() !== now.getFullYear();
		return new Intl.DateTimeFormat(undefined, includeYear
			? { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
			: { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }
		).format(resetDate);
	}

	private _ensureNotification(): vscode.ChatInputNotification {
		if (!this._notification) {
			this._notification = vscode.chat.createInputNotification(QUOTA_NOTIFICATION_ID);
			this._register({ dispose: () => this._notification?.dispose() });
		}
		return this._notification;
	}

	private _hideNotification(): void {
		if (this._notification) {
			this._notification.hide();
		}
	}
}
