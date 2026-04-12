/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { McpSamplingLog } from '../../common/mcpSamplingLog.js';
import { asArray } from '../../../../../base/common/arrays.js';
suite('MCP - Sampling Log', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    const fakeServer = {
        definition: { id: 'testServer' },
        readDefinitions: () => ({
            get: () => ({ collection: { scope: -1 /* StorageScope.APPLICATION */ } }),
        }),
    };
    let log;
    let storage;
    let clock;
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
        log.add(fakeServer, [{ role: 'user', content: { type: 'text', text: 'test request' } }], 'test response here', 'foobar9000');
        // storage.testEmitWillSaveState(WillSaveStateReason.NONE);
        await storage.flush();
        assert.deepStrictEqual(storage.getObject('mcp.sampling.logs', -1 /* StorageScope.APPLICATION */), [
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
        ]);
    });
    test('logs multiple requests on the same day', async () => {
        // First request
        log.add(fakeServer, [{ role: 'user', content: { type: 'text', text: 'first request' } }], 'first response', 'foobar9000');
        // Advance time by a few hours but stay on the same day
        clock.tick(5 * 60 * 60 * 1000); // 5 hours
        // Second request
        log.add(fakeServer, [{ role: 'user', content: { type: 'text', text: 'second request' } }], 'second response', 'foobar9000');
        await storage.flush();
        const data = storage.getObject('mcp.sampling.logs', -1 /* StorageScope.APPLICATION */)[0][1];
        // Verify the bin for the current day has 2 requests
        assert.strictEqual(data.bins[0], 2);
        // Verify both requests are in the lastReqs array, with the most recent first
        assert.strictEqual(data.lastReqs.length, 2);
        assert.strictEqual(data.lastReqs[0].request[0].content.text, 'second request');
        assert.strictEqual(data.lastReqs[1].request[0].content.text, 'first request');
    });
    test('shifts bins when adding requests on different days', async () => {
        // First request on day 1
        log.add(fakeServer, [{ role: 'user', content: { type: 'text', text: 'day 1 request' } }], 'day 1 response', 'foobar9000');
        // Advance time to the next day
        clock.tick(24 * 60 * 60 * 1000);
        // Second request on day 2
        log.add(fakeServer, [{ role: 'user', content: { type: 'text', text: 'day 2 request' } }], 'day 2 response', 'foobar9000');
        await storage.flush();
        const data = storage.getObject('mcp.sampling.logs', -1 /* StorageScope.APPLICATION */)[0][1];
        // Verify the bins: day 2 should have 1 request, day 1 should have 1 request
        assert.strictEqual(data.bins[0], 1); // day 2
        assert.strictEqual(data.bins[1], 1); // day 1
        // Advance time by 5 more days
        clock.tick(5 * 24 * 60 * 60 * 1000);
        // Request on day 7
        log.add(fakeServer, [{ role: 'user', content: { type: 'text', text: 'day 7 request' } }], 'day 7 response', 'foobar9000');
        await storage.flush();
        const updatedData = storage.getObject('mcp.sampling.logs', -1 /* StorageScope.APPLICATION */)[0][1];
        // Verify the bins have shifted correctly
        assert.strictEqual(updatedData.bins[0], 1); // day 7
        assert.strictEqual(updatedData.bins[5], 1); // day 2
        assert.strictEqual(updatedData.bins[6], 1); // day 1
    });
    test('limits the number of stored requests', async () => {
        // Add more than the maximum number of requests (Constants.SamplingLastNMessage = 30)
        for (let i = 0; i < 35; i++) {
            log.add(fakeServer, [{ role: 'user', content: { type: 'text', text: `request ${i}` } }], `response ${i}`, 'foobar9000');
        }
        await storage.flush();
        const data = storage.getObject('mcp.sampling.logs', -1 /* StorageScope.APPLICATION */)[0][1];
        // Verify only the last 30 requests are kept
        assert.strictEqual(data.lastReqs.length, 30);
        assert.strictEqual(data.lastReqs[0].request[0].content.text, 'request 34');
        assert.strictEqual(data.lastReqs[29].request[0].content.text, 'request 5');
    });
    test('handles different content types', async () => {
        // Add a request with text content
        log.add(fakeServer, [{ role: 'user', content: { type: 'text', text: 'text request' } }], 'text response', 'foobar9000');
        // Add a request with image content
        log.add(fakeServer, [{
                role: 'user',
                content: {
                    type: 'image',
                    data: 'base64data',
                    mimeType: 'image/png'
                }
            }], 'image response', 'foobar9000');
        // Add a request with mixed content
        log.add(fakeServer, [
            { role: 'user', content: { type: 'text', text: 'text and image' } },
            {
                role: 'assistant',
                content: {
                    type: 'image',
                    data: 'base64data',
                    mimeType: 'image/jpeg'
                }
            }
        ], 'mixed response', 'foobar9000');
        await storage.flush();
        const data = storage.getObject('mcp.sampling.logs', -1 /* StorageScope.APPLICATION */)[0][1];
        // Verify all requests are stored correctly
        assert.strictEqual(data.lastReqs.length, 3);
        assert.strictEqual(data.lastReqs[0].request.length, 2); // Mixed content request has 2 messages
        assert.strictEqual(asArray(data.lastReqs[1].request[0].content)[0].type, 'image');
        assert.strictEqual(asArray(data.lastReqs[2].request[0].content)[0].type, 'text');
    });
    test('handles multiple servers', async () => {
        const fakeServer2 = {
            definition: { id: 'testServer2' },
            readDefinitions: () => ({
                get: () => ({ collection: { scope: -1 /* StorageScope.APPLICATION */ } }),
            }),
        };
        log.add(fakeServer, [{ role: 'user', content: { type: 'text', text: 'server1 request' } }], 'server1 response', 'foobar9000');
        log.add(fakeServer2, [{ role: 'user', content: { type: 'text', text: 'server2 request' } }], 'server2 response', 'foobar9000');
        await storage.flush();
        const storageData = storage.getObject('mcp.sampling.logs', -1 /* StorageScope.APPLICATION */);
        // Verify both servers have their data stored
        assert.strictEqual(storageData.length, 2);
        assert.strictEqual(storageData[0][0], 'testServer');
        assert.strictEqual(storageData[1][0], 'testServer2');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2FtcGxpbmdMb2cudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC90ZXN0L2NvbW1vbi9tY3BTYW1wbGluZ0xvZy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBSW5HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3RGLE9BQU8sRUFBdUIsY0FBYyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRS9ELEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7SUFDaEMsTUFBTSxFQUFFLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUNyRCxNQUFNLFVBQVUsR0FBZTtRQUM5QixVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFO1FBQ2hDLGVBQWUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZCLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsS0FBSyxtQ0FBMEIsRUFBRSxFQUFFLENBQUM7U0FDaEUsQ0FBQztLQUNZLENBQUM7SUFFaEIsSUFBSSxHQUFtQixDQUFDO0lBQ3hCLElBQUksT0FBMkIsQ0FBQztJQUNoQyxJQUFJLEtBQTRCLENBQUM7SUFFakMsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLE9BQU8sR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1FBQzNDLEdB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