/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { LocalChatMigrationTelemetry } from '../../../browser/agentSessions/agentHost/localChatMigrationTelemetry.js';

suite('LocalChatMigrationTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports that an attempt started, then only its first outcome', () => {
		const events: { name: string; data: Record<string, unknown> }[] = [];
		const telemetryService = upcastPartial<ITelemetryService>({ publicLog2: (name: string, data?: object) => { events.push({ name, data: data as Record<string, unknown> }); } });
		const migration = new LocalChatMigrationTelemetry(telemetryService, {
			entryPoint: 'continueIn', trigger: 'manual', policyRequired: false, kind: 'migrate', target: 'agent-host-copilot', location: 'panel', turns: 3,
		});
		migration.failed('openFailed');
		migration.succeeded();
		migration.cancelled();

		assert.deepStrictEqual(events.map(({ name, data: { durationMs, ...data } }) => ({ name, ...data, timed: typeof durationMs === 'number' && durationMs >= 0 })), [
			{ name: 'chat.localChatMigration', entryPoint: 'continueIn', trigger: 'manual', policyRequired: false, kind: 'migrate', target: 'agent-host-copilot', location: 'panel', turns: 3, outcome: 'started', failureReason: 'none', timed: true },
			{ name: 'chat.localChatMigration', entryPoint: 'continueIn', trigger: 'manual', policyRequired: false, kind: 'migrate', target: 'agent-host-copilot', location: 'panel', turns: 3, outcome: 'failed', failureReason: 'openFailed', timed: true },
		]);
	});
});
