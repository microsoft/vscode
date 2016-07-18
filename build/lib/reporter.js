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
	util.log(`Starting ${ util.colors.green('compilation') }...`);
}

function onEnd() {
	if (--count > 0) {
		return ;
	}

	const errors = _.flatten(allErrors);
	errors.map(err => util.log(`${ util.colors.red('Error') }: ${ err }`));

	util.log(`Finished ${ util.colors.green('compilation') } with ${ errors.length } errors after ${ util.colors.magenta((new Date().getTime() - startTime) + ' ms') }`);
}

module.exports = () => {
	const errors = [];
	allErrors.push(errors);

	const result = err => errors.push(err);
	result.hasErrors = () => errors.length > 0;

	result.end = emitError => {
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

	return result;
};