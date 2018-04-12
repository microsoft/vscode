/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Client } from 'vs/base/parts/ipc/node/ipc.cp';
import uri from 'vs/base/common/uri';
import { always } from 'vs/base/common/async';
import { ITestChannel, TestServiceClient, ITestService } from './testService';

function createClient(): Client {
	return new Client(uri.parse(require.toUrl('bootstrap')).fsPath, {
		serverName: 'TestServer',
		env: { AMD_ENTRYPOINT: 'vs/base/parts/ipc/test/node/testApp', verbose: true }
	});
}

// Rename to ipc.perf.test.ts and run with ./scripts/test.sh --grep IPC.performance --timeout 60000
suite('IPC performance', () => {

	test('increasing batch size', () => {
		const client = createClient();
		const channel = client.getChannel<ITestChannel>('test');
		const service = new TestServiceClient(channel);

		const runs = [
			{ batches: 250000, size: 1 },
			{ batches: 2500, size: 100 },
			{ batches: 500, size: 500 },
			{ batches: 250, size: 1000 },
			{ batches: 50, size: 5000 },
			{ batches: 25, size: 10000 },
			// { batches: 10, size: 25000 },
			// { batches: 5, size: 50000 },
			// { batches: 1, size: 250000 },
		];
		const dataSizes = [
			100,
			250,
		];
		let i = 0, j = 0;
		const result = measure(service, 10, 10, 250) // warm-up
			.then(() => {
				return (function nextRun() {
					if (i >= runs.length) {
						if (++j >= dataSizes.length) {
							return;
						}
						i = 0;
					}
					const run = runs[i++];
					return measure(service, run.batches, run.size, dataSizes[j])
						.then(() => {
							return nextRun();
						});
				})();
			});

		return always(result, () => client.dispose());
	});

	test('increasing raw data size', () => {
		const client = createClient();
		const channel = client.getChannel<ITestChannel>('test');
		const service = new TestServiceClient(channel);

		const runs = [
			{ batches: 250000, dataSize: 100 },
			{ batches: 25000, dataSize: 1000 },
			{ batches: 2500, dataSize: 10000 },
			{ batches: 1250, dataSize: 20000 },
			{ batches: 500, dataSize: 50000 },
			{ batches: 250, dataSize: 100000 },
			{ batches: 125, dataSize: 200000 },
			{ batches: 50, dataSize: 500000 },
			{ batches: 25, dataSize: 1000000 },
		];
		let i = 0;
		const result = measure(service, 10, 10, 250) // warm-up
			.then(() => {
				return (function nextRun() {
					if (i >= runs.length) {
						return;
					}
					const run = runs[i++];
					return measure(service, run.batches, 1, run.dataSize)
						.then(() => {
							return nextRun();
						});
				})();
			});

		return always(result, () => client.dispose());
	});

	function measure(service: ITestService, batches: number, size: number, dataSize: number) {
		const start = Date.now();
		let hits = 0;
		let count = 0;
		return service.batchPerf(batches, size, dataSize)
			.then(() => {
				console.log(`Batches: ${batches}, size: ${size}, dataSize: ${dataSize}, n: ${batches * size * dataSize}, duration: ${Date.now() - start}`);
				assert.strictEqual(hits, batches);
				assert.strictEqual(count, batches * size);
			}, err => assert.fail(err),
				batch => {
					hits++;
					count += batch.length;
				});
	}
});