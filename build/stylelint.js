/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const es = require('event-stream');
const vfs = require('vinyl-fs');
const { stylelintFilter } = require('./filters');
const { getVariableNameValidator } = require('./lib/stylelint/validateVariableNames');

module.exports = gulpstylelint;

/** use regex on lines */
function gulpstylelint(reporter) {
	const variableValidator = getVariableNameValidator();
	return es.through(function (file) {
		const lines = file.__lines || file.contents.toString('utf8').split(/\r\n|\r|\n/);
		file.__lines = lines;

		lines.forEach((line, i) => {
			variableValidator(line, unknownVariable => {
				reporter(file.relative + '(' + (i + 1) + ',1): Unknown variable: ' + unknownVariable);
			});
		});

		this.emit('data', file);
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
