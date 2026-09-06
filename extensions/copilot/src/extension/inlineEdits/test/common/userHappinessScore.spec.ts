/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION, parseUserHappinessScoreConfigurationString, UserHappinessScoreConfiguration } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { ActionKind, getUserHappinessScore, getWindowWithIgnoredLimit, MAX_INTERACTIONS_CONSIDERED, NESUserAction } from '../../common/userInteractionMonitor';

function action(kind: ActionKind): NESUserAction {
	return { time: 0, kind };
}

/**
 * v1 algorithm from main branch (only accepted/rejected).
 * Used as reference to verify the new configurable algorithm can mimic the original behavior.
 */
function v1GetUserHappinessScore(actions: NESUserAction[]): number {
	if (actions.length === 0) {
		return 0.5; // neutral score when no data
	}

	let weightedScore = 0;
	let totalWeight = 0;

	for (let i = 0; i < actions.length; i++) {
		const a = actions[i];
		// Calculate weight based on position (more recent = higher weight)
		// Position 0 (oldest) has lowest weight, last position has highest weight
		const weight = i + 1;

		// Accepted = 1, Rejected = 0
		const score = a.kind === ActionKind.Accepted ? 1 : 0;

		weightedScore += score * weight;
		totalWeight += weight;
	}

	const rawScore = totalWeight > 0 ? weightedScore / totalWeight : 0.5;

	// Adjust score towards neutral (0.5) when we have fewer data points
	// This prevents extreme scores with limited data
	const dataConfidence = actions.length / MAX_INTERACTIONS_CONSIDERED;
	return 0.5 + (rawScore - 0.5) * dataConfidence;
}

/**
 * Configuration that mimics the v1 algorithm behavior.
 */
const CONFIG_MIMICS_V1: UserHappinessScoreConfiguration = {
	acceptedScore: 1,
	rejectedScore: 0,
	ignoredScore: 0.5,
	highThreshold: 0.7,
	mediumThreshold: 0.4,
	includeIgnored: false,
	ignoredLimit: 0,
	limitConsecutiveIgnored: false,
	limitTotalIgnored: true,
};

describe('UserHappinessScore', () => {

	const accepted = ActionKind.Accepted;
	const rejected = ActionKind.Rejected;
	const ignored = ActionKind.Ignored;

	describe('v2 algorithm mimics v1', () => {
		const testCases: { name: string; actions: ActionKind[] }[] = [
			{ name: 'empty actions', actions: [] },
			{ name: 'single accept', actions: [accepted] },
			{ name: 'single reject', actions: [rejected] },
			{ name: 'all accepts', actions: [accepted, accepted, accepted, accepted, accepted] },
			{ name: 'all rejects', actions: [rejected, rejected, rejected, rejected, rejected] },
			{ name: 'mixed 50/50', actions: [accepted, rejected, accepted, rejected, accepted, rejected] },
			{ name: 'accepts then rejects', actions: [accepted, accepted, accepted, rejected, rejected, rejected] },
			{ name: 'rejects then accepts', actions: [rejected, rejected, rejected, accepted, accepted, accepted] },
			{ name: 'full 10 mixed', actions: [accepted, rejected, accepted, accepted, rejected, accepted, rejected, accepted, rejected, accepted] },
			// Cases with ignored (should be filtered out when mimicking v1)
			{ name: 'accepts with ignored', actions: [accepted, ignored, accepted, ignored, accepted] },
			{ name: 'rejects with ignored', actions: [rejected, ignored, rejected, ignored, rejected] },
			{ name: 'mixed with many ignored', actions: [accepted, ignored, ignored, ignored, rejected, ignored, accepted] },
			{ name: 'all ignored', actions: [ignored, ignored, ignored, ignored, ignored] },
			{ name: 'accept surrounded by ignored', actions: [ignored, ignored, accepted, ignored, ignored] },
		];

		for (const testCase of testCases) {
			test(testCase.name, () => {
				// For v1, filter out ignored actions
				const v1Actions = testCase.actions
					.filter((a): a is ActionKind.Accepted | ActionKind.Rejected => a !== ActionKind.Ignored)
					.map(kind => action(kind));

				const newActions = testCase.actions.map(kind => action(kind));

				const v1Score = v1GetUserHappinessScore(v1Actions);
				const newScore = getUserHappinessScore(newActions, CONFIG_MIMICS_V1);

				expect(newScore).toBeCloseTo(v1Score, 6);
			});
		}
	});

	describe('v2 algorithm with ignored actions', () => {
		test('ignored actions count towards score when includeIgnored is true', () => {
			const config: UserHappinessScoreConfiguration = {
				...DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION,
				includeIgnored: true,
			};

			const actions = [
				action(accepted),
				action(ignored),
				action(rejected),
			];

			const score = getUserHappinessScore(actions, config);
			// With ignored having score 0.5, it should pull the average towards middle
			expect(score).toBeGreaterThan(0.4);
			expect(score).toBeLessThan(0.6);
		});

		test('consecutive ignored limiting works correctly', () => {
			const config: UserHappinessScoreConfiguration = {
				...DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION,
				limitConsecutiveIgnored: true,
				limitTotalIgnored: false,
				ignoredLimit: 2,
				includeIgnored: true,
			};

			// Many consecutive ignored followed by accept
			const actions: NESUserAction[] = [
				action(ignored),
				action(ignored),
				action(ignored),
				action(ignored),
				action(ignored),
				action(accepted),
			];

			const window = getWindowWithIgnoredLimit(actions, config);
			// Should only include 2 consecutive ignored before the accept
			expect(window.length).toBe(3); // 2 ignored + 1 accepted
		});

		test('total ignored limiting works correctly', () => {
			const config: UserHappinessScoreConfiguration = {
				...DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION,
				limitConsecutiveIgnored: false,
				limitTotalIgnored: true,
				ignoredLimit: 2,
				includeIgnored: true,
			};

			// Scattered ignored actions
			const actions: NESUserAction[] = [
				action(ignored),
				action(accepted),
				action(ignored),
				action(rejected),
				action(ignored),
				action(accepted),
			];

			const window = getWindowWithIgnoredLimit(actions, config);
			// Should only include 2 total ignored
			const ignoredCount = window.filter(a => a.kind === ignored).length;
			expect(ignoredCount).toBe(2);
		});

		test('different score weights affect result', () => {
			// Test that including ignored with a specific score affects the result
			const actions = [
				action(accepted),
				action(ignored),
				action(rejected),
			];

			// Config where ignored is included but scores as neutral (0.5)
			// Disable ignored limiting so the ignored action is included in the window
			const configWithIgnoredNeutral: UserHappinessScoreConfiguration = {
				...DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION,
				includeIgnored: true,
				ignoredScore: 0.5, // Neutral
				limitTotalIgnored: false,
			};

			// Config where ignored is included but scores as positive (0.8)
			const configWithIgnoredPositive: UserHappinessScoreConfiguration = {
				...DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION,
				includeIgnored: true,
				ignoredScore: 0.8, // Higher than neutral
				limitTotalIgnored: false,
			};

			const neutralScore = getUserHappinessScore(actions, configWithIgnoredNeutral);
			const positiveScore = getUserHappinessScore(actions, configWithIgnoredPositive);

			// With higher ignored score, overall score should be higher
			expect(positiveScore).toBeGreaterThan(neutralScore);
		});
	});

	describe('edge cases', () => {
		test('empty actions returns neutral score', () => {
			const score = getUserHappinessScore([], DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION);
			expect(score).toBe(0.5);
		});

		test('all ignored with no limiting returns neutral', () => {
			const config: UserHappinessScoreConfiguration = {
				...DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION,
				limitTotalIgnored: true,
				ignoredLimit: 0,
				includeIgnored: false,
			};

			const actions = [
				action(ignored),
				action(ignored),
				action(ignored),
			];

			const score = getUserHappinessScore(actions, config);
			expect(score).toBe(0.5);
		});

		test('score adjusts towards neutral with fewer data points', () => {
			const config = DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION;

			// Single accept should give score above 0.5 but not too high
			const singleAccept = getUserHappinessScore([action(accepted)], config);
			expect(singleAccept).toBeGreaterThan(0.5);
			expect(singleAccept).toBeLessThan(0.6); // Pulled towards neutral due to low confidence

			// 10 accepts should give score closer to 1
			const manyAccepts = getUserHappinessScore(
				Array(10).fill(null).map(() => action(accepted)),
				config
			);
			expect(manyAccepts).toBeGreaterThan(0.9);
		});

		test('more recent actions have higher weight', () => {
			const config = DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION;

			// Accepts followed by rejects (recent rejects should lower score)
			const acceptsThenRejects = getUserHappinessScore(
				[action(accepted), action(accepted), action(rejected), action(rejected)],
				config
			);

			// Rejects followed by accepts (recent accepts should raise score)
			const rejectsThenAccepts = getUserHappinessScore(
				[action(rejected), action(rejected), action(accepted), action(accepted)],
				config
			);

			// Recent accepts should give higher score than recent rejects
			expect(rejectsThenAccepts).toBeGreaterThan(acceptsThenRejects);
		});
	});

	describe('configuration parsing', () => {
		test('stringified default configuration parses correctly', () => {
			const stringified = JSON.stringify(DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION);
			const parsed = parseUserHappinessScoreConfigurationString(stringified);

			expect(parsed).toEqual(DEFAULT_USER_HAPPINESS_SCORE_CONFIGURATION);
		});

		test('custom configuration string parses correctly', () => {
			const configString = '{"acceptedScore": 1.0, "rejectedScore": 0.2, "ignoredScore": 0.5, "highThreshold": 0.6, "mediumThreshold": 0.4, "includeIgnored": true, "ignoredLimit": 5, "limitConsecutiveIgnored": false, "limitTotalIgnored": true}';
			const parsed = parseUserHappinessScoreConfigurationString(configString);

			expect(parsed).toEqual({
				acceptedScore: 1.0,
				rejectedScore: 0.2,
				ignoredScore: 0.5,
				highThreshold: 0.6,
				mediumThreshold: 0.4,
				includeIgnored: true,
				ignoredLimit: 5,
				limitConsecutiveIgnored: false,
				limitTotalIgnored: true,
			});
		});

		test('parsed configuration can be used for score calculation', () => {
			const configString = '{"acceptedScore": 1.0, "rejectedScore": 0.2, "ignoredScore": 0.5, "highThreshold": 0.6, "mediumThreshold": 0.4, "includeIgnored": true, "ignoredLimit": 5, "limitConsecutiveIgnored": false, "limitTotalIgnored": true}';
			const config = parseUserHappinessScoreConfigurationString(configString);

			const actions = [
				action(accepted),
				action(ignored),
				action(rejected),
			];

			const score = getUserHappinessScore(actions, config);
			// Score should be a valid number
			expect(typeof score).toBe('number');
			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(1);
		});
	});
});
