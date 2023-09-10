/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var tsb = require('../../../../build/lib/tsb');
var util = require('./lib/util');
var watcher = require('./lib/watch');
var assign = require('object-assign');

var compilation = tsb.create(assign({ verbose: true }, require('./tsconfig.json').compilerOptions));

gulp.task('compile', function () {
	return gulp.src('**/*.ts', { base: '.' })
		.pipe(compilation())
		.pipe(gulp.dest(''));
});

gulp.task('watch', function () {
	var src = gulp.src('**/*.ts', { base: '.' });

	return watcher('**/*.ts', { base: '.' })
		.pipe(util.incremental(compilation, src))
		.pipe(gulp.dest(''));
});

gulp.task('default', ['compile']);

function cloneArray(arr) {
	_.foo();
	var r = [];
	for (var i = 0, len = arr.length; i < len; i++) {
		r[i] = doClone(arr[i]);
	}
	return r;
}
