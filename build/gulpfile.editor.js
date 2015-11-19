/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var path = require('path');
var rename = require('gulp-rename');
var filter = require('gulp-filter');
var _ = require('underscore');
var es = require('event-stream');
var buildfile = require('../src/buildfile');
var util = require('./lib/util');
var common = require('./gulpfile.common');

// Build

var editorEntryPoints = _.flatten([
	buildfile.entrypoint('vs/editor/editor.main'),
	buildfile.base,
	buildfile.standaloneLanguages,
	buildfile.editor,
	buildfile.languages
]);

var editorResources = [
	'out-build/vs/css.js',
	'out-build/vs/nls.js',
	'out-build/vs/text.js',
	'out-build/vs/{base,editor}/**/*.{svg,png}',
	'out-build/vs/editor/css/*.css',
	'out-build/vs/base/worker/workerMainCompatibility.html',
	'out-build/vs/base/worker/workerMain.{js,js.map}',
	'out-build/vs/languages/typescript/common/lib/lib.{d.ts,es6.d.ts}',
	'!out-build/vs/workbench/**',
	'!**/test/**'
];

function editorLoaderConfig(removeAllOSS) {
	var result = common.loaderConfig();

	// never ship marked in editor
	result.paths['vs/languages/markdown/common/marked'] = 'out-build/vs/languages/markdown/common/marked.mock';

	if (removeAllOSS) {
		result.paths['vs/languages/lib/common/beautify-html'] = 'out-build/vs/languages/lib/common/beautify-html.mock';
	}

	return result;
}

gulp.task('clean-optimized-editor', util.rimraf('out-editor'));
gulp.task('optimize-editor', ['clean-optimized-editor', 'compile-build'], common.optimizeTask(
	editorEntryPoints,
	editorResources,
	editorLoaderConfig(false),
	'out-editor'
));

gulp.task('clean-minified-editor', util.rimraf('out-editor-min'));
gulp.task('minify-editor', ['clean-minified-editor', 'optimize-editor'], common.minifyTask('out-editor'));

// OSS Free
gulp.task('clean-optimized-editor-ossfree', util.rimraf('out-editor-ossfree'));
gulp.task('optimize-editor-ossfree', ['clean-optimized-editor-ossfree', 'compile-build'], common.optimizeTask(
	editorEntryPoints,
	editorResources,
	editorLoaderConfig(true),
	'out-editor-ossfree'
));

gulp.task('clean-minified-editor-ossfree', util.rimraf('out-editor-ossfree-min'));
gulp.task('minify-editor-ossfree', ['clean-minified-editor-ossfree', 'optimize-editor-ossfree'], common.minifyTask('out-editor-ossfree'));

// Package

var root = path.dirname(__dirname);

function editorTask(out, dest) {
	return function () {
		return gulp.src(out + '/**', { base: out })
			.pipe(filter(['**', '!**/*.js.map', '!**/bundles.json']))
			.pipe(gulp.dest(dest));
	};
}

gulp.task('clean-editor', util.rimraf(path.join(path.dirname(root), 'Monaco-Editor-Build')));
gulp.task('editor', ['clean-editor', 'optimize-editor'],
	editorTask('out-editor', path.join(path.dirname(root), 'Monaco-Editor-Build')));

gulp.task('clean-editor-min', util.rimraf(path.join(path.dirname(root), 'Monaco-Editor-Build-Min')));
gulp.task('editor-min', ['clean-editor-min', 'minify-editor'],
	editorTask('out-editor-min', path.join(path.dirname(root), 'Monaco-Editor-Build-Min')));

gulp.task('clean-editor-ossfree', util.rimraf(path.join(path.dirname(root), 'Monaco-Editor-Build-OSS-Free')));
gulp.task('editor-ossfree', ['clean-editor-ossfree', 'optimize-editor-ossfree'],
	editorTask('out-editor-ossfree', path.join(path.dirname(root), 'Monaco-Editor-Build-OSS-Free')));

gulp.task('clean-editor-ossfree-min', util.rimraf(path.join(path.dirname(root), 'Monaco-Editor-Build-OSS-Free-Min')));
gulp.task('editor-ossfree-min', ['clean-editor-ossfree-min', 'minify-editor-ossfree'],
	editorTask('out-editor-ossfree-min', path.join(path.dirname(root), 'Monaco-Editor-Build-OSS-Free-Min')));
