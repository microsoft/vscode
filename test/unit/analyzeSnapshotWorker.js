/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

import * as fs from 'fs';

const workerData = process.env.SNAPSHOT_WORKER_DATA;

if (!workerData) {
	throw new Error(`worker data is required`)
}

const { path, classes } = JSON.parse(workerData);
const { decode_bytes } = await import('@vscode/v8-heap-parser');

fs.promises.readFile(path)
	.then(buf => decode_bytes(buf))
	.then(graph => graph.get_class_counts(classes))
	.then(
		counts => process.send({ counts: Array.from(counts) }),
		err => process.send({ err: String(err.stack || err) })
	);
