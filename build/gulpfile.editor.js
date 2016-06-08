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
var es = require('event-stream');

var root = path.dirname(__dirname);
var sha1 = util.getVersion(root);
var semver = require('./monaco/package.json').version;
var headerVersion = semver + '(' + sha1 + ')';

// Build

var editorEntryPoints = _.flatten([
	buildfile.entrypoint('vs/editor/editor.main'),
	buildfile.base,
	buildfile.standaloneLanguages2,
	buildfile.editor,
	buildfile.languages
]);

var editorResources = [
	'out-build/vs/{base,editor}/**/*.{svg,png}',
	'!out-build/vs/base/browser/ui/splitview/**/*',
	'!out-build/vs/base/browser/ui/toolbar/**/*',
	'!out-build/vs/base/browser/ui/octiconLabel/**/*',
	'out-build/vs/base/worker/workerMainCompatibility.html',
	'out-build/vs/base/worker/workerMain.{js,js.map}',
	'!out-build/vs/workbench/**',
	'!**/test/**'
];

var editorOtherSources = [
	'out-build/vs/css.js',
	'out-build/vs/nls.js'
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

	result['vs/css'] = { inlineResources: true };

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

gulp.task('clean-editor-distro', util.rimraf('out-monaco-editor-core'));
gulp.task('editor-distro', ['clean-editor-distro', 'minify-editor', 'optimize-editor'], function() {
	return es.merge(
		// other assets
		es.merge(
			gulp.src('build/monaco/LICENSE'),
			gulp.src('build/monaco/ThirdPartyNotices.txt'),
			gulp.src('src/vs/monaco.d.ts')
		).pipe(gulp.dest('out-monaco-editor-core')),

		// package.json
		gulp.src('build/monaco/package.json')
			.pipe(es.through(function(data) {
				var json = JSON.parse(data.contents.toString());
				json.private = false;
				data.contents = new Buffer(JSON.stringify(json, null, '  '));
				this.emit('data', data);
			}))
			.pipe(gulp.dest('out-monaco-editor-core')),

		// dev folder
		es.merge(
			gulp.src('out-editor/**/*')
		).pipe(gulp.dest('out-monaco-editor-core/dev')),

		// min folder
		es.merge(
			gulp.src('out-editor-min/**/*')
		).pipe(filterStream(function(path) {
			// no map files
			return !/\.js\.map$|nls\.metadata\.json/.test(path);
		})).pipe(es.through(function(data) {
			// tweak the sourceMappingURL
			if (!/\.js$/.test(data.path)) {
				this.emit('data', data);
				return;
			}

			var relativePathToMap = path.relative(path.join(data.relative), path.join('min-maps', data.relative + '.map'));

			var strContents = data.contents.toString();
			var newStr = '//# sourceMappingURL=' + relativePathToMap.replace(/\\/g, '/');
			strContents = strContents.replace(/\/\/\# sourceMappingURL=[^ ]+$/, newStr);

			data.contents = new Buffer(strContents);
			this.emit('data', data);
		})).pipe(gulp.dest('out-monaco-editor-core/min')),

		// min-maps folder
		es.merge(
			gulp.src('out-editor-min/**/*')
		).pipe(filterStream(function(path) {
			// no map files
			return /\.js\.map$/.test(path);
		})).pipe(gulp.dest('out-monaco-editor-core/min-maps'))
	);
});

function filterStream(testFunc) {
	return es.through(function(data) {
		if (!testFunc(data.relative)) {
			return;
		}
		this.emit('data', data);
	});
}
