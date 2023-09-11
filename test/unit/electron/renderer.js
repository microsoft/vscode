/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*eslint-env mocha*/

const fs = require('fs');

(function () {
	const originals = {};
	let logging = false;
	let withStacks = false;

	self.beginLoggingFS = (_withStacks) => {
		logging = true;
		withStacks = _withStacks || false;
	};
	self.endLoggingFS = () => {
		logging = false;
		withStacks = false;
	};

	function createSpy(element, cnt) {
		return function (...args) {
			if (logging) {
				console.log(`calling ${element}: ` + args.slice(0, cnt).join(',') + (withStacks ? (`\n` + new Error().stack.split('\n').slice(2).join('\n')) : ''));
			}
			return originals[element].call(this, ...args);
		};
	}

	function intercept(element, cnt) {
		originals[element] = fs[element];
		fs[element] = createSpy(element, cnt);
	}

	[
		['realpathSync', 1],
		['readFileSync', 1],
		['openSync', 3],
		['readSync', 1],
		['closeSync', 1],
		['readFile', 2],
		['mkdir', 1],
		['lstat', 1],
		['stat', 1],
		['watch', 1],
		['readdir', 1],
		['access', 2],
		['open', 2],
		['write', 1],
		['fdatasync', 1],
		['close', 1],
		['read', 1],
		['unlink', 1],
		['rmdir', 1],
	].forEach((element) => {
		intercept(element[0], element[1]);
	});
})();

const { ipcRenderer } = require('electron');
const assert = require('assert');
const path = require('path');
const glob = require('glob');
const util = require('util');
const bootstrap = require('../../../src/bootstrap');
const coverage = require('../coverage');

// Disabled custom inspect. See #38847
if (util.inspect && util.inspect['defaultOptions']) {
	util.inspect['defaultOptions'].customInspect = false;
}

// VSCODE_GLOBALS: node_modules
globalThis._VSCODE_NODE_MODULES = new Proxy(Object.create(null), { get: (_target, mod) => (require.__$__nodeRequire ?? require)(String(mod)) });

// VSCODE_GLOBALS: package/product.json
globalThis._VSCODE_PRODUCT_JSON = (require.__$__nodeRequire ?? require)('../../../product.json');
globalThis._VSCODE_PACKAGE_JSON = (require.__$__nodeRequire ?? require)('../../../package.json');

// Test file operations that are common across platforms. Used for test infra, namely snapshot tests
Object.assign(globalThis, {
	__readFileInTests: path => fs.promises.readFile(path, 'utf-8'),
	__writeFileInTests: (path, contents) => fs.promises.writeFile(path, contents),
	__readDirInTests: path => fs.promises.readdir(path),
	__unlinkInTests: path => fs.promises.unlink(path),
	__mkdirPInTests: path => fs.promises.mkdir(path, { recursive: true }),
});

const _tests_glob = '**/test/**/*.test.js';
let loader;
let _out;

function initLoader(opts) {
	const outdir = opts.build ? 'out-build' : 'out';
	_out = path.join(__dirname, `../../../${outdir}`);

	// setup loader
	loader = require(`${_out}/vs/loader`);
	const loaderConfig = {
		nodeRequire: require,
		catchError: true,
		baseUrl: bootstrap.fileUriFromPath(path.join(__dirname, '../../../src'), { isWindows: process.platform === 'win32' }),
		paths: {
			'vs': `../${outdir}/vs`,
			'lib': `../${outdir}/lib`,
			'bootstrap-fork': `../${outdir}/bootstrap-fork`
		}
	};

	if (opts.coverage) {
		// initialize coverage if requested
		coverage.initialize(loaderConfig);
	}

	loader.require.config(loaderConfig);
}

function createCoverageReport(opts) {
	if (opts.coverage) {
		return coverage.createReport(opts.run || opts.runGlob);
	}
	return Promise.resolve(undefined);
}

function loadWorkbenchTestingUtilsModule() {
	return new Promise((resolve, reject) => {
		loader.require(['vs/workbench/test/common/utils'], resolve, reject);
	});
}

async function loadModules(modules) {
	for (const file of modules) {
		mocha.suite.emit(Mocha.Suite.constants.EVENT_FILE_PRE_REQUIRE, globalThis, file, mocha);
		const m = await new Promise((resolve, reject) => loader.require([file], resolve, reject));
		mocha.suite.emit(Mocha.Suite.constants.EVENT_FILE_REQUIRE, m, file, mocha);
		mocha.suite.emit(Mocha.Suite.constants.EVENT_FILE_POST_REQUIRE, globalThis, file, mocha);
	}
}

function loadTestModules(opts) {

	if (opts.run) {
		const files = Array.isArray(opts.run) ? opts.run : [opts.run];
		const modules = files.map(file => {
			file = file.replace(/^src/, 'out');
			file = file.replace(/\.ts$/, '.js');
			return path.relative(_out, file).replace(/\.js$/, '');
		});
		return loadModules(modules);
	}

	const pattern = opts.runGlob || _tests_glob;

	return new Promise((resolve, reject) => {
		glob(pattern, { cwd: _out }, (err, files) => {
			if (err) {
				reject(err);
				return;
			}
			const modules = files.map(file => file.replace(/\.js$/, ''));
			resolve(modules);
		});
	}).then(loadModules);
}

function loadTests(opts) {

	const _unexpectedErrors = [];
	const _loaderErrors = [];

	// collect loader errors
	loader.require.config({
		onError(err) {
			_loaderErrors.push(err);
			console.error(err);
		}
	});

	// collect unexpected errors
	loader.require(['vs/base/common/errors'], function (errors) {
		errors.setUnexpectedErrorHandler(function (err) {
			let stack = (err ? err.stack : null);
			if (!stack) {
				stack = new Error().stack;
			}

			_unexpectedErrors.push((err && err.message ? err.message : err) + '\n' + stack);
		});
	});

	return loadWorkbenchTestingUtilsModule().then((workbenchTestingModule) => {
		const assertCleanState = workbenchTestingModule.assertCleanState;

		suite('Tests are using suiteSetup and setup correctly', () => {
			test('assertCleanState - check that registries are clean at the start of test running', () => {
				assertCleanState();
			});
		});

		return loadTestModules(opts).then(() => {
			suite('Unexpected Errors & Loader Errors', function () {
				test('should not have unexpected errors', function () {
					const errors = _unexpectedErrors.concat(_loaderErrors);
					if (errors.length) {
						errors.forEach(function (stack) {
							console.error('');
							console.error(stack);
						});
						assert.ok(false, errors);
					}
				});

				test('assertCleanState - check that registries are clean and objects are disposed at the end of test running', () => {
					assertCleanState();
				});
			});
		});
	});
}

function serializeSuite(suite) {
	return {
		root: suite.root,
		suites: suite.suites.map(serializeSuite),
		tests: suite.tests.map(serializeRunnable),
		title: suite.title,
		fullTitle: suite.fullTitle(),
		titlePath: suite.titlePath(),
		timeout: suite.timeout(),
		retries: suite.retries(),
		slow: suite.slow(),
		bail: suite.bail()
	};
}

function serializeRunnable(runnable) {
	return {
		title: runnable.title,
		fullTitle: runnable.fullTitle(),
		titlePath: runnable.titlePath(),
		async: runnable.async,
		slow: runnable.slow(),
		speed: runnable.speed,
		duration: runnable.duration
	};
}

function serializeError(err) {
	return {
		message: err.message,
		stack: err.stack,
		snapshotPath: err.snapshotPath,
		actual: safeStringify({ value: err.actual }),
		expected: safeStringify({ value: err.expected }),
		uncaught: err.uncaught,
		showDiff: err.showDiff,
		inspect: typeof err.inspect === 'function' ? err.inspect() : ''
	};
}

function safeStringify(obj) {
	const seen = new Set();
	return JSON.stringify(obj, (key, value) => {
		if (value === undefined) {
			return '[undefined]';
		}

		if (isObject(value) || Array.isArray(value)) {
			if (seen.has(value)) {
				return '[Circular]';
			} else {
				seen.add(value);
			}
		}
		return value;
	});
}

function isObject(obj) {
	// The method can't do a type cast since there are type (like strings) which
	// are subclasses of any put not positvely matched by the function. Hence type
	// narrowing results in wrong results.
	return typeof obj === 'object'
		&& obj !== null
		&& !Array.isArray(obj)
		&& !(obj instanceof RegExp)
		&& !(obj instanceof Date);
}

class IPCReporter {

	constructor(runner) {
		runner.on('start', () => ipcRenderer.send('start'));
		runner.on('end', () => ipcRenderer.send('end'));
		runner.on('suite', suite => ipcRenderer.send('suite', serializeSuite(suite)));
		runner.on('suite end', suite => ipcRenderer.send('suite end', serializeSuite(suite)));
		runner.on('test', test => ipcRenderer.send('test', serializeRunnable(test)));
		runner.on('test end', test => ipcRenderer.send('test end', serializeRunnable(test)));
		runner.on('hook', hook => ipcRenderer.send('hook', serializeRunnable(hook)));
		runner.on('hook end', hook => ipcRenderer.send('hook end', serializeRunnable(hook)));
		runner.on('pass', test => ipcRenderer.send('pass', serializeRunnable(test)));
		runner.on('fail', (test, err) => ipcRenderer.send('fail', serializeRunnable(test), serializeError(err)));
		runner.on('pending', test => ipcRenderer.send('pending', serializeRunnable(test)));
	}
}

function runTests(opts) {
	// this *must* come before loadTests, or it doesn't work.
	if (opts.timeout !== undefined) {
		mocha.timeout(opts.timeout);
	}

	return loadTests(opts).then(() => {

		if (opts.grep) {
			mocha.grep(opts.grep);
		}

		if (!opts.dev) {
			mocha.reporter(IPCReporter);
		}

		const runner = mocha.run(() => {
			createCoverageReport(opts).then(() => {
				ipcRenderer.send('all done');
			});
		});

		if (opts.dev) {
			runner.on('fail', (test, err) => {

				console.error(test.fullTitle());
				console.error(err.stack);
			});
		}
	});
}

ipcRenderer.on('run', (e, opts) => {
	initLoader(opts);
	runTests(opts).catch(err => {
		if (typeof err !== 'string') {
			err = JSON.stringify(err);
		}

		console.error(err);
		ipcRenderer.send('error', err);
	});
});
