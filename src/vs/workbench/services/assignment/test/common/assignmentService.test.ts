/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { cleanData } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { resolveScopedTreatment, resolveTreatmentWithAssignment, toExperimentTelemetryData } from '../../common/assignmentService.js';
import { DeferredPromise } from '../../../../../base/common/async.js';

suite('resolveScopedTreatment', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const BARE = 'config.chat.agentHost.copilot.multiTurnContextRouting.enabled';
	const SCOPED = `/vscode/${BARE}`;

	function readFrom(values: Record<string, string | number | boolean>): (name: string) => string | number | boolean | undefined {
		return name => values[name];
	}

	test('prefers the /vscode/ scoped value (new endpoint) over the bare value on collision', () => {
		const read = readFrom({ [BARE]: 'legacy', [SCOPED]: 'new' });
		assert.strictEqual(resolveScopedTreatment(read, BARE), 'new');
	});

	test('falls back to the bare value when only the legacy endpoint assigns it', () => {
		const read = readFrom({ [BARE]: 'legacy' });
		assert.strictEqual(resolveScopedTreatment(read, BARE), 'legacy');
	});

	test('uses the scoped value when only the new endpoint assigns it', () => {
		const read = readFrom({ [SCOPED]: 'new' });
		assert.strictEqual(resolveScopedTreatment(read, BARE), 'new');
	});

	test('returns undefined when neither endpoint assigns it', () => {
		const read = readFrom({});
		assert.strictEqual(resolveScopedTreatment(read, BARE), undefined);
	});

	test('preserves a defined falsy scoped value instead of falling back to bare', () => {
		const read = readFrom({ [BARE]: true, [SCOPED]: false });
		assert.strictEqual(resolveScopedTreatment(read, BARE), false);
	});
});

suite('resolveTreatmentWithAssignment', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('distinguishes real assignments from developer overrides, including falsy values', async () => {
		const results = [];
		for (const assignment of [undefined, false, 0, '', 'treatment']) {
			for (const override of [undefined, false, 0, '', 'override']) {
				let reads = 0;
				const result = await resolveTreatmentWithAssignment(override, async () => {
					reads++;
					return assignment;
				});
				results.push({ value: result.value, assigned: await result.hasAssignment, reads });
			}
		}
		assert.deepStrictEqual(results, [undefined, false, 0, '', 'treatment'].flatMap(assignment =>
			[undefined, false, 0, '', 'override'].map(override => ({
				value: override !== undefined ? override : assignment,
				assigned: assignment !== undefined,
				reads: 1,
			}))
		));
	});

	test('does not delay a developer override while assignment metadata loads', async () => {
		const assignment = new DeferredPromise<string | undefined>();
		const result = await resolveTreatmentWithAssignment('override', () => assignment.p);
		assert.strictEqual(result.value, 'override');
		await assignment.complete('treatment');
		assert.strictEqual(await result.hasAssignment, true);
	});

	test('does not disguise assignment errors as absence', async () => {
		const error = new Error('assignment unavailable');
		const result = await resolveTreatmentWithAssignment('override', async () => { throw error; });
		await assert.rejects(result.hasAssignment, error);
		await assert.rejects(resolveTreatmentWithAssignment(undefined, async () => { throw error; }), error);
	});
});

suite('toExperimentTelemetryData', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('marks the queried feature name trusted so a /vscode/-scoped key survives telemetry cleaning', () => {
		const scoped = '/vscode/config.chat.agentHost.copilot.multiTurnContextRouting.enabled';
		const data = toExperimentTelemetryData(new Map([['ABExp.queriedFeature', scoped]]));

		// The trusted feature name survives cleaning, whereas the same value left unmarked would be
		// redacted by the file-path heuristic - guarding against a regression back to that behavior.
		assert.strictEqual(cleanData(data, [])['ABExp.queriedFeature'], scoped);
		assert.strictEqual(cleanData({ 'ABExp.queriedFeature': scoped }, [])['ABExp.queriedFeature'], '<REDACTED: user-file-path>');
	});
});
