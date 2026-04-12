/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as cp from 'child_process';
import { FileAccess } from '../../../common/network.js';
import * as objects from '../../../common/objects.js';
import * as platform from '../../../common/platform.js';
import * as processes from '../../../node/processes.js';
function fork(id) {
    const opts = {
        env: objects.mixin(objects.deepClone(process.env), {
            VSCODE_ESM_ENTRYPOINT: id,
            VSCODE_PIPE_LOGGING: 'true',
            VSCODE_VERBOSE_LOGGING: true
        })
    };
    return cp.fork(FileAccess.asFileUri('bootstrap-fork').fsPath, ['--type=processTests'], opts);
}
suite('Processes', () => {
    test('buffered sending - simple data', function (done) {
        if (process.env['VSCODE_PID']) {
            return done(); // this test fails when run from within VS Code
        }
        const child = fork('vs/base/test/node/processes/fixtures/fork');
        const sender = processes.createQueuedSender(child);
        let counter = 0;
        const msg1 = 'Hello One';
        const msg2 = 'Hello Two';
        const msg3 = 'Hello Three';
        child.on('message', msgFromChild => {
            if (msgFromChild === 'ready') {
                sender.send(msg1);
                sender.send(msg2);
                sender.send(msg3);
            }
            else {
                counter++;
                if (counter === 1) {
                    assert.strictEqual(msgFromChild, msg1);
                }
                else if (counter === 2) {
                    assert.strictEqual(msgFromChild, msg2);
                }
                else if (counter === 3) {
                    assert.strictEqual(msgFromChild, msg3);
                    child.kill();
                    done();
                }
            }
        });
    });
    (!platform.isWindows || process.env['VSCODE_PID'] ? test.skip : test)('buffered sending - lots of data (potential deadlock on win32)', function (done) {
        const child = fork('vs/base/test/node/processes/fixtures/fork_large');
        const sender = processes.createQueuedSender(child);
        const largeObj = Object.create(null);
        for (let i = 0; i < 10000; i++) {
            largeObj[i] = 'some data';
        }
        const msg = JSON.stringify(largeObj);
        child.on('message', msgFromChild => {
            if (msgFromChild === 'ready') {
                sender.send(msg);
                sender.send(msg);
                sender.send(msg);
            }
            else if (msgFromChild === 'done') {
                child.kill();
                done();
            }
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc2VzLmludGVncmF0aW9uVGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9ub2RlL3Byb2Nlc3Nlcy9wcm9jZXNzZXMuaW50ZWdyYXRpb25UZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNwQyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDeEQsT0FBTyxLQUFLLE9BQU8sTUFBTSw0QkFBNEIsQ0FBQztBQUN0RCxPQUFPLEtBQUssUUFBUSxNQUFNLDZCQUE2QixDQUFDO0FBQ3hELE9BQU8sS0FBSyxTQUFTLE1BQU0sNEJBQTRCLENBQUM7QUFFeEQsU0FBUyxJQUFJLENBQUMsRUFBVTtJQUN2QixNQUFNLElBQUksR0FBUTtRQUNqQixHQUFHLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUNsRCxxQkFBcUIsRUFBRSxFQUFFO1lBQ3pCLG1CQUFtQixFQUFFLE1BQU07WUFDM0Isc0JBQXNCLEVBQUUsSUFBSTtTQUM1QixDQUFDO0tBQ0YsQ0FBQztJQUVGLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMscUJBQXFCLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUM5RixDQUFDO0FBRUQsS0FBSyxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUU7SUFDdkIsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLFVBQVUsSUFBZ0I7UUFDaEUsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFF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