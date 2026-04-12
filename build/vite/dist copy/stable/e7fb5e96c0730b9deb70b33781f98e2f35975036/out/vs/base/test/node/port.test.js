/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as net from 'net';
import * as ports from '../../node/ports.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { flakySuite } from './testUtils.js';
flakySuite('Ports', () => {
    (process.env['VSCODE_PID'] ? test.skip /* this test fails when run from within VS Code */ : test)('Finds a free port (no timeout)', function (done) {
        // get an initial freeport >= 7000
        ports.findFreePort(7000, 100, 300000).then(initialPort => {
            assert.ok(initialPort >= 7000);
            // create a server to block this port
            const server = net.createServer();
            server.listen(initialPort, undefined, undefined, () => {
                // once listening, find another free port and assert that the port is different from the opened one
                ports.findFreePort(7000, 50, 300000).then(freePort => {
                    assert.ok(freePort >= 7000 && freePort !== initialPort);
                    server.close();
                    done();
                }, err => done(err));
            });
        }, err => done(err));
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9ydC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L25vZGUvcG9ydC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssR0FBRyxNQUFNLEtBQUssQ0FBQztBQUMzQixPQUFPLEtBQUssS0FBSyxNQUFNLHFCQUFxQixDQUFDO0FBQzdDLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzdFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUU1QyxVQUFVLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtJQUN4QixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsa0RBQWtELENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLGdDQUFnQyxFQUFFLFVBQVUsSUFBSTtRQUVqSixrQ0FBa0M7UUFDbEMsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRTtZQUN4RCxNQUFNLENBQUMsRUFBRSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsQ0FBQztZQUUvQixxQ0FBcUM7WUFDckMsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2xDLE1BQU0sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFO2dCQUVyRCxtR0FBbUc7Z0JBQ25HLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUU7b0JBQ3BELE1BQU0sQ0FBQyxFQUFFLENBQUMsUUFBUSxJQUFJLElBQUksSUFBSSxRQUFRLEtBQUssV0FBVyxDQUFDLENBQUM7b0JBQ3hELE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFFZixJQUFJLEVBQUUsQ0FBQztnQkFDUixDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN0QixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3RCLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztBQUMzQyxDQUFDLENBQUMsQ0FBQyJ9