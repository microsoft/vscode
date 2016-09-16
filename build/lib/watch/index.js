/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const es = require('event-stream');

/** Ugly hack for gulp-tsb */
function handleDeletions() {
	return es.mapSync(f => {
		if (/\.ts$/.test(f.relative) && !f.contents) {
			f.contents = new Buffer('');
			f.stat = { mtime: new Date() };
		}

		return f;
	});
}

const watch = process.platform === 'win32'
	? require('./watch-win32')
	: require('gulp-watch');

module.exports = function () {
	return watch.apply(null, arguments)
		.pipe(handleDeletions());
};
