/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toAgentHostTelemetryHarness } from '../../common/agentHostTelemetry.js';

suite('agentHostTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes the Copilot harness and preserves other harnesses', () => {
		assert.deepStrictEqual([
			toAgentHostTelemetryHarness('copilotcli'),
			toAgentHostTelemetryHarness('copilot'),
			toAgentHostTelemetryHarness('claude'),
			toAgentHostTelemetryHarness('codex'),
			toAgentHostTelemetryHarness('custom'),
		], [
			'copilot',
			'copilot',
			'claude',
			'codex',
			'custom',
		]);
	});
});
