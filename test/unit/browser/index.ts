/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import glob from 'glob';
import * as events from 'events';
import mocha from 'mocha';
import createStatsCollector from 'mocha/lib/stats-collector.js';
import MochaJUnitReporter from 'mocha-junit-reporter';
import * as url from 'url';
import minimatch from 'minimatch';
import * as fs from 'fs';
import * as playwright from '@playwright/test';
import { applyReporter } from '../reporter.mts';
import parallel from '../parallel.ts';
import yaserver from 'yaserver';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { randomBytes } from 'crypto';
import minimist from 'minimist';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

interface IWorker {
	workerId: string;
	workerDir: string;
}

/**
 * The failures of a worker, as parallel.ts reports them to the process that started the workers.
 */
interface IWorkerReport {
	failures: { title: string; file: string; type: string }[];
	unattributedFailures: string[];
}

/**
 * How the page of a worker claims the test files it runs, see createTestFileClaims in parallel.ts.
 */
interface ITestFileClaims {
	start(fileCount: number): void;
	claim(file: string): boolean;
	claimAll(): boolean;
	recordRun(files: string[]): void;
}

/**
 * The functions of parallel.ts that this runner uses. parallel.ts exports them with
 * `module.exports`, which TypeScript does not read, so their signatures are repeated here.
 */
interface IParallel {
	getWorkerCount(value: string | undefined): number;
	getWorkerCountForFiles(count: number, fileCount: number): number;
	removeArgument(argv: string[], name: string): string[];
	runInWorkers(options: { name: string; count: number; command: string; args: string[] }): Promise<IWorkerReport>;
	writeWorkerReport(worker: IWorker, report: IWorkerReport): void;
	createTestFileClaims(worker: IWorker): ITestFileClaims;
	trackTestFiles(root: mocha.Suite): Map<string, unknown>;
	distributeClaimedTestFiles(root: mocha.Suite, files: Map<string, unknown>, claims: ITestFileClaims): void;
}

const { getWorkerCount, getWorkerCountForFiles, removeArgument, runInWorkers, writeWorkerReport, createTestFileClaims, trackTestFiles, distributeClaimedTestFiles } = parallel as IParallel;

// mocha-junit-reporter is a constructor function, which its JSDoc does not mark as one
const JUnitReporter = MochaJUnitReporter as unknown as new (...args: Parameters<typeof MochaJUnitReporter>) => object;

interface IArgs extends minimist.ParsedArgs {
	run?: string | string[];
	runList?: string;
	grep?: string;
	runGlob?: string;
	browser: string | string[];
	reporter: string;
	'reporter-options': string;
	tfs?: string;
	'stall-timeout': string;
	'rerun-failed-files'?: string;
	workers?: string;
	worker?: string;
	workerDir?: string;
	build: boolean;
	debug: boolean;
	sequential: boolean;
	help: boolean;
}

/** The Playwright browsers, which the first part of a `--browser` value names */
type BrowserType = 'chromium' | 'firefox' | 'webkit';

const args = minimist<IArgs>(process.argv.slice(2), {
	boolean: ['build', 'debug', 'sequential', 'help'],
	string: ['run', 'runList', 'grep', 'runGlob', 'browser', 'reporter', 'reporter-options', 'tfs', 'stall-timeout', 'rerun-failed-files', 'workers', 'worker', 'workerDir'],
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
--workers <count>    run all test files, or those of --runList, in <count> parallel processes, each with its own browser, at most one per CPU and per 2 GB of memory; with --runList, one per 75 test files that run, but at least 2 and at most one per file; browsers run one at a time; ignored with --run, --runGlob, --grep or --debug; reruns use one browser
--help, -h           show the help`);
	process.exit(0);
}

// --runList: the listed test files as compiled modules relative to the output folder (src/vs/a.test.ts is vs/a.test.js)
const runList = args.runList ? new Set(fs.readFileSync(args.runList, 'utf8').split(/\r?\n/).map(line => line.trim().replace(/\\/g, '/')).filter(line => line.length > 0).map(line => line.replace(/^src\//, '').replace(/\.ts$/, '.js'))) : undefined;

const isDebug = !!args.debug;
const stallTimeoutMs = isDebug ? 0 : Math.max(0, Number(args['stall-timeout']) || 0) * 1000;

// A run of all test files, or of those of --runList, is spread across worker processes, reruns of failed tests run in one browser
let workerCount = 1;
try {
	workerCount = getWorkerCount(args.workers);
} catch (error) {
	console.error((error as Error).message);
	process.exit(1);
}
const workersApply = args.workers !== undefined && !args.run && !args.runGlob && !args.grep && !isDebug;
if (workerCount > 1 && !workersApply) {
	console.log('Running in a single browser, because --workers only applies when all test files or those of --runList run, without --run, --runGlob, --grep or --debug');
}

/** this process is a worker of a parallel run, which only runs the test files it claims */
const worker: IWorker | undefined = args.worker && args.workerDir ? { workerId: args.worker, workerDir: args.workerDir } : undefined;

/**
 * With more failed tests and suites than this, a rerun repeats whole test files
 * instead of selecting the failures by title.
 */
const MAX_RERUN_TARGETS = 50;

const withReporter = (function () {
	const tfs = args.tfs;
	if (tfs) {
		{
			const testResultsRoot = process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE;
			return (browserType: string, runner: mocha.Runner, attempt: number) => {
				// every attempt and worker writes its own results file, so that reruns do not overwrite earlier failures
				const attemptSuffix = attempt > 1 ? `-attempt-${attempt}` : '';
				const workerSuffix = worker ? `-worker${worker.workerId}` : '';
				new mocha.reporters.Dot(runner);
				new JUnitReporter(runner, {
					reporterOptions: {
						testsuitesTitle: `${tfs} ${process.platform}${worker ? ` (worker ${worker.workerId})` : ''}${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
						// without a results folder, mocha-junit-reporter writes test-results.xml to the working directory
						mochaFile: testResultsRoot
							? path.join(testResultsRoot, `test-results/${process.platform}-${process.arch}-${browserType}-${tfs.toLowerCase().replace(/[^\w]/g, '-')}${workerSuffix}${attemptSuffix}-results.xml`)
							: worker ? `test-results-${browserType}${workerSuffix}.xml` : undefined
					}
				});
			};
		}
	} else {
		return (_: string, runner: mocha.Runner) => applyReporter(runner, args);
	}
})();

const outdir = args.build ? 'out-build' : 'out';
const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const out = path.join(rootDir, `${outdir}`);

function ensureIsArray<T>(a: T | T[]): T[] {
	return Array.isArray(a) ? a : [a];
}

const testModules = (async function () {

	const excludeGlob = '**/{node,electron-browser,electron-main,electron-utility}/**/*.test.js';
	let isDefaultModules = true;
	let promise: Promise<string[]>;

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
		const modules: string[] = [];
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

function consoleLogFn(msg: playwright.ConsoleMessage): (...args: unknown[]) => void {
	const type = msg.type();
	const candidate = (console as unknown as Record<string, ((...args: unknown[]) => void) | undefined>)[type];
	if (candidate) {
		return candidate;
	}

	if (type === 'warning') {
		return console.warn;
	}

	return console.log;
}

/**
 * @param claims how the page of a worker claims the test files it runs
 */
async function createServer(claims: ITestFileClaims | undefined): Promise<{ dispose(): void; url: string }> {
	// Demand a prefix to avoid issues with other services on the
	// machine being able to access the test server.
	const prefix = '/' + randomBytes(16).toString('hex');
	const serveStatic = await yaserver.createServer({ rootDir });

	/** Handles a request for a remote method call, invoking `fn` and returning the result */
	const remoteMethod = async <P extends unknown[]>(req: http.IncomingMessage, response: http.ServerResponse, fn: (...params: P) => unknown) => {
		const params = await new Promise<P>((resolve, reject) => {
			const body: Buffer[] = [];
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

		function massagePath(p: string) {
			// TODO@jrieken FISHY but it enables snapshot
			// in ESM browser tests
			p = String(p).replace(/\\/g, '/').replace(prefix, rootDir);
			return p;
		}

		switch (request.url) {
			case '/remoteMethod/__readFileInTests':
				return remoteMethod(request, response, (p: string) => fs.promises.readFile(massagePath(p), 'utf-8'));
			case '/remoteMethod/__writeFileInTests':
				return remoteMethod(request, response, (p: string, contents: string) => fs.promises.writeFile(massagePath(p), contents));
			case '/remoteMethod/__readDirInTests':
				return remoteMethod(request, response, (p: string) => fs.promises.readdir(massagePath(p)));
			case '/remoteMethod/__unlinkInTests':
				return remoteMethod(request, response, (p: string) => fs.promises.unlink(massagePath(p)));
			case '/remoteMethod/__mkdirPInTests':
				return remoteMethod(request, response, (p: string) => fs.promises.mkdir(massagePath(p), { recursive: true }));
		}

		// see createTestFileClaims in renderer.html, which parses every result, so none is `undefined`
		if (claims && request.url.startsWith('/testFileClaims/')) {
			switch (request.url.slice('/testFileClaims/'.length)) {
				case 'start':
					return remoteMethod(request, response, (fileCount: number) => {
						claims.start(fileCount);
						return null;
					});
				case 'claim':
					return remoteMethod(request, response, (file: string) => claims.claim(file));
				case 'claimAll':
					return remoteMethod(request, response, () => claims.claimAll());
				case 'recordRun':
					return remoteMethod(request, response, (files: string[]) => {
						claims.recordRun(files);
						return null;
					});
			}
		}

		return serveStatic.handle(request, response);
	});

	return new Promise((resolve, reject) => {
		server.listen(0, 'localhost', () => {
			resolve({
				dispose: () => server.close(),
				url: `http://localhost:${(server.address() as AddressInfo).port}${prefix}`
			});
		});
		server.on('error', reject);
	});
}

/**
 * What the isolation checks of the page record, see isolationCheck.ts.
 */
interface IIsolationGlobals {
	__vscodeTestIsolationFlush?: () => Promise<void>;
	__vscodeTestIsolationFindings?: object[];
}

/**
 * Appends what the isolation checks found (see isolationCheck.ts) to the JSON lines file in
 * VSCODE_TEST_ISOLATION_REPORT, one line per finding, so the findings of several runs end up in one file.
 */
async function writeIsolationFindings(page: playwright.Page, browserType: string) {
	const reportPath = process.env.VSCODE_TEST_ISOLATION_REPORT;
	if (!reportPath) {
		return;
	}
	const findings = await page.evaluate(async () => {
		try {
			// Settles checks that only a later suite would have settled, see flushIsolationChecks in isolationCheck.ts.
			await (globalThis as IIsolationGlobals).__vscodeTestIsolationFlush?.();
		} catch (error) {
			console.error(`Failed to flush isolation checks: ${error}`);
		}
		return (globalThis as IIsolationGlobals).__vscodeTestIsolationFindings ?? [];
	});
	if (findings.length) {
		try {
			await fs.promises.appendFile(reportPath, findings.map(finding => JSON.stringify({ runner: browserType, ...finding }) + '\n').join(''));
		} catch (error) {
			// The report is optional: never fail the run because of it.
			console.error(`Failed to write isolation findings to ${reportPath}: ${error}`);
		}
	}
}
/**
 * Runs the test modules once in a newly launched browser. Returns the failure message
 * for the console, if any test failed, and which tests passed and failed.
 */
async function runTestsInBrowser(testModules: string[], browserType: BrowserType, browserChannel: string | undefined, grep: string | undefined, attempt: number, rerunTargets: IRerunTarget[] | undefined): Promise<IAttemptResult> {
	// a worker of a parallel run (see parallel.ts) only runs the test files it claims
	const claims = worker ? createTestFileClaims(worker) : undefined;
	const server = await createServer(claims);
	const browser = await playwright[browserType].launch({ headless: !Boolean(args.debug), channel: browserChannel });
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
	await promisify(glob)('**/*.css', { cwd: out }).then(async cssModules => {
		const cssData = await new Response((await new Response(cssModules.join(',')).blob()).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
		target.searchParams.set('_devCssData', Buffer.from(cssData).toString('base64'));
	});

	const emitter = new events.EventEmitter();
	const progress = new TestProgress();
	await page.exposeFunction('mocha_report', (type: string, data1: ISerializedSuite | ISerializedRunnable | undefined, data2: ISerializedError | undefined) => {
		progress.onEvent(type, data1);
		emitter.emit(type, data1, data2);
	});

	if (claims) {
		// the page selects the test files it claims as the other runners do, see renderer.html
		await page.addInitScript({ content: `globalThis.parallelTestFiles = { trackTestFiles: ${trackTestFiles}, distributeTestFiles: ${distributeClaimedTestFiles} };` });
	}

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

	// EchoRunner replays the events of the page's mocha runner
	withReporter(browserType, new EchoRunner(emitter, browserChannel ? `${browserType.toUpperCase()}-${browserChannel.toUpperCase()}` : browserType.toUpperCase()) as mocha.Runner, attempt);

	/** failed tests and hooks that belong to a test file */
	const failures: IFailure[] = [];
	const passed: IPassed[] = [];
	/** failures that do not belong to a test file, such as root-level hooks */
	const unattributedFailures: string[] = [];
	emitter.on('pass', (test: ISerializedRunnable) => passed.push({ titlePath: test.titlePath, file: test.file, ambiguous: test.ambiguous }));
	emitter.on('fail', (test: ISerializedRunnable) => {
		if (test.file) {
			failures.push({ title: test.fullTitle, titlePath: test.titlePath, file: test.file, type: test.type, parentTitlePath: test.parentTitlePath, ambiguous: test.ambiguous });
		} else {
			unattributedFailures.push(test.fullTitle);
		}
	});

	// collection failures for console printing
	const failingModuleIds: string[] = [];
	const failingTests: { title: string; message: string }[] = [];
	emitter.on('fail', (test: ISerializedRunnable, err: ISerializedError) => {
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
			claimTestFiles: !!claims,
			isolationProbes: !!process.env.VSCODE_TEST_ISOLATION_REPORT,
		});
		await writeIsolationFindings(page, browserType);
	} finally {
		await stallWatchdog.dispose();
		if (!isDebug) {
			await page.removeAllListeners('console', { behavior: 'wait' });
			server?.dispose();
			await browser.close();
		}
	}

	let failureMessage: string | undefined;
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
	lastEventTime = Date.now();
	completed = 0;
	currentTest: { title: string; startTime: number } | undefined = undefined;
	currentHook: { title: string; startTime: number } | undefined = undefined;
	lastCompletedTest: string | undefined = undefined;

	/**
	 * @param runnable the suite, test or hook of the event, which the start and end events have none of
	 */
	onEvent(type: string, runnable: { fullTitle: string } | undefined) {
		this.lastEventTime = Date.now();
		switch (type) {
			case 'test':
				this.currentTest = { title: runnable!.fullTitle, startTime: this.lastEventTime };
				break;
			case 'test end':
				this.currentTest = undefined;
				this.lastCompletedTest = runnable!.fullTitle;
				break;
			case 'hook':
				this.currentHook = { title: runnable!.fullTitle, startTime: this.lastEventTime };
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
function startStallWatchdog(page: playwright.Page, browserType: string, progress: TestProgress): { dispose(): Promise<void> } {
	if (!stallTimeoutMs) {
		return { dispose: async () => { } };
	}

	let diagnostics: Promise<void> | undefined;
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

/** The document of the page, for the code that runs in it */
declare const document: { readonly readyState: string };

async function reportStallAndExit(page: playwright.Page, browserType: string, progress: TestProgress) {
	const log = (message: string) => console.error(`[${browserType}] ${message}`);
	const ago = (time: number) => `${Math.round((Date.now() - time) / 1000)}s ago`;
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

function raceTimeout(promise: Promise<unknown>, ms: number): Promise<{ ok: boolean; error: string | undefined }> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		promise.then(() => ({ ok: true, error: undefined }), err => ({ ok: false, error: String(err?.message ?? err) })),
		new Promise<{ ok: boolean; error: string }>(resolve => timer = setTimeout(() => resolve({ ok: false, error: `no response within ${ms}ms` }), ms))
	]).finally(() => clearTimeout(timer));
}

/**
 * Logs the browser processes launched by this runner (CPU usage tells a busy
 * loop from a deadlock) and, on macOS, writes native stack samples next to
 * the other CI logs.
 */
async function dumpBrowserProcesses(browserType: string, log: (message: string) => void) {
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
	const installRoots = new Set<string>();
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
			await execFileAsync('sample', [String(pid), '3', '-file', file], { timeout: 180_000 }); // symbolication of browser frameworks is slow
			log(`  Wrote native stack sample of pid ${pid} to ${path.relative(rootDir, file)}`);
		} catch (err) {
			log(`  Failed to sample pid ${pid}: ${err.message}`);
		}
	}));
}

/**
 * A mocha suite as the page reports it, see serializeSuite in renderer.html.
 */
interface ISerializedSuite {
	root: boolean;
	suites: ISerializedSuite[];
	tests: ISerializedRunnable[];
	title: string;
	fullTitle: string;
	titlePath: string[];
	timeout: number;
	retries: number;
	slow: number;
	bail: boolean;
}

/**
 * A mocha test or hook as the page reports it, see serializeRunnable in renderer.html.
 */
interface ISerializedRunnable {
	title: string;
	titlePath: string[];
	fullTitle: string;
	async: boolean;
	slow: number;
	speed: string | undefined;
	duration: number | undefined;
	currentRetry: number;
	file: string | undefined;
	type: string;
	parentTitlePath: string[];
	ambiguous: boolean;
}

/**
 * An error as the page reports it, see serializeError in renderer.html.
 */
interface ISerializedError {
	message: string;
	stack: string | undefined;
	actual: unknown;
	expected: unknown;
	uncaught: boolean | undefined;
	showDiff: boolean | undefined;
	inspect: unknown;
}

class EchoRunner extends events.EventEmitter {

	constructor(event: events.EventEmitter, title = '') {
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

	static deserializeSuite(suite: ISerializedSuite, titleExtra: string) {
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

	static deserializeRunnable(runnable: ISerializedRunnable, titleExtra?: string) {
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

	static deserializeError(err: ISerializedError) {
		const inspect = err.inspect;
		err.inspect = () => inspect;
		return err;
	}
}

/**
 * A failed test or hook of a test file.
 */
interface IFailure {
	title: string;
	titlePath: string[];
	file: string;
	type: string;
	parentTitlePath: string[];
	ambiguous: boolean;
}

/**
 * A test that passed.
 */
interface IPassed {
	titlePath: string[];
	file: string | undefined;
	ambiguous: boolean;
}

/**
 * The result of an attempt: the failure message for the console, if any test failed, and which tests passed and failed.
 */
interface IAttemptResult {
	message: string | undefined;
	failures: IFailure[];
	passed: IPassed[];
	unattributedFailures: string[];
}

/**
 * What a rerun runs to establish that a failure was flaky: a failed test by its full
 * title, the suite of a failed hook, or the test file of a failed hook outside any suite.
 */
interface IRerunTarget {
	kind: 'test' | 'suite' | 'file';
	file: string;
	titlePath: string[];
	label: string;
	ambiguous: boolean;
}

/**
 * The test files that a rerun loads, and the grep that selects their tests.
 */
interface IRerunPlan {
	byTitle: boolean;
	files: string[];
	grep: string | undefined;
	targets: IRerunTarget[] | undefined;
}

/**
 * When a rerun target did not pass, and when it passed.
 */
interface IRerunRecord {
	target: IRerunTarget;
	firstAttempt: number;
	lastAttempt: number;
	passedInAttempt?: number;
}

/**
 * Runs the test files once in `count` worker processes. Each worker is a separate
 * instance of this script that runs the test files it claims in its own browser, and does not
 * rerun its failures: this process reruns them in one browser.
 * @param browserName the browser, with its channel if any
 */
async function runFirstAttemptInWorkers(browserName: string, count: number): Promise<IAttemptResult> {
	const report = await runInWorkers({
		name: `Browser unit tests (${browserName})`,
		count,
		command: process.execPath,
		args: [...process.execArgv, import.meta.filename, ...removeArgument(removeArgument(removeArgument(process.argv.slice(2), 'workers'), 'rerun-failed-files'), 'browser'), `--browser=${browserName}`],
	});
	// as the workers record them in runTestsInBrowser
	const failures = report.failures as IFailure[];
	const failed = [...failures.map(failure => failure.title), ...report.unattributedFailures];
	return {
		// the workers printed the reasons with their output
		message: failed.length ? `[${browserName}] The following tests failed in the parallel workers:\n - ${failed.join('\n - ')}\n` : undefined,
		failures,
		// Only reruns check which tests passed
		passed: [],
		unattributedFailures: report.unattributedFailures
	};
}

/**
 * Runs the tests in a browser, and reruns the failed ones, each time in a freshly launched
 * browser, up to `--rerun-failed-files` more times. Returns the failure message of the last
 * attempt when failures remain.
 * @param workers the number of worker processes for the first attempt, which runs in this process with 1
 */
async function runTestsWithReruns(modules: string[], browserType: BrowserType, browserChannel: string | undefined, workers: number): Promise<string | undefined> {
	// the browser stays open for debugging
	const maxReruns = isDebug ? 0 : Math.max(0, Number(args['rerun-failed-files']) || 0);
	const browserName = browserChannel ? `${browserType}-${browserChannel}` : browserType;

	/** every failure that was a rerun target, by key */
	const records = new Map<string, IRerunRecord>();
	/** the failures that did not pass since they failed */
	const targets = new Map<string, IRerunTarget>();
	/** what the current attempt reruns, unless it is the first */
	let plan: IRerunPlan | undefined;
	let attemptModules = modules;
	let grep: string | undefined = args.grep;

	for (let attempt = 1; ; attempt++) {
		let result: IAttemptResult;
		if (attempt === 1 && workers > 1) {
			result = await runFirstAttemptInWorkers(browserName, workers);
		} else {
			result = await runTestsInBrowser(attemptModules, browserType, browserChannel, grep, attempt, plan?.targets);
			if (worker) {
				// the process that started this worker reruns the failures
				writeWorkerReport(worker, result);
			}
		}
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
 */
function targetsFromFailures(failures: IFailure[]): Map<string, IRerunTarget> {
	const targets = new Map<string, IRerunTarget>();
	for (const failure of failures) {
		let target: IRerunTarget;
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
 */
function planRerun(targets: Map<string, IRerunTarget>): IRerunPlan {
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
 */
function findPassedTargets(targets: Map<string, IRerunTarget>, result: { failures: IFailure[]; passed: IPassed[] }): string[] {
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
		const isInSuite = (titlePath: string[]) => titlePath.length > target.titlePath.length && target.titlePath.every((title, index) => title === titlePath[index]);
		return passed.some(test => isInSuite(test.titlePath)) && !failures.some(failure => isInSuite(failure.titlePath));
	}).map(([key]) => key);
}

/**
 * Records that the targets did not pass in the attempt.
 */
function recordNotPassed(records: Map<string, IRerunRecord>, targets: Map<string, IRerunTarget>, attempt: number) {
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
 */
function reportFlakyTests(records: Map<string, IRerunRecord>, browserName: string) {
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
 */
function describeTarget(target: IRerunTarget) {
	return `${target.label.replace(/\s*[\n\r\u2028\u2029]+\s*/g, ' ')} (${target.file})`;
}

/**
 * Escapes a title for a grep. Line terminators are escaped too, because mocha reads a
 * grep string only up to the first one.
 */
function escapeRegExp(value: string) {
	return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').replace(/[\n\r\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

testModules.then(async modules => {

	if (runList) {
		// the process that starts the workers reports the listed files they run
		if (!worker) {
			console.log(`Running the ${modules.length} browser test files of the ${runList.size} files listed in ${args.runList}`);
		}
		if (modules.length === 0) {
			process.exit(0);
		}
	}

	// With --runList, only as many workers as the listed test files that run need, see getWorkerCountForFiles
	const workers = !workersApply ? 1 : runList ? getWorkerCountForFiles(workerCount, modules.length) : workerCount;

	// run tests in selected browsers
	const browsers = Array.isArray(args.browser)
		? args.browser : [args.browser];

	let messages: (string | undefined)[] = [];
	let didFail = false;

	try {
		// The workers of a browser already use the CPUs, so browsers run one at a time with them, also when the cap or a short --runList leaves only one
		if (args.sequential || workersApply) {
			for (const browser of browsers) {
				const [browserType, browserChannel] = browser.split('-') as [BrowserType, string | undefined];
				messages.push(await runTestsWithReruns(modules, browserType, browserChannel, workers));
			}
		} else {
			messages = await Promise.all(browsers.map(async browser => {
				const [browserType, browserChannel] = browser.split('-') as [BrowserType, string | undefined];
				return await runTestsWithReruns(modules, browserType, browserChannel, 1);
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
