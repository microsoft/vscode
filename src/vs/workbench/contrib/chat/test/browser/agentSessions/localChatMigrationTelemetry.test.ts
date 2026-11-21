/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { getLocalChatMigrationTarget, LocalChatMigrationTelemetry } from '../../../browser/agentSessions/agentHost/localChatMigrationTelemetry.js';

suite('LocalChatMigrationTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports that an attempt started, then only its first outcome', () => {
		const events: { name: string; data: Record<string, unknown> }[] = [];
		const telemetryService = upcastPartial<ITelemetryService>({ publicLog2: (name: string, data?: object) => { events.push({ name, data: data as Record<string, unknown> }); } });
		const migration = new LocalChatMigrationTelemetry(telemetryService, {
			entryPoint: 'continueIn', trigger: 'manual', policyRequired: false, kind: 'migrate', target: 'agent-host-copilotcli', location: 'panel', turns: 3,
		});
		migration.failed('openFailed');
		migration.succeeded();
		migration.cancelled();

		assert.deepStrictEqual(events.map(({ name, data: { durationMs, ...data } }) => ({ name, ...data, timed: typeof durationMs === 'number' && durationMs >= 0 })), [
			{ name: 'chat.localChatMigration', entryPoint: 'continueIn', trigger: 'manual', policyRequired: false, kind: 'migrate', target: 'agent-host-copilotcli', location: 'panel', turns: 3, outcome: 'started', failureReason: 'none', timed: true },
			{ name: 'chat.localChatMigration', entryPoint: 'continueIn', trigger: 'manual', policyRequired: false, kind: 'migrate', target: 'agent-host-copilotcli', location: 'panel', turns: 3, outcome: 'failed', failureReason: 'openFailed', timed: true },
		]);
	});

	test('reports built-in targets by session type and other agent hosts only by category, never by address', () => {
		assert.deepStrictEqual(['agent-host-copilotcli', 'agent-host-claude', 'agent-host-codex', 'cloud-sandbox-task', 'remote-myhost.example.com__8080-copilotcli', 'agent-host-future'].map(getLocalChatMigrationTarget), [
			'agent-host-copilotcli', 'agent-host-claude', 'agent-host-codex', 'cloud-sandbox-task', 'remoteAgentHost', 'otherAgentHost',
		]);
	});
});
