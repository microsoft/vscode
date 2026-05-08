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

	private readonly _shownQuotaThresholds = new Set<number>();
	private readonly _shownSessionThresholds = new Set<number>();
	private readonly _shownWeeklyThresholds = new Set<number>();

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
			this._shownQuotaThresholds.clear();
			this._shownSessionThresholds.clear();
			this._shownWeeklyThresholds.clear();
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
		return this._checkThreshold(info, this._shownQuotaThresholds);
	}

	private _computeRateLimitWarning(): IRateLimitWarning | undefined {
		const { session, weekly } = this._chatQuotaService.rateLimitInfo;
		const sessionWarning = this._checkThreshold(session, this._shownSessionThresholds);
		if (sessionWarning) {
			return { ...sessionWarning, type: 'session' };
		}
		const weeklyWarning = this._checkThreshold(weekly, this._shownWeeklyThresholds);
		if (weeklyWarning) {
			return { ...weeklyWarning, type: 'weekly' };
		}
		return undefined;
	}

	/**
	 * Checks whether a quota/rate-limit info has crossed a new threshold
	 * that hasn't been shown yet. Clears stale thresholds when usage drops.
	 */
	private _checkThreshold(info: IChatQuota | undefined, shownThresholds: Set<number>): { percentUsed: number; resetDate: Date } | undefined {
		if (!info) {
			shownThresholds.clear();
			return undefined;
		}
		if (info.unlimited) {
			return undefined;
		}

		const percentUsed = 100 - info.percentRemaining;

		// Clear thresholds that are no longer crossed (usage dropped)
		for (const threshold of shownThresholds) {
			if (percentUsed < threshold) {
				shownThresholds.delete(threshold);
			}
		}

		// Walk thresholds highest-first so we report the most severe crossed threshold
		for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
			const threshold = THRESHOLDS[i];
			if (percentUsed >= threshold && !shownThresholds.has(threshold)) {
				// Mark this and all lower thresholds as shown
				for (let j = 0; j <= i; j++) {
					shownThresholds.add(THRESHOLDS[j]);
				}
				return { percentUsed: Math.round(percentUsed), resetDate: info.resetDate };
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
		const quotaInfo = this._chatQuotaService.quotaInfo;
		const hadOverage = quotaInfo ? quotaInfo.additionalUsageUsed > 0 : false;

		if (isAnonymous) {
			notification.description = vscode.l10n.t('Sign in to keep going.');
			notification.actions = [
				{ label: vscode.l10n.t('View Usage'), commandId: 'workbench.action.chat.openCopilotStatus' },
				{ label: vscode.l10n.t('Sign In'), commandId: 'workbench.action.chat.triggerSetup' },
			];
		} else if (isFree) {
			notification.description = vscode.l10n.t('Upgrade to keep going.');
			notification.actions = [
				{ label: vscode.l10n.t('View Usage'), commandId: 'workbench.action.chat.openCopilotStatus' },
				{ label: vscode.l10n.t('Upgrade'), commandId: 'workbench.action.chat.upgradePlan' },
			];
		} else if (hadOverage) {
			notification.description = vscode.l10n.t('Increase your budget to keep building.');
			notification.actions = [
				{ label: vscode.l10n.t('View Usage'), commandId: 'workbench.action.chat.openCopilotStatus' },
				{ label: vscode.l10n.t('Manage Budget'), commandId: 'workbench.action.chat.manageAdditionalSpend' },
			];
		} else {
			notification.description = vscode.l10n.t('Manage your budget to keep building.');
			notification.actions = [
				{ label: vscode.l10n.t('View Usage'), commandId: 'workbench.action.chat.openCopilotStatus' },
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

		if (isAnonymous || isFree) {
			notification.description = vscode.l10n.t('Upgrade to continue past the limit.');
			notification.actions = [
				{ label: vscode.l10n.t('Upgrade'), commandId: 'workbench.action.chat.upgradePlan' },
			];
		} else if (this._chatQuotaService.additionalUsageEnabled) {
			notification.description = vscode.l10n.t('Additional budget is covering extra usage.');
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
