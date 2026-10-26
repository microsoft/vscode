/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// mocha disables running through electron by default. Note that this must
// come before any mocha imports.
process.env.MOCHA_COLORS = '1';

const { app, BrowserWindow, WebContentsView, ipcMain, crashReporter, net: electronNet, protocol, session } = require('electron');
// A renderer's execPath points at the helper executable on macOS.
process.env.VSCODE_TEST_ELECTRON_PATH = process.execPath;
const product = require('../../../product.json');
const { tmpdir } = require('os');
const { existsSync, mkdirSync, promises } = require('fs');
const http = require('http');
const path = require('path');
const mocha = require('mocha');
const events = require('events');
const MochaJUnitReporter = require('mocha-junit-reporter');
const url = require('url');
const net = require('net');
const createStatsCollector = require('mocha/lib/stats-collector');
const { applyReporter, importMochaReporter } = require('../reporter');

const minimist = require('minimist');

protocol.registerSchemesAsPrivileged([
	{
		scheme: 'vscode-file',
		privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true }
	},
	{
		scheme: 'vscode-remote-resource',
		privileges: { secure: true, supportFetchAPI: true, corsEnabled: true }
	}
]);

/**
 * @type {{
 * _: string[];
 * grep: string;
 * run: string | string[];
 * runList: string;
 * runGlob: string;
 * excludeRunGlob: string;
 * testSplit: string;
 * dev: boolean;
 * reporter: string;
 * 'reporter-options': string;
 * 'waitServer': string;
 * timeout: string;
 * 'crash-reporter-directory': string;
 * tfs: string;
 * build: boolean;
 * coverage: boolean;
 * coveragePath: string;
 * coverageFormats: string | string[];
 * 'per-test-coverage': boolean;
 * 'rerun-failed-files': string;
 * help: boolean;
 * }}
 */
const args = minimist(process.argv.slice(2), {
	string: ['grep', 'run', 'runList', 'runGlob', 'excludeRunGlob', 'reporter', 'reporter-options', 'waitServer', 'timeout', 'crash-reporter-directory', 'tfs', 'coveragePath', 'coverageFormats', 'testSplit', 'rerun-failed-files'],
	boolean: ['build', 'coverage', 'help', 'dev', 'per-test-coverage'],
	alias: {
		'grep': ['g', 'f'],
		'runGlob': ['glob', 'runGrep'],
		'dev': ['dev-tools', 'devTools'],
		'help': 'h'
	},
	default: {
		'reporter': 'spec',
		'reporter-options': ''
	}
});

const isCI = !!process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || !!process.env.GITHUB_WORKSPACE;

/**
 * With more failed tests and suites than this, a rerun repeats whole test files
 * instead of selecting the failures by title.
 */
const MAX_RERUN_TARGETS = 50;

if (args.help) {
	console.log(`Usage: node ${process.argv[1]} [options] [file...]

Bare .ts/.js file paths passed as positional arguments are treated as
--run arguments.

Options:
--grep, -g, -f <pattern>      only run tests matching <pattern>
--run <file>                  only run tests from <file>
--runList <file>              only run tests whose files are listed in <file>, one per line
--runGlob, --glob, --runGrep <file_pattern> only run tests matching <file_pattern>
--excludeRunGlob <file_pattern> exclude tests matching <file_pattern> from --runGlob
--testSplit <i>/<n>           split tests into <n> parts and run the <i>th part
--build                       run with build output (out-build)
--coverage                    generate coverage report
--per-test-coverage           generate a per-test V8 coverage report, only valid with the full-json-stream reporter
--dev, --dev-tools, --devTools <window> open dev tools, keep window open, reuse app data
--reporter <reporter>         the mocha reporter (default: "spec")
--reporter-options <options>  the mocha reporter options (default: "")
--waitServer <port>           port to connect to and wait before running tests
--timeout <ms>                timeout for tests
--crash-reporter-directory <path> crash reporter directory
--rerun-failed-files <count>  rerun failed tests (suites for failed hooks) in a fresh window up to <count> more times; use whole files for many failures
--tfs <url>                   TFS server URL
--help, -h                    show the help`);
	process.exit(0);
}

// Treat bare .ts/.js positional arguments as --run values
const bareFiles = (args._ || []).filter(a => typeof a === 'string' && (a.endsWith('.ts') || a.endsWith('.js')));
if (bareFiles.length > 0) {
	const existing = !args.run ? [] : Array.isArray(args.run) ? args.run : [args.run];
	args.run = [...existing, ...bareFiles];
	args._ = (args._ || []).filter(a => !bareFiles.includes(a));
}

// The renderer reads the --runList file (see loadTestModules in renderer.js)
if (args.runList) {
	args.runList = path.resolve(args.runList);
}

let crashReporterDirectory = args['crash-reporter-directory'];
if (crashReporterDirectory) {
	crashReporterDirectory = path.normalize(crashReporterDirectory);

	if (!path.isAbsolute(crashReporterDirectory)) {
		console.error(`The path '${crashReporterDirectory}' specified for --crash-reporter-directory must be absolute.`);
		app.exit(1);
	}

	if (!existsSync(crashReporterDirectory)) {
		try {
			mkdirSync(crashReporterDirectory);
		} catch (error) {
			console.error(`The path '${crashReporterDirectory}' specified for --crash-reporter-directory does not seem to exist or cannot be created.`);
			app.exit(1);
		}
	}

	// Crashes are stored in the crashDumps directory by default, so we
	// need to change that directory to the provided one
	console.log(`Found --crash-reporter-directory argument. Setting crashDumps directory to be '${crashReporterDirectory}'`);
	app.setPath('crashDumps', crashReporterDirectory);

	crashReporter.start({
		companyName: 'Microsoft',
		productName: process.env.VSCODE_DEV ? `${product.nameShort} Dev` : product.nameShort,
		uploadToServer: false,
		compress: true
	});
}

if (!args.dev) {
	app.setPath('userData', path.join(tmpdir(), `vscode-tests-${Date.now()}-${process.pid}`));
}

function deserializeSuite(suite) {
	return {
		root: suite.root,
		suites: suite.suites,
		tests: suite.tests,
		title: suite.title,
		titlePath: () => suite.titlePath,
		fullTitle: () => suite.fullTitle,
		timeout: () => suite.timeout,
		retries: () => suite.retries,
		slow: () => suite.slow,
		bail: () => suite.bail
	};
}

function deserializeRunnable(runnable) {
	return {
		title: runnable.title,
		titlePath: () => runnable.titlePath,
		fullTitle: () => runnable.fullTitle,
		async: runnable.async,
		slow: () => runnable.slow,
		speed: runnable.speed,
		duration: runnable.duration,
		currentRetry: () => runnable.currentRetry,
		file: runnable.file
	};
}

function deserializeError(err) {
	const inspect = err.inspect;
	err.inspect = () => inspect;
	// Unfortunately, mocha rewrites and formats err.actual/err.expected.
	// This formatting is hard to reverse, so err.*JSON includes the unformatted value.
	if (err.actual) {
		err.actual = JSON.parse(err.actual).value;
		err.actualJSON = err.actual;
	}
	if (err.expected) {
		err.expected = JSON.parse(err.expected).value;
		err.expectedJSON = err.expected;
	}
	return err;
}

/**
 * A failed test or hook of a test file.
 * @typedef {{ title: string; file: string; type: string; parentTitle?: string }} IFailure
 */

/**
 * A test that passed.
 * @typedef {{ title: string; file: string }} IPassed
 */

/**
 * Relays the mocha events of the test run in one window to the reporters in the
 * main process, and records which tests passed and failed.
 */
class IPCRunner extends events.EventEmitter {

	constructor(win) {
		super();

		this.didFail = false;
		this.didEnd = false;

		/** @type {IFailure[]} failed tests and hooks that belong to a test file */
		this.failures = [];
		/** @type {IPassed[]} */
		this.passed = [];
		/** @type {string[]} failures that do not belong to a test file, such as root-level hooks */
		this.unattributedFailures = [];

		ipcMain.on('start', () => this.emit('start'));
		ipcMain.on('end', () => {
			this.didEnd = true;
			this.emit('end');
		});
		ipcMain.on('suite', (e, suite) => this.emit('suite', deserializeSuite(suite)));
		ipcMain.on('suite end', (e, suite) => this.emit('suite end', deserializeSuite(suite)));
		ipcMain.on('test', (e, test) => this.emit('test', deserializeRunnable(test)));
		ipcMain.on('test end', (e, test) => this.emit('test end', deserializeRunnable(test)));
		ipcMain.on('hook', (e, hook) => this.emit('hook', deserializeRunnable(hook)));
		ipcMain.on('hook end', (e, hook) => this.emit('hook end', deserializeRunnable(hook)));
		ipcMain.on('pass', (e, test) => {
			this.passed.push({ title: test.fullTitle, file: test.file });
			this.emit('pass', deserializeRunnable(test));
		});
		ipcMain.on('fail', (e, test, err) => {
			this.didFail = true;
			if (test.file) {
				this.failures.push({ title: test.fullTitle, file: test.file, type: test.type, parentTitle: test.parentTitle });
			} else {
				this.unattributedFailures.push(test.fullTitle);
			}
			this.emit('fail', deserializeRunnable(test), deserializeError(err));
		});
		ipcMain.on('pending', (e, test) => this.emit('pending', deserializeRunnable(test)));
		ipcMain.on('all done', () => this.emit('all done'));

		ipcMain.handle('startCoverage', async () => {
			win.webContents.debugger.attach();
			await win.webContents.debugger.sendCommand('Debugger.enable');
			await win.webContents.debugger.sendCommand('Profiler.enable');
			await win.webContents.debugger.sendCommand('Profiler.startPreciseCoverage', {
				detailed: true,
				allowTriggeredUpdates: false,
			});
		});

		const coverageScriptsReported = new Set();
		ipcMain.handle('snapshotCoverage', async (_, test) => {
			const coverage = await win.webContents.debugger.sendCommand('Profiler.takePreciseCoverage');
			await Promise.all(coverage.result.map(async (r) => {
				if (!coverageScriptsReported.has(r.scriptId)) {
					coverageScriptsReported.add(r.scriptId);
					const src = await win.webContents.debugger.sendCommand('Debugger.getScriptSource', { scriptId: r.scriptId });
					r.source = src.scriptSource;
				}
			}));

			if (!test) {
				this.emit('coverage init', coverage);
			} else {
				this.emit('coverage increment', test, coverage);
			}
		});
	}

	dispose() {
		for (const channel of ['start', 'end', 'suite', 'suite end', 'test', 'test end', 'hook', 'hook end', 'pass', 'fail', 'pending', 'all done']) {
			ipcMain.removeAllListeners(channel);
		}
		ipcMain.removeHandler('startCoverage');
		ipcMain.removeHandler('snapshotCoverage');
	}
}

app.on('ready', async () => {
	session.defaultSession.setSpellCheckerLanguages([]);
	session.defaultSession.setSpellCheckerEnabled(false);
	const outDir = args.build ? 'out-build' : 'out';
	const [{ createRemoteResourceRequestHandler }, { getRemoteResourceResponseHeaders }] = await Promise.all([
		import(url.pathToFileURL(path.join(__dirname, `../../../${outDir}/vs/platform/protocol/electron-main/remoteResourceProtocol.js`)).href),
		import(url.pathToFileURL(path.join(__dirname, `../../../${outDir}/vs/server/node/remoteResourceResponse.js`)).href),
	]);
	/** @type {import('http').IncomingHttpHeaders | undefined} */
	let remoteResourceRequestHeaders;
	const remoteResourceServer = http.createServer((request, response) => {
		remoteResourceRequestHeaders = request.headers;
		response.writeHead(200, {
			...getRemoteResourceResponseHeaders(request.headers.origin, () => false),
			'Content-Type': 'image/svg+xml',
		});
		response.write('<svg xmlns="http://www.w3.org/2000/svg">');
		setTimeout(() => response.end('</svg>'), 10);
	});
	await new Promise((resolve, reject) => {
		remoteResourceServer.once('error', reject);
		remoteResourceServer.listen(0, '127.0.0.1', () => resolve());
	});
	const remoteResourceServerAddress = remoteResourceServer.address();
	if (!remoteResourceServerAddress || typeof remoteResourceServerAddress === 'string') {
		throw new Error('Remote resource test server did not bind to a TCP port');
	}
	protocol.handle('vscode-remote-resource', createRemoteResourceRequestHandler({ warn() { } }));
	// A second view lets tests blur the page without stealing desktop focus.
	/** @type {Map<number, import('electron').WebContentsView>} */
	const focusTestViews = new Map();
	ipcMain.handle('vscode:test-set-web-contents-focus', async (event, focused) => {
		const window = BrowserWindow.fromWebContents(event.sender);
		if (!window) {
			throw new Error('Focus test requires a BrowserWindow');
		}
		if (focused) {
			event.sender.focus();
			const view = focusTestViews.get(event.sender.id);
			if (view) {
				window.contentView.removeChildView(view);
				view.webContents.close();
				focusTestViews.delete(event.sender.id);
			}
		} else {
			const view = new WebContentsView();
			focusTestViews.set(event.sender.id, view);
			window.contentView.addChildView(view);
			await view.webContents.loadURL('about:blank');
			view.webContents.focus();
		}
	});
	ipcMain.handle('vscode:test-remote-resource', async () => {
		const remoteResourceTestWindow = new BrowserWindow({ show: false });
		try {
			const pagePath = url.pathToFileURL(path.join(__dirname, 'fixtures/remote-resource.html')).pathname;
			await remoteResourceTestWindow.loadURL(`vscode-file://vscode-app${pagePath}`);

			const remoteResourceUrl = `vscode-remote-resource://127.0.0.1:${remoteResourceServerAddress.port}/vscode-remote-resource`;
			await remoteResourceTestWindow.webContents.executeJavaScript(`
				new Promise((resolve, reject) => {
					const image = new Image();
					image.crossOrigin = 'anonymous';
					image.onload = resolve;
					image.onerror = () => reject(new Error('Remote resource image failed to load'));
					image.src = ${JSON.stringify(remoteResourceUrl)};
					document.body.append(image);
				})
			`);
			return {
				loaded: true,
				requestHeaders: {
					origin: remoteResourceRequestHeaders?.origin,
					secFetchMode: remoteResourceRequestHeaders?.['sec-fetch-mode'],
				},
			};
		} finally {
			remoteResourceTestWindow.close();
		}
	});

	ipcMain.handle('vscode:test-file-resource', async (_event, requestUrl, roots) => {
		const [{ ProtocolMainService }, { URI }] = await Promise.all([
			import(url.pathToFileURL(path.join(__dirname, `../../../${outDir}/vs/platform/protocol/electron-main/protocolMainService.js`)).href),
			import(url.pathToFileURL(path.join(__dirname, `../../../${outDir}/vs/base/common/uri.js`)).href),
		]);
		// Preserve the production root registration and guard; replace only protocol registration and file transport.
		class TestProtocolMainService extends ProtocolMainService {
			handleProtocols() { }
			async createFileResponse(_request, filePath) {
				return new Response(filePath);
			}
		}
		/** @type {string[]} */
		const errors = [];
		const service = new TestProtocolMainService(
			{ ...roots, workspaceStorageHome: URI.file(roots.workspaceStorageHome), isBuilt: true },
			{ defaultProfile: { globalStorageHome: URI.file(roots.globalStorageHome) } },
			{ error: message => errors.push(message) },
		);
		try {
			const response = await service.handleResourceRequest(new Request(requestUrl));
			return { status: response.status, path: response.ok ? await response.text() : undefined, errors };
		} finally {
			service.dispose();
		}
	});

	// needed when loading resources from the renderer, e.g xterm.js or the encoding lib
	session.defaultSession.protocol.handle('vscode-file', request => {
		const fileUrl = new URL(request.url.replace(/^vscode-file:/, 'file:'));
		if (fileUrl.hostname === 'vscode-app') {
			fileUrl.hostname = '';
		}

		return electronNet.fetch(fileUrl, {
			method: request.method,
			headers: request.headers,
			bypassCustomProtocolHandlers: true
		}).catch(() => Response.error());
	});

	ipcMain.on('error', (_, err) => {
		if (!args.dev) {
			console.error(err);
			app.exit(1);
		}
	});

	// We need to provide a basic `ISandboxConfiguration`
	// for our preload script to function properly because
	// some of our types depend on it (e.g. product.ts).
	ipcMain.handle('vscode:test-vscode-window-config', async () => {
		return {
			product: {
				version: '1.x.y',
				nameShort: 'Code - OSS Dev',
				nameLong: 'Code - OSS Dev',
				applicationName: 'code-oss',
				dataFolderName: '.vscode-oss',
				urlProtocol: 'code-oss',
			}
		};
	});

	// No-op since invoke the IPC as part of IIFE in the preload.
	ipcMain.handle('vscode:fetchShellEnv', event => { });

	/**
	 * Validates that a file path is within the project root for security purposes.
	 * @param {string} filePath - The file path to validate
	 * @throws {Error} If the path is outside the project root
	 */
	function validatePathWithinProject(filePath) {
		const projectRoot = path.join(__dirname, '../../..');
		const resolvedPath = path.resolve(filePath);
		const normalizedRoot = path.resolve(projectRoot);

		// On Windows, paths are case-insensitive
		const isWindows = process.platform === 'win32';
		const rel = path.relative(
			isWindows ? normalizedRoot.toLowerCase() : normalizedRoot,
			isWindows ? resolvedPath.toLowerCase() : resolvedPath
		);
		if (rel.startsWith('..') || path.isAbsolute(rel)) {
			const error = new Error(`Access denied: Path '${filePath}' is outside the project root`);
			console.error(error.message);
			throw error;
		}
	}

	// Handle file reading for tests
	ipcMain.handle('vscode:readFile', async (event, filePath) => {
		validatePathWithinProject(filePath);

		try {
			return await promises.readFile(path.resolve(filePath));
		} catch (error) {
			console.error(`Error reading file ${filePath}:`, error);
			throw error;
		}
	});

	// Handle file stat for tests
	ipcMain.handle('vscode:statFile', async (event, filePath) => {
		validatePathWithinProject(filePath);

		try {
			const stats = await promises.stat(path.resolve(filePath));
			return {
				isFile: stats.isFile(),
				isDirectory: stats.isDirectory(),
				isSymbolicLink: stats.isSymbolicLink(),
				ctimeMs: stats.ctimeMs,
				mtimeMs: stats.mtimeMs,
				size: stats.size,
				isReadonly: (stats.mode & 0o200) === 0 // Check if owner write bit is not set
			};
		} catch (error) {
			console.error(`Error stating file ${filePath}:`, error);
			throw error;
		}
	});

	/**
	 * Runs the tests selected by `runArgs` in a new window, and so in a new renderer
	 * process. `done` resolves with the runner once the tests finished and the
	 * reporters are drained.
	 * @param {typeof args} runArgs
	 * @param {number} attempt
	 */
	function runInWindow(runArgs, attempt) {
		const win = new BrowserWindow({
			height: 600,
			width: 800,
			show: false,
			webPreferences: {
				preload: path.join(__dirname, 'preload.js'), // ensure similar environment as VSCode as tests may depend on this
				additionalArguments: [`--vscode-window-config=vscode:test-vscode-window-config`],
				nodeIntegration: true,
				contextIsolation: false,
				backgroundThrottling: false,
				spellcheck: false
			}
		});

		if (isCI) {
			// Hidden windows throttle requestAnimationFrame on Windows even when background throttling is disabled.
			win.showInactive();
		}

		win.webContents.on('did-finish-load', () => {
			if (runArgs.dev) {
				win.show();
				win.webContents.openDevTools();
			}

			const sendRun = () => win.webContents.send('run', runArgs);
			if (runArgs.waitServer) {
				waitForServer(Number(runArgs.waitServer)).then(sendRun);
			} else {
				sendRun();
			}
		});

		const target = url.pathToFileURL(path.join(__dirname, 'renderer.html'));
		target.searchParams.set('argv', JSON.stringify(runArgs));
		win.loadURL(target.href);

		const runner = new IPCRunner(win);
		createStatsCollector(runner);

		// Handle renderer crashes, #117068
		win.webContents.on('render-process-gone', (evt, details) => {
			if (!runner.didEnd) {
				console.error(`Renderer process crashed with: ${JSON.stringify(details)}`);
				app.exit(1);
			}
		});

		const reporters = createReporters(runner, attempt);

		/** @type {Promise<IPCRunner>} */
		const done = new Promise(resolve => runner.once('all done', async () => {
			await Promise.all(reporters.map(r => r.drain?.()));
			resolve(runner);
		}));

		return { win, done };
	}

	function createReporters(runner, attempt) {
		if (!args.tfs) {
			return [applyReporter(runner, args)];
		}

		// every attempt writes its own results file, so that reruns do not overwrite earlier failures
		const attemptSuffix = attempt > 1 ? `-attempt-${attempt}` : '';
		const testResultsRoot = process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE;
		return [
			new mocha.reporters.Spec(runner),
			new MochaJUnitReporter(runner, {
				reporterOptions: {
					testsuitesTitle: `${args.tfs} ${process.platform}${attempt > 1 ? ` (attempt ${attempt})` : ''}`,
					mochaFile: testResultsRoot ? path.join(testResultsRoot, `test-results/${process.platform}-${process.arch}-${args.tfs.toLowerCase().replace(/[^\w]/g, '-')}${attemptSuffix}-results.xml`) : undefined
				}
			}),
		];
	}

	async function waitForServer(port) {
		let timeout;
		let socket;

		return new Promise(resolve => {
			socket = net.connect(port, '127.0.0.1');
			socket.on('error', e => {
				console.error('error connecting to waitServer', e);
				resolve(undefined);
			});

			socket.on('close', () => {
				resolve(undefined);
			});

			timeout = setTimeout(() => {
				console.error('timed out waiting for before starting tests debugger');
				resolve(undefined);
			}, 15000);
		}).finally(() => {
			if (socket) {
				socket.end();
			}
			clearTimeout(timeout);
		});
	}

	// mocha patches symbols to use windows escape codes, but it seems like
	// Electron mangles these in its output.
	if (!args.tfs && process.platform === 'win32') {
		Object.assign(importMochaReporter('base').symbols, {
			ok: '+',
			err: 'X',
			dot: '.',
		});
	}

	if (args.dev) {
		// keep the window open for debugging
		runInWindow(args, 1);
		return;
	}

	// Coverage is collected from the first window only
	const maxReruns = args.coverage || args['per-test-coverage'] ? 0 : Math.max(0, Number(args['rerun-failed-files']) || 0);

	/** @type {Map<string, IRerunRecord>} every failure that was a rerun target, by key */
	const records = new Map();
	/** @type {Map<string, IRerunTarget>} the failures that did not pass since they failed */
	let targets = new Map();
	/** @type {IRerunPlan | undefined} what the current attempt reruns, unless it is the first */
	let plan;
	let runArgs = args;
	let previousWindow;
	let exitCode = 0;

	for (let attempt = 1; ; attempt++) {
		const { win, done } = runInWindow(runArgs, attempt);
		previousWindow?.destroy();
		previousWindow = win;

		const runner = await done;
		runner.dispose();

		if (!plan && !runner.didFail) {
			break;
		}

		// A failure outside any test file can stop the run early, so the attempt does not establish that anything passed.
		if (plan && runner.unattributedFailures.length === 0) {
			for (const key of findPassedTargets(targets, runner)) {
				targets.delete(key);
				const record = records.get(key);
				if (record) {
					record.passedInAttempt = attempt;
				}
			}
		}
		targets = new Map([...targets, ...targetsFromFailures(runner.failures)]);
		recordNotPassed(records, targets, attempt);

		if (targets.size === 0 && runner.unattributedFailures.length === 0) {
			break;
		}

		if (runner.unattributedFailures.length > 0 && maxReruns > 0) {
			console.error(`\n${plan ? `Not counting attempt ${attempt}` : 'Not rerunning failed tests'}: ${runner.unattributedFailures.length} failure(s) do not belong to a test file:\n${runner.unattributedFailures.map(title => `  ${title}`).join('\n')}`);
		} else if (attempt <= maxReruns) {
			plan = planRerun(targets);
			console.log(plan.byTitle
				? `\nRerunning ${targets.size} failed test(s) in a fresh window (attempt ${attempt + 1} of ${maxReruns + 1}):\n${[...targets.values()].map(target => `  ${describeTarget(target)}`).join('\n')}\n`
				: `\nRerunning the test files of ${targets.size} failed test(s) in a fresh window (attempt ${attempt + 1} of ${maxReruns + 1}):\n${plan.files.map(file => `  ${file}`).join('\n')}\n`);
			runArgs = { ...args, run: plan.files, grep: plan.grep, runGlob: undefined, excludeRunGlob: undefined, testSplit: undefined, waitServer: undefined };
			continue;
		}

		if (plan) {
			console.error(`\n${targets.size} failed test(s) did not pass in ${attempt} attempts:\n${[...targets.values()].map(target => `  ${describeTarget(target)}`).join('\n')}`);
		}
		exitCode = 1;
		break;
	}

	reportFlakyTests(records);

	await new Promise(resolve => remoteResourceServer.close(resolve));
	app.exit(exitCode);
});

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
 * @param {{ failures: IFailure[]; passed: IPassed[] }} result
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

	console.log(`\n${flaky.length} failed test(s) passed when rerun in a fresh window. They are flaky:`);
	for (const record of flaky) {
		const failed = record.firstAttempt === record.lastAttempt ? `failed in attempt ${record.firstAttempt}` : `did not pass in attempts ${record.firstAttempt} to ${record.lastAttempt}`;
		const message = `${describeTarget(record.target)} ${failed} and ${record.target.kind === 'file' ? 'its test file passed' : 'passed'} in attempt ${record.passedInAttempt}`;
		console.log(`  ${message}`);
		// the runner also runs the node.js integration tests, so this is not only about unit tests
		if (process.env.GITHUB_ACTIONS) {
			console.log(`::warning title=Flaky test::${message}`);
		} else if (process.env.TF_BUILD) {
			console.log(`##vso[task.logissue type=warning]Flaky test: ${message}`);
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
