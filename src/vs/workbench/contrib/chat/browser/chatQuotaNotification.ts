/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeIntl } from '../../../../base/common/date.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService, IQuotaSnapshot, IRateLimitSnapshot } from '../../../services/chat/common/chatEntitlementService.js';
import { isSelectedModelCopilot, SELECTED_MODEL_STORAGE_KEY_PREFIX } from '../common/chatSelectedModel.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from './widget/input/chatInputNotificationService.js';

const QUOTA_NOTIFICATION_ID = 'copilot.quotaStatus';
const THRESHOLDS = [50, 75, 90, 95];
const TRAJECTORY_NUDGE_SPEC = {
	treatmentName: 'config.chatQuotaTrajectoryNudge',
	shownStorageKey: 'chat.quotaTrajectory.shownPeriod',
	averageDailyUsageThreshold: 4.5,
	minimumPercentUsed: 10,
	maximumPercentUsed: 35,
	billingPeriodDays: 30,
	msPerDay: 24 * 60 * 60 * 1000,
	learnMoreUrl: 'https://aka.ms/token-usage-tips',
	learnMoreCommandId: 'workbench.action.chat.learnMoreAboutCreditUsage',
} as const;

type ChatQuotaTrajectoryNudgeLinkClickedClassification = {
	owner: 'rfeltis';
	comment: 'Tracks when users click the chat quota trajectory nudge learn more link.';
};

type ChatQuotaTrajectoryNudgeEnrollmentEvent = {
	treatment: boolean;
	entitlement: string;
	averageDailyUsage: number;
	percentUsed: number;
};

type ChatQuotaTrajectoryNudgeEnrollmentClassification = {
	owner: 'rfeltis';
	comment: 'Tracks when a user is assigned to a flight for the chat quota trajectory nudge experiment, to measure experiment exposure.';
	treatment: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The treatment value assigned by the experiment service (true for the treatment arm, false for control).' };
	entitlement: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The user entitlement when the user was assigned to the experiment flight.' };
	averageDailyUsage: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The average daily monthly quota usage percentage when the user was assigned to the experiment flight.' };
	percentUsed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The monthly quota percentage used when the user was assigned to the experiment flight.' };
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
	private _trajectoryTreatment: boolean | undefined;
	private _trajectoryAssignmentRequested = false;

	constructor(
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkbenchAssignmentService private readonly _assignmentService: IWorkbenchAssignmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._chatEntitlementService.onDidChangeQuotaRemaining(() => this._update()));
		this._register(this._chatEntitlementService.onDidChangeQuotaExceeded(() => this._update()));
		this._register(this._chatEntitlementService.onDidChangeEntitlement(() => this._update()));
		this._register(CommandsRegistry.registerCommand(TRAJECTORY_NUDGE_SPEC.learnMoreCommandId, (accessor: ServicesAccessor) => this._handleCreditEfficiencyLearnMoreCommand(accessor)));

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
		this._update();
	}

	/**
	 * Reads the already-evaluated trajectory experiment cohort. The assignment
	 * service resolves the cohort asynchronously, so this is requested only once
	 * the user has met every non-experiment condition required for the nudge.
	 *
	 * Stores the raw treatment value. `undefined` means the user is not
	 * assigned to the flight (or assignments are not available); only a `true`
	 * treatment renders the nudge. We deliberately do not coerce a missing
	 * assignment into a synthetic "control" value, since that would assume an
	 * enrollment that may not exist. Enrollment telemetry is emitted only when
	 * the user is actually assigned to a flight.
	 */
	private async _resolveTrajectoryTreatment(warning: { averageDailyUsage: number; percentUsed: number }): Promise<void> {
		const treatment = await this._assignmentService.getTreatment<boolean>(TRAJECTORY_NUDGE_SPEC.treatmentName);
		this._trajectoryTreatment = treatment;
		if (treatment !== undefined) {
			this._logQuotaTrajectoryNudgeEnrolled(treatment, warning);
		}
		if (treatment === true) {
			this._update();
		}
	}

	private _requestTrajectoryTreatment(warning: { averageDailyUsage: number; percentUsed: number }): void {
		if (!this._trajectoryAssignmentRequested) {
			this._trajectoryAssignmentRequested = true;
			void this._resolveTrajectoryTreatment(warning).catch(error => {
				this._logService.error(`Failed to resolve ${TRAJECTORY_NUDGE_SPEC.treatmentName}`, error);
				this._trajectoryAssignmentRequested = false;
			});
		}
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

		// Nothing new to show — only hide if the exhausted notification is
		// active and the quota is no longer exhausted (state-driven).
		if (this._showingExhausted && !this._isQuotaUsedUp()) {
			this._hideNotification();
		}
	}

	// --- Threshold crossing detection ----------------------------------------

	private _computeQuotaWarning(): { percentUsed: number; threshold: number } | undefined {
		const snapshot = this._getRelevantSnapshot();
		if (!snapshot || snapshot.unlimited) {
			this._prevQuotaPercentUsed = undefined;
			return undefined;
		}
		const percentUsed = 100 - snapshot.percentRemaining;
		const crossed = this._findCrossedThreshold(percentUsed, this._prevQuotaPercentUsed);
		this._prevQuotaPercentUsed = percentUsed;
		if (crossed !== undefined) {
			return { percentUsed: Math.floor(percentUsed), threshold: crossed };
		}
		return undefined;
	}

	private _computeQuotaTrajectoryWarning(): { averageDailyUsage: number; percentUsed: number } | undefined {
		if (this._isTrajectoryShownInCurrentPeriod()) {
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

		const periodStartTime = resetTime - (TRAJECTORY_NUDGE_SPEC.billingPeriodDays * TRAJECTORY_NUDGE_SPEC.msPerDay);
		const elapsedDays = Math.max(0, (Date.now() - periodStartTime) / TRAJECTORY_NUDGE_SPEC.msPerDay);
		if (elapsedDays <= 0) {
			return undefined;
		}

		const percentUsed = 100 - snapshot.percentRemaining;
		if (percentUsed < TRAJECTORY_NUDGE_SPEC.minimumPercentUsed || percentUsed > TRAJECTORY_NUDGE_SPEC.maximumPercentUsed) {
			return undefined;
		}

		const averageDailyUsage = percentUsed / elapsedDays;
		if (averageDailyUsage < TRAJECTORY_NUDGE_SPEC.averageDailyUsageThreshold) {
			return undefined;
		}

		this._requestTrajectoryTreatment({ averageDailyUsage, percentUsed });
		return this._trajectoryTreatment === true ? { averageDailyUsage, percentUsed } : undefined;
	}

	private _showQuotaTrajectoryWarning(warning: { averageDailyUsage: number; percentUsed: number }): void {
		this._showingExhausted = false;
		this._storeTrajectoryShown();
		const learnMoreLink = createMarkdownCommandLink({
			text: localize('quota.trajectory.learnMoreStandalone', "Learn about optimizing usage"),
			id: TRAJECTORY_NUDGE_SPEC.learnMoreCommandId,
			tooltip: localize('quota.trajectory.learnMoreTooltip', "Learn about optimizing usage"),
		});
		const message = localize({ key: 'quota.trajectory.message', comment: ['{Locked="["}', '{Locked="]({0})"}'] }, "You're likely to exhaust your AI credits before your billing period. {0}.", learnMoreLink);

		this._setNotification({
			id: QUOTA_NOTIFICATION_ID,
			telemetryId: 'quotaTrajectoryNudge',
			severity: ChatInputNotificationSeverity.Info,
			message: new MarkdownString(message, { isTrusted: { enabledCommands: [TRAJECTORY_NUDGE_SPEC.learnMoreCommandId] } }),
			description: undefined,
			actions: [],
			dismissible: true,
			autoDismissOnMessage: false,
		});
	}

	private async _handleCreditEfficiencyLearnMoreCommand(accessor: ServicesAccessor): Promise<void> {
		this._telemetryService.publicLog2<{}, ChatQuotaTrajectoryNudgeLinkClickedClassification>('chatQuotaTrajectoryNudgeLinkClicked');
		queueMicrotask(() => this._hideNotification());
		await accessor.get(IOpenerService).open(URI.parse(TRAJECTORY_NUDGE_SPEC.learnMoreUrl));
	}

	private _logQuotaTrajectoryNudgeEnrolled(treatment: boolean, warning: { averageDailyUsage: number; percentUsed: number }): void {
		this._telemetryService.publicLog2<ChatQuotaTrajectoryNudgeEnrollmentEvent, ChatQuotaTrajectoryNudgeEnrollmentClassification>('chatQuotaTrajectoryNudgeEnrolled', {
			treatment,
			entitlement: ChatEntitlement[this._chatEntitlementService.entitlement],
			averageDailyUsage: Math.round(warning.averageDailyUsage * 100) / 100,
			percentUsed: Math.round(warning.percentUsed * 100) / 100,
		});
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

	private _showQuotaApproachingWarning(warning: { percentUsed: number; threshold: number }): void {
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

	private _isManagedPlanBlocked(): boolean {
		const snapshot = this._chatEntitlementService.quotas.premiumChat;
		return !!snapshot && snapshot.hasQuota === false;
	}

	private _showManagedPlanBlockedNotification(): void {
		this._showingExhausted = true;

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
		return !!periodKey && this._storageService.get(TRAJECTORY_NUDGE_SPEC.shownStorageKey, StorageScope.APPLICATION) === periodKey;
	}

	private _storeTrajectoryShown(): void {
		const periodKey = this._getTrajectoryPeriodKey();
		if (periodKey) {
			this._storageService.store(TRAJECTORY_NUDGE_SPEC.shownStorageKey, periodKey, StorageScope.APPLICATION, StorageTarget.USER);
		}
	}

	private _setNotification(notification: IChatInputNotification): void {
		this._chatInputNotificationService.setNotification(notification);
	}

	private _hideNotification(): void {
		this._showingExhausted = false;
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
