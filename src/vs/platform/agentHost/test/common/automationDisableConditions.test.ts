/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAutomationDisableConditionsError, isAutomationAfterDate, isAutomationAfterDateExpired } from '../../common/automationDisableConditions.js';
import { AutomationDisableConditionKind } from '../../common/state/protocol/channels-automation/state.js';

suite('Automation disable conditions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates timestamp zones and calendar dates without accepting date-only strings', () => {
		assert.deepStrictEqual([
			'2026-10-01T00:00:00Z', '2026-10-01T17:00:00-07:00', '2028-02-29T12:30:01.123Z',
			'2026-02-29T00:00:00Z', '2026-02-30T00:00:00Z', '2026-10-01', '2026-10-01T00:00:00',
			'2026-10-01T24:00:00Z', '2026-13-01T00:00:00Z', 'not a date',
		].map(isAutomationAfterDate), [true, true, true, false, false, false, false, false, false, false]);
	});

	test('rejects invalid arrays, values and duplicate kinds', () => {
		const max = { kind: AutomationDisableConditionKind.AfterRuns, max: 3 };
		const date = { kind: AutomationDisableConditionKind.AfterDate, date: '2026-10-01T00:00:00Z' };
		assert.deepStrictEqual([
			undefined, [], [max], [date], [date, max],
			null, {}, [null], [{ kind: 'unknown' }],
			[max, max], [date, date],
			[max, { ...max, max: 7 }],
			[{ ...max, max: Number.MAX_SAFE_INTEGER + 1 }],
			[{ ...max, max: 1.5 }],
			[{ ...date, date: '2026-02-30T00:00:00Z' }],
		].map(value => getAutomationDisableConditionsError(value) === undefined),
			[true, true, true, true, true, false, false, false, false, false, false, false, false, false, false]);
	});

	test('final date compares instants and includes the exact cutoff', () => {
		const conditions = [{ kind: AutomationDisableConditionKind.AfterDate as const, date: '2026-10-01T17:00:00-07:00' }];
		const cutoff = Date.parse('2026-10-02T00:00:00Z');
		assert.deepStrictEqual([
			isAutomationAfterDateExpired(conditions, cutoff - 1),
			isAutomationAfterDateExpired(conditions, cutoff),
			isAutomationAfterDateExpired(conditions, cutoff + 1),
			isAutomationAfterDateExpired([], cutoff),
		], [false, true, true, false]);
	});
});
