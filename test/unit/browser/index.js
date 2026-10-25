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
 * grep: string;
 * runGlob: string;
 * browser: string;
 * reporter: string;
 * 'reporter-options': string;
 * tfs: string;
 * 'stall-timeout': string;
 * build: boolean;
 * debug: boolean;
 * sequential: boolean;
 * help: boolean;
 * }}
*/
const args = minimist(process.argv.slice(2), {
	boolean: ['build', 'debug', 'sequential', 'help'],
	string: ['run', 'grep', 'runGlob', 'browser', 'reporter', 'reporter-options', 'tfs', 'stall-timeout'],
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
		grep: 'only run tests matching <pattern>',
		debug: 'do not run browsers headless',
		sequential: 'only run suites for a single browser at a time',
		browser: 'browsers in which tests should run',
		reporter: 'the mocha reporter',
		'reporter-options': 'the mocha reporter options',
		tfs: 'tfs',
		'stall-timeout': 'abort with diagnostics when no test progress is reported for <seconds> (0 disables)',
		help: 'show the help'
	}
});

if (args.help) {
	console.log(`Usage: node ${process.argv[1]} [options]

Options:
--build              run with build output (out-build)
--run <relative_file_path> only run tests matching <relative_file_path>
--grep, -g, -f <pattern> only run tests matching <pattern>
--debug, --debug-browser do not run browsers headless
--sequential         only run suites for a single browser at a time
--browser <browser>  browsers in which tests should run. separate the channel with a dash, e.g. 'chromium-msedge' or 'chromium-chrome'
--reporter <reporter> the mocha reporter
--reporter-options <reporter-options> the mocha reporter options
--tfs <tfs>          tfs
--stall-timeout <seconds> abort with diagnostics when no test progress is reported for <seconds> (default 300, 0 disables)
--help, -h           show the help`);
	process.exit(0);
}

const isDebug = !!args.debug;
const stallTimeoutMs = isDebug ? 0 : Math.max(0, Number(args['stall-timeout']) || 0) * 1000;

const withReporter = (function () {
	if (args.tfs) {
		{
			const testResultsRoot = process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE;
			return (browserType, runner) => {
				new mocha.reporters.Dot(runner);
				new MochaJUnitReporter(runner, {
					reporterOptions: {
						testsuitesTitle: `${args.tfs} ${process.platform}`,
						mochaFile: testResultsRoot ? path.join(testResultsRoot, `test-results/${process.platform}-${process.arch}-${browserType}-${args.tfs.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`) : undefined
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
					resolve(files);
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

async function runTestsInBrowser(testModules, browserType, browserChannel) {
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

	withReporter(browserType, new EchoRunner(emitter, browserChannel ? `${browserType.toUpperCase()}-${browserChannel.toUpperCase()}` : browserType.toUpperCase()));

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
			grep: args.grep,
		});
	} finally {
		await stallWatchdog.dispose();
		if (!isDebug) {
			await page.removeAllListeners('console', { behavior: 'wait' });
			server?.dispose();
			await browser.close();
		}
	}

	if (failingTests.length > 0) {
		let res = `The followings tests are failing:\n - ${failingTests.map(({ title, message }) => `${title} (reason: ${message})`).join('\n - ')}`;

		if (failingModuleIds.length > 0) {
			res += `\n\nTo DEBUG, open ${browserType.toUpperCase()} and navigate to ${target.href}?${failingModuleIds.map(module => `m=${module}`).join('&')}`;
		}

		return `${res}\n`;
	}
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

testModules.then(async modules => {

	// run tests in selected browsers
	const browsers = Array.isArray(args.browser)
		? args.browser : [args.browser];

	let messages = [];
	let didFail = false;

	try {
		if (args.sequential) {
			for (const browser of browsers) {
				const [browserType, browserChannel] = browser.split('-');
				messages.push(await runTestsInBrowser(modules, browserType, browserChannel));
			}
		} else {
			messages = await Promise.all(browsers.map(async browser => {
				const [browserType, browserChannel] = browser.split('-');
				return await runTestsInBrowser(modules, browserType, browserChannel);
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
