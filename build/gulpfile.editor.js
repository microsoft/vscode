/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var path = require('path');
var _ = require('underscore');
var buildfile = require('../src/buildfile');
var util = require('./lib/util');
var common = require('./gulpfile.common');

var root = path.dirname(__dirname);
var headerVersion = process.env['BUILD_SOURCEVERSION'] || util.getVersion(root);

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
	'out-build/vs/text.js'
];

var BUNDLED_FILE_HEADER = [
	'/*!-----------------------------------------------------------',
	' * Copyright (c) Microsoft Corporation. All rights reserved.',
	' * Version: ' + headerVersion,
	' * Released under the MIT license',
	' * https://github.com/Microsoft/vscode/blob/master/LICENSE.txt',
	' *-----------------------------------------------------------*/',
	''
].join('\n');

function editorLoaderConfig(removeAllOSS) {
	var result = common.loaderConfig();

	// never ship marked in editor
	result.paths['vs/base/common/marked/marked'] = 'out-build/vs/base/common/marked/marked.mock';
	// never ship octicons in editor
	result.paths['vs/base/browser/ui/octiconLabel/octiconLabel'] = 'out-build/vs/base/browser/ui/octiconLabel/octiconLabel.mock';

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
gulp.task('editor-distro', ['minify-editor', 'optimize-editor']);
