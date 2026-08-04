/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { computeDrift, decideMultiTurn, MULTI_TURN_DEFAULTS, MultiTurnState, ResolvedMultiTurnConfig, resolveMultiTurnConfig } from '../multiTurnRouting';

const sigma = { reasoning: 0.15, code_gen: 0.20, debugging: 0.15, tool_use: 0.25 };

function config(overrides?: Partial<ResolvedMultiTurnConfig>): ResolvedMultiTurnConfig {
	return {
		sigma,
		escalateThreshold: 2,
		initialSkip: 2,
		backoffCoefficient: 2,
		maxSkip: 32,
		scheduleVersion: 'v1',
		...overrides,
	};
}

describe('computeDrift', () => {
	it('computes the one-sided, sigma-normalized L2 drift', () => {
		const anchor = { reasoning: 0.30, code_gen: 0.50, debugging: 0.20, tool_use: 0.40 };
		const current = { reasoning: 0.65, code_gen: 0.55, debugging: 0.15, tool_use: 0.45 };

		const result = computeDrift(current, anchor, sigma);

		expect(result.drift).toBeCloseTo(2.3552, 3);
		// `debugging` decreased, so it is excluded (one-sided); the rest contribute.
		expect(result.contributions.map(c => c.dimension)).toEqual(['reasoning', 'code_gen', 'tool_use']);
		expect(result.missingSigma).toEqual([]);
	});

	it('is zero when demand does not increase on any dimension', () => {
		const anchor = { reasoning: 0.6, code_gen: 0.6, debugging: 0.6, tool_use: 0.6 };
		const current = { reasoning: 0.1, code_gen: 0.6, debugging: 0.2, tool_use: 0.5 };

		expect(computeDrift(current, anchor, sigma).drift).toBe(0);
	});

	it('excludes dimensions without a positive sigma', () => {
		const anchor = { reasoning: 0.2, code_gen: 0.2 };
		const current = { reasoning: 0.5, code_gen: 0.5 };

		const result = computeDrift(current, anchor, { reasoning: 0.15, code_gen: 0 });

		expect(result.missingSigma).toEqual(['code_gen']);
		expect(result.drift).toBeCloseTo((0.3 / 0.15), 5);
	});
});

describe('decideMultiTurn', () => {
	it('anchors when there is no previous state', () => {
		const current = { reasoning: 0.3, code_gen: 0.5, debugging: 0.2, tool_use: 0.4 };

		const decision = decideMultiTurn(current, undefined, config());

		expect(decision.kind).toBe('anchor');
		expect(decision.adoptCandidate).toBe(true);
		expect(decision.nextState).toEqual({
			anchorVector: current,
			skipWindow: 2,
			skipRemaining: 0,
			turnsSinceAnchor: 0,
			scheduleVersion: 'v1',
		});
	});

	it('stays and grows the skip window when drift is below the threshold', () => {
		const anchor = { reasoning: 0.3, code_gen: 0.5, debugging: 0.2, tool_use: 0.4 };
		const previous: MultiTurnState = { anchorVector: anchor, skipWindow: 2, skipRemaining: 0, turnsSinceAnchor: 0, scheduleVersion: 'v1' };
		// A tiny increase keeps drift well under threshold.
		const current = { reasoning: 0.32, code_gen: 0.5, debugging: 0.2, tool_use: 0.4 };

		const decision = decideMultiTurn(current, previous, config());

		expect(decision.kind).toBe('stay');
		expect(decision.adoptCandidate).toBe(false);
		// Arms the current window (2) and doubles it for next time (4); anchor is unchanged.
		expect(decision.nextState).toEqual({
			anchorVector: anchor,
			skipWindow: 4,
			skipRemaining: 2,
			turnsSinceAnchor: 1,
			scheduleVersion: 'v1',
		});
	});

	it('caps the grown skip window at maxSkip', () => {
		const anchor = { reasoning: 0.3 };
		const previous: MultiTurnState = { anchorVector: anchor, skipWindow: 32, skipRemaining: 0, turnsSinceAnchor: 3, scheduleVersion: 'v1' };
		const current = { reasoning: 0.3 };

		const decision = decideMultiTurn(current, previous, config({ maxSkip: 32 }));

		expect(decision.nextState.skipWindow).toBe(32);
		expect(decision.nextState.skipRemaining).toBe(32);
	});

	it('floors a fractional backoff window so the schedule stays integer', () => {
		const anchor = { reasoning: 0.3 };
		const previous: MultiTurnState = { anchorVector: anchor, skipWindow: 3, skipRemaining: 0, turnsSinceAnchor: 0, scheduleVersion: 'v1' };
		const current = { reasoning: 0.3 };

		const decision = decideMultiTurn(current, previous, config({ backoffCoefficient: 1.5, maxSkip: 32 }));

		// 3 × 1.5 = 4.5 → floored to 4.
		expect(decision.nextState.skipWindow).toBe(4);
	});

	it('escalates and re-anchors when drift reaches the threshold', () => {
		const anchor = { reasoning: 0.30, code_gen: 0.50, debugging: 0.20, tool_use: 0.40 };
		const previous: MultiTurnState = { anchorVector: anchor, skipWindow: 8, skipRemaining: 0, turnsSinceAnchor: 5, scheduleVersion: 'v1' };
		const current = { reasoning: 0.65, code_gen: 0.55, debugging: 0.15, tool_use: 0.45 };

		const decision = decideMultiTurn(current, previous, config({ escalateThreshold: 2 }));

		expect(decision.kind).toBe('escalate');
		expect(decision.adoptCandidate).toBe(true);
		expect(decision.nextState).toEqual({
			anchorVector: current,
			skipWindow: 2,
			skipRemaining: 0,
			turnsSinceAnchor: 0,
			scheduleVersion: 'v1',
		});
	});

	it('reports dimensions missing a sigma so callers can monitor INV-1', () => {
		const anchor = { reasoning: 0.3, code_gen: 0.5 };
		const previous: MultiTurnState = { anchorVector: anchor, skipWindow: 2, skipRemaining: 0, turnsSinceAnchor: 0, scheduleVersion: 'v1' };
		const current = { reasoning: 0.4, code_gen: 0.6 };
		// sigma covers `reasoning` only.
		const decision = decideMultiTurn(current, previous, config({ sigma: { reasoning: 0.15 } }));

		expect(decision.missingSigma).toEqual(['code_gen']);
	});
});

describe('resolveMultiTurnConfig', () => {
	it('merges server values with defaults', () => {
		const resolved = resolveMultiTurnConfig({ sigma, escalate_threshold: 1.5, schedule_version: 'srv' });

		expect(resolved.config).toEqual({
			sigma,
			escalateThreshold: 1.5,
			initialSkip: MULTI_TURN_DEFAULTS.initialSkip,
			backoffCoefficient: MULTI_TURN_DEFAULTS.backoffCoefficient,
			maxSkip: MULTI_TURN_DEFAULTS.maxSkip,
			scheduleVersion: 'srv',
		});
	});

	it('reports the abort reason when disabled or without usable sigma', () => {
		expect(resolveMultiTurnConfig(undefined).reason).toBe('noConfig');
		expect(resolveMultiTurnConfig({ enabled: false, sigma }).reason).toBe('serverDisabled');
		expect(resolveMultiTurnConfig({}).reason).toBe('noSigma');
		expect(resolveMultiTurnConfig({ sigma: {} }).reason).toBe('invalidSigma');
		expect(resolveMultiTurnConfig({ sigma: { reasoning: 0 } }).reason).toBe('invalidSigma');
	});

	it('clamps maxSkip to be at least initialSkip', () => {
		const resolved = resolveMultiTurnConfig({ sigma, initial_skip: 10, max_skip: 4 });

		expect(resolved.config?.maxSkip).toBe(10);
	});
});
