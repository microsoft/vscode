/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

process.env.MOCHA_COLORS = '1'; // Force colors (note that this must come before any mocha imports)

import * as assert from 'assert';
import { spawnSync } from 'child_process';
import Mocha from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import glob from 'glob';
import minimatch from 'minimatch';
import minimist from 'minimist';
import * as module from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import semver from 'semver';

/**
 * @type {{ build: boolean; run: string; runGlob: string; coverage: boolean; help: boolean; coverageFormats: string | string[]; coveragePath: string; timeout?: string; 'rerun-failed-files'?: string; }}
 */
const args = minimist(process.argv.slice(2), {
	boolean: ['build', 'coverage', 'help'],
	string: ['run', 'coveragePath', 'coverageFormats', 'timeout', 'rerun-failed-files'],
	alias: {
		h: 'help',
		t: 'timeout'
	},
	default: {
		build: false,
		coverage: false,
		help: false
	},
	description: {
		build: 'Run from out-build',
		run: 'Run a single file',
		coverage: 'Generate a coverage report',
		coveragePath: 'Path to coverage report to generate',
		coverageFormats: 'Coverage formats to generate',
		timeout: 'Timeout for tests',
		help: 'Show help'
	}
});

if (args.help) {
	console.log(`Usage: node test/unit/node/index [options]

Options:
--build          Run from out-build
--run <file>     Run a single file
--coverage       Generate a coverage report
--timeout <ms>   Test timeout (default: 5000 locally, 30000 in CI; alias: -t)
--rerun-failed-files <count>  Rerun the test files that failed, each time in a fresh process, up to <count> more times
--help           Show help`);
	process.exit(0);
}

const TEST_GLOB = '**/test/**/*.test.js';
const IS_CI = !!process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || !!process.env.GITHUB_WORKSPACE;

/**
 * Set for the process that reruns failed test files: the path of the JSON file in
 * which it reports the test files that failed again.
 */
const FAILED_FILES_REPORT_ENV = 'VSCODE_TEST_FAILED_FILES_REPORT';

const CHECK_LOADER_ENV = 'VSCODE_TEST_CHECK_LOADER';
const checkLoader = process.env[CHECK_LOADER_ENV] === undefined
	? !args.run && !args.runGlob
	: process.env[CHECK_LOADER_ENV] === '1';

const excludeGlobs = [
	'**/{browser,electron-browser,electron-main,electron-utility}/**/*.test.js',
	'**/vs/platform/environment/test/node/nativeModules.test.js', // native modules are compiled against Electron and this test would fail with node.js
	'**/vs/base/parts/storage/test/node/storage.test.js', // same as above, due to direct dependency to sqlite native module
	'**/vs/workbench/contrib/testing/test/**', // flaky (https://github.com/microsoft/vscode/issues/137853)
	'**/vs/sessions/test/web.test.js', // web-only E2E test that imports CSS — cannot run in Node
];

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const out = args.build ? 'out-build' : 'out';
const src = path.join(REPO_ROOT, out);
const baseUrl = pathToFileURL(src);

//@ts-ignore
const requiredNodeVersion = semver.parse(/^target="(.*)"$/m.exec(fs.readFileSync(path.join(REPO_ROOT, 'remote', '.npmrc'), 'utf8'))[1]);
const currentNodeVersion = semver.parse(process.version);
//@ts-ignore
if (currentNodeVersion?.major < requiredNodeVersion?.major) {
	console.error(`node.js unit tests require a major node.js version of ${requiredNodeVersion?.major} (your version is: ${currentNodeVersion?.major})`);
	process.exit(1);
}

function main() {

	// VSCODE_GLOBALS: package/product.json
	const _require = module.createRequire(import.meta.url);
	globalThis._VSCODE_PRODUCT_JSON = _require(`${REPO_ROOT}/product.json`);
	globalThis._VSCODE_PACKAGE_JSON = _require(`${REPO_ROOT}/package.json`);

	// VSCODE_GLOBALS: file root
	globalThis._VSCODE_FILE_ROOT = baseUrl.href;

	if (args.build) {
		// when running from `out-build`, ensure to load the default
		// messages file, because all `nls.localize` calls have their
		// english values removed and replaced by an index.
		globalThis._VSCODE_NLS_MESSAGES = _require(`${REPO_ROOT}/${out}/nls.messages.json`);
	}

	// Test file operations that are common across platforms. Used for test infra, namely snapshot tests
	Object.assign(globalThis, {
		// __analyzeSnapshotInTests: takeSnapshotAndCountClasses,
		__readFileInTests: (/** @type {string} */ path) => fs.promises.readFile(path, 'utf-8'),
		__writeFileInTests: (/** @type {string} */ path, /** @type {BufferEncoding} */ contents) => fs.promises.writeFile(path, contents),
		__readDirInTests: (/** @type {string} */ path) => fs.promises.readdir(path),
		__unlinkInTests: (/** @type {string} */ path) => fs.promises.unlink(path),
		__mkdirPInTests: (/** @type {string} */ path) => fs.promises.mkdir(path, { recursive: true }),
	});

	// Configure Node.js diagnostic reports for crash investigation.
	// Reports are written to .build/crashes so the existing CI artifact
	// collection picks them up alongside Electron crash dumps.
	const crashDir = path.join(REPO_ROOT, '.build', 'crashes');
	fs.mkdirSync(crashDir, { recursive: true });
	if (process.report) {
		process.report.directory = crashDir;
		process.report.reportOnFatalError = true;
		process.report.reportOnUncaughtException = true;
	}

	process.on('uncaughtException', function(e) {
		console.error(e.stack || e);
	});

	process.on('unhandledRejection', function(reason) {
		console.error('Unhandled promise rejection:');
		console.error(reason && (/** @type {Error} */ (reason)).stack || reason);
	});

	/**
	 * @param modules
	 * @param onLoad
	 * @param onError
	 */
	const loader = function(modules, onLoad, onError) {
		const loads = modules.map(mod => import(`${baseUrl}/${mod}.js`).catch(err => {
			console.error(`FAILED to load ${mod} as ${baseUrl}/${mod}.js`);
			throw err;
		}));
		Promise.all(loads).then(onLoad, onError);
	};


	let didErr = false;
	const write = process.stderr.write;
	process.stderr.write = function(...args) {
		didErr = didErr || !!args[0];
		return write.apply(process.stderr, args);
	};


	const runner = new Mocha({
		ui: 'tdd',
		timeout: args.timeout ?? (IS_CI ? 30000 : 5000)
	});

	/**
	 * @param modules
	 */
	async function loadModules(modules) {
		for (const file of modules) {
			runner.suite.emit(Mocha.Suite.constants.EVENT_FILE_PRE_REQUIRE, globalThis, file, runner);
			const m = await new Promise((resolve, reject) => loader([file], resolve, reject));
			runner.suite.emit(Mocha.Suite.constants.EVENT_FILE_REQUIRE, m, file, runner);
			runner.suite.emit(Mocha.Suite.constants.EVENT_FILE_POST_REQUIRE, globalThis, file, runner);
		}
	}

	/** @type { null|((callback:(err:any)=>void)=>void) } */
	let loadFunc = null;

	if (args.runGlob) {
		loadFunc = (cb) => {
			const doRun = /** @param tests */(tests) => {
				const modulesToLoad = tests.map(test => {
					if (path.isAbsolute(test)) {
						test = path.relative(src, path.resolve(test));
					}

					return test.replace(/(\.js)|(\.d\.ts)|(\.js\.map)$/, '');
				});
				loadModules(modulesToLoad).then(() => cb(null), cb);
			};

			glob(args.runGlob, { cwd: src }, function(err, files) { doRun(files); });
		};
	} else if (args.run) {
		const tests = (typeof args.run === 'string') ? [args.run] : args.run;
		const modulesToLoad = tests.map(function(test) {
			test = test.replace(/^src/, 'out');
			test = test.replace(/\.ts$/, '.js');
			return path.relative(src, path.resolve(test)).replace(/(\.js)|(\.js\.map)$/, '').replace(/\\/g, '/');
		});
		loadFunc = (cb) => {
			loadModules(modulesToLoad).then(() => cb(null), cb);
		};
	} else {
		loadFunc = (cb) => {
			glob(TEST_GLOB, { cwd: src }, function(err, files) {
				/** @type {string[]} */
				const modules = [];
				for (const file of files) {
					if (!excludeGlobs.some(excludeGlob => minimatch(file, excludeGlob))) {
						modules.push(file.replace(/\.js$/, ''));
					}
				}
				loadModules(modules).then(() => cb(null), cb);
			});
		};
	}

	loadFunc(function(err) {
		if (err) {
			console.error(err);
			return process.exit(1);
		}

		process.stderr.write = write;

		if (checkLoader) {
			// set up last test
			detachFromTestFiles(Mocha.suite('Loader', function() {
				test('should not explode while loading', function() {
					assert.ok(!didErr, `should not explode while loading: ${didErr}`);
				});
			}));
		}

		// report failing test for every unexpected error during any of the tests
		const unexpectedErrors = [];
		detachFromTestFiles(Mocha.suite('Errors', function() {
			test('should not have unexpected errors in tests', function() {
				if (unexpectedErrors.length) {
					unexpectedErrors.forEach(function(stack) {
						console.error('');
						console.error(stack);
					});

					assert.ok(false);
				}
			});
		}));

		// replace the default unexpected error handler to be useful during tests
		import(`${baseUrl}/vs/base/common/errors.js`).then(errors => {
			errors.setUnexpectedErrorHandler(function(err) {
				const stack = (err && err.stack) || (new Error().stack);
				unexpectedErrors.push((err && err.message ? err.message : err) + '\n' + stack);
			});

			/** @type {Set<string>} test files with a failing test or hook */
			const failedFiles = new Set();
			/** @type {string[]} failures that do not belong to a test file, such as the runner's own checks */
			const unattributedFailures = [];

			// fire up mocha
			const mochaRunner = runner.run(failures => {
				/** @type {IAttemptResult} */
				const result = { failures, failedFiles: [...failedFiles], unattributedFailures };
				const reportPath = process.env[FAILED_FILES_REPORT_ENV];
				if (reportPath) {
					fs.writeFileSync(reportPath, JSON.stringify(result));
				}

				process.exit(failures ? rerunFailedFiles(result) : 0);
			});

			mochaRunner.on('fail', (runnable) => {
				if (runnable.file) {
					failedFiles.add(runnable.file);
				} else {
					unattributedFailures.push(runnable.fullTitle());
				}
			});
		});
	});
}

/**
 * The runner's own suites are created after the test files are loaded, so mocha
 * attributes them to the last loaded file. They do not belong to any test file,
 * and rerunning one file would not cover them.
 * @param {Mocha.Suite} suite
 */
function detachFromTestFiles(suite) {
	suite.file = undefined;
	for (const test of suite.tests) {
		test.file = undefined;
	}
}

/**
 * @typedef {{ failures: number; failedFiles: string[]; unattributedFailures: string[] }} IAttemptResult
 */

/**
 * Reruns the test files that failed, each time in a fresh process, up to
 * `--rerun-failed-files` more times. Returns the exit code for the whole run.
 * @param {IAttemptResult} result the result of the first attempt, which failed
 * @returns {number}
 */
function rerunFailedFiles(result) {
	const maxReruns = args.coverage ? 0 : Math.max(0, Number(args['rerun-failed-files']) || 0);

	/** @type {Map<string, number>} test file -> the last attempt in which it failed */
	const lastFailedAttempt = new Map();
	/** @type {string[] | undefined} the test files that the attempt behind `result` reran */
	let rerunFiles;

	for (let attempt = 1; ; attempt++) {
		for (const file of result.failedFiles) {
			lastFailedAttempt.set(file, attempt);
		}

		if (attempt > maxReruns) {
			if (maxReruns > 0) {
				console.error(`\n${result.failedFiles.length} test file(s) still failed after ${attempt} attempts:\n${result.failedFiles.map(file => `  ${file}`).join('\n')}`);
			}
		} else if (result.unattributedFailures.length > 0) {
			console.error(`\nNot rerunning failed tests: ${result.unattributedFailures.length} failure(s) do not belong to a test file:\n${result.unattributedFailures.map(title => `  ${title}`).join('\n')}`);
		} else {
			console.log(`\nRerunning ${result.failedFiles.length} test file(s) with failures in a fresh process (attempt ${attempt + 1} of ${maxReruns + 1}):\n${result.failedFiles.map(file => `  ${file}`).join('\n')}\n`);
			const next = runInFreshProcess(result.failedFiles);
			if (!next) {
				console.error('\nThe rerun did not complete normally or report its results.');
			} else if (next.failures === 0) {
				reportRescuedFiles(lastFailedAttempt, new Set());
				return 0;
			} else {
				rerunFiles = result.failedFiles;
				result = next;
				continue;
			}
		}

		// A rerun with failures outside any test file, such as unexpected errors, does
		// not establish that its other files passed.
		const stillFailingFiles = result.unattributedFailures.length > 0 && rerunFiles
			? new Set([...rerunFiles, ...result.failedFiles])
			: new Set(result.failedFiles);
		reportRescuedFiles(lastFailedAttempt, stillFailingFiles);
		return 1;
	}
}

/**
 * Runs the given test files in a new process, the same way `npm run test-node` runs
 * all of them, and returns its result, or `undefined` when it did not complete
 * normally or report one.
 * @param {string[]} files test files as module paths
 * @returns {IAttemptResult | undefined}
 */
function runInFreshProcess(files) {
	const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-node-rerun-'));
	const reportPath = path.join(reportDir, 'result.json');
	try {
		const mochaCli = module.createRequire(import.meta.url).resolve('mocha/bin/mocha.js');
		const child = spawnSync(process.execPath, [
			...process.execArgv,
			mochaCli, fileURLToPath(import.meta.url), '--delay', '--ui=tdd', '--exit',
			...(args.build ? ['--build'] : []),
			...(args.timeout !== undefined ? ['--timeout', args.timeout] : []),
			...files.flatMap(file => ['--run', path.join(src, `${file}.js`)]),
		], {
			stdio: 'inherit',
			env: { ...process.env, [FAILED_FILES_REPORT_ENV]: reportPath, [CHECK_LOADER_ENV]: checkLoader ? '1' : '0' },
		});

		if (child.error) {
			console.error('\nFailed to start the rerun:', child.error);
			return undefined;
		}
		if (child.signal) {
			console.error(`\nThe rerun was terminated by signal ${child.signal}.`);
			return undefined;
		}
		if (!fs.existsSync(reportPath)) {
			return undefined;
		}

		/** @type {IAttemptResult} */
		const result = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
		if (child.status !== (result.failures ? 1 : 0)) {
			console.error(`\nThe rerun exited with code ${child.status}, inconsistent with its reported ${result.failures} failure(s).`);
			return undefined;
		}
		return result;
	} finally {
		fs.rmSync(reportDir, { recursive: true, force: true });
	}
}

/**
 * Reports the test files that failed and then passed when they were rerun, as warnings
 * in CI, so that flaky tests stay visible whether or not the run passed.
 * @param {Map<string, number>} lastFailedAttempt
 * @param {Set<string>} stillFailingFiles
 */
function reportRescuedFiles(lastFailedAttempt, stillFailingFiles) {
	const rescued = [...lastFailedAttempt].filter(([file]) => !stillFailingFiles.has(file));
	if (rescued.length === 0) {
		return;
	}

	console.log(`\n${rescued.length} test file(s) failed and then passed when rerun in a fresh process. Their tests are flaky:`);
	for (const [file, attempt] of rescued) {
		const message = `${file} failed in ${attempt === 1 ? 'attempt 1' : `attempts 1 to ${attempt}`} and passed in attempt ${attempt + 1}`;
		console.log(`  ${message}`);
		if (process.env.GITHUB_ACTIONS) {
			console.log(`::warning title=Flaky node.js unit test file::${message}`);
		} else if (process.env.TF_BUILD) {
			console.log(`##vso[task.logissue type=warning]Flaky node.js unit test file: ${message}`);
		}
	}
}

main();
