/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeIntl } from '../../../../base/common/date.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Language } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatEntitlement, IChatEntitlementService, IQuotaSnapshot, IRateLimitSnapshot } from '../../../services/chat/common/chatEntitlementService.js';
import { isSelectedModelCopilot, SELECTED_MODEL_STORAGE_KEY_PREFIX } from '../common/chatSelectedModel.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from './widget/input/chatInputNotificationService.js';

const QUOTA_NOTIFICATION_ID = 'copilot.quotaStatus';
const THRESHOLDS = [50, 75, 90, 95];
const TRAJECTORY_DAILY_USAGE_THRESHOLD = 4.5;
const TRAJECTORY_MINIMUM_PERCENT_USED = 10;
const TRAJECTORY_MAXIMUM_PERCENT_USED = 35;
const BILLING_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRAJECTORY_TREATMENT = 'chatQuotaTrajectoryNudge';
const TRAJECTORY_SHOWN_STORAGE_KEY = 'chat.quotaTrajectory.shownPeriod';
const CREDIT_EFFICIENCY_LEARN_MORE_URL = 'https://aka.ms/token-usage-tips';
const CREDIT_EFFICIENCY_LEARN_MORE_COMMAND_ID = 'workbench.action.chat.learnMoreAboutCreditUsage';

type ChatQuotaTrajectoryNudgeEvent = {
	severity: 'info';
	entitlement: string;
	averageDailyUsage: number;
	percentUsed: number;
};

type ChatQuotaTrajectoryNudgeClassification = {
	owner: 'rfeltis';
	comment: 'Tracks when the chat quota trajectory nudge is shown, closed, and when users click its learn more link.';
	severity: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The severity of the quota trajectory nudge.' };
	entitlement: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The user entitlement when the quota trajectory nudge event was logged.' };
	averageDailyUsage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The average daily monthly quota usage percentage that caused the nudge.' };
	percentUsed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The monthly quota percentage used when the quota trajectory nudge event was logged.' };
};

/**
 * Persisted flag remembering that the user dismissed the quota-exceeded
 * notification. Kept until quota recovers (credit becomes available again) so
 * the banner does not re-appear on every window reload while quota is still
 * exhausted.
 */
const QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY = 'chat.quotaNotification.exhaustedDismissed';

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
	private _trajectoryNudgeEnabled = false;
	private _trajectoryTreatmentInitialized = false;
	private _lastLoggedTrajectoryShownSignature: string | undefined;
	private _activeTrajectoryWarning: { averageDailyUsage: number; percentUsed: number } | undefined;

	constructor(
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkbenchAssignmentService private readonly _assignmentService: IWorkbenchAssignmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._register(this._chatEntitlementService.onDidChangeQuotaRemaining(() => this._update()));
		this._register(this._chatEntitlementService.onDidChangeQuotaExceeded(() => this._update()));
		this._register(this._chatEntitlementService.onDidChangeEntitlement(() => this._update()));
		this._register(this._assignmentService.onDidRefetchAssignments(() => { void this._updateTrajectoryTreatment(); }));
		this._register(this._chatInputNotificationService.onDidDismiss(id => {
			if (id !== QUOTA_NOTIFICATION_ID) {
				return;
			}
			if (this._activeTrajectoryWarning) {
				this._logQuotaTrajectoryNudgeClosed(this._activeTrajectoryWarning);
				this._storeTrajectoryShown();
			}
			this._activeTrajectoryWarning = undefined;
		}));
		this._register(CommandsRegistry.registerCommand(CREDIT_EFFICIENCY_LEARN_MORE_COMMAND_ID, (accessor: ServicesAccessor) => this._handleCreditEfficiencyLearnMoreCommand(accessor)));

		// Re-evaluate when the selected model changes (e.g. switching between Copilot and BYOK).
		// The chatModelId context key is widget-scoped and may not bubble to the global
		// service, so we also listen for storage changes on the persisted model selection key.
		const storageListener = this._register(new DisposableStore());
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, undefined, storageListener)(e => {
			if (e.key.startsWith(SELECTED_MODEL_STORAGE_KEY_PREFIX)) {
				this._update();
			}
		}));

		// Remember when the user dismisses the quota-exceeded notification so it
		// does not re-appear on the next window reload while quota is still
		// exhausted. The flag is cleared from `_update` once quota recovers.
		this._register(this._chatInputNotificationService.onDidDismiss(id => {
			if (id === QUOTA_NOTIFICATION_ID && this._showingExhausted) {
				this._setExhaustedDismissed();
			}
		}));

		// Check initial state in case quota is already exhausted at startup
		void this._updateTrajectoryTreatment();
		this._update();
	}

	private async _updateTrajectoryTreatment(): Promise<void> {
		if (!Language.isDefaultVariant()) {
			this._setTrajectoryTreatment(false);
			return;
		}

		const trajectoryTreatment = await this._assignmentService.getTreatment<string>(TRAJECTORY_TREATMENT);
		this._setTrajectoryTreatment(trajectoryTreatment === 'enabled');
	}

	private _setTrajectoryTreatment(trajectoryEnabled: boolean): void {
		const wasInitialized = this._trajectoryTreatmentInitialized;
		this._trajectoryTreatmentInitialized = true;
		if (wasInitialized && this._trajectoryNudgeEnabled === trajectoryEnabled) {
			return;
		}
		this._trajectoryNudgeEnabled = trajectoryEnabled;
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
		const isCopilot = this._isCopilotModelSelected();

		// Once quota recovers (credit is positively available again) drop any
		// persisted dismissal so the quota-exceeded notification can show the next
		// time quota runs out. Done before the Copilot/BYOK gate so a recovery is
		// always observed, even while a BYOK model is selected. Guarded on a
		// present snapshot so the transient "no quota data yet" state at
		// startup/reload does not wipe the flag.
		if (this._isQuotaKnownAvailable()) {
			this._clearExhaustedDismissed();
		}

		// Defer new notifications when a BYOK model is selected or the model
		// selection hasn't loaded yet — quota only applies to Copilot models.
		// Already-shown notifications stay visible.
		if (!isCopilot) {
			return;
		}

		// Skip quota notifications for PRU users — only show for UBB.
		const isQuotaNotificationEligible = entitlement === ChatEntitlement.Unknown || this._isUBBEligible();

		// Priority 0: Business/Enterprise org-blocked — hasQuota === false is the
		// authoritative signal that the org has exceeded its budget, regardless of
		// overages or remaining quota.
		if (this._isManagedPlan(entitlement) && this._isManagedPlanBlocked()) {
			if (!this._isExhaustedDismissed()) {
				this._showManagedPlanBlockedNotification();
			}
			return;
		}

		// Priority 1: Quota exhausted or fully used
		if (isQuotaNotificationEligible && this._isQuotaUsedUp()) {
			const quotas = this._chatEntitlementService.quotas;
			const additionalUsageEnabled = quotas.additionalUsageEnabled ?? false;
			const wasAdditionalUsageEnabled = this._prevAdditionalUsageEnabled;
			this._prevAdditionalUsageEnabled = additionalUsageEnabled;

			if (!this._isExhaustedDismissed()) {
				if (additionalUsageEnabled) {
					// Show overage notification on a live transition to 100%,
					// or when overages are enabled while already at 100%.
					if (this._prevQuotaPercentUsed !== undefined || wasAdditionalUsageEnabled === false) {
						this._showOverageActivationNotification();
					}
				} else {
					this._showExhaustedNotification();
				}
			}

			// Keep the baseline up-to-date so that recovery from exhaustion
			// does not trigger a spurious threshold notification.
			const exhaustedSnapshot = this._getRelevantSnapshot();
			if (exhaustedSnapshot && !exhaustedSnapshot.unlimited) {
				this._prevQuotaPercentUsed = 100 - exhaustedSnapshot.percentRemaining;
			}

			return;
		}

		// Nothing new to show — only hide if the exhausted notification is
		// active and the quota is no longer exhausted (state-driven).
		if (this._showingExhausted && !this._isQuotaUsedUp()) {
			this._hideNotification();
		}

		if (!this._trajectoryTreatmentInitialized) {
			this._captureNotificationBaselines();
			return;
		}

		// Priority 2: Quota approaching threshold
		if (isQuotaNotificationEligible) {
			const trajectoryWarning = this._computeQuotaTrajectoryWarning();
			if (trajectoryWarning) {
				this._showQuotaTrajectoryWarning(trajectoryWarning);
				return;
			}

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

		this._captureNotificationBaselines();
	}

	// --- Threshold crossing detection ----------------------------------------

	private _captureNotificationBaselines(): void {
		const snapshot = this._getRelevantSnapshot();
		this._prevQuotaPercentUsed = !snapshot || snapshot.unlimited ? undefined : 100 - snapshot.percentRemaining;
		this._prevSessionPercentUsed = this._getRateLimitPercentUsed(this._chatEntitlementService.quotas.sessionRateLimit);
		this._prevWeeklyPercentUsed = this._getRateLimitPercentUsed(this._chatEntitlementService.quotas.weeklyRateLimit);
	}

	private _getRateLimitPercentUsed(snapshot: IRateLimitSnapshot | undefined): number | undefined {
		if (!snapshot || snapshot.unlimited) {
			return undefined;
		}
		return 100 - snapshot.percentRemaining;
	}

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

	private _computeQuotaTrajectoryWarning(): { averageDailyUsage: number; percentUsed: number } | undefined {
		if (!this._trajectoryNudgeEnabled || !this._isTrajectoryEligibleEntitlement() || this._isTrajectoryShownInCurrentPeriod()) {
			return undefined;
		}

		const snapshot = this._getRelevantSnapshot();
		if (!snapshot || snapshot.unlimited || snapshot.percentRemaining <= 0) {
			return undefined;
		}

		const resetDate = this._chatEntitlementService.quotas.resetDate;
		if (!resetDate) {
			return undefined;
		}

		const resetTime = new Date(resetDate).getTime();
		if (!Number.isFinite(resetTime)) {
			return undefined;
		}

		const periodStartTime = resetTime - (BILLING_PERIOD_DAYS * MS_PER_DAY);
		const elapsedDays = Math.max(0, (Date.now() - periodStartTime) / MS_PER_DAY);
		if (elapsedDays <= 0) {
			return undefined;
		}

		const percentUsed = 100 - snapshot.percentRemaining;
		if (percentUsed < TRAJECTORY_MINIMUM_PERCENT_USED || percentUsed > TRAJECTORY_MAXIMUM_PERCENT_USED) {
			return undefined;
		}

		const averageDailyUsage = percentUsed / elapsedDays;
		if (averageDailyUsage >= TRAJECTORY_DAILY_USAGE_THRESHOLD) {
			return { averageDailyUsage, percentUsed };
		}
		return undefined;
	}

	private _showQuotaTrajectoryWarning(warning: { averageDailyUsage: number; percentUsed: number }): void {
		this._showingExhausted = false;
		this._activeTrajectoryWarning = warning;
		this._logQuotaTrajectoryNudgeShown(warning);
		this._storeTrajectoryShown();
		const learnMoreLink = createMarkdownCommandLink({
			text: localize('quota.trajectory.learnMore', "Learn more about managing credits"),
			id: CREDIT_EFFICIENCY_LEARN_MORE_COMMAND_ID,
			tooltip: localize('quota.trajectory.learnMoreTooltip', "Learn more about managing credits"),
		});

		this._setNotification({
			id: QUOTA_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: new MarkdownString(localize({ key: 'quota.trajectory.message', comment: ['{Locked="]({0})"}'] }, "Based on recent usage, your monthly allowance may run out before it resets. {0}", learnMoreLink), { isTrusted: { enabledCommands: [CREDIT_EFFICIENCY_LEARN_MORE_COMMAND_ID] } }),
			description: undefined,
			actions: [],
			dismissible: true,
			autoDismissOnMessage: false,
		});
	}

	private async _handleCreditEfficiencyLearnMoreCommand(accessor: ServicesAccessor): Promise<void> {
		if (this._activeTrajectoryWarning) {
			this._handleQuotaTrajectoryNudgeLinkClicked(this._activeTrajectoryWarning);
		}
		await accessor.get(IOpenerService).open(URI.parse(CREDIT_EFFICIENCY_LEARN_MORE_URL));
	}

	private _handleQuotaTrajectoryNudgeLinkClicked(warning: { averageDailyUsage: number; percentUsed: number }): void {
		this._logQuotaTrajectoryNudgeLinkClicked(warning);
		this._storeTrajectoryShown();
		queueMicrotask(() => this._hideNotification());
	}

	private _logQuotaTrajectoryNudgeShown(warning: { averageDailyUsage: number; percentUsed: number }): void {
		const resetPeriod = this._getTrajectoryPeriodKey();
		const signature = resetPeriod ?? 'unknown';
		if (signature === this._lastLoggedTrajectoryShownSignature) {
			return;
		}
		this._lastLoggedTrajectoryShownSignature = signature;
		this._telemetryService.publicLog2<ChatQuotaTrajectoryNudgeEvent, ChatQuotaTrajectoryNudgeClassification>('chatQuotaTrajectoryNudgeShown', this._getQuotaTrajectoryNudgeTelemetryData(warning));
	}

	private _logQuotaTrajectoryNudgeClosed(warning: { averageDailyUsage: number; percentUsed: number }): void {
		this._telemetryService.publicLog2<ChatQuotaTrajectoryNudgeEvent, ChatQuotaTrajectoryNudgeClassification>('chatQuotaTrajectoryNudgeClosed', this._getQuotaTrajectoryNudgeTelemetryData(warning));
	}

	private _logQuotaTrajectoryNudgeLinkClicked(warning: { averageDailyUsage: number; percentUsed: number }): void {
		this._telemetryService.publicLog2<ChatQuotaTrajectoryNudgeEvent, ChatQuotaTrajectoryNudgeClassification>('chatQuotaTrajectoryNudgeLinkClicked', this._getQuotaTrajectoryNudgeTelemetryData(warning));
	}

	private _getQuotaTrajectoryNudgeTelemetryData(warning: { averageDailyUsage: number; percentUsed: number }): ChatQuotaTrajectoryNudgeEvent {
		return {
			severity: 'info',
			entitlement: ChatEntitlement[this._chatEntitlementService.entitlement],
			averageDailyUsage: Math.round(warning.averageDailyUsage * 100) / 100,
			percentUsed: Math.round(warning.percentUsed * 100) / 100,
		};
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
		this._activeTrajectoryWarning = undefined;

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
			telemetryId: 'quotaExhausted',
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
		this._activeTrajectoryWarning = undefined;

		this._setNotification({
			id: QUOTA_NOTIFICATION_ID,
			telemetryId: 'overageActivation',
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
		this._activeTrajectoryWarning = undefined;

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
			telemetryId: `quotaApproaching${warning.threshold}`,
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
		this._activeTrajectoryWarning = undefined;

		const message = warning.type === 'session'
			? localize('rateLimit.session', "You've used {0}% of your session rate limit.", warning.percentUsed)
			: localize('rateLimit.weekly', "You've used {0}% of your weekly rate limit.", warning.percentUsed);

		const description = warning.resetDate
			? localize('rateLimit.resets', "Resets on {0}.", this._formatResetDate(warning.resetDate))
			: undefined;

		this._setNotification({
			id: QUOTA_NOTIFICATION_ID,
			telemetryId: warning.type === 'session' ? 'sessionRateLimitWarning' : 'weeklyRateLimitWarning',
			severity: ChatInputNotificationSeverity.Info,
			message,
			description,
			actions: [],
			dismissible: true,
			autoDismissOnMessage: true,
		});
	}

	// --- Helpers ------------------------------------------------------------

	/**
	 * Returns `true` only when a Copilot model is actively selected.
	 * Returns `false` if no model is selected yet (widget not initialized)
	 * or if the selected model is from a non-Copilot vendor (BYOK).
	 */
	private _isCopilotModelSelected(): boolean {
		return isSelectedModelCopilot(this._contextKeyService, this._storageService, this._languageModelsService);
	}

	private _isManagedPlan(entitlement: ChatEntitlement): boolean {
		return entitlement === ChatEntitlement.Business || entitlement === ChatEntitlement.Enterprise;
	}

	private _isTrajectoryEligibleEntitlement(): boolean {
		const entitlement = this._chatEntitlementService.entitlement;
		return entitlement === ChatEntitlement.Pro || entitlement === ChatEntitlement.ProPlus || entitlement === ChatEntitlement.Max;
	}

	private _isManagedPlanBlocked(): boolean {
		const snapshot = this._chatEntitlementService.quotas.premiumChat;
		return !!snapshot && snapshot.hasQuota === false;
	}

	private _showManagedPlanBlockedNotification(): void {
		this._showingExhausted = true;
		this._activeTrajectoryWarning = undefined;

		this._setNotification({
			id: QUOTA_NOTIFICATION_ID,
			telemetryId: 'managedPlanBlocked',
			severity: ChatInputNotificationSeverity.Info,
			message: localize('quota.blocked.managed.title', "Usage Blocked"),
			description: localize('quota.blocked.managed', "Your organization or enterprise has exceeded its Copilot budget. Contact your admin to resume usage."),
			actions: [],
			dismissible: true,
			autoDismissOnMessage: true,
		});
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

	private _getTrajectoryPeriodKey(): string | undefined {
		const resetDate = this._chatEntitlementService.quotas.resetDate;
		if (!resetDate) {
			return undefined;
		}
		const date = new Date(resetDate);
		if (!Number.isFinite(date.getTime())) {
			return undefined;
		}
		return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
	}

	private _isTrajectoryShownInCurrentPeriod(): boolean {
		const periodKey = this._getTrajectoryPeriodKey();
		return !!periodKey && this._storageService.get(TRAJECTORY_SHOWN_STORAGE_KEY, StorageScope.APPLICATION) === periodKey;
	}

	private _storeTrajectoryShown(): void {
		const periodKey = this._getTrajectoryPeriodKey();
		if (periodKey) {
			this._storageService.store(TRAJECTORY_SHOWN_STORAGE_KEY, periodKey, StorageScope.APPLICATION, StorageTarget.USER);
		}
	}

	private _setNotification(notification: IChatInputNotification): void {
		this._chatInputNotificationService.setNotification(notification);
	}

	private _hideNotification(): void {
		this._showingExhausted = false;
		this._activeTrajectoryWarning = undefined;
		this._chatInputNotificationService.deleteNotification(QUOTA_NOTIFICATION_ID);
	}

	// --- Exhausted dismissal persistence ------------------------------------

	/**
	 * Returns `true` only when there is an actual quota snapshot indicating that
	 * credit is available (i.e. quota is not used up). Returns `false` when no
	 * snapshot has loaded yet, so the transient "no data" state at startup/reload
	 * is not mistaken for recovery.
	 */
	private _isQuotaKnownAvailable(): boolean {
		return !!this._getRelevantSnapshot() && !this._isQuotaUsedUp();
	}

	private _isExhaustedDismissed(): boolean {
		return this._storageService.getBoolean(QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	private _setExhaustedDismissed(): void {
		this._storageService.store(QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private _clearExhaustedDismissed(): void {
		this._storageService.remove(QUOTA_EXHAUSTED_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION);
	}
}
