/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

var gulp = require('gulp');
var path = require('path');
var tsb = require('gulp-tsb');
var es = require('event-stream');
var cp = require('child_process');
var filter = require('gulp-filter');
var rename = require('gulp-rename');
var rimraf = require('rimraf');
var util = require('./lib/util');
var watcher = require('./lib/watch');
var createReporter = require('./lib/reporter');
var glob = require('glob');
var fs = require('fs');
var JSONC = require('json-comments');

var quiet = !!process.env['VSCODE_BUILD_QUIET'];
var extensionsPath = path.join(path.dirname(__dirname), 'extensions');

function getTSConfig(plugin) {
	var script = (plugin.desc && plugin.desc.scripts && plugin.desc.scripts['vscode:prepublish']) || '';
	var match = /^node \.\.\/\.\.\/node\_modules\/gulp\/bin\/gulp\.js \-\-gulpfile \.\.\/\.\.\/gulpfile\.plugins\.js compile-plugin:([^ ]+) ?(.*tsconfig\.json)?/.exec(script);

	if (!match) {
		return;
	}

	var pluginRoot = path.join(extensionsPath, plugin.desc.name);
	var options = null;

	if (match[2]) {
		options = require(path.join(pluginRoot, match[2])).compilerOptions;
	} else {
		options = {
			noLib: true,
			target: 'ES5',
			module: 'amd',
			declaration: false,
			sourceMap: true,
			rootDir: path.join(pluginRoot, 'src'),
			sourceRoot: util.toFileUri(path.join(pluginRoot, 'src'))
		};
	}

	options.verbose = !quiet;
	return options;
}

function noop() {}

function readAllPlugins() {
	var PLUGINS_FOLDER = path.join(extensionsPath);

	var extensions = glob.sync('*/package.json', {
		cwd: PLUGINS_FOLDER
	});

	var result = [];

	extensions.forEach(function (relativeJSONPath) {
		var relativePath = path.dirname(relativeJSONPath);
		var fullJSONPath = path.join(PLUGINS_FOLDER, relativeJSONPath);
		var contents = fs.readFileSync(fullJSONPath).toString();
		var desc = JSONC.parse(contents);

		result.push({
			relativePath: relativePath,
			desc: desc
		});
	});

	return result;
}

var tasks = readAllPlugins()
	.map(function (plugin) {
		var options = getTSConfig(plugin);

		if (!options) {
			return null;
		}

		var name = plugin.desc.name;
		var pluginRoot = path.join(extensionsPath, name);
		var clean = 'clean-plugin:' + name;
		var compile = 'compile-plugin:' + name;
		var watch = 'watch-plugin:' + name;

		var sources = 'extensions/' + name + '/src/**';
		var deps = [
			'src/vs/vscode.d.ts',
			'src/typings/mocha.d.ts',
			'extensions/declares.d.ts',
			'extensions/node.d.ts',
			'extensions/lib.core.d.ts'
		];

		var pipeline = (function () {
			var reporter = quiet ? null : createReporter();
			var compilation = tsb.create(options, null, null, quiet ? null : function (err) { reporter(err.toString()); });

			return function () {
				var input = es.through();
				var tsFilter = filter(['**/*.ts', '!**/lib/lib*.d.ts'], { restore: true });

				var output = input
					.pipe(tsFilter)
					.pipe(compilation())
					.pipe(tsFilter.restore)
					.pipe(quiet ? es.through() : reporter());

				return es.duplex(input, output);
			};
		})();

		var sourcesRoot = path.join(pluginRoot, 'src');
		var sourcesOpts = { cwd: path.dirname(__dirname), base: sourcesRoot };
		var depsOpts = { cwd: path.dirname(__dirname)	};

		gulp.task(clean, function (cb) {
			rimraf(path.join(pluginRoot, 'out'), cb);
		});

		gulp.task(compile, [clean], function () {
			var src = es.merge(gulp.src(sources, sourcesOpts), gulp.src(deps, depsOpts));

			return src
				.pipe(pipeline())
				.pipe(gulp.dest('extensions/' + name + '/out'));
		});

		gulp.task(watch, [clean], function () {
			var src = es.merge(gulp.src(sources, sourcesOpts), gulp.src(deps, depsOpts));
			var watchSrc = es.merge(watcher(sources, sourcesOpts), watcher(deps, depsOpts));

			return watchSrc
				.pipe(util.incremental(pipeline, src))
				.pipe(gulp.dest('extensions/' + name + '/out'));
		});

		return {
			clean: clean,
			compile: compile,
			watch: watch
		};
	})
	.filter(function(task) { return !!task; });

gulp.task('clean-plugins', tasks.map(function (t) { return t.clean; }));
gulp.task('compile-plugins', tasks.map(function (t) { return t.compile; }));
gulp.task('watch-plugins', tasks.map(function (t) { return t.watch; }));