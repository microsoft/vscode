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

var root = path.dirname(__dirname);
var commit = util.getVersion(root);

// Build

var editorEntryPoints = _.flatten([
	buildfile.entrypoint('vs/editor/editor.main'),
	buildfile.base,
	buildfile.standaloneLanguages,
	buildfile.standaloneLanguages2,
	buildfile.editor,
	buildfile.languages
]);

var editorResources = [
	'out-build/vs/{base,editor}/**/*.{svg,png}',
	'out-build/vs/base/worker/workerMainCompatibility.html',
	'out-build/vs/base/worker/workerMain.{js,js.map}',
	'out-build/vs/languages/typescript/common/lib/lib.{d.ts,es6.d.ts}',
	'!out-build/vs/workbench/**',
	'!**/test/**'
];

var editorOtherSources = [
	'out-build/vs/css.js',
	'out-build/vs/nls.js',
	'out-build/vs/text.js',
	'out-build/vs/editor/css/*.css'
];

var BUNDLED_FILE_HEADER = [
	'/*!-----------------------------------------------------------',
	' * Copyright (C) Microsoft Corporation. All rights reserved.',
	' * Version: ' + commit,
	' * Released under the MIT license',
	' * https://github.com/Microsoft/vscode/blob/master/LICENSE.txt',
	' *-----------------------------------------------------------*/',
	''
].join('\n');

function editorLoaderConfig(removeAllOSS) {
	var result = common.loaderConfig();

	// never ship marked in editor
	result.paths['vs/base/common/marked/marked'] = 'out-build/vs/base/common/marked/marked.mock';

	if (removeAllOSS) {
		result.paths['vs/languages/lib/common/beautify-html'] = 'out-build/vs/languages/lib/common/beautify-html.mock';
	}

	return result;
}

gulp.task('clean-optimized-editor', util.rimraf('out-editor'));
gulp.task('optimize-editor', ['clean-optimized-editor', 'compile-build'], common.optimizeTask({
	entryPoints: editorEntryPoints,
	otherSources: editorOtherSources,
	resources: editorResources,
	loaderConfig: editorLoaderConfig(false),
	header: BUNDLED_FILE_HEADER,
	out: 'out-editor'
}));

gulp.task('clean-minified-editor', util.rimraf('out-editor-min'));
gulp.task('minify-editor', ['clean-minified-editor', 'optimize-editor'], common.minifyTask('out-editor', true));

// Package

var root = path.dirname(__dirname);

function copyTask(src, dest, FILTER) {
	return function () {
		return (
			gulp.src(src + '/**', { base: src })
			.pipe(FILTER ? filter(FILTER) : es.through())
			.pipe(gulp.dest(dest))
		);
	};
}

var DISTRO_DEV_FOLDER_PATH = path.join(path.dirname(root), 'Monaco-Editor');
gulp.task('clean-editor-distro-dev', util.rimraf(DISTRO_DEV_FOLDER_PATH));
gulp.task('editor-distro-dev', ['clean-editor-distro-dev', 'optimize-editor'], copyTask('out-editor', DISTRO_DEV_FOLDER_PATH));

var DISTRO_MIN_FOLDER_PATH = path.join(path.dirname(root), 'Monaco-Editor-Min');
gulp.task('clean-editor-distro-min', util.rimraf(DISTRO_MIN_FOLDER_PATH));
gulp.task('editor-distro-min', ['clean-editor-distro-min', 'minify-editor'], copyTask('out-editor-min', DISTRO_MIN_FOLDER_PATH, ['**', '!**/*.js.map', '!nls.metadata.json']));

var DISTRO_MIN_SOURCEMAPS_FOLDER_PATH = path.join(path.dirname(root), 'Monaco-Editor-Min-SourceMaps');
gulp.task('clean-editor-distro-min-sourcemaps', util.rimraf(DISTRO_MIN_SOURCEMAPS_FOLDER_PATH));
gulp.task('editor-distro-min-sourcemaps', ['clean-editor-distro-min-sourcemaps', 'minify-editor'], copyTask('out-editor-min', DISTRO_MIN_SOURCEMAPS_FOLDER_PATH, ['**/*.js.map']));

gulp.task('editor-distro', ['editor-distro-min', 'editor-distro-min-sourcemaps', 'editor-distro-dev']);
