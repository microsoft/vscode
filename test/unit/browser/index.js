/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const path = require('path');
const glob = require('glob');
const events = require('events');
const mocha = require('mocha');
const createStatsCollector = require('mocha/lib/stats-collector');
const MochaJUnitReporter = require('mocha-junit-reporter');
const url = require('url');
const minimatch = require('minimatch');
const fs = require('fs');
const playwright = require('@playwright/test');
const { applyReporter } = require('../reporter');
const yaserver = require('yaserver');
const http = require('http');
const { randomBytes } = require('crypto');
const minimist = require('minimist');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');

/**
 * @type {{
 * run: string;
 * runList: string;
 * grep: string;
 * runGlob: string;
 * browser: string;
 * reporter: string;
 * 'reporter-options': string;
 * tfs: string;
 * 'stall-timeout': string;
 * 'rerun-failed-files': string;
 * build: boolean;
 * debug: boolean;
 * sequential: boolean;
 * help: boolean;
 * }}
*/
const args = minimist(process.argv.slice(2), {
	boolean: ['build', 'debug', 'sequential', 'help'],
	string: ['run', 'runList', 'grep', 'runGlob', 'browser', 'reporter', 'reporter-options', 'tfs', 'stall-timeout', 'rerun-failed-files'],
	default: {
		build: false,
		browser: ['chromium', 'firefox', 'webkit'],
		reporter: process.platform === 'win32' ? 'list' : 'spec',
		'reporter-options': '',
		'stall-timeout': '300'
	},
	alias: {
		grep: ['g', 'f'],
		runGlob: ['glob', 'runGrep'],
		debug: ['debug-browser'],
		help: 'h'
	},
	describe: {
		build: 'run with build output (out-build)',
		run: 'only run tests matching <relative_file_path>',
		runList: 'only run tests whose files are listed in <file>, one per line',
		grep: 'only run tests matching <pattern>',
		debug: 'do not run browsers headless',
		sequential: 'only run suites for a single browser at a time',
		browser: 'browsers in which tests should run',
		reporter: 'the mocha reporter',
		'reporter-options': 'the mocha reporter options',
		tfs: 'tfs',
		'stall-timeout': 'abort with diagnostics when no test progress is reported for <seconds> (0 disables)',
		'rerun-failed-files': 'rerun the failed tests in a freshly launched browser up to <count> more times',
		help: 'show the help'
	}
});

if (args.help) {
	console.log(`Usage: node ${process.argv[1]} [options]

Options:
--build              run with build output (out-build)
--run <relative_file_path> only run tests matching <relative_file_path>
--runList <file>     only run tests whose files are listed in <file>, one per line
--grep, -g, -f <pattern> only run tests matching <pattern>
--debug, --debug-browser do not run browsers headless
--sequential         only run suites for a single browser at a time
--browser <browser>  browsers in which tests should run. separate the channel with a dash, e.g. 'chromium-msedge' or 'chromium-chrome'
--reporter <reporter> the mocha reporter
--reporter-options <reporter-options> the mocha reporter options
--tfs <tfs>          tfs
--stall-timeout <seconds> abort with diagnostics when no test progress is reported for <seconds> (default 300, 0 disables)
--rerun-failed-files <count> rerun the failed tests (the suite of a failed hook) in a freshly launched browser up to <count> more times, or their whole test files when there are too many failures
--help, -h           show the help`);
	process.exit(0);
}

// --runList: the listed test files as compiled modules relative to the output folder (src/vs/a.test.ts is vs/a.test.js)
const runList = args.runList ? new Set(fs.readFileSync(args.runList, 'utf8').split(/\r?\n/).map(line => line.trim().replace(/\\/g, '/')).filter(line => line.length > 0).map(line => line.replace(/^src\//, '').replace(/\.ts$/, '.js'))) : undefined;

const isDebug = !!args.debug;
const stallTimeoutMs = isDebug ? 0 : Math.max(0, Number(args['stall-timeout']) || 0) * 1000;

/**
 * With more failed tests and suites than this, a rerun repeats whole test files
 * instead of selecting the failures by title.
 */
const MAX_RERUN_TARGETS = 50;

const withReporter = (function () {
	if (args.tfs) {
		{
			const testResultsRoot = process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE;
			return (browserType, runner, attempt) => {
				// every attempt writes its own results file, so that reruns do not overwrite earlier failures
				const attemptSuffix = attempt > 1 ? `-attempt-${attempt}` : '';
				new mocha.reporters.Dot(runner);
				new MochaJUnitReporter(runner, {
					reporterOptions: {
						testsuitesTitle: `${args.tfs} ${process.platform}${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
						mochaFile: testResultsRoot ? path.join(testResultsRoot, `test-results/${process.platform}-${process.arch}-${browserType}-${args.tfs.toLowerCase().replace(/[^\w]/g, '-')}${attemptSuffix}-results.xml`) : undefined
					}
				});
			};
		}
	} else {
		return (_, runner) => applyReporter(runner, args);
	}
})();

const outdir = args.build ? 'out-build' : 'out';
const rootDir = path.resolve(__dirname, '..', '..', '..');
const out = path.join(rootDir, `${outdir}`);

function ensureIsArray(a) {
	return Array.isArray(a) ? a : [a];
}

const testModules = (async function () {

	const excludeGlob = '**/{node,electron-browser,electron-main,electron-utility}/**/*.test.js';
	let isDefaultModules = true;
	let promise;

	if (args.run) {
		// use file list (--run)
		isDefaultModules = false;
		promise = Promise.resolve(ensureIsArray(args.run).map(file => {
			file = file.replace(/^src/, 'out');
			file = file.replace(/\.ts$/, '.js');
			return path.relative(out, file);
		}));

	} else {
		// glob patterns (--glob)
		const defaultGlob = '**/*.test.js';
		const pattern = args.runGlob || defaultGlob;
		isDefaultModules = pattern === defaultGlob;

		promise = new Promise((resolve, reject) => {
			glob(pattern, { cwd: out }, (err, files) => {
				if (err) {
					reject(err);
				} else {
					resolve(runList ? files.filter(file => runList.has(file)) : files);
				}
			});
		});
	}

	return promise.then(files => {
		const modules = [];
		for (const file of files) {
			if (!minimatch(file, excludeGlob)) {
				modules.push(file.replace(/\.js$/, ''));

			} else if (!isDefaultModules) {
				console.warn(`DROPPING ${file} because it cannot be run inside a browser`);
			}
		}
		return modules;
	});
})();

function consoleLogFn(msg) {
	const type = msg.type();
	const candidate = console[type];
	if (candidate) {
		return candidate;
	}

	if (type === 'warning') {
		return console.warn;
	}

	return console.log;
}

async function createServer() {
	// Demand a prefix to avoid issues with other services on the
	// machine being able to access the test server.
	const prefix = '/' + randomBytes(16).toString('hex');
	const serveStatic = await yaserver.createServer({ rootDir });

	/** Handles a request for a remote method call, invoking `fn` and returning the result */
	const remoteMethod = async (req, response, fn) => {
		const params = await new Promise((resolve, reject) => {
			const body = [];
			req.on('data', chunk => body.push(chunk));
			req.on('end', () => resolve(JSON.parse(Buffer.concat(body).toString())));
			req.on('error', reject);
		});
		try {
			const result = await fn(...params);
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify(result));
		} catch (err) {
			response.writeHead(500);
			response.end(err.message);
		}
	};

	const server = http.createServer((request, response) => {
		if (!request.url?.startsWith(prefix)) {
			return response.writeHead(404).end();
		}

		// rewrite the URL so the static server can handle the request correctly
		request.url = request.url.slice(prefix.length);

		function massagePath(p) {
			// TODO@jrieken FISHY but it enables snapshot
			// in ESM browser tests
			p = String(p).replace(/\\/g, '/').replace(prefix, rootDir);
			return p;
		}

		switch (request.url) {
			case '/remoteMethod/__readFileInTests':
				return remoteMethod(request, response, p => fs.promises.readFile(massagePath(p), 'utf-8'));
			case '/remoteMethod/__writeFileInTests':
				return remoteMethod(request, response, (p, contents) => fs.promises.writeFile(massagePath(p), contents));
			case '/remoteMethod/__readDirInTests':
				return remoteMethod(request, response, p => fs.promises.readdir(massagePath(p)));
			case '/remoteMethod/__unlinkInTests':
				return remoteMethod(request, response, p => fs.promises.unlink(massagePath(p)));
			case '/remoteMethod/__mkdirPInTests':
				return remoteMethod(request, response, p => fs.promises.mkdir(massagePath(p), { recursive: true }));
			default:
				return serveStatic.handle(request, response);
		}
	});

	return new Promise((resolve, reject) => {
		server.listen(0, 'localhost', () => {
			resolve({
				dispose: () => server.close(),
				// @ts-ignore
				url: `http://localhost:${server.address().port}${prefix}`
			});
		});
		server.on('error', reject);
	});
}

/**
 * Runs the test modules once in a newly launched browser. Returns the failure message
 * for the console, if any test failed, and which tests passed and failed.
 * @param {string[]} testModules
 * @param browserType the Playwright browser: chromium, firefox or webkit
 * @param {string | undefined} browserChannel
 * @param {string | undefined} grep
 * @param {number} attempt
 * @param {IRerunTarget[] | undefined} rerunTargets
 * @returns {Promise<{ message: string | undefined; failures: IFailure[]; passed: IPassed[]; unattributedFailures: string[] }>}
 */
async function runTestsInBrowser(testModules, browserType, browserChannel, grep, attempt, rerunTargets) {
	const server = await createServer();
	const browser = await playwright[browserType].launch({ headless: !Boolean(args.debug), devtools: Boolean(args.debug), channel: browserChannel });
	const context = await browser.newContext();
	const page = await context.newPage();
	const target = new URL(server.url + '/test/unit/browser/renderer.html');
	target.searchParams.set('baseUrl', url.pathToFileURL(path.join(rootDir, 'src')).toString());
	if (args.build) {
		target.searchParams.set('build', 'true');
	}
	if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE) {
		target.searchParams.set('ci', 'true');
	}

	// append CSS modules as query-param
	await promisify(require('glob'))('**/*.css', { cwd: out }).then(async cssModules => {
		const cssData = await new Response((await new Response(cssModules.join(',')).blob()).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
		target.searchParams.set('_devCssData', Buffer.from(cssData).toString('base64'));
	});

	const emitter = new events.EventEmitter();
	const progress = new TestProgress();
	await page.exposeFunction('mocha_report', (type, data1, data2) => {
		progress.onEvent(type, data1);
		emitter.emit(type, data1, data2);
	});

	await page.goto(target.href);

	if (args.build) {
		const nlsMessages = await fs.promises.readFile(path.join(out, 'nls.messages.json'), 'utf8');
		await page.evaluate(value => {
			// when running from `out-build`, ensure to load the default
			// messages file, because all `nls.localize` calls have their
			// english values removed and replaced by an index.
			// @ts-ignore
			globalThis._VSCODE_NLS_MESSAGES = JSON.parse(value);
		}, nlsMessages);
	}

	page.on('console', async msg => {
		consoleLogFn(msg)(msg.text(), await Promise.all(msg.args().map(async arg => await arg.jsonValue())));
	});

	withReporter(browserType, new EchoRunner(emitter, browserChannel ? `${browserType.toUpperCase()}-${browserChannel.toUpperCase()}` : browserType.toUpperCase()), attempt);

	/** @type {IFailure[]} failed tests and hooks that belong to a test file */
	const failures = [];
	/** @type {IPassed[]} */
	const passed = [];
	/** @type {string[]} failures that do not belong to a test file, such as root-level hooks */
	const unattributedFailures = [];
	emitter.on('pass', test => passed.push({ titlePath: test.titlePath, file: test.file, ambiguous: test.ambiguous }));
	emitter.on('fail', test => {
		if (test.file) {
			failures.push({ title: test.fullTitle, titlePath: test.titlePath, file: test.file, type: test.type, parentTitlePath: test.parentTitlePath, ambiguous: test.ambiguous });
		} else {
			unattributedFailures.push(test.fullTitle);
		}
	});

	// collection failures for console printing
	const failingModuleIds = [];
	const failingTests = [];
	emitter.on('fail', (test, err) => {
		failingTests.push({ title: test.fullTitle, message: err.message });

		if (err.stack) {
			const regex = /(vs\/.*\.test)\.js/;
			for (const line of String(err.stack).split('\n')) {
				const match = regex.exec(line);
				if (match) {
					failingModuleIds.push(match[1]);
					return;
				}
			}
		}
	});

	const stallWatchdog = startStallWatchdog(page, browserType, progress);
	try {
		// @ts-expect-error
		await page.evaluate(opts => loadAndRun(opts), {
			modules: testModules,
			grep,
			rerunTargets,
		});
	} finally {
		await stallWatchdog.dispose();
		if (!isDebug) {
			await page.removeAllListeners('console', { behavior: 'wait' });
			server?.dispose();
			await browser.close();
		}
	}

	let failureMessage;
	if (failingTests.length > 0) {
		let res = `The followings tests are failing:\n - ${failingTests.map(({ title, message }) => `${title} (reason: ${message})`).join('\n - ')}`;

		if (failingModuleIds.length > 0) {
			res += `\n\nTo DEBUG, open ${browserType.toUpperCase()} and navigate to ${target.href}?${failingModuleIds.map(module => `m=${module}`).join('&')}`;
		}

		failureMessage = `${res}\n`;
	}

	return { message: failureMessage, failures, passed, unattributedFailures };
}

/**
 * Tracks the mocha events reported by the page so that a stalled run can
 * report which test or hook was in flight.
 */
class TestProgress {
	constructor() {
		this.lastEventTime = Date.now();
		this.completed = 0;
		/** @type {{ title: string; startTime: number } | undefined} */
		this.currentTest = undefined;
		/** @type {{ title: string; startTime: number } | undefined} */
		this.currentHook = undefined;
		/** @type {string | undefined} */
		this.lastCompletedTest = undefined;
	}

	onEvent(type, runnable) {
		this.lastEventTime = Date.now();
		switch (type) {
			case 'test':
				this.currentTest = { title: runnable.fullTitle, startTime: this.lastEventTime };
				break;
			case 'test end':
				this.currentTest = undefined;
				this.lastCompletedTest = runnable.fullTitle;
				break;
			case 'hook':
				this.currentHook = { title: runnable.fullTitle, startTime: this.lastEventTime };
				break;
			case 'hook end':
				this.currentHook = undefined;
				break;
			case 'pass':
			case 'fail':
			case 'pending':
				// same events the dot reporter prints a character for
				this.completed++;
				break;
		}
	}
}

/**
 * Aborts the run with diagnostics when the page stops reporting test progress.
 * Mocha's per-test timeout cannot fire when the page itself is stuck, which
 * otherwise leaves CI silent until the step timeout.
 */
function startStallWatchdog(page, browserType, progress) {
	if (!stallTimeoutMs) {
		return { dispose: async () => { } };
	}

	/** @type {Promise<void> | undefined} */
	let diagnostics;
	progress.lastEventTime = Date.now();
	const handle = setInterval(() => {
		if (Date.now() - progress.lastEventTime >= stallTimeoutMs) {
			clearInterval(handle);
			diagnostics = reportStallAndExit(page, browserType, progress);
		}
	}, Math.min(10_000, stallTimeoutMs));

	return {
		// Once a stall was detected the run must fail, even if the page recovers
		// while diagnostics are collected, so wait for them (they exit the process).
		dispose: async () => {
			clearInterval(handle);
			await diagnostics;
		}
	};
}

async function reportStallAndExit(page, browserType, progress) {
	const log = message => console.error(`[${browserType}] ${message}`);
	const ago = time => `${Math.round((Date.now() - time) / 1000)}s ago`;
	try {
		process.stdout.write('\n'); // terminate a partially written reporter line
		log(`No test progress since ${ago(progress.lastEventTime)}, aborting (--stall-timeout ${stallTimeoutMs / 1000}).`);
		log(`  Completed tests: ${progress.completed}`);
		log(`  In-flight test: ${progress.currentTest ? `${progress.currentTest.title} (started ${ago(progress.currentTest.startTime)})` : 'none'}`);
		log(`  In-flight hook: ${progress.currentHook ? `${progress.currentHook.title} (started ${ago(progress.currentHook.startTime)})` : 'none'}`);
		log(`  Last completed test: ${progress.lastCompletedTest ?? 'none'}`);

		const probe = await raceTimeout(page.evaluate(() => document.readyState), 10_000);
		log(`  Page responds to evaluate(): ${probe.ok ? 'yes' : `no (${probe.error})`}`);

		await dumpBrowserProcesses(browserType, log);
	} catch (err) {
		log(`  Failed to collect stall diagnostics: ${err}`);
	} finally {
		process.exit(1);
	}
}

function raceTimeout(promise, ms) {
	let timer;
	return Promise.race([
		promise.then(() => ({ ok: true, error: undefined }), err => ({ ok: false, error: String(err?.message ?? err) })),
		new Promise(resolve => timer = setTimeout(() => resolve({ ok: false, error: `no response within ${ms}ms` }), ms))
	]).finally(() => clearTimeout(timer));
}

/**
 * Logs the browser processes launched by this runner (CPU usage tells a busy
 * loop from a deadlock) and, on macOS, writes native stack samples next to
 * the other CI logs.
 */
async function dumpBrowserProcesses(browserType, log) {
	if (process.platform === 'win32') {
		return;
	}

	const execFileAsync = promisify(execFile);
	const { stdout } = await execFileAsync('ps', ['-A', '-ww', '-o', 'pid=,ppid=,pcpu=,rss=,etime=,command='], { maxBuffer: 16 * 1024 * 1024 });
	const all = stdout.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
		const [pid, ppid, cpu, rss, elapsed, ...command] = line.split(/\s+/);
		return { pid: Number(pid), ppid: Number(ppid), cpu, rss, elapsed, command: command.join(' ') };
	});

	// The launched browser (bundled, headless shell or an installed channel) and
	// its helpers are descendants of this process. WebKit's XPC services on macOS
	// are spawned by launchd instead, so also include processes running from the
	// same Playwright browser installation as a launched process.
	const pids = new Set([process.pid]);
	for (let size = 0; size !== pids.size;) {
		size = pids.size;
		for (const p of all) {
			if (pids.has(p.ppid)) {
				pids.add(p.pid);
			}
		}
	}
	pids.delete(process.pid);
	const installRoots = new Set();
	for (const p of all) {
		const installRoot = pids.has(p.pid) ? /^(.*?[\\/]ms-playwright[\\/][^\\/]+[\\/])/.exec(p.command)?.[1] : undefined;
		if (installRoot) {
			installRoots.add(installRoot);
		}
	}
	const processes = all.filter(p => !p.command.startsWith('ps -A') && (pids.has(p.pid) || [...installRoots].some(root => p.command.includes(root))));

	log(`  Browser processes (pid, ppid, %cpu, rss KiB, elapsed, command):`);
	for (const p of processes) {
		const line = `${p.pid} ${p.ppid} ${p.cpu} ${p.rss} ${p.elapsed} ${p.command}`;
		log(`    ${line.length > 300 ? `${line.slice(0, 300)}...` : line}`);
	}

	if (process.platform !== 'darwin') {
		return;
	}

	const outDir = path.join(rootDir, '.build', 'logs', 'browser-unit-stall');
	await fs.promises.mkdir(outDir, { recursive: true });
	await Promise.all(processes.map(async ({ pid }) => {
		const file = path.join(outDir, `${browserType}-${pid}.sample.txt`);
		try {
			await execFileAsync('sample', [pid, '3', '-file', file], { timeout: 180_000 }); // symbolication of browser frameworks is slow
			log(`  Wrote native stack sample of pid ${pid} to ${path.relative(rootDir, file)}`);
		} catch (err) {
			log(`  Failed to sample pid ${pid}: ${err.message}`);
		}
	}));
}

class EchoRunner extends events.EventEmitter {

	constructor(event, title = '') {
		super();
		createStatsCollector(this);
		event.on('start', () => this.emit('start'));
		event.on('end', () => this.emit('end'));
		event.on('suite', (suite) => this.emit('suite', EchoRunner.deserializeSuite(suite, title)));
		event.on('suite end', (suite) => this.emit('suite end', EchoRunner.deserializeSuite(suite, title)));
		event.on('test', (test) => this.emit('test', EchoRunner.deserializeRunnable(test)));
		event.on('test end', (test) => this.emit('test end', EchoRunner.deserializeRunnable(test)));
		event.on('hook', (hook) => this.emit('hook', EchoRunner.deserializeRunnable(hook)));
		event.on('hook end', (hook) => this.emit('hook end', EchoRunner.deserializeRunnable(hook)));
		event.on('pass', (test) => this.emit('pass', EchoRunner.deserializeRunnable(test)));
		event.on('fail', (test, err) => this.emit('fail', EchoRunner.deserializeRunnable(test, title), EchoRunner.deserializeError(err)));
		event.on('pending', (test) => this.emit('pending', EchoRunner.deserializeRunnable(test)));
	}

	static deserializeSuite(suite, titleExtra) {
		return {
			root: suite.root,
			suites: suite.suites,
			tests: suite.tests,
			title: titleExtra && suite.title ? `${suite.title} - /${titleExtra}/` : suite.title,
			titlePath: () => suite.titlePath,
			fullTitle: () => suite.fullTitle,
			timeout: () => suite.timeout,
			retries: () => suite.retries,
			slow: () => suite.slow,
			bail: () => suite.bail
		};
	}

	static deserializeRunnable(runnable, titleExtra) {
		return {
			title: runnable.title,
			fullTitle: () => titleExtra && runnable.fullTitle ? `${runnable.fullTitle} - /${titleExtra}/` : runnable.fullTitle,
			titlePath: () => runnable.titlePath,
			async: runnable.async,
			slow: () => runnable.slow,
			speed: runnable.speed,
			duration: runnable.duration,
			currentRetry: () => runnable.currentRetry,
		};
	}

	static deserializeError(err) {
		const inspect = err.inspect;
		err.inspect = () => inspect;
		return err;
	}
}

/**
 * A failed test or hook of a test file.
 * @typedef {{ title: string; titlePath: string[]; file: string; type: string; parentTitlePath: string[]; ambiguous: boolean }} IFailure
 */

/**
 * A test that passed.
 * @typedef {{ titlePath: string[]; file: string; ambiguous: boolean }} IPassed
 */

/**
 * What a rerun runs to establish that a failure was flaky: a failed test by its full
 * title, the suite of a failed hook, or the test file of a failed hook outside any suite.
 * @typedef {{ kind: 'test' | 'suite' | 'file'; file: string; titlePath: string[]; label: string; ambiguous: boolean }} IRerunTarget
 */

/**
 * The test files that a rerun loads, and the grep that selects their tests.
 * @typedef {{ byTitle: boolean; files: string[]; grep: string | undefined; targets: IRerunTarget[] | undefined }} IRerunPlan
 */

/**
 * When a rerun target did not pass, and when it passed.
 * @typedef {{ target: IRerunTarget; firstAttempt: number; lastAttempt: number; passedInAttempt?: number }} IRerunRecord
 */

/**
 * Runs the tests in a browser, and reruns the failed ones, each time in a freshly launched
 * browser, up to `--rerun-failed-files` more times. Returns the failure message of the last
 * attempt when failures remain.
 * @param {string[]} modules
 * @param {string} browserType
 * @param {string | undefined} browserChannel
 * @returns {Promise<string | undefined>}
 */
async function runTestsWithReruns(modules, browserType, browserChannel) {
	// the browser stays open for debugging
	const maxReruns = isDebug ? 0 : Math.max(0, Number(args['rerun-failed-files']) || 0);
	const browserName = browserChannel ? `${browserType}-${browserChannel}` : browserType;

	/** @type {Map<string, IRerunRecord>} every failure that was a rerun target, by key */
	const records = new Map();
	/** @type {Map<string, IRerunTarget>} the failures that did not pass since they failed */
	const targets = new Map();
	/** @type {IRerunPlan | undefined} what the current attempt reruns, unless it is the first */
	let plan;
	let attemptModules = modules;
	/** @type {string | undefined} */
	let grep = args.grep;

	for (let attempt = 1; ; attempt++) {
		const result = await runTestsInBrowser(attemptModules, browserType, browserChannel, grep, attempt, plan?.targets);
		if (!plan && result.failures.length === 0 && result.unattributedFailures.length === 0) {
			return undefined;
		}

		// A failure outside any test file can stop the run early, so the attempt does not establish that anything passed.
		if (plan && result.unattributedFailures.length === 0) {
			for (const key of findPassedTargets(targets, result)) {
				targets.delete(key);
				const record = records.get(key);
				if (record) {
					record.passedInAttempt = attempt;
				}
			}
		}
		for (const [key, target] of targetsFromFailures(result.failures)) {
			if (targets.get(key)?.ambiguous) {
				target.ambiguous = true;
			}
			targets.set(key, target);
		}
		recordNotPassed(records, targets, attempt);

		if (targets.size === 0 && result.unattributedFailures.length === 0) {
			reportFlakyTests(records, browserName);
			return undefined;
		}

		if (result.unattributedFailures.length > 0 && maxReruns > 0) {
			console.error(`\n[${browserName}] ${plan ? `Not counting attempt ${attempt}` : 'Not rerunning failed tests'}: ${result.unattributedFailures.length} failure(s) do not belong to a test file:\n${result.unattributedFailures.map(title => `  ${title}`).join('\n')}`);
		} else if (attempt <= maxReruns) {
			plan = planRerun(targets);
			console.log(plan.byTitle
				? `\n[${browserName}] Rerunning ${targets.size} failed test(s) in a freshly launched browser (attempt ${attempt + 1} of ${maxReruns + 1}):\n${[...targets.values()].map(target => `  ${describeTarget(target)}`).join('\n')}\n`
				: `\n[${browserName}] Rerunning the test files of ${targets.size} failed test(s) in a freshly launched browser (attempt ${attempt + 1} of ${maxReruns + 1}):\n${plan.files.map(file => `  ${file}`).join('\n')}\n`);
			attemptModules = plan.files;
			grep = plan.grep;
			continue;
		}

		if (plan) {
			console.error(`\n[${browserName}] ${targets.size} failed test(s) did not pass in ${attempt} attempts:\n${[...targets.values()].map(target => `  ${describeTarget(target)}`).join('\n')}`);
		}
		reportFlakyTests(records, browserName);
		// the last attempt need not fail any test, for example when it did not run a failed test whose title changed
		return result.message ?? `[${browserName}] ${targets.size} failed test(s) did not pass in ${attempt} attempts\n`;
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
			target = { kind: 'test', file: failure.file, titlePath: failure.titlePath, label: failure.title, ambiguous: failure.ambiguous };
		} else if (failure.parentTitlePath.length > 0) {
			// a failed hook skips the rest of its suite
			target = { kind: 'suite', file: failure.file, titlePath: failure.parentTitlePath, label: failure.title, ambiguous: failure.ambiguous };
		} else {
			target = { kind: 'file', file: failure.file, titlePath: [], label: failure.title, ambiguous: failure.ambiguous };
		}

		const key = JSON.stringify([target.kind, target.file, target.titlePath]);
		if (!targets.has(key) || target.ambiguous) {
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
		return { byTitle, files, grep: args.grep, targets: undefined };
	}

	// mocha matches the grep against the full title of every test
	const selection = [...targets.values()].map(target => target.kind === 'test' ? escapeRegExp(target.titlePath.join(' ')) : `${escapeRegExp(target.titlePath.join(' '))} [\\s\\S]*`).join('|');
	return { byTitle, files, grep: args.grep ? `^(?=[\\s\\S]*(?:${args.grep}))(?:${selection})$` : `^(?:${selection})$`, targets: [...targets.values()] };
}

/**
 * Returns the keys of the targets that passed in the rerun. The rerun must have run and
 * passed the failed test, or a test of the failed hook's suite, so that a failure that
 * the rerun did not select does not count as passing. A failed hook outside any suite
 * passes with its whole test file.
 * @param {Map<string, IRerunTarget>} targets
 * @param {{ failures: IFailure[]; passed: IPassed[] }} result
 * @returns {string[]}
 */
function findPassedTargets(targets, result) {
	return [...targets].filter(([, target]) => {
		if (target.ambiguous) {
			return false;
		}
		const failures = result.failures.filter(failure => failure.file === target.file);
		const failedPaths = new Set(failures.map(failure => JSON.stringify(failure.titlePath)));
		// A test that passes and then fails in teardown is reported both ways.
		const passed = result.passed.filter(test => test.file === target.file && !test.ambiguous && !failedPaths.has(JSON.stringify(test.titlePath)));
		if (target.kind === 'file') {
			return failures.length === 0 && passed.length > 0;
		}
		if (target.kind === 'test') {
			return passed.some(test => JSON.stringify(test.titlePath) === JSON.stringify(target.titlePath));
		}
		const isInSuite = titlePath => titlePath.length > target.titlePath.length && target.titlePath.every((title, index) => title === titlePath[index]);
		return passed.some(test => isInSuite(test.titlePath)) && !failures.some(failure => isInSuite(failure.titlePath));
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
 * @param {string} browserName
 */
function reportFlakyTests(records, browserName) {
	const flaky = [...records.values()].filter(record => record.passedInAttempt !== undefined);
	if (flaky.length === 0) {
		return;
	}

	console.log(`\n[${browserName}] ${flaky.length} failed test(s) passed when rerun in a freshly launched browser. They are flaky:`);
	for (const record of flaky) {
		const failed = record.firstAttempt === record.lastAttempt ? `failed in attempt ${record.firstAttempt}` : `did not pass in attempts ${record.firstAttempt} to ${record.lastAttempt}`;
		const message = `${describeTarget(record.target)} ${failed} and ${record.target.kind === 'file' ? 'its test file passed' : 'passed'} in attempt ${record.passedInAttempt}`;
		console.log(`  ${message}`);
		if (process.env.GITHUB_ACTIONS) {
			console.log(`::warning title=Flaky browser unit test (${browserName})::${message}`);
		} else if (process.env.TF_BUILD) {
			console.log(`##vso[task.logissue type=warning]Flaky browser unit test (${browserName}): ${message}`);
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

testModules.then(async modules => {

	if (runList) {
		console.log(`Running the ${modules.length} browser test files of the ${runList.size} files listed in ${args.runList}`);
		if (modules.length === 0) {
			process.exit(0);
		}
	}

	// run tests in selected browsers
	const browsers = Array.isArray(args.browser)
		? args.browser : [args.browser];

	let messages = [];
	let didFail = false;

	try {
		if (args.sequential) {
			for (const browser of browsers) {
				const [browserType, browserChannel] = browser.split('-');
				messages.push(await runTestsWithReruns(modules, browserType, browserChannel));
			}
		} else {
			messages = await Promise.all(browsers.map(async browser => {
				const [browserType, browserChannel] = browser.split('-');
				return await runTestsWithReruns(modules, browserType, browserChannel);
			}));
		}
	} catch (err) {
		console.error(err);
		if (!isDebug) {
			process.exit(1);
		}
	}

	// aftermath
	for (const msg of messages) {
		if (msg) {
			didFail = true;
			console.log(msg);
		}
	}
	if (!isDebug) {
		process.exit(didFail ? 1 : 0);
	}

}).catch(err => {
	console.error(err);
});
