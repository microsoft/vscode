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
 * Listens to {@link IChatQuotaService.onDidChange} and determines whether a
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

	/** Previous percentUsed values — `undefined` means no prior state (initial load). */
	private _prevQuotaPercent: number | undefined;
	private _prevSessionPercent: number | undefined;
	private _prevWeeklyPercent: number | undefined;

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

		// Detect signed-in → signed-out transition: clear thresholds and hide.
		if (wasSignedIn && !hasCopilotToken) {
			this._prevQuotaPercent = undefined;
			this._prevSessionPercent = undefined;
			this._prevWeeklyPercent = undefined;
			this._hideNotification();
			this._showingExhausted = false;
			return;
		}

		// Non-UBB (PRU) users have unlimited quotas — skip all notifications.
		if (this._chatQuotaService.quotaInfo?.unlimited) {
			this._hideNotification();
			this._showingExhausted = false;
			return;
		}

		// Priority 1: Quota exhausted — sticky info notification
		if (this._chatQuotaService.quotaExhausted) {
			this._showExhaustedNotification();
			return;
		}

		// Priority 2: Quota approaching threshold
		const quotaWarning = this._computeQuotaWarning();
		if (quotaWarning) {
			this._showQuotaApproachingWarning(quotaWarning);
			return;
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

	// --- Threshold computation -----------------------------------------------

	private _computeQuotaWarning(): IQuotaWarning | undefined {
		const info = this._chatQuotaService.quotaInfo;
		if (!info || info.unlimited) {
			return undefined;
		}
		const result = this._checkThresholdCrossing(info, this._prevQuotaPercent);
		this._prevQuotaPercent = result.percentUsed;
		return result.warning;
	}

	private _computeRateLimitWarning(): IRateLimitWarning | undefined {
		const { session, weekly } = this._chatQuotaService.rateLimitInfo;

		const sessionResult = this._checkThresholdCrossing(session, this._prevSessionPercent);
		this._prevSessionPercent = sessionResult.percentUsed;
		if (sessionResult.warning) {
			return { ...sessionResult.warning, type: 'session' };
		}

		const weeklyResult = this._checkThresholdCrossing(weekly, this._prevWeeklyPercent);
		this._prevWeeklyPercent = weeklyResult.percentUsed;
		if (weeklyResult.warning) {
			return { ...weeklyResult.warning, type: 'weekly' };
		}

		return undefined;
	}

	/**
	 * Checks whether usage has crossed a new threshold compared to the
	 * previous percentage. Returns `undefined` when there is no previous
	 * state (initial load) or no new threshold was crossed.
	 */
	private _checkThresholdCrossing(
		info: IChatQuota | undefined,
		prevPercent: number | undefined,
	): { percentUsed: number | undefined; warning: { percentUsed: number; resetDate: Date } | undefined } {
		if (!info || info.unlimited) {
			return { percentUsed: undefined, warning: undefined };
		}

		const percentUsed = Math.min(100, 100 - info.percentRemaining);

		// No previous state — record current value but don't warn.
		if (prevPercent === undefined) {
			return { percentUsed, warning: undefined };
		}

		// Find the highest threshold that was just crossed
		// (previous was below it, current is at or above it).
		for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
			const threshold = THRESHOLDS[i];
			if (percentUsed >= threshold && prevPercent < threshold) {
				return { percentUsed, warning: { percentUsed: Math.floor(percentUsed), resetDate: info.resetDate } };
			}
		}

		return { percentUsed, warning: undefined };
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
			notification.actions = [
				{ label: vscode.l10n.t('View Usage'), commandId: 'workbench.action.chat.openCopilotStatus' },
			];
		} else if (this._chatQuotaService.additionalUsageEnabled) {
			notification.description = vscode.l10n.t('Additional budget is enabled to cover extra usage.');
			notification.actions = [
				{ label: vscode.l10n.t('View Usage'), commandId: 'workbench.action.chat.openCopilotStatus' },
			];
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
