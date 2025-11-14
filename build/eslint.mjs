/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import eventStream from 'event-stream';
import { src } from 'vinyl-fs';
import { eslintFilter } from './filters.js';
import gulpEslint from './gulp-eslint.js';

function eslint() {
	return src(eslintFilter, { base: '.', follow: true, allowEmpty: true })
		.pipe(
			gulpEslint((results) => {
				if (results.warningCount > 0 || results.errorCount > 0) {
					throw new Error(`eslint failed with ${results.warningCount + results.errorCount} warnings and/or errors`);
				}
			})
		).pipe(eventStream.through(function () { /* noop, important for the stream to end */ }));
}

const normalizeScriptPath = (/** @type {string} */ p) => p.replace(/\.(js|ts)$/, '');
if (normalizeScriptPath(import.meta.filename) === normalizeScriptPath(process.argv[1])) {
	eslint().on('error', (err) => {
		console.error();
		console.error(err);
		process.exit(1);
	});
}
