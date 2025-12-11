/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	StorageScope
} from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ISamplingStoredData, McpSamplingLog } from '../../common/mcpSamplingLog.js';
import { IMcpServer } from '../../common/mcpTypes.js';
import { asArray } from '../../../../../base/common/arrays.js';

suite('MCP - Sampling Log', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	const fakeServer: IMcpServer = {
		definition: { id: 'testServer' },
		readDefinitions: () => ({
			get: () => ({ collection: { scope: StorageScope.APPLICATION } }),
		}),
	} as IMcpServer;

	let log: McpSamplingLog;
	let storage: TestStorageService;
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		storage = ds.add(new TestStorageService());
		log = ds.add(new McpSamplingLog(storage));
		clock = sinon.useFakeTimers();
		clock.setSystemTime(new Date('2023-10-01T00:00:00Z').getTime());
	});

	teardown(() => {
		clock.restore();
	});

	test('logs a single request', async () => {
		log.add(
			fakeServer,
			[{ role: 'user', content: { type: 'text', text: 'test request' } }],
			'test response here',
			'foobar9000',
		);

		// storage.testEmitWillSaveState(WillSaveStateReason.NONE);
		await storage.flush();
		assert.deepStrictEqual(
			(storage.getObject('mcp.sampling.logs', StorageScope.APPLICATION) as unknown),
			[
				[
					'testServer',
					{
						head: 19631,
						bins: [1, 0, 0, 0, 0, 0, 0],
						lastReqs: [
							{
								request: [{ role: 'user', content: { type: 'text', text: 'test request' } }],
								response: 'test response here',
								at: 1696118400000,
								model: 'foobar9000',
							},
						],
					},
				],
			],
		);
	});

	test('logs multiple requests on the same day', async () => {
		// First request
		log.add(
			fakeServer,
			[{ role: 'user', content: { type: 'text', text: 'first request' } }],
			'first response',
			'foobar9000',
		);

		// Advance time by a few hours but stay on the same day
		clock.tick(5 * 60 * 60 * 1000); // 5 hours

		// Second request
		log.add(
			fakeServer,
			[{ role: 'user', content: { type: 'text', text: 'second request' } }],
			'second response',
			'foobar9000',
		);

		await storage.flush();
		const data = (storage.getObject('mcp.sampling.logs', StorageScope.APPLICATION) as [string, any][])[0][1];

		// Verify the bin for the current day has 2 requests
		assert.strictEqual(data.bins[0], 2);

		// Verify both requests are in the lastReqs array, with the most recent first
		assert.strictEqual(data.lastReqs.length, 2);
		assert.strictEqual(data.lastReqs[0].request[0].content.text, 'second request');
		assert.strictEqual(data.lastReqs[1].request[0].content.text, 'first request');
	});

	test('shifts bins when adding requests on different days', async () => {
		// First request on day 1
		log.add(
			fakeServer,
			[{ role: 'user', content: { type: 'text', text: 'day 1 request' } }],
			'day 1 response',
			'foobar9000',
		);

		// Advance time to the next day
		clock.tick(24 * 60 * 60 * 1000);

		// Second request on day 2
		log.add(
			fakeServer,
			[{ role: 'user', content: { type: 'text', text: 'day 2 request' } }],
			'day 2 response',
			'foobar9000',
		);

		await storage.flush();
		const data = (storage.getObject('mcp.sampling.logs', StorageScope.APPLICATION) as [string, ISamplingStoredData][])[0][1];

		// Verify the bins: day 2 should have 1 request, day 1 should have 1 request
		assert.strictEqual(data.bins[0], 1); // day 2
		assert.strictEqual(data.bins[1], 1); // day 1

		// Advance time by 5 more days
		clock.tick(5 * 24 * 60 * 60 * 1000);

		// Request on day 7
		log.add(
			fakeServer,
			[{ role: 'user', content: { type: 'text', text: 'day 7 request' } }],
			'day 7 response',
			'foobar9000',
		);

		await storage.flush();
		const updatedData = (storage.getObject('mcp.sampling.logs', StorageScope.APPLICATION) as [string, ISamplingStoredData][])[0][1];

		// Verify the bins have shifted correctly
		assert.strictEqual(updatedData.bins[0], 1); // day 7
		assert.strictEqual(updatedData.bins[5], 1); // day 2
		assert.strictEqual(updatedData.bins[6], 1); // day 1
	});

	test('limits the number of stored requests', async () => {
		// Add more than the maximum number of requests (Constants.SamplingLastNMessage = 30)
		for (let i = 0; i < 35; i++) {
			log.add(
				fakeServer,
				[{ role: 'user', content: { type: 'text', text: `request ${i}` } }],
				`response ${i}`,
				'foobar9000',
			);
		}

		await storage.flush();
		const data = (storage.getObject('mcp.sampling.logs', StorageScope.APPLICATION) as [string, ISamplingStoredData][])[0][1];

		// Verify only the last 30 requests are kept
		assert.strictEqual(data.lastReqs.length, 30);
		assert.strictEqual((data.lastReqs[0].request[0].content as { type: 'text'; text: string }).text, 'request 34');
		assert.strictEqual((data.lastReqs[29].request[0].content as { type: 'text'; text: string }).text, 'request 5');
	});

	test('handles different content types', async () => {
		// Add a request with text content
		log.add(
			fakeServer,
			[{ role: 'user', content: { type: 'text', text: 'text request' } }],
			'text response',
			'foobar9000',
		);

		// Add a request with image content
		log.add(
			fakeServer,
			[{
				role: 'user',
				content: {
					type: 'image',
					data: 'base64data',
					mimeType: 'image/png'
				}
			}],
			'image response',
			'foobar9000',
		);

		// Add a request with mixed content
		log.add(
			fakeServer,
			[
				{ role: 'user', content: { type: 'text', text: 'text and image' } },
				{
					role: 'assistant',
					content: {
						type: 'image',
						data: 'base64data',
						mimeType: 'image/jpeg'
					}
				}
			],
			'mixed response',
			'foobar9000',
		);

		await storage.flush();
		const data = (storage.getObject('mcp.sampling.logs', StorageScope.APPLICATION) as [string, ISamplingStoredData][])[0][1];

		// Verify all requests are stored correctly
		assert.strictEqual(data.lastReqs.length, 3);
		assert.strictEqual(data.lastReqs[0].request.length, 2); // Mixed content request has 2 messages
		assert.strictEqual(asArray(data.lastReqs[1].request[0].content)[0].type, 'image');
		assert.strictEqual(asArray(data.lastReqs[2].request[0].content)[0].type, 'text');
	});

	test('handles multiple servers', async () => {
		const fakeServer2: IMcpServer = {
			definition: { id: 'testServer2' },
			readDefinitions: () => ({
				get: () => ({ collection: { scope: StorageScope.APPLICATION } }),
			}),
		} as IMcpServer;

		log.add(
			fakeServer,
			[{ role: 'user', content: { type: 'text', text: 'server1 request' } }],
			'server1 response',
			'foobar9000',
		);

		log.add(
			fakeServer2,
			[{ role: 'user', content: { type: 'text', text: 'server2 request' } }],
			'server2 response',
			'foobar9000',
		);

		await storage.flush();
		const storageData = (storage.getObject('mcp.sampling.logs', StorageScope.APPLICATION) as [string, ISamplingStoredData][]);

		// Verify both servers have their data stored
		assert.strictEqual(storageData.length, 2);
		assert.strictEqual(storageData[0][0], 'testServer');
		assert.strictEqual(storageData[1][0], 'testServer2');
	});
});
