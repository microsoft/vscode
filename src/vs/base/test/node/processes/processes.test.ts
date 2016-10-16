/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as cp from 'child_process';
import * as objects from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';
import processes = require('vs/base/node/processes');

function fork(id: string): cp.ChildProcess {
	const opts: any = {
		env: objects.mixin(objects.clone(process.env), {
			AMD_ENTRYPOINT: id,
			PIPE_LOGGING: 'true',
			VERBOSE_LOGGING: true
		})
	};

	return cp.fork(URI.parse(require.toUrl('bootstrap')).fsPath, ['--type=processTests'], opts);
}

suite('Processes', () => {
	test('buffered sending - simple data', function (done: () => void) {
		const child = fork('vs/base/test/node/processes/fixtures/fork');
		const sender = processes.createQueuedSender(child);

		const msg = 'Hello Child';
		child.on('message', msgFromChild => {
			if (msgFromChild === 'ready') {
				sender.send(msg);
			} else {
				assert.equal(msgFromChild, msg);

				child.kill();
				done();
			}
		});
	});

	test('buffered sending - lots of data (potential deadlock on win32)', function (done: () => void) {
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