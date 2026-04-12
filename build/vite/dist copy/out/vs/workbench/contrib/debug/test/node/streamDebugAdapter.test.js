/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as crypto from 'crypto';
import * as net from 'net';
import * as platform from '../../../../../base/common/platform.js';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import * as ports from '../../../../../base/node/ports.js';
import { SocketDebugAdapter, NamedPipeDebugAdapter } from '../../node/debugAdapter.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
function sendInitializeRequest(debugAdapter) {
    return new Promise((resolve, reject) => {
        debugAdapter.sendRequest('initialize', { adapterID: 'test' }, (result) => {
            resolve(result);
        }, 3000);
    });
}
function serverConnection(socket) {
    socket.on('data', (data) => {
        const str = data.toString().split('\r\n')[2];
        const request = JSON.parse(str);
        const response = {
            seq: request.seq,
            request_seq: request.seq,
            type: 'response',
            command: request.command
        };
        if (request.arguments.adapterID === 'test') {
            response.success = true;
        }
        else {
            response.success = false;
            response.message = 'failed';
        }
        const responsePayload = JSON.stringify(response);
        socket.write(`Content-Length: ${responsePayload.length}\r\n\r\n${responsePayload}`);
    });
}
suite('Debug - StreamDebugAdapter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test(`StreamDebugAdapter (NamedPipeDebugAdapter) can initialize a connection`, async () => {
        const pipeName = crypto.randomBytes(10).toString('hex');
        const pipePath = platform.isWindows ? join('\\\\.\\pipe\\', pipeName) : join(tmpdir(), pipeName);
        const server = await new Promise((resolve, reject) => {
            const server = net.createServer(serverConnection);
            server.once('listening', () => resolve(server));
            server.once('error', reject);
            server.listen(pipePath);
        });
        const debugAdapter = new NamedPipeDebugAdapter({
            type: 'pipeServer',
            path: pipePath
        });
        try {
            await debugAdapter.startSession();
            const response = await sendInitializeRequest(debugAdapter);
            assert.strictEqual(response.command, 'initialize');
            assert.strictEqual(response.request_seq, 1);
            assert.strictEqual(response.success, true, response.message);
        }
        finally {
            await debugAdapter.stopSession();
            server.close();
            debugAdapter.dispose();
        }
    });
    test(`StreamDebugAdapter (SocketDebugAdapter) can initialize a connection`, async () => {
        const rndPort = Math.floor(Math.random() * 1000 + 8000);
        const port = await ports.findFreePort(rndPort, 10 /* try 10 ports */, 3000 /* try up to 3 seconds */, 87 /* skip 87 ports between attempts */);
        const server = net.createServer(serverConnection).listen(port);
        const debugAdapter = new SocketDebugAdapter({
            type: 'server',
            port
        });
        try {
            await debugAdapter.startSession();
            const response = await sendInitializeRequest(debugAdapter);
            assert.strictEqual(response.command, 'initialize');
            assert.strictEqual(response.request_seq, 1);
            assert.strictEqual(response.success, true, response.message);
        }
        finally {
            await debugAdapter.stopSession();
            server.close();
            debugAdapter.dispose();
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtRGVidWdBZGFwdGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy90ZXN0L25vZGUvc3RyZWFtRGVidWdBZGFwdGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sS0FBSyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQzNCLE9BQU8sS0FBSyxRQUFRLE1BQU0sd0NBQXdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUM1QixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxLQUFLLEtBQUssTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUscUJBQXFCLEVBQXNCLE1BQU0sNEJBQTRCLENBQUM7QUFDM0csT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHbkcsU0FBUyxxQkFBcUIsQ0FBQyxZQUFnQztJQUM5RCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ3RDLFlBQVksQ0FBQyxXQUFXLENBQUMsWUFBWSxFQUFFLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDeEUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pCLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNWLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsTUFBa0I7SUFDM0MsTUFBTSxDQUFDLEVBQUUsQ0FB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