/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InlineAgentSurveySurface, InlineAgentSurveyTrigger } from '../../common/inlineAgentSurveyService.js';
import {
	clampNonNegative,
	clampProbability,
	IInlineAgentSurveyEligibilityContext,
	InlineAgentSurveyTreatmentFallback,
	isResponseEligible,
	resolveInlineAgentSurveyTreatments,
	rollInlineAgentSurvey,
	selectInlineAgentSurveyTrigger,
} from '../../common/inlineAgentSurveyScheduler.js';

function eligibility(overrides?: Partial<IInlineAgentSurveyEligibilityContext>): IInlineAgentSurveyEligibilityContext {
	return {
		surface: InlineAgentSurveySurface.AgentsWindow,
		isCopilotProvider: true,
		isAgentMode: true,
		completedUserTurns: 1,
		elapsedChatTimeMs: 0,
		isLatestResponse: true,
		isTerminalSuccess: true,
		hasVisibleOutput: true,
		isPendingInput: false,
		...overrides,
	};
}

suite('InlineAgentSurveyScheduler', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('clampProbability sanitizes values', () => {
		assert.strictEqual(clampProbability(0.5, 0.1), 0.5);
		assert.strictEqual(clampProbability(undefined, 0.1), 0.1);
		assert.strictEqual(clampProbability(-1, 0.1), 0);
		assert.strictEqual(clampProbability(1.5, 0.1), 0);
		assert.strictEqual(clampProbability(NaN, 0.1), 0);
		assert.strictEqual(clampProbability(Infinity, 0.1), 0);
		assert.strictEqual(clampProbability(0, 0.1), 0);
		assert.strictEqual(clampProbability(1, 0.1), 1);
	});

	test('clampNonNegative sanitizes values', () => {
		assert.strictEqual(clampNonNegative(1000, 500), 1000);
		assert.strictEqual(clampNonNegative(undefined, 500), 500);
		assert.strictEqual(clampNonNegative(-5, 500), 500);
		assert.strictEqual(clampNonNegative(NaN, 500), 500);
		assert.strictEqual(clampNonNegative(0, 500), 0);
	});

	test('resolveInlineAgentSurveyTreatments applies fallbacks and disabled-by-default', () => {
		const resolved = resolveInlineAgentSurveyTreatments({
			enabled: undefined,
			firstResponseProbability: undefined,
			matureResponseProbability: undefined,
			matureMinTimeMs: undefined,
			matureMinUserTurns: undefined,
			globalCooldownMs: undefined,
		});
		assert.deepStrictEqual(resolved, {
			enabled: false,
			firstResponseProbability: InlineAgentSurveyTreatmentFallback.firstResponseProbability,
			matureResponseProbability: InlineAgentSurveyTreatmentFallback.matureResponseProbability,
			matureMinTimeMs: InlineAgentSurveyTreatmentFallback.matureMinTimeMs,
			matureMinUserTurns: InlineAgentSurveyTreatmentFallback.matureMinUserTurns,
			globalCooldownMs: InlineAgentSurveyTreatmentFallback.globalCooldownMs,
		});
	});

	test('resolveInlineAgentSurveyTreatments clamps malformed probabilities to 0', () => {
		const resolved = resolveInlineAgentSurveyTreatments({
			enabled: true,
			firstResponseProbability: 5,
			matureResponseProbability: -0.2,
			matureMinTimeMs: -1,
			matureMinUserTurns: 3,
			globalCooldownMs: 42,
		});
		assert.strictEqual(resolved.enabled, true);
		assert.strictEqual(resolved.firstResponseProbability, 0);
		assert.strictEqual(resolved.matureResponseProbability, 0);
		assert.strictEqual(resolved.matureMinTimeMs, InlineAgentSurveyTreatmentFallback.matureMinTimeMs);
		assert.strictEqual(resolved.matureMinUserTurns, 3);
		assert.strictEqual(resolved.globalCooldownMs, 42);
	});

	test('isResponseEligible gates on the fixed rules', () => {
		assert.strictEqual(isResponseEligible(eligibility()), true);
		assert.strictEqual(isResponseEligible(eligibility({ isCopilotProvider: false })), false);
		assert.strictEqual(isResponseEligible(eligibility({ isTerminalSuccess: false })), false);
		assert.strictEqual(isResponseEligible(eligibility({ hasVisibleOutput: false })), false);
		assert.strictEqual(isResponseEligible(eligibility({ isLatestResponse: false })), false);
		assert.strictEqual(isResponseEligible(eligibility({ isPendingInput: true })), false);
	});

	test('isResponseEligible requires Agent mode only for Editor chat', () => {
		assert.strictEqual(isResponseEligible(eligibility({ surface: InlineAgentSurveySurface.EditorChat, isAgentMode: false })), false);
		assert.strictEqual(isResponseEligible(eligibility({ surface: InlineAgentSurveySurface.EditorChat, isAgentMode: true })), true);
		// Agents window does not require the Agent-mode flag.
		assert.strictEqual(isResponseEligible(eligibility({ surface: InlineAgentSurveySurface.AgentsWindow, isAgentMode: false })), true);
	});

	test('selectInlineAgentSurveyTrigger prefers first-response, then mature', () => {
		const treatments = resolveInlineAgentSurveyTreatments({ enabled: true, firstResponseProbability: 1, matureResponseProbability: 1, matureMinTimeMs: 1000, matureMinUserTurns: 5, globalCooldownMs: 0 });
		assert.strictEqual(selectInlineAgentSurveyTrigger(eligibility({ completedUserTurns: 1 }), treatments), InlineAgentSurveyTrigger.FirstResponse);
		// Between first and mature thresholds => no trigger.
		assert.strictEqual(selectInlineAgentSurveyTrigger(eligibility({ completedUserTurns: 3, elapsedChatTimeMs: 2000 }), treatments), undefined);
		// Meets mature thresholds.
		assert.strictEqual(selectInlineAgentSurveyTrigger(eligibility({ completedUserTurns: 5, elapsedChatTimeMs: 2000 }), treatments), InlineAgentSurveyTrigger.Mature);
		// Meets turn count but not elapsed time.
		assert.strictEqual(selectInlineAgentSurveyTrigger(eligibility({ completedUserTurns: 5, elapsedChatTimeMs: 500 }), treatments), undefined);
	});

	test('rollInlineAgentSurvey respects master enable', () => {
		const treatments = resolveInlineAgentSurveyTreatments({ enabled: false, firstResponseProbability: 1, matureResponseProbability: 1, matureMinTimeMs: 0, matureMinUserTurns: 0, globalCooldownMs: 0 });
		assert.strictEqual(rollInlineAgentSurvey({ treatments, eligibility: eligibility(), now: 1000, lastGlobalImpressionAt: 0, alreadyImpressedThisChat: false, random: 0 }), undefined);
	});

	test('rollInlineAgentSurvey honors probability comparison', () => {
		const treatments = resolveInlineAgentSurveyTreatments({ enabled: true, firstResponseProbability: 0.5, matureResponseProbability: 1, matureMinTimeMs: 0, matureMinUserTurns: 0, globalCooldownMs: 0 });
		// random below probability => selected
		assert.strictEqual(rollInlineAgentSurvey({ treatments, eligibility: eligibility(), now: 1e9, lastGlobalImpressionAt: 0, alreadyImpressedThisChat: false, random: 0.49 }), InlineAgentSurveyTrigger.FirstResponse);
		// random at/above probability => not selected
		assert.strictEqual(rollInlineAgentSurvey({ treatments, eligibility: eligibility(), now: 1e9, lastGlobalImpressionAt: 0, alreadyImpressedThisChat: false, random: 0.5 }), undefined);
	});

	test('rollInlineAgentSurvey enforces global cooldown and per-chat cap', () => {
		const treatments = resolveInlineAgentSurveyTreatments({ enabled: true, firstResponseProbability: 1, matureResponseProbability: 1, matureMinTimeMs: 0, matureMinUserTurns: 0, globalCooldownMs: 10000 });
		// Within cooldown window => suppressed.
		assert.strictEqual(rollInlineAgentSurvey({ treatments, eligibility: eligibility(), now: 5000, lastGlobalImpressionAt: 0, alreadyImpressedThisChat: false, random: 0 }), undefined);
		// After cooldown window => allowed.
		assert.strictEqual(rollInlineAgentSurvey({ treatments, eligibility: eligibility(), now: 10001, lastGlobalImpressionAt: 0, alreadyImpressedThisChat: false, random: 0 }), InlineAgentSurveyTrigger.FirstResponse);
		// Already impressed this chat => suppressed regardless of cooldown.
		assert.strictEqual(rollInlineAgentSurvey({ treatments, eligibility: eligibility(), now: 1e9, lastGlobalImpressionAt: 0, alreadyImpressedThisChat: true, random: 0 }), undefined);
	});
});
