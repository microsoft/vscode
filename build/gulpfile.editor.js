/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var path = require('path');
var util = require('./lib/util');
var common = require('./lib/optimize');
var es = require('event-stream');
var File = require('vinyl');

var root = path.dirname(__dirname);
var sha1 = util.getVersion(root);
var semver = require('./monaco/package.json').version;
var headerVersion = semver + '(' + sha1 + ')';

// Build

var editorEntryPoints = [
	{
		name: 'vs/editor/editor.main',
		include: [],
		exclude: [],
		prepend: [ 'vs/css.js', 'vs/nls.js' ],
	},
	{
		name: 'vs/base/common/worker/simpleWorker',
		include: [ 'vs/editor/common/services/editorSimpleWorker' ],
		prepend: [ 'vs/loader.js' ],
		append: [ 'vs/base/worker/workerMain' ],
		dest: 'vs/base/worker/workerMain.js'
	}
];

var editorResources = [
	'out-build/vs/{base,editor}/**/*.{svg,png}',
	'!out-build/vs/base/browser/ui/splitview/**/*',
	'!out-build/vs/base/browser/ui/toolbar/**/*',
	'!out-build/vs/base/browser/ui/octiconLabel/**/*',
	'!out-build/vs/editor/contrib/defineKeybinding/**/*',
	'!out-build/vs/workbench/**',
	'!**/test/**'
];

var editorOtherSources = [
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

function editorLoaderConfig() {
	var result = common.loaderConfig();

	// never ship octicons in editor
	result.paths['vs/base/browser/ui/octiconLabel/octiconLabel'] = 'out-build/vs/base/browser/ui/octiconLabel/octiconLabel.mock';

	// force css inlining to use base64 -- see https://github.com/Microsoft/monaco-editor/issues/148
	result['vs/css'] = {
		inlineResources: 'base64',
		inlineResourcesLimit: 3000 // see https://github.com/Microsoft/monaco-editor/issues/336
	};

	return result;
}

gulp.task('clean-optimized-editor', util.rimraf('out-editor'));
gulp.task('optimize-editor', ['clean-optimized-editor', 'compile-client-build'], common.optimizeTask({
	entryPoints: editorEntryPoints,
	otherSources: editorOtherSources,
	resources: editorResources,
	loaderConfig: editorLoaderConfig(),
	bundleLoader: false,
	header: BUNDLED_FILE_HEADER,
	bundleInfo: true,
	out: 'out-editor'
}));

gulp.task('clean-minified-editor', util.rimraf('out-editor-min'));
gulp.task('minify-editor', ['clean-minified-editor', 'optimize-editor'], common.minifyTask('out-editor'));

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

		// README.md
		gulp.src('build/monaco/README-npm.md')
			.pipe(es.through(function(data) {
				this.emit('data', new File({
					path: data.path.replace(/README-npm\.md/, 'README.md'),
					base: data.base,
					contents: data.contents
				}));
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
			return !/(\.js\.map$)|(nls\.metadata\.json$)|(bundleInfo\.json$)/.test(path);
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

gulp.task('analyze-editor-distro', function() {
	var bundleInfo = require('../out-editor/bundleInfo.json');
	var graph = bundleInfo.graph;
	var bundles = bundleInfo.bundles;

	var inverseGraph = {};
	Object.keys(graph).forEach(function(module) {
		var dependencies = graph[module];
		dependencies.forEach(function(dep) {
			inverseGraph[dep] = inverseGraph[dep] || [];
			inverseGraph[dep].push(module);
		});
	});

	var detailed = {};
	Object.keys(bundles).forEach(function(entryPoint) {
		var included = bundles[entryPoint];
		var includedMap = {};
		included.forEach(function(included) {
			includedMap[included] = true;
		});

		var explanation = [];
		included.map(function(included) {
			if (included.indexOf('!') >= 0) {
				return;
			}

			var reason = (inverseGraph[included]||[]).filter(function(mod) {
				return !!includedMap[mod];
			});
			explanation.push({
				module: included,
				reason: reason
			});
		});

		detailed[entryPoint] = explanation;
	});

	console.log(JSON.stringify(detailed, null, '\t'));
});

function filterStream(testFunc) {
	return es.through(function(data) {
		if (!testFunc(data.relative)) {
			return;
		}
		this.emit('data', data);
	});
}
