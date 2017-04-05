/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*eslint-env mocha*/
/*global define,run*/

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
	.usage('Run the Code tests. All mocha options apply.')
	.describe('build', 'Run from out-build').boolean('build')
	.describe('run', 'Run a single file').string('run')
	.describe('coverage', 'Generate a coverage report').boolean('coverage')
	.describe('only-monaco-editor', 'Run only monaco editor tests').boolean('only-monaco-editor')
	.describe('forceLoad', 'Force loading').boolean('forceLoad')
	.describe('browser', 'Run tests in a browser').boolean('browser')
	.alias('h', 'help').boolean('h')
	.describe('h', 'Show help');

var argv = optimist.argv;

if (argv.help) {
	optimist.showHelp();
	process.exit(1);
}

var out = argv.build ? 'out-build' : 'out';
var loader = require('../' + out + '/vs/loader');
var src = path.join(path.dirname(__dirname), out);

function main() {
	process.on('uncaughtException', function (e) {
		console.error(e.stack || e);
	});

	var loaderConfig = {
		nodeRequire: require,
		nodeMain: __filename,
		baseUrl: path.join(path.dirname(__dirname), 'src'),
		paths: {
			'vs': `../${ out }/vs`,
			'lib': `../${ out }/lib`,
			'bootstrap': `../${ out }/bootstrap`
		},
		catchError: true
	};

	if (argv.coverage) {
		var instrumenter = new istanbul.Instrumenter();

		var seenSources = {};

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

	var didErr = false;
	var write = process.stderr.write;
	process.stderr.write = function (data) {
		didErr = didErr || !!data;
		write.apply(process.stderr, arguments);
	};

	var loadFunc = null;

	if (argv.runGlob) {
		loadFunc = cb => {
			const doRun = tests => {
				const modulesToLoad = tests.map(test => {
					if (path.isAbsolute(test)) {
						test = path.relative(src, path.resolve(test));
					}

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

	loadFunc(function(err) {
		if (err) {
			console.error(err);
			return process.exit(1);
		}

		process.stderr.write = write;

		if (!argv.run && !argv.runGlob) {
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
					});

					assert.ok(false);
				}
			});
		});

		// replace the default unexpected error handler to be useful during tests
		loader(['vs/base/common/errors'], function(errors) {
			errors.setUnexpectedErrorHandler(function (err) {
				let stack = (err && err.stack) || (new Error().stack);
				unexpectedErrors.push((err && err.message ? err.message : err) + '\n' + stack);
			});

			// fire up mocha
			run();
		});
	});
}

if (process.argv.some(function (a) { return /^--browser/.test(a); })) {
	require('./browser');
} else {
	main();
}