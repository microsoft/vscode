/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { notebookSerializationWorkerData } from './common';
import { workerData, parentPort } from 'node:worker_threads';

function sortObjectPropertiesRecursively(obj: any): any {
	if (Array.isArray(obj)) {
		return obj.map(sortObjectPropertiesRecursively);
	}
	if (obj !== undefined && obj !== null && typeof obj === 'object' && Object.keys(obj).length > 0) {
		return (
			Object.keys(obj)
				.sort()
				.reduce<Record<string, any>>((sortedObj, prop) => {
					sortedObj[prop] = sortObjectPropertiesRecursively(obj[prop]);
					return sortedObj;
				}, {}) as any
		);
	}
	return obj;
}

if (parentPort) {
	const { notebookContent, indentAmount } = <notebookSerializationWorkerData>workerData;
	const json = JSON.stringify(sortObjectPropertiesRecursively(notebookContent), undefined, indentAmount) + '\n';
	parentPort.postMessage(json);
}
