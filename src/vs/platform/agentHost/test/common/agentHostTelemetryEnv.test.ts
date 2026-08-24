/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostDevDeviceIdEnvKey, AgentHostMachineIdEnvKey, AgentHostSqmIdEnvKey, buildAgentHostTelemetryIdEnv } from '../../common/agentHostTelemetryEnv.js';

suite('agentHostTelemetryEnv', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('buildAgentHostTelemetryIdEnv forwards present ids and omits empty ones', () => {
		assert.deepStrictEqual([
			buildAgentHostTelemetryIdEnv({ machineId: 'm1', sqmId: 's1', devDeviceId: 'd1' }),
			buildAgentHostTelemetryIdEnv({ machineId: 'm1', sqmId: '', devDeviceId: 'd1' }),
			buildAgentHostTelemetryIdEnv({ machineId: '', sqmId: '', devDeviceId: '' }),
		], [
			{ [AgentHostMachineIdEnvKey]: 'm1', [AgentHostSqmIdEnvKey]: 's1', [AgentHostDevDeviceIdEnvKey]: 'd1' },
			{ [AgentHostMachineIdEnvKey]: 'm1', [AgentHostDevDeviceIdEnvKey]: 'd1' },
			{},
		]);
	});
});
