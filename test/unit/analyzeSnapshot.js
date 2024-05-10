/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

// note: we use a fork here since we can't make a worker from the renderer process




import { fork } from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const takeSnapshotAndCountClasses = async (/** @type string */currentTest, /** @type string[] */ classes) => {
	const cleanTitle = currentTest.replace(/[^\w]+/g, '-');
	const file = join(tmpdir(), `vscode-test-snap-${cleanTitle}.heapsnapshot`);

	if (typeof process.takeHeapSnapshot !== 'function') {
		// node.js:
		const inspector = require('inspector');
		const session = new inspector.Session();
		session.connect();

		const fd = fs.openSync(file, 'w');
		await new Promise((resolve, reject) => {
			session.on('HeapProfiler.addHeapSnapshotChunk', (m) => {
				fs.writeSync(fd, m.params.chunk);
			});

			session.post('HeapProfiler.takeHeapSnapshot', null, (err) => {
				session.disconnect();
				fs.closeSync(fd);
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	} else {
		// electron exposes this nice method for us:
		process.takeHeapSnapshot(file);
	}

	const workerPath = join(__dirname, 'analyzeSnapshotWorker.js')
	const worker = fork(workerPath, {
		env: {
			...process.env,
			SNAPSHOT_WORKER_DATA: JSON.stringify({
				path: file,
				classes,
			})
		}
	});

	const promise = new Promise((resolve, reject) => {
		worker.on('message', (/** @type any */msg) => {
			if ('err' in msg) {
				reject(new Error(msg.err));
			} else {
				resolve(msg.counts);
			}
			worker.kill();
		});
	});

	return { done: promise, file: pathToFileURL(file) };
};
