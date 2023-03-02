/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const es = require('event-stream');
const path = require('path');
const vfs = require('vinyl-fs');
const { stylelintFilter } = require('./filters');

function stylelint() {
	const gulpStylelint = require('gulp-stylelint');
	return vfs
		.src(stylelintFilter, { base: '.', follow: true, allowEmpty: true })
		.pipe(
			gulpStylelint({
				configFile: path.join(__dirname, '../.stylelintrc.json'),
				failAfterError: true,
				reporters: [
					{ formatter: 'verbose', console: true },
					{ formatter: 'json', save: 'report.json' },
				],
			})
			// )
			// .pipe(
			// 	gulpStylelint.results((results) => {
			// 		if (results.warningCount > 0 || results.errorCount > 0) {
			// 			throw new Error('stylelint failed with warnings and/or errors');
			// 		}
			// 	})
		).pipe(es.through(function () { /* noop, important for the stream to end */ }));
}

if (require.main === module) {
	stylelint().on('error', (err) => {
		console.error();
		console.error(err);
		process.exit(1);
	});
}
