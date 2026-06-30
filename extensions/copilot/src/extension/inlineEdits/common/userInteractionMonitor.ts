/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { AggressivenessLevel, AggressivenessSetting, DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION, parseUserHappinessScoreConfigurationString, UserHappinessScoreConfiguration } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ErrorUtils } from '../../../util/common/errors';
import { DelaySession } from './delay';

export enum ActionKind {
	Accepted = 'accepted',
	Rejected = 'rejected',
	Ignored = 'ignored',
}

/**
 * Represents a user interaction wrt an inline edit suggestion.
 */
export interface NESUserAction {
	time: number;
	kind: ActionKind;
}

export const MAX_INTERACTIONS_CONSIDERED = 10;
export const MAX_INTERACTIONS_STORED = 30;

/**
 * Get window of actions with ignored action limiting via window expansion.
 *
 * When ignored limit is reached, skip excess ignored actions but expand window
 * further back to still get MAX_INTERACTIONS_CONSIDERED items.
 */
export function getWindowWithIgnoredLimit(
	actions: NESUserAction[],
	config: UserHappinessScoreConfiguration
): NESUserAction[] {
	const { limitConsecutiveIgnored, limitTotalIgnored, ignoredLimit } = config;

	if (!limitConsecutiveIgnored && !limitTotalIgnored) {
		// No limiting - just take last MAX_INTERACTIONS_CONSIDERED
		return actions.slice(-MAX_INTERACTIONS_CONSIDERED);
	}

	const result: NESUserAction[] = [];
	let consecutiveIgnored = 0;
	let totalIgnored = 0;

	// Walk backwards through history
	for (let i = actions.length - 1; i >= 0 && result.length < MAX_INTERACTIONS_CONSIDERED; i--) {
		const action = actions[i];

		if (action.kind === ActionKind.Ignored) {
			let skip = false;
			if (limitConsecutiveIgnored && consecutiveIgnored >= ignoredLimit) {
				skip = true;
			}
			if (limitTotalIgnored && totalIgnored >= ignoredLimit) {
				skip = true;
			}

			if (skip) {
				continue;
			}

			consecutiveIgnored++;
			totalIgnored++;
		} else {
			consecutiveIgnored = 0; // Reset consecutive count on accept/reject
		}

		result.push(action);
	}

	// Reverse to get chronological order
	result.reverse();
	return result;
}

/**
 * Calculate user happiness score from actions.
 * Value between 0 and 1 indicating user happiness.
 * 1 means very happy, 0 means very unhappy.
 *
 * Uses position-weighted scoring with ignored action limiting:
 * - More recent actions have higher weight
 * - Ignored actions can be limited (consecutive or total) to prevent score dilution
 * - Score is adjusted towards neutral (0.5) based on data confidence
 */
export function getUserHappinessScore(
	actions: NESUserAction[],
	config: UserHappinessScoreConfiguration
): number {
	if (actions.length === 0) {
		return 0.5; // neutral score when no data
	}

	// Get window of actions with ignored limiting
	const window = getWindowWithIgnoredLimit(actions, config);

	if (window.length === 0) {
		return 0.5; // neutral score when no data after filtering
	}

	// Calculate weighted score
	let weightedScore = 0; // Sum of weighted normalized scores
	let totalWeight = 0; // Sum of weights applied
	let scoredActionCount = 0; // Count of actions that contributed to score

	for (let i = 0; i < window.length; i++) {
		const action = window[i];

		// Skip ignored actions if not included in score calculation
		if (action.kind === ActionKind.Ignored && !config.includeIgnored) {
			continue;
		}

		scoredActionCount++;

		// Calculate weight based on position (more recent = higher weight)
		// Position 0 (oldest) has lowest weight, last position has highest weight
		const weight = i + 1;

		// Get score based on action kind from configuration
		let score: number;
		switch (action.kind) {
			case ActionKind.Accepted:
				score = config.acceptedScore;
				break;
			case ActionKind.Rejected:
				score = config.rejectedScore;
				break;
			case ActionKind.Ignored:
				score = config.ignoredScore;
				break;
		}

		// Normalize score to 0-1 range based on accept/reject weights
		const normalized = (score - config.rejectedScore) / (config.acceptedScore - config.rejectedScore);

		weightedScore += normalized * weight;
		totalWeight += weight;
	}

	const rawScore = totalWeight > 0 ? weightedScore / totalWeight : 0.5;

	// Adjust score towards neutral (0.5) when we have fewer data points
	// This prevents extreme scores with limited data
	const dataConfidence = scoredActionCount / MAX_INTERACTIONS_CONSIDERED;
	return 0.5 + (rawScore - 0.5) * dataConfidence;
}

export class UserInteractionMonitor {

	/**
	 * Used for aggressiveness level calculation.
	 * Includes all action types (accepted, rejected, ignored).
	 */
	protected _recentUserActionsForAggressiveness: NESUserAction[] = [];

	/**
	 * Used for timing/debounce calculation.
	 * Only includes accepted and rejected actions (ignored actions don't affect timing).
	 */
	protected _recentUserActionsForTiming: (NESUserAction & { kind: ActionKind.Accepted | ActionKind.Rejected })[] = [];

	private _lastActionWasAcceptance = false;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	// Capture user interactions

	public handleAcceptance(): void {
		this._recordUserAction(ActionKind.Accepted);
	}

	public handleRejection(): void {
		this._recordUserAction(ActionKind.Rejected);
	}

	public handleIgnored(): void {
		this._recordUserAction(ActionKind.Ignored);
	}

	/**
	 * Returns true if the last recorded user action was an acceptance.
	 * Used to skip aggressiveness min-response-time delay after accepts.
	 */
	get wasLastActionAcceptance(): boolean {
		return this._lastActionWasAcceptance;
	}

	private _recordUserAction(kind: ActionKind): void {
		const now = Date.now();

		this._lastActionWasAcceptance = kind === ActionKind.Accepted;

		// Always record for aggressiveness calculation
		this._recentUserActionsForAggressiveness.push({ time: now, kind });
		this._recentUserActionsForAggressiveness = this._recentUserActionsForAggressiveness.slice(-MAX_INTERACTIONS_STORED);

		// Only record accepts/rejects for timing calculation
		if (kind !== ActionKind.Ignored) {
			this._recentUserActionsForTiming.push({ time: now, kind });
			this._recentUserActionsForTiming = this._recentUserActionsForTiming.slice(-MAX_INTERACTIONS_CONSIDERED);
		}
	}

	// Creates a DelaySession based on recent user interactions

	public createDelaySession(requestTime: number | undefined): DelaySession {
		const baseDebounceTime = this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsDebounce, this._experimentationService);

		const backoffDebounceEnabled = this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsBackoffDebounceEnabled, this._experimentationService);
		const expectedTotalTime = backoffDebounceEnabled ? this._getExpectedTotalTime(baseDebounceTime) : undefined;

		return new DelaySession(baseDebounceTime, expectedTotalTime, requestTime);
	}

	private _getExpectedTotalTime(baseDebounceTime: number): number {
		const DEBOUNCE_DECAY_TIME_MS = 10 * 60 * 1000; // 10 minutes
		const MAX_DEBOUNCE_TIME = 3000; // 3 seconds
		const MIN_DEBOUNCE_TIME = 50; // 50 ms
		const REJECTION_WEIGHT = 1.5;
		const ACCEPTANCE_WEIGHT = 0.8;
		const now = Date.now();
		let multiplier = 1;

		// Calculate impact of each action with time decay
		// Uses timing-specific array which only contains accepts/rejects
		for (const action of this._recentUserActionsForTiming) {
			const timeSinceAction = now - action.time;
			if (timeSinceAction > DEBOUNCE_DECAY_TIME_MS) {
				continue;
			}

			// Exponential decay: impact decreases as time passes
			const decayFactor = Math.exp(-timeSinceAction / DEBOUNCE_DECAY_TIME_MS);
			const actionWeight = action.kind === ActionKind.Rejected ? REJECTION_WEIGHT : ACCEPTANCE_WEIGHT;
			multiplier *= 1 + ((actionWeight - 1) * decayFactor);
		}

		let debounceTime = baseDebounceTime * multiplier;

		// Clamp the debounce time to reasonable bounds
		debounceTime = Math.min(MAX_DEBOUNCE_TIME, Math.max(MIN_DEBOUNCE_TIME, debounceTime));

		return debounceTime;
	}

	// Determine aggressiveness level based on user interactions

	/**
	 * Returns the aggressiveness level and the user happiness score that was used to derive it.
	 * The score is returned to avoid race conditions when logging telemetry.
	 */
	public getAggressivenessLevel(): { aggressivenessLevel: AggressivenessLevel; userHappinessScore: number | undefined } {
		// User-facing setting takes priority when explicitly set to a non-default value
		const userAggressiveness = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.InlineEditsAggressiveness, this._experimentationService);
		const userLevel = AggressivenessSetting.toLevel(userAggressiveness);
		if (userLevel !== undefined) {
			return { aggressivenessLevel: userLevel, userHappinessScore: undefined };
		}

		// Team-internal experiment-based override
		const configuredAggressivenessLevel = this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabAggressivenessLevel, this._experimentationService);

		if (configuredAggressivenessLevel !== undefined) {
			return { aggressivenessLevel: configuredAggressivenessLevel, userHappinessScore: undefined };
		}

		// Default or unrecognized: fall through to happiness-score-based logic
		let level: AggressivenessLevel;
		const config = this._getUserHappinessScoreConfiguration();
		const userHappinessScore = this._getUserHappinessScore(config);
		if (userHappinessScore >= config.highThreshold) {
			level = AggressivenessLevel.High;
		} else if (userHappinessScore >= config.mediumThreshold) {
			level = AggressivenessLevel.Medium;
		} else {
			level = AggressivenessLevel.Low;
		}
		return { aggressivenessLevel: level, userHappinessScore };
	}

	protected _getUserHappinessScoreConfiguration(): UserHappinessScoreConfiguration {
		const configKey = ConfigKey.TeamInternal.InlineEditsUserHappinessScoreConfigurationString;
		const configString = this._configurationService.getExperimentBasedConfig(configKey, this._experimentationService);
		if (configString === undefined) {
			return DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION;
		}

		try {
			return parseUserHappinessScoreConfigurationString(configString);
		}
		catch (e) {
			this._logService.error(e, 'Failed to parse user happiness score configuration, using default config');
			// Log to telemetry when we fail to parse an experimental config, but still offer the default config to avoid disruption.
			/* __GDPR__
				"incorrectNesAdaptiveAggressivenessConfig" : {
					"owner": "bstee615",
					"comment": "Capture if model configuration string is invalid JSON.",
					"configName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Name of the configuration that failed to parse." },
					"errorMessage": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Error message from JSON.parse." },
					"configValue": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The invalid JSON string." }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('incorrectNesAdaptiveAggressivenessConfig', { configName: configKey.id, errorMessage: ErrorUtils.toString(ErrorUtils.fromUnknown(e)), configValue: configString });
			return DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION;
		}
	}

	private _getUserHappinessScore(config: UserHappinessScoreConfiguration): number {
		return getUserHappinessScore(this._recentUserActionsForAggressiveness, config);
	}
}
