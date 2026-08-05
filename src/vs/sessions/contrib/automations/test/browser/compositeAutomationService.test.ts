/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { InitializeResult } from '../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { CompositeAutomationService } from '../../browser/compositeAutomationService.js';
import { TestAutomationStorageService } from './automationTestUtils.js';

suite('CompositeAutomationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not create a legacy fallback while host capabilities are pending', async () => {
		const connection = new TestConnection(undefined);
		const storage = disposables.add(new InMemoryStorageService());
		const service = disposables.add(new CompositeAutomationService(
			storage,
			new NullLogService(),
			NullTelemetryService,
			new TestAutomationStorageService(storage),
			new TestConnectionsService(connection),
		));

		await assert.rejects(service.createAutomation(createOptions()), /has not reported its capabilities/);
		assert.deepStrictEqual(service.automations.get(), []);
	});

	test('uses the legacy backend only after the host reports automation unsupported', async () => {
		const connection = new TestConnection({
			protocolVersion: '0.8.0',
			serverSeq: 0,
			snapshots: [],
		});
		const storage = disposables.add(new InMemoryStorageService());
		const service = disposables.add(new CompositeAutomationService(
			storage,
			new NullLogService(),
			NullTelemetryService,
			new TestAutomationStorageService(storage),
			new TestConnectionsService(connection),
		));
		await timeout(0);

		const automation = await service.createAutomation(createOptions());
		assert.deepStrictEqual({
			name: automation.name,
			host: automation.host,
			count: service.automations.get().length,
		}, {
			name: 'Test',
			host: undefined,
			count: 1,
		});
	});
});

class TestConnection extends NullAgentHostService {
	override readonly initializeResult = observableValue<InitializeResult | undefined>(this, undefined);

	constructor(result: InitializeResult | undefined) {
		super();
		this.initializeResult.set(result, undefined);
	}
}

class TestConnectionsService implements IAgentHostConnectionsService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeConnections = Event.None;
	readonly connections;
	readonly ambientConnection;

	constructor(connection: TestConnection) {
		this.ambientConnection = connection;
		this.connections = [{
			authority: AMBIENT_AGENT_HOST_AUTHORITY,
			address: undefined,
			name: 'Local',
			isAmbient: true,
			connection,
		}];
	}

	getConnectionByAuthority(authority: string) {
		return authority === AMBIENT_AGENT_HOST_AUTHORITY ? this.ambientConnection : undefined;
	}

	getConnectionByAddress() {
		return undefined;
	}

	resolveSessionResource() {
		return undefined;
	}
}

function createOptions() {
	return {
		name: 'Test',
		prompt: 'Run tests',
		schedule: { interval: 'manual' as const, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
		target: { kind: 'quickChat' as const, providerId: 'local-agent-host', sessionTypeId: 'copilot' },
	};
}
