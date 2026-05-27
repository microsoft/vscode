/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatQuota, IChatQuotaService } from '../../../platform/chat/common/chatQuotaService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

const RATE_LIMIT_NOTIFICATION_ID = 'copilot.rateLimitStatus';
const THRESHOLDS = [50, 75, 90, 95];

interface IRateLimitWarning {
	percentUsed: number;
	type: 'session' | 'weekly';
	resetDate: Date;
}

/**
 * Manages a single chat input notification for rate limit status.
 *
 * Quota notifications (exhausted / approaching) are handled by the core
 * workbench via `ChatQuotaNotificationContribution`. This contribution
 * only handles **rate-limit warnings** which depend on extension-side
 * session/weekly data from the copilot token.
 */
export class ChatInputNotificationContribution extends Disposable {

	private _notification: vscode.ChatInputNotification | undefined;
	/** Whether a copilot token was present on the last {@link _update} call. */
	private _hadCopilotToken = false;

	/**
	 * Previous percent-used values for threshold crossing detection.
	 * `undefined` means no data has been seen yet — the first value
	 * establishes a baseline without triggering a notification.
	 */
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
	 * Single entry point that determines whether to show a rate-limit notification.
	 */
	private _update(): void {
		const hasCopilotToken = !!this._authService.copilotToken;
		const wasSignedIn = this._hadCopilotToken;
		this._hadCopilotToken = hasCopilotToken;

		// Detect signed-in → signed-out transition: clear state and hide.
		if (wasSignedIn && !hasCopilotToken) {
			this._prevSessionPercentUsed = undefined;
			this._prevWeeklyPercentUsed = undefined;
			this._hideNotification();
			return;
		}

		// Rate-limit warning (session > weekly)
		const rateLimitWarning = this._computeRateLimitWarning();
		if (rateLimitWarning) {
			this._showRateLimitWarning(rateLimitWarning);
		}
	}

	// --- Threshold crossing detection ----------------------------------------

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

	// --- Rate limit warning -------------------------------------------------

	private _showRateLimitWarning(warning: IRateLimitWarning): void {
		const notification = this._ensureNotification();

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
			this._notification = vscode.chat.createInputNotification(RATE_LIMIT_NOTIFICATION_ID);
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
