/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const es = require('event-stream');
const _ = require('underscore');
const util = require('gulp-util');

const allErrors = [];
let startTime = null;
let count = 0;

function onStart() {
	if (count++ > 0) {
		return;
	}

	startTime = new Date().getTime();
	util.log(util.colors.green('Starting compilation'));
}

function onEnd() {
	if (--count > 0) {
		return ;
	}

	var errors = _.flatten(allErrors);
	errors.map(err => util.log(`${ util.colors.red('Error') }: ${ err }`));

	util.log(`${ util.colors.green('Finished compilation') } with ${ util.colors.red(errors.length + ' errors') } in ${ util.colors.blue((new Date().getTime() - startTime) + 'ms') }.`);
}

module.exports = function () {
	var errors = [];
	allErrors.push(errors);

	var result = function (err) {
		errors.push(err);
	};

	result.end = function (emitError) {
		errors.length = 0;
		onStart();
		return es.through(null, function () {
			onEnd();

			if (emitError && errors.length > 0) {
				this.emit('error', 'Errors occurred.');
			} else {
				this.emit('end');
			}
		});
	};

	result.hasErrors = function() {
		return errors.length > 0;
	}

	return result;
};