/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';
import { request } from '../../common/requestImpl.js';
import { streamToBuffer } from '../../../../common/buffer.js';
import { runWithFakedTimers } from '../../../../test/common/timeTravelScheduler.js';
suite('Request', () => {
    let port;
    let server;
    setup(async () => {
        const http = await import('http');
        port = await new Promise((resolvePort, rejectPort) => {
            server = http.createServer((req, res) => {
                if (req.url === '/noreply') {
                    return; // never respond
                }
                res.setHeader('Content-Type', 'application/json');
                if (req.headers['echo-header']) {
                    res.setHeader('echo-header', req.headers['echo-header']);
                }
                const data = [];
                req.on('data', chunk => data.push(chunk));
                req.on('end', () => {
                    res.end(JSON.stringify({
                        method: req.method,
                        url: req.url,
                        data: Buffer.concat(data).toString()
                    }));
                });
            }).listen(0, '127.0.0.1', () => {
                const address = server.address();
                resolvePort(address.port);
            }).on('error', err => {
                rejectPort(err);
            });
        });
    });
    teardown(async () => {
        await new Promise((resolve, reject) => {
            server.close(err => err ? reject(err) : resolve());
        });
    });
    test('GET', async () => {
        const context = await request({
            url: `http://127.0.0.1:${port}`,
            headers: {
                'echo-header': 'echo-value'
            },
            callSite: 'request.test.GET'
        }, CancellationToken.None);
        assert.strictEqual(context.res.statusCode, 200);
        assert.strictEqual(context.res.headers['content-type'], 'application/json');
        assert.strictEqual(context.res.headers['echo-header'], 'echo-value');
        const buffer = await streamToBuffer(context.stream);
        const body = JSON.parse(buffer.toString());
        assert.strictEqual(body.method, 'GET');
        assert.strictEqual(body.url, '/');
    });
    test('POST', async () => {
        const context = await request({
            type: 'POST',
            url: `http://127.0.0.1:${port}/postpath`,
            data: 'Some data',
            callSite: 'request.test.POST'
        }, CancellationToken.None);
        assert.strictEqual(context.res.statusCode, 200);
        assert.strictEqual(context.res.headers['content-type'], 'application/json');
        const buffer = await streamToBuffer(context.stream);
        const body = JSON.parse(buffer.toString());
        assert.strictEqual(body.method, 'POST');
        assert.strictEqual(body.url, '/postpath');
        assert.strictEqual(body.data, 'Some data');
    });
    test('timeout', async () => {
        return runWithFakedTimers({}, async () => {
            try {
                await request({
                    type: 'GET',
                    url: `http://127.0.0.1:${port}/noreply`,
                    timeout: 123,
                    callSite: 'request.test.timeout'
                }, CancellationToken.None);
                assert.fail('Should fail with timeout');
            }
            catch (err) {
                assert.strictEqual(err.message, 'Fetch timeout: 123ms');
            }
        });
    });
    test('cancel', async () => {
        return runWithFakedTimers({}, async () => {
            try {
                const source = new CancellationTokenSource();
                const res = request({
                    type: 'GET',
                    url: `http://127.0.0.1:${port}/noreply`,
                    callSite: 'request.test.cancel'
                }, source.token);
                await new Promise(resolve => setTimeout(resolve, 100));
                source.cancel();
                await res;
                assert.fail('Should fail with cancellation');
            }
            catch (err) {
                assert.strictEqual(err.message, 'Canceled');
            }
        });
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9wYXJ0cy9yZXF1ZXN0L3Rlc3QvZWxlY3Ryb24tbWFpbi9yZXF1ZXN0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDOUQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHcEYsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7SUFFckIsSUFBSSxJQUFZLENBQUM7SUFDakIsSUFBSSxNQUFtQixDQUFDO0lBRXhCLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRTtRQUNoQixNQUFNLElBQUksR0FBRyxNQUFNLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsQyxJQUFJLEdBQUcsTUFBTSxJQUFJLE9BQU8sQ0FBUyxDQUFDLFdBQVcsRUFBRSxVQUFVLEVBQUUsRUFBRTtZQUM1RCxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtnQkFDdkMsSUFBSSxHQUFHLENBQUMsR0FBRyxLQUFLLFVBQVUsRUFBRSxDQUFDO29CQUM1QixPQUFPLENBQUMsZ0JBQWdCO2dCQUN6QixDQUFDO2dCQUNELEdBQUcsQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFLGtCQUFrQixDQUFDLENBQUM7Z0JBQ2xE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