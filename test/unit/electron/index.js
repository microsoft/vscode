/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// mocha disables running through electron by default. Note that this must
// come before any mocha imports.
process.env.MOCHA_COLORS = '1';

const { app, BrowserWindow, ipcMain, crashReporter, session } = require('electron');
const product = require('../../../product.json');
const { tmpdir } = require('os');
const { existsSync, mkdirSync, promises } = require('fs');
const path = require('path');
const mocha = require('mocha');
const events = require('events');
const MochaJUnitReporter = require('mocha-junit-reporter');
const url = require('url');
const net = require('net');
const createStatsCollector = require('mocha/lib/stats-collector');
const { applyReporter, importMochaReporter } = require('../reporter');

const minimist = require('minimist');

/**
 * @type {{
 * grep: string;
 * run: string;
 * runGlob: string;
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
 * help: boolean;
 * }}
 */
const args = minimist(process.argv.slice(2), {
	string: ['grep', 'run', 'runGlob', 'reporter', 'reporter-options', 'waitServer', 'timeout', 'crash-reporter-directory', 'tfs', 'coveragePath', 'coverageFormats', 'testSplit'],
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

if (args.help) {
	console.log(`Usage: node ${process.argv[1]} [options]

Options:
--grep, -g, -f <pattern>      only run tests matching <pattern>
--run <file>                  only run tests from <file>
--runGlob, --glob, --runGrep <file_pattern> only run tests matching <file_pattern>
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
--tfs <url>                   TFS server URL
--help, -h                    show the help`);
	process.exit(0);
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
		productName: process.env['VSCODE_DEV'] ? `${product.nameShort} Dev` : product.nameShort,
		uploadToServer: false,
		compress: true
	});
}

if (!args.dev) {
	app.setPath('userData', path.join(tmpdir(), `vscode-tests-${Date.now()}`));
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
		currentRetry: () => runnable.currentRetry
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

class IPCRunner extends events.EventEmitter {

	constructor(win) {
		super();

		this.didFail = false;
		this.didEnd = false;

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
		ipcMain.on('pass', (e, test) => this.emit('pass', deserializeRunnable(test)));
		ipcMain.on('fail', (e, test, err) => {
			this.didFail = true;
			this.emit('fail', deserializeRunnable(test), deserializeError(err));
		});
		ipcMain.on('pending', (e, test) => this.emit('pending', deserializeRunnable(test)));

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
}

app.on('ready', () => {

	// needed when loading resources from the renderer, e.g xterm.js or the encoding lib
	session.defaultSession.protocol.registerFileProtocol('vscode-file', (request, callback) => {
		const path = new URL(request.url).pathname;
		callback({ path });
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

	const win = new BrowserWindow({
		height: 600,
		width: 800,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'), // ensure similar environment as VSCode as tests may depend on this
			additionalArguments: [`--vscode-window-config=vscode:test-vscode-window-config`],
			nodeIntegration: true,
			contextIsolation: false,
			enableWebSQL: false,
			spellcheck: false
		}
	});

	win.webContents.on('did-finish-load', () => {
		if (args.dev) {
			win.show();
			win.webContents.openDevTools();
		}

		if (args.waitServer) {
			waitForServer(Number(args.waitServer)).then(sendRun);
		} else {
			sendRun();
		}
	});

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

	function sendRun() {
		win.webContents.send('run', args);
	}

	const target = url.pathToFileURL(path.join(__dirname, 'renderer.html'));
	target.searchParams.set('argv', JSON.stringify(args));
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

	const reporters = [];

	if (args.tfs) {
		const testResultsRoot = process.env.BUILD_ARTIFACTSTAGINGDIRECTORY || process.env.GITHUB_WORKSPACE;
		reporters.push(
			new mocha.reporters.Spec(runner),
			new MochaJUnitReporter(runner, {
				reporterOptions: {
					testsuitesTitle: `${args.tfs} ${process.platform}`,
					mochaFile: testResultsRoot ? path.join(testResultsRoot, `test-results/${process.platform}-${process.arch}-${args.tfs.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`) : undefined
				}
			}),
		);
	} else {
		// mocha patches symbols to use windows escape codes, but it seems like
		// Electron mangles these in its output.
		if (process.platform === 'win32') {
			Object.assign(importMochaReporter('base').symbols, {
				ok: '+',
				err: 'X',
				dot: '.',
			});
		}

		reporters.push(applyReporter(runner, args));
	}

	if (!args.dev) {
		ipcMain.on('all done', async () => {
			await Promise.all(reporters.map(r => r.drain?.()));
			app.exit(runner.didFail ? 1 : 0);
		});
	}
});
