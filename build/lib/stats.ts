/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as es from 'event-stream';
import * as util from 'gulp-util';
import * as File from 'vinyl';

class Entry {
	constructor(readonly name: string, public totalCount: number, public totalSize: number) { }

	toString(): string {
		return `${this.name}: ${this.totalCount} files with ${this.totalSize} bytes`;
	}
}

const _entries = new Map<string, Entry>();

export function createStatsStream(group: string, log?: boolean): es.ThroughStream {

	const entry = new Entry(group, 0, 0);
	_entries.set(entry.name, entry);

	return es.through(function (data) {
		let file = data as File;
		if (typeof file.path === 'string') {
			entry.totalCount += 1;
			if (Buffer.isBuffer(file.contents)) {
				entry.totalSize += file.contents.length;
			} else if (file.stat && typeof file.stat.size === 'number') {
				entry.totalSize += file.stat.size;
			} else {
				// funky file...
			}
		}
		this.emit('data', data);
	}, function () {
		if (log) {
			if (entry.totalCount === 1) {
				util.log(`Stats for '${util.colors.grey(entry.name)}': ${Math.round(entry.totalSize / 1204)}KB`);

			} else {
				let count = entry.totalCount < 100
					? util.colors.green(entry.totalCount.toString())
					: util.colors.red(entry.totalCount.toString());

				util.log(`Stats for '${util.colors.grey(entry.name)}': ${count} files, ${Math.round(entry.totalSize / 1204)}KB`);
			}
		}

		this.emit('end');
	});
}
