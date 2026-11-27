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

function fork(id: string): cp.ChildProcess {
	const opts: any = {
		env: objects.mixin(objects.deepClone(process.env), {
			VSCODE_ESM_ENTRYPOINT: id,
			VSCODE_PIPE_LOGGING: 'true',
			VSCODE_VERBOSE_LOGGING: true
		})
	};

	return cp.fork(FileAccess.asFileUri('bootstrap-fork').fsPath, ['--type=processTests'], opts);
}

suite('Processes', () => {
	test('buffered sending - simple data', function (done: () => void) {
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
			} else {
				counter++;

				if (counter === 1) {
					assert.strictEqual(msgFromChild, msg1);
				} else if (counter === 2) {
					assert.strictEqual(msgFromChild, msg2);
				} else if (counter === 3) {
					assert.strictEqual(msgFromChild, msg3);

					child.kill();
					done();
				}
			}
		});
	});

	test('console forwarding - shared references are not reported as circular', function (done: (err?: unknown) => void) {
		if (process.env['VSCODE_PID']) {
			return done(); // this test fails when run from within VS Code
		}

		const child = fork('vs/base/test/node/processes/fixtures/fork_console');

		child.on('message', msgFromChild => {
			const msg = msgFromChild as { type?: string; arguments?: string };
			if (msg.type !== '__$console') {
				return;
			}

			child.kill();

			try {
				assert.deepStrictEqual(JSON.parse(msg.arguments!), [
					{ value: 1 },
					{ a: { value: 1 }, b: { value: 1 } },
					{ name: 'circular', self: '[Circular]' }
				]);
				done();
			} catch (error) {
				done(error);
			}
		});
	});

	(!platform.isWindows || process.env['VSCODE_PID'] ? test.skip : test)('buffered sending - lots of data (potential deadlock on win32)', function (done: () => void) { // test is only relevant for Windows and seems to crash randomly on some Linux builds
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
			} else if (msgFromChild === 'done') {
				child.kill();
				done();
			}
		});
	});
});
