/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const es = require('event-stream');
const vfs = require('vinyl-fs');
const { stylelintFilter } = require('./filters');
const { getVariableNameValidator } = require('./lib/stylelint/validateVariableNames');

module.exports = gulpstylelint;

/** use a stylelint plugin */
function gulpstylelint(reporter) {
	const lint = require('gulp-stylelint');
	return lint({
		reporters: [
			{ formatter: 'string', console: true }
		]
	});
}

function stylelint() {
	return vfs
		.src(stylelintFilter, { base: '.', follow: true, allowEmpty: true })
		.pipe(gulpstylelint(error => {
			console.error(error);
		}))
		.pipe(es.through(function () { /* noop, important for the stream to end */ }));
}

if (require.main === module) {
	stylelint().on('error', (err) => {
		console.error();
		console.error(err);
		process.exit(1);
	});
}
