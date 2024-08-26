/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { notebookSerializationWorkerData } from './common';

const { workerData, parentPort } = require('worker_threads');

if (parentPort) {
	const { notebookContent, indentAmount } = <notebookSerializationWorkerData>workerData;
	const json = JSON.stringify(notebookContent, undefined, indentAmount) + '\n';
	parentPort.postMessage(json);
}
