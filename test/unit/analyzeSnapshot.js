/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

// note: we use a fork here since we can't make a worker from the renderer process

const { fork } = require('child_process');
const workerData = process.env.SNAPSHOT_WORKER_DATA;
const fs = require('fs');
const { pathToFileURL } = require('url');

if (!workerData) {
	const { join } = require('path');
	const { tmpdir } = require('os');

	exports.takeSnapshotAndCountClasses = async (/** @type string */currentTest, /** @type string[] */ classes) => {
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

		const worker = fork(__filename, {
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
} else {
	const { path, classes } = JSON.parse(workerData);
	const { decode_bytes } = require('@vscode/v8-heap-parser');

	fs.promises.readFile(path)
		.then(buf => decode_bytes(buf))
		.then(graph => graph.get_class_counts(classes))
		.then(
			counts => process.send({ counts: Array.from(counts) }),
			err => process.send({ err: String(err.stack || err) })
		);

}
