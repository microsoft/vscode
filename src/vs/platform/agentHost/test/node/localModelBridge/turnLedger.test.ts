/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TurnLedger, type LocalModelRequestOutcome } from '../../../node/copilot/localModelBridge/shim/turnLedger.js';
import { MAI_IDENTITY, EXAMPLE_IDENTITY } from './fakeServingAccess.js';

suite('LocalModel TurnLedger', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const local: LocalModelRequestOutcome = { kind: 'local', serving: MAI_IDENTITY };
	const fallback: LocalModelRequestOutcome = { kind: 'fallback', reason: 'slotsFull', fallbackModel: 'cloud-model', serving: MAI_IDENTITY };
	const cloud: LocalModelRequestOutcome = { kind: 'cloud' };

	function runTurn(outcomes: readonly LocalModelRequestOutcome[]) {
		const ledger = new TurnLedger();
		const generation = ledger.beginTurn('session-1');
		for (const outcome of outcomes) {
			ledger.record('session-1', outcome);
		}
		return ledger.endTurn('session-1', generation);
	}

	test('aggregates local, fallback, mixed and cloud-only turns', () => {
		assert.deepStrictEqual({
			local: runTurn([local, local]),
			fallback: runTurn([cloud, fallback, { ...fallback, reason: 'staleModel' }]),
			mixed: runTurn([local, fallback]),
			cloudOnly: runTurn([cloud]),
			empty: runTurn([]),
		}, {
			local: { execution: 'local', familyId: MAI_IDENTITY.familyId },
			fallback: { execution: 'fallback', fallbackReason: 'slotsFull', fallbackModel: 'cloud-model', familyId: MAI_IDENTITY.familyId },
			mixed: { execution: 'mixed', fallbackReason: 'slotsFull', fallbackModel: 'cloud-model', familyId: MAI_IDENTITY.familyId },
			cloudOnly: undefined,
			empty: undefined,
		});
	});

	test('takes identity from the serving lease, not the active model', () => {
		assert.deepStrictEqual(runTurn([{ kind: 'local', serving: EXAMPLE_IDENTITY }, { ...fallback, serving: MAI_IDENTITY }]), {
			execution: 'mixed', fallbackReason: 'slotsFull', fallbackModel: 'cloud-model', familyId: EXAMPLE_IDENTITY.familyId,
		});
	});

	test('reports unknown when only requests without a session id ran during the turn', () => {
		const ledger = new TurnLedger();
		const first = ledger.beginTurn('session-1');
		const second = ledger.beginTurn('session-2');
		ledger.record(undefined, local);
		ledger.record('session-2', fallback);
		const outside = ledger.beginTurn('session-3');
		assert.deepStrictEqual({
			first: ledger.endTurn('session-1', first),
			second: ledger.endTurn('session-2', second),
			outside: ledger.endTurn('session-3', outside),
		}, {
			first: { execution: 'unknown' },
			second: { execution: 'fallback', fallbackReason: 'slotsFull', fallbackModel: 'cloud-model', familyId: MAI_IDENTITY.familyId },
			outside: undefined,
		});
	});

	test('keeps generations per session and drops outcomes without an open turn', () => {
		const ledger = new TurnLedger();
		ledger.record('session-1', local);
		const stale = ledger.beginTurn('session-1');
		const current = ledger.beginTurn('session-1');
		ledger.record('session-1', local);
		assert.deepStrictEqual({
			staleEnd: ledger.endTurn('session-1', stale),
			currentEnd: ledger.endTurn('session-1', current),
			again: ledger.endTurn('session-1', current),
			distinct: stale !== current,
		}, {
			staleEnd: undefined,
			currentEnd: { execution: 'local', familyId: MAI_IDENTITY.familyId },
			again: undefined,
			distinct: true,
		});
	});

	test('releases a turn\'s serving hold when it ends, is replaced or dropped, and on dispose; never for a stale end', () => {
		const ledger = new TurnLedger();
		const released: string[] = [];
		const hold = (name: string, servingGeneration = 1) => ({ servingGeneration, dispose: () => released.push(name) });
		const withoutTurn = ledger.setHold('session-1', hold('without a turn'));
		const first = ledger.beginTurn('session-1');
		ledger.setHold('session-1', hold('first generation'));
		ledger.setHold('session-1', hold('replaced by the next generation', 2));
		const step = (name: string) => released.push(`-- ${name}`);
		step('a newer turn replaces the turn');
		ledger.beginTurn('session-1');
		const second = ledger.beginTurn('session-2');
		ledger.setHold('session-2', hold('ended'));
		step('a stale end');
		ledger.endTurn('session-2', first);
		step('the end');
		ledger.endTurn('session-2', second);
		ledger.beginTurn('session-3');
		ledger.setHold('session-3', hold('disposed'));
		step('dispose');
		ledger.dispose();
		assert.deepStrictEqual({ withoutTurn, released, afterDispose: ledger.getHold('session-3') }, {
			withoutTurn: false,
			released: [
				'without a turn',
				'first generation',
				'-- a newer turn replaces the turn',
				'replaced by the next generation',
				'-- a stale end',
				'-- the end',
				'ended',
				'-- dispose',
				'disposed',
			],
			afterDispose: undefined,
		});
	});
});
