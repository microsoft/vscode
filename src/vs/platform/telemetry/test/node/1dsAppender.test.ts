/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITelemetryItem, ITelemetryUnloadState } from '@microsoft/1ds-core-js';
import { PostChannel } from '@microsoft/1ds-post-js';
import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { TestMeteredConnectionService } from '../../../meteredConnection/test/common/testMeteredConnectionService.js';
import { IRequestService } from '../../../request/common/request.js';
import { IAppInsightsCore } from '../../common/1dsAppender.js';
import { OneDataSystemAppender } from '../../node/1dsAppender.js';

class TestAppInsightsCore implements IAppInsightsCore {
	pluginVersionString = '';
	readonly events: ITelemetryItem[] = [];
	unloadCount = 0;

	track(item: ITelemetryItem): void {
		this.events.push(item);
	}

	unload(isAsync: boolean, unloadComplete: (unloadState: ITelemetryUnloadState) => void): void {
		this.unloadCount++;
		unloadComplete({ reason: 0, isAsync });
	}
}

class TestOneDataSystemAppender extends OneDataSystemAppender {
	readonly clientInitialized = new DeferredPromise<void>();
	transmissionController: Pick<PostChannel, 'pause' | 'resume'> | undefined;

	override setTransmissionController(transmissionController: Pick<PostChannel, 'pause' | 'resume'>): void {
		super.setTransmissionController(transmissionController);
		this.transmissionController = transmissionController;
		void this.clientInitialized.complete();
	}
}

suite('OneDataSystemAppender', () => {
	const appenders: OneDataSystemAppender[] = [];

	teardown(async () => {
		await Promise.all(appenders.splice(0).map(appender => appender.flush()));
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createAppender(isMetered: boolean, whenInitialized = Promise.resolve()) {
		const core = new TestAppInsightsCore();
		const meteredConnectionService = store.add(new TestMeteredConnectionService(isMetered, whenInitialized));
		const appender = new TestOneDataSystemAppender(undefined, false, 'test', null, () => core, meteredConnectionService);
		appenders.push(appender);
		const transmissionChanges: string[] = [];
		appender.setTransmissionController({
			pause: () => transmissionChanges.push('paused'),
			resume: () => transmissionChanges.push('resumed'),
		});
		return { core, meteredConnectionService, appender, transmissionChanges };
	}

	function createNetworkAppender(responseCodes: readonly number[] = []) {
		const requests: IRequestOptions[] = [];
		const requestService = upcastPartial<IRequestService>({
			request: async options => {
				requests.push(options);
				return {
					res: { statusCode: responseCodes[requests.length - 1] ?? 200, headers: {} },
					stream: bufferToStream(VSBuffer.fromString('')),
				};
			},
		});
		const appender = new TestOneDataSystemAppender(requestService, false, 'test', null, 'test-key');
		appenders.push(appender);
		return { appender, requests };
	}

	test('pauses until initialization, then follows metered state changes', async () => {
		const { appender, core, meteredConnectionService, transmissionChanges } = createAppender(false);
		appender.log('beforeInitialization');
		await meteredConnectionService.whenInitialized;
		appender.log('unmetered');
		meteredConnectionService.setIsConnectionMetered(true);
		appender.log('metered');
		meteredConnectionService.setIsConnectionMetered(false);
		appender.log('resumed');
		await appender.flush();

		assert.deepStrictEqual({
			transmissionChanges,
			events: core.events.map(event => event.name),
			unloadCount: core.unloadCount,
		}, {
			transmissionChanges: ['paused', 'resumed', 'paused', 'resumed'],
			events: ['test/unmetered', 'test/resumed'],
			unloadCount: 1,
		});
	});

	test('resumes after a silent unmetered initial snapshot', async () => {
		const initialized = new DeferredPromise<void>();
		const { appender, core, meteredConnectionService, transmissionChanges } = createAppender(true, initialized.p);
		appender.log('beforeInitialization');
		meteredConnectionService.isConnectionMetered = false;
		await initialized.complete();
		appender.log('afterInitialization');
		await appender.flush();

		assert.deepStrictEqual({
			transmissionChanges,
			events: core.events.map(event => event.name),
		}, {
			transmissionChanges: ['paused', 'resumed'],
			events: ['test/afterInitialization'],
		});
	});

	test('does not resume on unmetered events before initialization', async () => {
		const initialized = new DeferredPromise<void>();
		const { appender, core, meteredConnectionService, transmissionChanges } = createAppender(false, initialized.p);
		meteredConnectionService.setIsConnectionMetered(false);
		appender.log('pending');
		meteredConnectionService.isConnectionMetered = true;
		await initialized.complete();
		appender.log('metered');
		await appender.flush();

		assert.deepStrictEqual({ transmissionChanges, events: core.events, unloadCount: core.unloadCount }, {
			transmissionChanges: ['paused'],
			events: [],
			unloadCount: 0,
		});
	});

	test('does not flush or resume after shutdown before initialization', async () => {
		const initialized = new DeferredPromise<void>();
		const { appender, core, meteredConnectionService, transmissionChanges } = createAppender(false, initialized.p);
		await appender.flush();
		await initialized.complete();
		meteredConnectionService.setIsConnectionMetered(false);
		appender.log('afterShutdown');

		assert.deepStrictEqual({ transmissionChanges, events: core.events, unloadCount: core.unloadCount }, {
			transmissionChanges: ['paused'],
			events: [],
			unloadCount: 0,
		});
	});

	test('does not flush queued events on metered shutdown', async () => {
		const { appender, core, meteredConnectionService, transmissionChanges } = createAppender(false);
		await meteredConnectionService.whenInitialized;
		appender.log('queued');
		meteredConnectionService.setIsConnectionMetered(true);
		await appender.flush();
		meteredConnectionService.setIsConnectionMetered(false);

		assert.deepStrictEqual({
			transmissionChanges,
			events: core.events.map(event => event.name),
			unloadCount: core.unloadCount,
		}, {
			transmissionChanges: ['paused', 'resumed', 'paused'],
			events: ['test/queued'],
			unloadCount: 0,
		});
	});

	test('suspends real 1DS batches without sending HTTP until unmetered', async () => {
		const { appender, requests } = createNetworkAppender();
		appender.log('queued');
		await appender.clientInitialized.p;
		await Promise.resolve();
		assert(appender.transmissionController instanceof PostChannel);

		appender.setIsConnectionMetered(true);
		appender.log('metered');
		appender.transmissionController.flush(false);
		const requestsWhileMetered = requests.length;

		appender.setIsConnectionMetered(false);
		appender.log('resumed');
		await appender.flush();

		const events = requests.flatMap(request => request.data!.trim().split('\n').map(line => {
			const event: ITelemetryItem = JSON.parse(line);
			return event.name;
		}));
		assert.deepStrictEqual({ requestsWhileMetered, events }, {
			requestsWhileMetered: 0,
			events: ['test/queued', 'test/resumed'],
		});
	});

	test('applies metered state before a lazily created 1DS client can send', async () => {
		const { appender, requests } = createNetworkAppender();
		appender.log('initializing');
		appender.setIsConnectionMetered(true);
		await appender.clientInitialized.p;
		await Promise.resolve();
		assert(appender.transmissionController instanceof PostChannel);
		appender.transmissionController.flush(false);
		const requestsWhileMetered = requests.length;

		appender.setIsConnectionMetered(false);
		await appender.flush();

		assert.deepStrictEqual({ requestsWhileMetered, requestsAfterResume: requests.length }, {
			requestsWhileMetered: 0,
			requestsAfterResume: 0,
		});
	});

	test('suspends scheduled 1DS retries until unmetered', () => runWithFakedTimers({}, async () => {
		const { appender, requests } = createNetworkAppender([500, 200]);
		appender.log('retry');
		await appender.clientInitialized.p;
		await Promise.resolve();
		assert(appender.transmissionController instanceof PostChannel);
		appender.transmissionController.flush(true);
		await timeout(1);
		const requestsBeforeMetered = requests.length;

		appender.setIsConnectionMetered(true);
		await timeout(10000);
		const requestsWhileMetered = requests.length;

		appender.setIsConnectionMetered(false);
		await appender.flush();
		assert.deepStrictEqual({ requestsBeforeMetered, requestsWhileMetered, requestsAfterResume: requests.length }, {
			requestsBeforeMetered: 1,
			requestsWhileMetered: 1,
			requestsAfterResume: 2,
		});
	}));
});
