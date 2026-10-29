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
import parallel from '../parallel.ts';

const { getWorkerCount, removeArgument, runInWorkers, writeWorkerReport, trackTestFiles, distributeTestFiles } = parallel;

/**
 * @type {{ build: boolean; run: string; runList: string; runGlob: string; grep?: string; coverage: boolean; help: boolean; coverageFormats: string | string[]; coveragePath: string; timeout?: string; 'rerun-failed-files'?: string; workers?: string; worker?: string; workerDir?: string; }}
 */
const args = minimist(process.argv.slice(2), {
	boolean: ['build', 'coverage', 'help'],
	string: ['run', 'runList', 'grep', 'coveragePath', 'coverageFormats', 'timeout', 'rerun-failed-files', 'workers', 'worker', 'workerDir'],
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
		runList: 'Only run the tests whose files are listed in a file, one per line',
		grep: 'Only run tests matching <pattern>',
		coverage: 'Generate a coverage report',
		coveragePath: 'Path to coverage report to generate',
		coverageFormats: 'Coverage formats to generate',
		timeout: 'Timeout for tests',
		workers: 'Number of parallel worker processes for a run of all test files',
		help: 'Show help'
	}
});

if (args.help) {
	console.log(`Usage: node test/unit/node/index [options]

Options:
--build          Run from out-build
--run <file>     Run a single file
--runList <file> Only run the tests whose files are listed in <file>, one per line
--grep <pattern> Only run tests matching <pattern>
--coverage       Generate a coverage report
--timeout <ms>   Test timeout (default: 5000 locally, 30000 in CI; alias: -t)
--rerun-failed-files <count>  Rerun failed tests (suites for failed hooks) in a fresh process up to <count> more times; use whole files for many failures
--workers <n>    Run all test files in <n> parallel processes, at most one per CPU and per 2 GB of memory; ignored when only some files or tests run; reruns use one process
--help           Show help`);
	process.exit(0);
}

// --runList: the listed test files as compiled modules relative to the output folder (src/vs/a.test.ts is vs/a.test.js)
const runList = args.runList ? new Set(fs.readFileSync(args.runList, 'utf8').split(/\r?\n/).map(line => line.trim().replace(/\\/g, '/')).filter(line => line.length > 0).map(line => line.replace(/^src\//, '').replace(/\.ts$/, '.js'))) : undefined;

const TEST_GLOB = '**/test/**/*.test.js';
const IS_CI = !!process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || !!process.env.GITHUB_WORKSPACE;

/**
 * With more failed tests and suites than this, a rerun repeats whole test files
 * instead of selecting the failures by title.
 */
const MAX_RERUN_TARGETS = 50;

/**
 * Set for the process that reruns failed tests: the path of the JSON file in which
 * it reports which tests passed and failed.
 */
const RESULT_REPORT_ENV = 'VSCODE_TEST_RESULT_REPORT';

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
		grep: args.grep,
		timeout: args.timeout ?? (IS_CI ? 30000 : 5000)
	});

	// a worker process of a parallel run (see parallel.ts) only runs the test files it claims
	const testFiles = args.workerDir ? trackTestFiles(runner.suite) : undefined;

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
					if (!excludeGlobs.some(excludeGlob => minimatch(file, excludeGlob)) && (!runList || runList.has(file))) {
						modules.push(file.replace(/\.js$/, ''));
					}
				}
				if (runList) {
					console.log(`Running the ${modules.length} node.js test files of the ${runList.size} files listed in ${args.runList}`);
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

		if (runner.options.grep instanceof RegExp) {
			runner.grep(includeOwnTests(runner.options.grep));
		}

		// replace the default unexpected error handler to be useful during tests
		import(`${baseUrl}/vs/base/common/errors.js`).then(errors => {
			errors.setUnexpectedErrorHandler(function(err) {
				const stack = (err && err.stack) || (new Error().stack);
				unexpectedErrors.push((err && err.message ? err.message : err) + '\n' + stack);
			});

			/** @type {IFailure[]} failed tests and hooks that belong to a test file */
			const failures = [];
			/** @type {IPassed[]} */
			const passed = [];
			/** @type {string[]} failures that do not belong to a test file, such as the runner's own checks */
			const unattributedFailures = [];

			if (testFiles && args.worker && args.workerDir) {
				distributeTestFiles(runner.suite, testFiles, { workerId: args.worker, workerDir: args.workerDir });
			}

			// fire up mocha
			const mochaRunner = runner.run(failureCount => {
				/** @type {IAttemptResult} */
				const result = { failureCount, failures, passed, unattributedFailures };
				const reportPath = process.env[RESULT_REPORT_ENV];
				if (reportPath) {
					fs.writeFileSync(reportPath, JSON.stringify(result));
				}
				if (args.worker && args.workerDir) {
					// the process that started this worker reruns the failures
					writeWorkerReport({ workerId: args.worker, workerDir: args.workerDir }, result);
				}

				process.exit(failureCount ? rerunFailedTests(result) : 0);
			});

			mochaRunner.on('pass', test => passed.push({ title: test.fullTitle(), file: test.file }));
			mochaRunner.on('fail', (runnable) => {
				if (runnable.file) {
					// a failed test is rerun by itself, a failed hook with the rest of its suite
					failures.push({ title: runnable.fullTitle(), file: runnable.file, type: runnable.type, parentTitle: runnable.parent?.fullTitle() });
				} else {
					unattributedFailures.push(runnable.fullTitle());
				}
			});
		});
	});
}

/** @type {string[]} the full titles of the runner's own tests, which every filtered run includes */
const ownTestTitles = [];

/**
 * The runner's own suites are created after the test files are loaded, so mocha
 * attributes them to the last loaded file. They do not belong to any test file,
 * and rerunning one file would not cover them, so every filtered run includes them.
 * @param {Mocha.Suite} suite
 */
function detachFromTestFiles(suite) {
	suite.file = undefined;
	for (const test of suite.tests) {
		test.file = undefined;
		ownTestTitles.push(test.fullTitle());
	}
}

/**
 * Keeps the runner's safety checks selected regardless of the user's grep.
 * @param {RegExp} grep
 */
function includeOwnTests(grep) {
	return new RegExp(`(?:${grep.source})|^(?:${ownTestTitles.map(escapeRegExp).join('|')})$`, grep.flags);
}

/**
 * A failed test or hook of a test file.
 * @typedef {{ title: string; file: string; type: string; parentTitle?: string }} IFailure
 */

/**
 * A test that passed.
 * @typedef {{ title: string; file: string | undefined }} IPassed
 */

/**
 * @typedef {{ failureCount: number; failures: IFailure[]; passed: IPassed[]; unattributedFailures: string[] }} IAttemptResult
 */

/**
 * What a rerun runs to establish that a failure was flaky: a failed test by its full
 * title, the suite of a failed hook, or the test file of a failed hook outside any suite.
 * @typedef {{ kind: 'test' | 'suite' | 'file'; file: string; title: string; label: string }} IRerunTarget
 */

/**
 * The test files that a rerun loads, and the grep that selects their tests.
 * @typedef {{ byTitle: boolean; files: string[]; grep: string | undefined }} IRerunPlan
 */

/**
 * When a rerun target did not pass, and when it passed.
 * @typedef {{ target: IRerunTarget; firstAttempt: number; lastAttempt: number; passedInAttempt?: number }} IRerunRecord
 */

/**
 * Reruns the failed tests, each time in a fresh process, up to `--rerun-failed-files`
 * more times. Returns the exit code for the whole run.
 * @param {IAttemptResult} result the result of the first attempt, which failed
 * @returns {number}
 */
function rerunFailedTests(result) {
	const maxReruns = args.coverage ? 0 : Math.max(0, Number(args['rerun-failed-files']) || 0);

	/** @type {Map<string, IRerunRecord>} every failure that was a rerun target, by key */
	const records = new Map();
	/** @type {Map<string, IRerunTarget>} the failures that did not pass since they failed */
	let targets = new Map();
	/** @type {IRerunPlan | undefined} what the current attempt reruns, unless it is the first */
	let plan;
	/** @type {IAttemptResult | undefined} */
	let current = result;

	for (let attempt = 1; ; attempt++) {
		if (!current) {
			console.error('\nThe rerun did not complete normally or report its results.');
			recordNotPassed(records, targets, attempt);
		} else {
			// A failure outside any test file, such as an unexpected error, does not establish that anything passed.
			if (plan && current.unattributedFailures.length === 0) {
				for (const key of findPassedTargets(targets, current)) {
					targets.delete(key);
					const record = records.get(key);
					if (record) {
						record.passedInAttempt = attempt;
					}
				}
			}
			targets = new Map([...targets, ...targetsFromFailures(current.failures)]);
			recordNotPassed(records, targets, attempt);

			if (targets.size === 0 && current.unattributedFailures.length === 0) {
				reportFlakyTests(records);
				return 0;
			}

			if (current.unattributedFailures.length > 0 && maxReruns > 0) {
				console.error(`\n${plan ? `Not counting attempt ${attempt}` : 'Not rerunning failed tests'}: ${current.unattributedFailures.length} failure(s) do not belong to a test file:\n${current.unattributedFailures.map(title => `  ${title}`).join('\n')}`);
			} else if (attempt <= maxReruns) {
				plan = planRerun(targets);
				console.log(plan.byTitle
					? `\nRerunning ${targets.size} failed test(s) in a fresh process (attempt ${attempt + 1} of ${maxReruns + 1}):\n${[...targets.values()].map(target => `  ${describeTarget(target)}`).join('\n')}\n`
					: `\nRerunning the test files of ${targets.size} failed test(s) in a fresh process (attempt ${attempt + 1} of ${maxReruns + 1}):\n${plan.files.map(file => `  ${file}`).join('\n')}\n`);
				current = runInFreshProcess(plan);
				continue;
			}
		}

		if (plan) {
			console.error(`\n${targets.size} failed test(s) did not pass in ${attempt} attempts:\n${[...targets.values()].map(target => `  ${describeTarget(target)}`).join('\n')}`);
		}
		reportFlakyTests(records);
		return 1;
	}
}

/**
 * Runs the tests of the plan in a new process, the same way `npm run test-node` runs
 * all of them, and returns its result, or `undefined` when it did not complete
 * normally or report one.
 * @param {IRerunPlan} plan
 * @returns {IAttemptResult | undefined}
 */
function runInFreshProcess(plan) {
	const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-node-rerun-'));
	const reportPath = path.join(reportDir, 'result.json');
	try {
		const mochaCli = module.createRequire(import.meta.url).resolve('mocha/bin/mocha.js');
		const child = spawnSync(process.execPath, [
			...process.execArgv,
			mochaCli, fileURLToPath(import.meta.url), '--delay', '--ui=tdd', '--exit',
			...(args.build ? ['--build'] : []),
			...(args.timeout !== undefined ? ['--timeout', args.timeout] : []),
			// the = form keeps a grep that starts with a dash from reading as an option
			...(plan.grep !== undefined ? [`--grep=${plan.grep}`] : []),
			...plan.files.flatMap(file => ['--run', path.join(src, `${file}.js`)]),
		], {
			stdio: 'inherit',
			env: { ...process.env, [RESULT_REPORT_ENV]: reportPath, [CHECK_LOADER_ENV]: checkLoader ? '1' : '0' },
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
		if (child.status !== (result.failureCount ? 1 : 0)) {
			console.error(`\nThe rerun exited with code ${child.status}, inconsistent with its reported ${result.failureCount} failure(s).`);
			return undefined;
		}
		return result;
	} finally {
		fs.rmSync(reportDir, { recursive: true, force: true });
	}
}

/**
 * Returns the rerun targets of the failed tests and hooks, by key.
 * @param {IFailure[]} failures
 * @returns {Map<string, IRerunTarget>}
 */
function targetsFromFailures(failures) {
	/** @type {Map<string, IRerunTarget>} */
	const targets = new Map();
	for (const failure of failures) {
		/** @type {IRerunTarget} */
		let target;
		if (failure.type !== 'hook') {
			target = { kind: 'test', file: failure.file, title: failure.title, label: failure.title };
		} else if (failure.parentTitle) {
			// a failed hook skips the rest of its suite
			target = { kind: 'suite', file: failure.file, title: failure.parentTitle, label: failure.title };
		} else {
			target = { kind: 'file', file: failure.file, title: '', label: failure.title };
		}

		const key = JSON.stringify([target.kind, target.file, target.title]);
		if (!targets.has(key)) {
			targets.set(key, target);
		}
	}
	return targets;
}

/**
 * Plans a rerun attempt: only the failed tests and the suites of failed hooks, or their
 * whole test files when they cannot be selected by title, such as when there are too many.
 * @param {Map<string, IRerunTarget>} targets
 * @returns {IRerunPlan}
 */
function planRerun(targets) {
	const files = [...new Set([...targets.values()].map(target => target.file))];
	// mocha reads a grep of the form /pattern/flags as a regular expression literal, which cannot be combined
	const byTitle = targets.size <= MAX_RERUN_TARGETS && [...targets.values()].every(target => target.kind !== 'file') && !/^\/.*\/[gimy]{0,4}$/.test(args.grep ?? '');
	if (!byTitle) {
		return { byTitle, files, grep: args.grep };
	}

	// mocha matches the grep against the full title of every test
	const selection = [...targets.values()].map(target => target.kind === 'test' ? escapeRegExp(target.title) : `${escapeRegExp(target.title)} [\\s\\S]*`).join('|');
	return { byTitle, files, grep: args.grep ? `^(?=[\\s\\S]*(?:${args.grep}))(?:${selection})$` : `^(?:${selection})$` };
}

/**
 * Returns the keys of the targets that passed in the rerun. The rerun must have run and
 * passed the failed test, or a test of the failed hook's suite, so that a failure that
 * the rerun did not select does not count as passing. A failed hook outside any suite
 * passes with its whole test file.
 * @param {Map<string, IRerunTarget>} targets
 * @param {IAttemptResult} result
 * @returns {string[]}
 */
function findPassedTargets(targets, result) {
	return [...targets].filter(([, target]) => {
		const failedTitles = new Set(result.failures.filter(failure => failure.file === target.file).map(failure => failure.title));
		// A test that passes and then fails in teardown is reported both ways.
		const passedTitles = result.passed.filter(test => test.file === target.file && !failedTitles.has(test.title)).map(test => test.title);
		if (target.kind === 'file') {
			return failedTitles.size === 0 && passedTitles.length > 0;
		}
		if (target.kind === 'test') {
			return passedTitles.includes(target.title);
		}
		const prefix = `${target.title} `;
		return passedTitles.some(title => title.startsWith(prefix)) && ![...failedTitles].some(title => title.startsWith(prefix));
	}).map(([key]) => key);
}

/**
 * Records that the targets did not pass in the attempt.
 * @param {Map<string, IRerunRecord>} records
 * @param {Map<string, IRerunTarget>} targets
 * @param {number} attempt
 */
function recordNotPassed(records, targets, attempt) {
	for (const [key, target] of targets) {
		const record = records.get(key);
		if (record) {
			record.lastAttempt = attempt;
			record.passedInAttempt = undefined;
		} else {
			records.set(key, { target, firstAttempt: attempt, lastAttempt: attempt });
		}
	}
}

/**
 * Reports the failed tests that passed when they were rerun, as warnings in CI, so that
 * flaky tests stay visible whether or not the run passed.
 * @param {Map<string, IRerunRecord>} records
 */
function reportFlakyTests(records) {
	const flaky = [...records.values()].filter(record => record.passedInAttempt !== undefined);
	if (flaky.length === 0) {
		return;
	}

	console.log(`\n${flaky.length} failed test(s) passed when rerun in a fresh process. They are flaky:`);
	for (const record of flaky) {
		const failed = record.firstAttempt === record.lastAttempt ? `failed in attempt ${record.firstAttempt}` : `did not pass in attempts ${record.firstAttempt} to ${record.lastAttempt}`;
		const message = `${describeTarget(record.target)} ${failed} and ${record.target.kind === 'file' ? 'its test file passed' : 'passed'} in attempt ${record.passedInAttempt}`;
		console.log(`  ${message}`);
		if (process.env.GITHUB_ACTIONS) {
			console.log(`::warning title=Flaky node.js unit test::${message}`);
		} else if (process.env.TF_BUILD) {
			console.log(`##vso[task.logissue type=warning]Flaky node.js unit test: ${message}`);
		}
	}
}

/**
 * Describes a rerun target on one line, so that a title with line breaks stays in one
 * list entry and one CI annotation.
 * @param {IRerunTarget} target
 */
function describeTarget(target) {
	return `${target.label.replace(/\s*[\n\r\u2028\u2029]+\s*/g, ' ')} (${target.file})`;
}

/**
 * Escapes a title for a grep. Line terminators are escaped too, because mocha reads a
 * grep string only up to the first one.
 * @param {string} value
 */
function escapeRegExp(value) {
	return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').replace(/[\n\r\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

// Only a run of all test files is spread across worker processes, reruns of failed tests run in one process
let workerCount = 1;
try {
	workerCount = getWorkerCount(args.workers);
} catch (error) {
	console.error(/** @type {Error} */ (error).message);
	process.exit(1);
}
const runInParallel = workerCount > 1 && !args.run && !args.runList && !args.runGlob && !args.grep && !args.coverage;
if (runInParallel) {
	// This process only starts the workers, each of which is a separate instance of this script and does not rerun its failures
	runInWorkers({
		name: 'Node.js unit tests',
		count: workerCount,
		command: process.execPath,
		args: [...process.execArgv, ...removeArgument(removeArgument(process.argv.slice(1), 'workers'), 'rerun-failed-files')],
	}).then(({ failures, unattributedFailures }) => {
		const failureCount = failures.length + unattributedFailures.length;
		// Only reruns check which tests passed
		process.exit(failureCount ? rerunFailedTests({ failureCount, failures, passed: [], unattributedFailures }) : 0);
	}, error => {
		console.error(error);
		process.exit(1);
	});
} else {
	if (workerCount > 1) {
		console.log('Running in a single process, because --workers only applies when all test files run without --grep or --coverage');
	}
	main();
}
