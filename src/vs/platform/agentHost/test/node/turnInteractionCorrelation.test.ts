/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestDataTelemetryService } from '../../../telemetry/test/common/testTelemetryService.js';
import { TurnInteractionCorrelation } from '../../node/copilot/turnInteractionCorrelation.js';

suite('TurnInteractionCorrelation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('enriches snapshots across repeated steering without emitting mapping events', () => {
		const telemetry = new TestDataTelemetryService();
		const correlation = new TurnInteractionCorrelation('sdk', telemetry);
		correlation.startTurn('root');
		correlation.record('root', 'i1');
		correlation.prepareSteering('b', correlation.getSteeringContext('root'));
		correlation.resolveSteering('b', 'i1', 'steering');
		correlation.record('b', 'i1');
		correlation.prepareSteering('c', correlation.getSteeringContext('b'));
		correlation.resolveSteering('c', 'i1', 'steering');
		correlation.record('c', 'i1');
		correlation.record('c', 'i2');
		correlation.startTurn('next');
		correlation.record('next', 'i1');
		assert.deepStrictEqual({
			originals: ['root', 'b', 'c', 'next'].map(turn => correlation.get(turn)?.originalTurnId),
			interactions: correlation.get('c')?.interactionIds,
			events: telemetry.events.map(event => [event.name, event.data.steeredFromTurn, event.data.originalTurnId, event.data.attributionStatus]),
		}, {
			originals: ['root', 'root', 'root', 'next'],
			interactions: ['i1', 'i2'],
			events: [['agentHost.turnSteered', 'root', 'root', 'confirmed'], ['agentHost.turnSteered', 'b', 'root', 'confirmed']],
		});
	});

	test('distinguishes runtime new requests, mismatched steering and missing evidence', () => {
		const telemetry = new TestDataTelemetryService();
		const correlation = new TurnInteractionCorrelation('sdk', telemetry);
		correlation.startTurn('root');
		correlation.record('root', 'i1');
		for (const [turn, interaction, delivery] of [
			['new', 'i2', 'idle'], ['queued', 'i2', 'queued'], ['mismatch', 'i2', 'steering'], ['missing', 'i1', undefined],
		] as const) {
			correlation.prepareSteering(turn, correlation.getSteeringContext('root'));
			correlation.resolveSteering(turn, interaction, delivery);
		}
		assert.deepStrictEqual(telemetry.events.map(event => [event.data.turnId, event.data.originalTurnId, event.data.attributionStatus]), [
			['new', 'new', 'newRequest'], ['queued', 'queued', 'newRequest'], ['mismatch', undefined, 'interactionMismatch'], ['missing', undefined, 'unknown'],
		]);
	});

	test('bounds history and interaction lists while keeping snapshots immutable and child origins unknown', () => {
		const correlation = new TurnInteractionCorrelation('sdk', new TestDataTelemetryService(), 2, 2);
		correlation.startTurn('old');
		correlation.record('old', 'a');
		const snapshot = correlation.get('old');
		correlation.record('old', 'b');
		correlation.record('old', 'b');
		correlation.record('old', 'c');
		const capped = correlation.get('old');
		correlation.record('child', 'a');
		const child = correlation.get('child');
		correlation.startTurn('new');
		assert.deepStrictEqual({
			snapshot, capped: capped?.interactionIds, truncated: capped?.interactionIdsTruncated,
			childOriginal: child?.originalTurnId, evicted: correlation.get('old'),
		}, {
			snapshot: { sdkSessionId: 'sdk', originalTurnId: 'old', interactionIds: ['a'], interactionIdsTruncated: false },
			capped: ['a', 'b'], truncated: true, childOriginal: undefined, evicted: undefined,
		});

		correlation.clear();
		assert.strictEqual(correlation.get('new'), undefined);
	});

	test('pending delivery is unknown until echo confirmation even without predecessor context', () => {
		const correlation = new TurnInteractionCorrelation('sdk', new TestDataTelemetryService());
		correlation.prepareSteering('pending', undefined);
		const before = correlation.get('pending');
		correlation.resolveSteering('pending', 'new-interaction', 'idle');
		const after = correlation.get('pending');
		assert.deepStrictEqual({
			before: [before?.steeringDelivery, before?.originalTurnId],
			after: [after?.steeringDelivery, after?.originalTurnId],
		}, { before: ['unknown', undefined], after: ['idle', 'pending'] });
	});
});
