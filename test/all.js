/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*eslint-env mocha*/
/*global define,run*/

<<<<<<< HEAD
var assert = require('assert'),
	path = require('path'),
	glob = require('glob'),
	istanbul = require('istanbul'),
	jsdom = require('jsdom-no-contextify'),
	minimatch = require('minimatch'),
	async = require('async'),
	TEST_GLOB = '**/test/**/*.test.js',
	optimist = require('optimist')
=======
var assert = require('assert');
var path = require('path');
var glob = require('glob');
var istanbul = require('istanbul');
var i_remap = require('remap-istanbul/lib/remap');
var jsdom = require('jsdom-no-contextify');
var minimatch = require('minimatch');
var fs = require('fs');
var vm = require('vm');
var TEST_GLOB = '**/test/**/*.test.js';

var optimist = require('optimist')
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
	.usage('Run the Code tests. All mocha options apply.')
	.describe('build', 'Run from out-build').boolean('build')
	.describe('run', 'Run a single file').string('run')
	.describe('coverage', 'Generate a coverage report').boolean('coverage')
	.describe('only-monaco-editor', 'Run only monaco editor tests').boolean('only-monaco-editor')
	.describe('forceLoad', 'Force loading').boolean('forceLoad')
	.describe('browser', 'Run tests in a browser').boolean('browser')
	.alias('h', 'help').boolean('h')
	.describe('h', 'Show help'),
	argv = optimist.argv;
if (argv.help) {
	optimist.showHelp();
	process.exit(1);
}
<<<<<<< HEAD
var out = argv.build ? 'out-build' : 'out',
	loader = require('../' + out + '/vs/loader'),
	src = path.join(path.dirname(__dirname), out);
function loadSingleTest(test) {
	var moduleId = path.relative(src, path.resolve(test)).replace(/\.js$/, '');
	return function (cb) {
		define([moduleId], function () {
			cb(null);
		}, cb);
	};
}
function loadClientTests(cb) {
	glob(TEST_GLOB, { cwd: src }, function (err, files) {
		var modules = files.map(function (file) {
			return file.replace(/\.js$/, '');
		});
		// load all modules with the AMD loader
		define(modules, function () {
			cb(null);
		}, cb);
	});
}
function loadPluginTests(cb) {
	var root = path.join(path.dirname(__dirname), 'extensions');
	glob(TEST_GLOB, { cwd: root }, function (err, files) {
		// load modules with commonjs
		var modules = files.map(function (file) {
			return '../extensions/' + file.replace(/\.js$/, '');
		});
		modules.forEach(require);
		cb(null);
	});
}
=======

var out = argv.build ? 'out-build' : 'out';
var loader = require('../' + out + '/vs/loader');
var src = path.join(path.dirname(__dirname), out);

>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
function main() {
	process.on('uncaughtException', function (e) {console.error(e.stack || e);});
	var loaderConfig = {
		nodeRequire: require,
		nodeMain: __filename,
		baseUrl: path.join(path.dirname(__dirname), 'src'),
		paths: {
			'vs/css': '../test/css.mock',
			'vs': `../${ out }/vs`,
			'lib': `../${ out }/lib`,
			'bootstrap-fork': `../${ out }/bootstrap-fork`
		},
		catchError: true
	};
	if (argv.coverage) {
		var instrumenter = new istanbul.Instrumenter();
<<<<<<< HEAD
=======

		var seenSources = {};

>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
		loaderConfig.nodeInstrumenter = function (contents, source) {
			seenSources[source] = true;

			if (minimatch(source, TEST_GLOB)) {
				return contents;
			}
			return instrumenter.instrumentSync(contents, source);
		};
		process.on('exit', function (code) {
			if (code !== 0) {
				return;
			}
<<<<<<< HEAD
			var collector = new istanbul.Collector();
	    	collector.add(global.__coverage__);
=======

			if (argv.forceLoad) {
				var allFiles = glob.sync(out + '/vs/**/*.js');
				allFiles = allFiles.map(function(source) {
					return path.join(__dirname, '..', source);
				});
				allFiles = allFiles.filter(function(source) {
					if (seenSources[source]) {
						return false;
					}
					if (minimatch(source, TEST_GLOB)) {
						return false;
					}
					if (/fixtures/.test(source)) {
						return false;
					}
					return true;
				});
				allFiles.forEach(function(source, index) {
					var contents = fs.readFileSync(source).toString();
					contents = instrumenter.instrumentSync(contents, source);
					var stopAt = contents.indexOf('}\n__cov');
					stopAt = contents.indexOf('}\n__cov', stopAt + 1);

					var str = '(function() {' + contents.substr(0, stopAt + 1) + '});';
					var r = vm.runInThisContext(str, source);
					r.call(global);
				});
			}

			let remapIgnores = /\b((winjs\.base)|(marked)|(raw\.marked)|(nls)|(css))\.js$/;

			var remappedCoverage = i_remap(global.__coverage__, { exclude: remapIgnores }).getFinalCoverage();
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274

			// The remapped coverage comes out with broken paths
			var toUpperDriveLetter = function(str) {
				if (/^[a-z]:/.test(str)) {
					return str.charAt(0).toUpperCase() + str.substr(1);
				}
				return str;
			};
			var toLowerDriveLetter = function(str) {
				if (/^[A-Z]:/.test(str)) {
					return str.charAt(0).toLowerCase() + str.substr(1);
				}
				return str;
			};

			var REPO_PATH = toUpperDriveLetter(path.join(__dirname, '..'));
			var fixPath = function(brokenPath) {
				var startIndex = brokenPath.indexOf(REPO_PATH);
				if (startIndex === -1) {
					return toLowerDriveLetter(brokenPath);
				}
				return toLowerDriveLetter(brokenPath.substr(startIndex));
			};

			var finalCoverage = {};
			for (var entryKey in remappedCoverage) {
				var entry = remappedCoverage[entryKey];
				entry.path = fixPath(entry.path);
				finalCoverage[fixPath(entryKey)] = entry;
			}

			var collector = new istanbul.Collector();
			collector.add(finalCoverage);

			var coveragePath = path.join(path.dirname(__dirname), '.build', 'coverage');
			var reportTypes = [];
			if (argv.run || argv.runGlob) {
				// single file running
				coveragePath += '-single';
				reportTypes = ['lcovonly'];
			} else {
				reportTypes = ['json', 'lcov', 'html'];
			}
			var reporter = new istanbul.Reporter(null, coveragePath);
			reporter.addAll(reportTypes);
			reporter.write(collector, true, function () {});
		});
	}
	loader.config(loaderConfig);
	global.define = loader;
	global.document = jsdom.jsdom('<!doctype html><html><body></body></html>');
	global.self = global.window = global.document.parentWindow;
	global.Element = global.window.Element;
	global.HTMLElement = global.window.HTMLElement;
	global.Node = global.window.Node;
	global.navigator = global.window.navigator;
	global.XMLHttpRequest = global.window.XMLHttpRequest;
	var didErr = false,write = process.stderr.write;
	process.stderr.write = function (data) {
		didErr = didErr || !!data;
		write.apply(process.stderr, arguments);
	};
<<<<<<< HEAD
	var loadTasks = [];
	if (argv.run) {
		var tests = (typeof argv.run === 'string') ? [argv.run] : argv.run;
=======

	var loadFunc = null;

	if (argv.runGlob) {
		loadFunc = cb => {
			const doRun = tests => {
				const modulesToLoad = tests.map(test => {
					if (path.isAbsolute(test)) {
						test = path.relative(src, path.resolve(test));
					}
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274

					return test.replace(/(\.js)|(\.d\.ts)|(\.js\.map)$/, '');
				});
				define(modulesToLoad, () => cb(null), cb);
			};

			glob(argv.runGlob, { cwd: src }, function (err, files) { doRun(files); });
		};
	} else if (argv.run) {
		var tests = (typeof argv.run === 'string') ? [argv.run] : argv.run;
		var modulesToLoad = tests.map(function(test) {
			return path.relative(src, path.resolve(test)).replace(/(\.js)|(\.d\.ts)|(\.js\.map)$/, '');
		});
		loadFunc = cb => {
			define(modulesToLoad, () => cb(null), cb);
		};
	} else if (argv['only-monaco-editor']) {
		loadFunc = function(cb) {
			glob(TEST_GLOB, { cwd: src }, function (err, files) {
				var modulesToLoad = files.map(function (file) {
					return file.replace(/\.js$/, '');
				});
				modulesToLoad = modulesToLoad.filter(function(module) {
					if (/^vs\/workbench\//.test(module)) {
						return false;
					}
					// platform tests drag in the workbench.
					// see https://github.com/Microsoft/vscode/commit/12eaba2f64c69247de105c3d9c47308ac6e44bc9
					// and cry a little
					if (/^vs\/platform\//.test(module)) {
						return false;
					}
					return !/(\/|\\)node(\/|\\)/.test(module);
				});
				console.log(JSON.stringify(modulesToLoad, null, '\t'));
				define(modulesToLoad, function () { cb(null); }, cb);
			});
		};
	} else {
		loadFunc = function(cb) {
			glob(TEST_GLOB, { cwd: src }, function (err, files) {
				var modulesToLoad = files.map(function (file) {
					return file.replace(/\.js$/, '');
				});
				define(modulesToLoad, function () { cb(null); }, cb);
			});
		};
	}
<<<<<<< HEAD
	async.parallel(loadTasks, function (err) {
=======

	loadFunc(function(err) {
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
		if (err) {
			console.error(err);
			return process.exit(1);
		}
		process.stderr.write = write;
<<<<<<< HEAD
		if (!argv.run) {
=======

		if (!argv.run && !argv.runGlob) {
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
			// set up last test
			suite('Loader', function () {
				test('should not explode while loading', function () {
					assert.ok(!didErr, 'should not explode while loading');
				});
			});
		}
		// report failing test for every unexpected error during any of the tests
		var unexpectedErrors = [];
		suite('Errors', function () {
			test('should not have unexpected errors in tests', function () {
				if (unexpectedErrors.length) {
					unexpectedErrors.forEach(function (stack) {
						console.error('');
						console.error(stack);
					})
					assert.ok(false);
				}
			});
		});
		// replace the default unexpected error handler to be useful during tests
		loader(['vs/base/common/errors'], function(errors) {
			errors.setUnexpectedErrorHandler(function (err) {
<<<<<<< HEAD
				try {
					throw new Error('oops');
				} catch (e) {
					unexpectedErrors.push((err && err.message ? err.message : err) + '\n' + e.stack);
				}
			});run();
=======
				let stack = (err && err.stack) || (new Error().stack);
				unexpectedErrors.push((err && err.message ? err.message : err) + '\n' + stack);
			});

			// fire up mocha
			run();
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
		});
	});
};if (process.argv.some(function (a) { return /^--browser/.test(a); })){require('./browser');} else {main();}