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

	test('preserves many-to-many associations and repeated steering without merging independent turns', () => {
		const telemetry = new TestDataTelemetryService();
		const correlation = new TurnInteractionCorrelation('sdk', telemetry);
		correlation.startTurn('root');
		correlation.record('root', 'interaction-1', 'userMessage');
		correlation.record('root', 'interaction-1', 'assistantTurnStart');
		correlation.steer('steering-1', 'root', 'root');
		correlation.record('steering-1', 'interaction-1', 'userMessage');
		correlation.steer('steering-2', 'steering-1', 'root');
		correlation.record('steering-2', 'interaction-1', 'userMessage');
		correlation.record('steering-2', 'interaction-2', 'modelCall');
		correlation.startTurn('independent');
		correlation.record('independent', 'interaction-1', 'userMessage');

		assert.deepStrictEqual(telemetry.events.map(event => ({ name: event.name, ...event.data })), [
			{ name: 'agentHost.turnInteractionCorrelated', sdkSessionId: 'sdk', turnId: 'root', interactionId: 'interaction-1', originalTurnId: 'root', evidence: 'userMessage' },
			{ name: 'agentHost.turnSteered', sdkSessionId: 'sdk', turnId: 'steering-1', previousTurnId: 'root', originalTurnId: 'root' },
			{ name: 'agentHost.turnInteractionCorrelated', sdkSessionId: 'sdk', turnId: 'steering-1', interactionId: 'interaction-1', originalTurnId: 'root', evidence: 'userMessage' },
			{ name: 'agentHost.turnSteered', sdkSessionId: 'sdk', turnId: 'steering-2', previousTurnId: 'steering-1', originalTurnId: 'root' },
			{ name: 'agentHost.turnInteractionCorrelated', sdkSessionId: 'sdk', turnId: 'steering-2', interactionId: 'interaction-1', originalTurnId: 'root', evidence: 'userMessage' },
			{ name: 'agentHost.turnInteractionCorrelated', sdkSessionId: 'sdk', turnId: 'steering-2', interactionId: 'interaction-2', originalTurnId: 'root', evidence: 'modelCall' },
			{ name: 'agentHost.turnInteractionCorrelated', sdkSessionId: 'sdk', turnId: 'independent', interactionId: 'interaction-1', originalTurnId: 'independent', evidence: 'userMessage' },
		]);
	});

	test('retains delayed evidence without guessing a child origin and bounds history', () => {
		const telemetry = new TestDataTelemetryService();
		const correlation = new TurnInteractionCorrelation('sdk', telemetry, 2);
		correlation.startTurn('old');
		correlation.startTurn('new');
		correlation.record('old', 'old-interaction', 'modelCall');
		correlation.record('child', 'old-interaction', 'modelCall');
		correlation.startTurn('newest');
		correlation.record('old', 'another-interaction', 'modelCall');
		correlation.record('new', 'evicted-interaction', 'modelCall');
		correlation.clear();
		correlation.record('new', 'new-interaction', 'modelCall');

		assert.deepStrictEqual(telemetry.events.map(event => ({
			turn: event.data.turnId, original: event.data.originalTurnId,
		})), [
			{ turn: 'old', original: 'old' },
			{ turn: 'child', original: undefined },
			{ turn: 'old', original: 'old' },
			{ turn: 'new', original: undefined },
			{ turn: 'new', original: undefined },
		]);
	});

	test('refines an idle-race association only after the steering echo proves its origin', () => {
		const telemetry = new TestDataTelemetryService();
		const correlation = new TurnInteractionCorrelation('sdk', telemetry);
		correlation.startTurn('successor');
		correlation.deferTurnOrigin('successor');
		correlation.record('successor', 'interaction', 'assistantTurnStart');
		correlation.steer('successor', 'previous', 'original');
		correlation.record('successor', 'interaction', 'userMessage');
		assert.deepStrictEqual(telemetry.events.filter(event => event.name === 'agentHost.turnInteractionCorrelated').map(event => event.data.originalTurnId), [undefined, 'original']);
	});
});
