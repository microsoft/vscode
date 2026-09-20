/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Client } from '../../../../base/parts/ipc/node/ipc.cp.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { NullLoggerService } from '../../../log/common/log.js';
import { TestMeteredConnectionService } from '../../../meteredConnection/test/common/testMeteredConnectionService.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryEndpoint } from '../../common/telemetry.js';
import { NullTelemetryService } from '../../common/telemetryUtils.js';
import { CustomEndpointTelemetryService } from '../../node/customEndpointTelemetryService.js';

class TestTelemetryClient extends Client {
	readonly messages: { command: string; arg: unknown }[] = [];
	running = false;

	constructor(readonly args: string[]) {
		super('', { serverName: 'Test Telemetry' });
	}

	override get isConnected(): boolean {
		return this.running;
	}

	protected override async requestPromise<T>(_channelName: string, command: string, arg?: unknown): Promise<T> {
		this.running = true;
		this.messages.push({ command, arg });
		return undefined!;
	}
}

class TestCustomEndpointTelemetryService extends CustomEndpointTelemetryService {
	readonly clients: TestTelemetryClient[] = [];

	protected override createTelemetryClient(args: string[]): TestTelemetryClient {
		const client = new TestTelemetryClient(args);
		this.clients.push(client);
		return client;
	}
}

suite('CustomEndpointTelemetryService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const endpoint: ITelemetryEndpoint = { id: 'test', aiKey: 'test-key', sendErrorTelemetry: true };

	function createService(isMetered: boolean, whenInitialized = Promise.resolve(), telemetryLevel = 'all') {
		const meteredConnectionService = store.add(new TestMeteredConnectionService(isMetered, whenInitialized));
		const configurationService = new TestConfigurationService({ telemetry: { telemetryLevel } });
		const loggerService = store.add(new NullLoggerService());
		const productService: IProductService = { _serviceBrand: undefined, ...product };
		const service = store.add(new TestCustomEndpointTelemetryService(
			configurationService, NullTelemetryService, loggerService,
			upcastPartial<IEnvironmentService>({ isBuilt: false }), productService, meteredConnectionService,
		));
		return { service, meteredConnectionService };
	}

	test('does not create a telemetry child while metered', async () => {
		const { service } = createService(true);
		await service.publicLog(endpoint, 'usage');
		await service.publicLogError(endpoint, 'error');
		assert.deepStrictEqual(service.clients, []);
	});

	test('waits for the initial state and resumes after a silent unmetered snapshot', async () => {
		const initialized = new DeferredPromise<void>();
		const { service, meteredConnectionService } = createService(true, initialized.p);
		const logged = service.publicLog(endpoint, 'startup');
		const clientsBeforeInitialization = service.clients.length;
		meteredConnectionService.isConnectionMetered = false;
		await initialized.complete();
		await logged;

		assert.deepStrictEqual({
			clientsBeforeInitialization,
			initialMeteredArgument: service.clients[0].args[3],
			messages: service.clients[0].messages,
		}, {
			clientsBeforeInitialization: 0,
			initialMeteredArgument: 'false',
			messages: [{ command: 'log', arg: { eventName: 'startup', data: {} } }],
		});
	});

	test('forwards state to a running child and drops metered events', async () => {
		const { service, meteredConnectionService } = createService(false);
		await service.publicLog(endpoint, 'before');
		meteredConnectionService.setIsConnectionMetered(true);
		await service.publicLog(endpoint, 'meteredUsage');
		await service.publicLogError(endpoint, 'meteredError');
		meteredConnectionService.setIsConnectionMetered(false);
		await service.publicLogError(endpoint, 'after');

		assert.deepStrictEqual(service.clients[0].messages, [
			{ command: 'log', arg: { eventName: 'before', data: {} } },
			{ command: 'setIsConnectionMetered', arg: true },
			{ command: 'setIsConnectionMetered', arg: false },
			{ command: 'log', arg: { eventName: 'after', data: { isError: true } } },
		]);
	});

	test('does not restart an idle child to forward connection state', async () => {
		const { service, meteredConnectionService } = createService(false);
		await service.publicLog(endpoint, 'beforeIdle');
		const client = service.clients[0];
		client.running = false;
		meteredConnectionService.setIsConnectionMetered(true);
		meteredConnectionService.setIsConnectionMetered(false);
		const runningAfterStateChange = client.running;
		await service.publicLog(endpoint, 'afterIdle');

		assert.deepStrictEqual({ runningAfterStateChange, messages: client.messages }, {
			runningAfterStateChange: false,
			messages: [
				{ command: 'log', arg: { eventName: 'beforeIdle', data: {} } },
				{ command: 'log', arg: { eventName: 'afterIdle', data: {} } },
			],
		});
	});

	test('does not start a child when telemetry is disabled', async () => {
		const { service, meteredConnectionService } = createService(false, Promise.resolve(), 'off');
		await service.publicLog(endpoint, 'disabled');
		meteredConnectionService.setIsConnectionMetered(true);
		assert.deepStrictEqual(service.clients.map(client => ({ running: client.running, messages: client.messages })), [
			{ running: false, messages: [] },
		]);
	});

	test('does not initialize or resume telemetry after disposal', async () => {
		const initialized = new DeferredPromise<void>();
		const { service, meteredConnectionService } = createService(false, initialized.p);
		const logged = service.publicLog(endpoint, 'pending');
		service.dispose();
		await initialized.complete();
		await logged;
		meteredConnectionService.setIsConnectionMetered(false);
		assert.deepStrictEqual(service.clients, []);
	});
});
