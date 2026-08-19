/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TelemetryConfiguration, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { telemetryLevelToAgentHostValue } from '../../common/agentHostTelemetry.js';

suite('AgentHostTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('telemetryLevelToAgentHostValue always produces a launch argument', () => {
		assert.deepStrictEqual([
			telemetryLevelToAgentHostValue(TelemetryLevel.USAGE),
			telemetryLevelToAgentHostValue(TelemetryLevel.ERROR),
			telemetryLevelToAgentHostValue(TelemetryLevel.CRASH),
			telemetryLevelToAgentHostValue(TelemetryLevel.NONE),
			telemetryLevelToAgentHostValue(undefined),
		], [
			TelemetryConfiguration.ON,
			TelemetryConfiguration.ERROR,
			TelemetryConfiguration.CRASH,
			TelemetryConfiguration.OFF,
			TelemetryConfiguration.OFF,
		]);
	});
});
