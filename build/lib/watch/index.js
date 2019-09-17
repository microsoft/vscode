/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const es = require('event-stream');


let watch = undefined;

if (!watch) {
	watch = process.platform === 'win32' ? require('./watch-win32') : require('gulp-watch');
}

module.exports = function () {
	return watch.apply(null, arguments);
};
