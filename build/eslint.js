/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const es = require('event-stream');
const { readFileSync } = require('fs');
const { join } = require('path');
const vfs = require('vinyl-fs');

function eslint() {

	const eslintIgnore = readFileSync(join(__dirname, '../.eslintignore'))
		.toString().split(/\r\n|\n/)
		.filter(line => !line.startsWith('#'))
		.map(line => `!${line}`);

	const gulpeslint = require('gulp-eslint');
	return vfs
		.src(['**/*.js', '**/*.ts', ...eslintIgnore], { base: '.', follow: true, allowEmpty: true })
		.pipe(
			gulpeslint({
				configFile: '.eslintrc.json',
				rulePaths: ['./build/lib/eslint'],
			})
		)
		.pipe(gulpeslint.formatEach('compact'))
		.pipe(
			gulpeslint.results((results) => {
				if (results.warningCount > 0 || results.errorCount > 0) {
					throw new Error('eslint failed with warnings and/or errors');
				}
			})
		).pipe(es.through(function () { /* noop, important for the stream to end */ }));
}

if (require.main === module) {
	eslint().on('error', (err) => {
		console.error();
		console.error(err);
		process.exit(1);
	});
}
