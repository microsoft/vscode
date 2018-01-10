/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function doBenchmark<T>(id: string, ts: T[], fn: (t: T) => void) {
	let columns: string[] = [id];
	for (let i = 0; i < ts.length; i++) {
		var start = process.hrtime();
		fn(ts[i]);
		var diff = process.hrtime(start);
		columns.push(`${(diff[0] * 1000 + diff[1] / 1000000).toFixed(3)} ms`);
	}
	console.log('|' + columns.join('\t|') + '|');
}