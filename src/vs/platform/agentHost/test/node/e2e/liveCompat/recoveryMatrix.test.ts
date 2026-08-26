/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Focused tests for the decision logic of the process-recovery matrix.
 *
 * The scenarios themselves fork real Agent Hosts and kill them, so they are run
 * by `runRecoveryMatrix` rather than by Mocha. What *is* unit-testable — and is
 * the part a wrong answer would silently corrupt every live result with — is
 * the classifier: it decides which post-crash observations are admissible
 * durability gaps and which are recovery defects.
 *
 * That line is worth testing precisely because a live run is not guaranteed to
 * produce every observation shape. A machine with a fast disk may never once
 * exhibit a lost rename, so the handling of that shape would otherwise ship
 * unexercised and be discovered only by a CI machine that is slower.
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	classifyRecovery,
	isRecoveryDefect,
	RECOVERY_BOUNDARIES,
	RECOVERY_INTEGRATION_PROPOSALS,
	RecoveryClassification,
	type IRecoveryObservation,
	type IRecoveryScenarioResult,
} from './recoveryMatrix.js';
import { tallyClassifications } from './runRecoveryMatrix.js';

const TITLES = { afterMutation: 'Renamed' } as const;

function classify(observation: IRecoveryObservation): RecoveryClassification {
	return classifyRecovery(observation, TITLES);
}

function scenarioResult(classifications: readonly RecoveryClassification[]): IRecoveryScenarioResult {
	return {
		scenario: 'test',
		build: 'current',
		outcome: 'passed',
		durationMs: 0,
		steps: [],
		classifications,
		diagnosticsPath: '',
	};
}

suite('Agent Host recovery matrix', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a surviving session is admissible whether or not the rename survived with it', () => {
		assert.deepStrictEqual(
			[
				// Durable: the mutation reached disk before the kill.
				classify({ listedCount: 1, listedTitle: 'Renamed', describedTitle: 'Renamed' }),
				// The known catalogue-write gap: readable before the kill, gone after.
				classify({ listedCount: 1, listedTitle: 'Untitled', describedTitle: 'Untitled' }),
				// Surfaces may restore at different rates; either carrying the new
				// title is enough to call the mutation durable.
				classify({ listedCount: 1, listedTitle: 'Renamed', describedTitle: 'Untitled' }),
				classify({ listedCount: 1, listedTitle: 'Untitled', describedTitle: 'Renamed' }),
			],
			[
				RecoveryClassification.ConvergedMutated,
				RecoveryClassification.ConvergedPreMutation,
				RecoveryClassification.ConvergedMutated,
				RecoveryClassification.ConvergedMutated,
			],
		);
	});

	test('losing, duplicating or failing to describe a session are recovery defects', () => {
		assert.deepStrictEqual(
			[
				classify({ listedCount: 0 }),
				classify({ listedCount: 2, listedTitle: 'Renamed', describedTitle: 'Renamed' }),
				classify({ listedCount: 1, listedTitle: 'Renamed', describeError: 'could not describe session yet' }),
			].map(classification => ({ classification, defect: isRecoveryDefect(classification) })),
			[
				{ classification: RecoveryClassification.Lost, defect: true },
				{ classification: RecoveryClassification.Duplicated, defect: true },
				{ classification: RecoveryClassification.Undescribable, defect: true },
			],
		);
	});

	test('duplication is a defect even when the duplicate carries the expected title', () => {
		// Guards the ordering inside the classifier: a duplicated session whose
		// entries both look correct must not be mistaken for a clean recovery.
		assert.strictEqual(
			classify({ listedCount: 3, listedTitle: 'Renamed', describedTitle: 'Renamed' }),
			RecoveryClassification.Duplicated,
		);
	});

	test('an empty restored title is a pre-mutation convergence, not an undescribable session', () => {
		// A session that describes with no title at all has been recovered; only
		// a `subscribe` that never succeeded leaves `describedTitle` undefined.
		assert.deepStrictEqual(
			[
				classify({ listedCount: 1, describedTitle: '' }),
				classify({ listedCount: 1, describeError: 'transient' }),
			],
			[RecoveryClassification.ConvergedPreMutation, RecoveryClassification.Undescribable],
		);
	});

	test('the run tallies admissible shapes so a durability gap is visible even when green', () => {
		assert.deepStrictEqual(
			tallyClassifications([
				scenarioResult([RecoveryClassification.ConvergedMutated, RecoveryClassification.ConvergedPreMutation]),
				scenarioResult([RecoveryClassification.ConvergedMutated]),
				scenarioResult([]),
			]),
			{
				[RecoveryClassification.ConvergedMutated]: 2,
				[RecoveryClassification.ConvergedPreMutation]: 1,
			},
		);
	});

	test('both admissible shapes are always reported, so a run cannot hide a zero', () => {
		// A run in which no rename ever survived must report `0`, not omit the
		// key — an omitted key reads as "not measured" rather than "never held".
		assert.deepStrictEqual(
			tallyClassifications([scenarioResult([])]),
			{
				[RecoveryClassification.ConvergedMutated]: 0,
				[RecoveryClassification.ConvergedPreMutation]: 0,
			},
		);
	});

	test('every uncovered boundary names a scoped integration proposal, and every proposal names an existing-coverage gap', () => {
		const uncovered = RECOVERY_BOUNDARIES.filter(boundary => !boundary.covered).map(boundary => boundary.id);
		assert.deepStrictEqual(
			{
				uncovered,
				proposed: RECOVERY_INTEGRATION_PROPOSALS.map(proposal => proposal.boundaryId),
				// A proposal that does not state what already exists invites
				// duplicating a green test instead of closing the real gap.
				allStateAGap: RECOVERY_INTEGRATION_PROPOSALS.every(proposal =>
					proposal.existingCoverage.some(entry => entry.startsWith('Gap:'))),
				coveredHaveScenarios: RECOVERY_BOUNDARIES
					.filter(boundary => boundary.covered)
					.every(boundary => boundary.detail.includes('scenario')),
			},
			{
				uncovered: ['torn-write-corruption', 'pending-receipt-at-kill'],
				proposed: ['torn-write-corruption', 'pending-receipt-at-kill'],
				allStateAGap: true,
				coveredHaveScenarios: true,
			},
		);
	});
});
