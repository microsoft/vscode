/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// mocha disables running through electron by default. Note that this must
// come before any mocha imports.
process.env.MOCHA_COLORS = '1';

const { app, BrowserWindow, ipcMain, crashReporter } = require('electron');
const product = require('../../../product.json');
const { tmpdir } = require('os');
const { existsSync, mkdirSync } = require('fs');
const path = require('path');
const mocha = require('mocha');
const events = require('events');
const MochaJUnitReporter = require('mocha-junit-reporter');
const url = require('url');
const net = require('net');
const createStatsCollector = require('mocha/lib/stats-collector');
const { applyReporter, importMochaReporter } = require('../reporter');

const optimist = require('optimist')
	.describe('grep', 'only run tests matching <pattern>').alias('grep', 'g').alias('grep', 'f').string('grep')
	.describe('run', 'only run tests from <file>').string('run')
	.describe('runGlob', 'only run tests matching <file_pattern>').alias('runGlob', 'glob').alias('runGlob', 'runGrep').string('runGlob')
	.describe('build', 'run with build output (out-build)').boolean('build')
	.describe('coverage', 'generate coverage report').boolean('coverage')
	.describe('dev', 'open dev tools, keep window open, reuse app data').alias('dev', ['dev-tools', 'devTools']).string('dev')
	.describe('reporter', 'the mocha reporter').string('reporter').default('reporter', 'spec')
	.describe('reporter-options', 'the mocha reporter options').string('reporter-options').default('reporter-options', '')
	.describe('wait-server', 'port to connect to and wait before running tests')
	.describe('timeout', 'timeout for tests')
	.describe('crash-reporter-directory', 'crash reporter directory').string('crash-reporter-directory')
	.describe('tfs').string('tfs')
	.describe('help', 'show the help').alias('help', 'h');

const argv = optimist.argv;

if (argv.help) {
	optimist.showHelp();
	process.exit(0);
}

let crashReporterDirectory = argv['crash-reporter-directory'];
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

if (!argv.dev) {
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

	constructor() {
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
	}
}

app.on('ready', () => {

	ipcMain.on('error', (_, err) => {
		if (!argv.dev) {
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

	const win = new BrowserWindow({
		height: 600,
		width: 800,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, '..', '..', '..', 'src', 'vs', 'base', 'parts', 'sandbox', 'electron-browser', 'preload.js'), // ensure similar environment as VSCode as tests may depend on this
			additionalArguments: [`--vscode-window-config=vscode:test-vscode-window-config`],
			nodeIntegration: true,
			contextIsolation: false,
			enableWebSQL: false,
			spellcheck: false
		}
	});

	win.webContents.on('did-finish-load', () => {
		if (argv.dev) {
			win.show();
			win.webContents.openDevTools();
		}

		if (argv.waitServer) {
			waitForServer(Number(argv.waitServer)).then(sendRun);
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
				resolve();
			});

			socket.on('close', () => {
				resolve();
			});

			timeout = setTimeout(() => {
				console.error('timed out waiting for before starting tests debugger');
				resolve();
			}, 15000);
		}).finally(() => {
			if (socket) {
				socket.end();
			}
			clearTimeout(timeout);
		});
	}

	function sendRun() {
		win.webContents.send('run', argv);
	}

	win.loadURL(url.format({ pathname: path.join(__dirname, 'renderer.html'), protocol: 'file:', slashes: true }));

	const runner = new IPCRunner();
	createStatsCollector(runner);

	// Handle renderer crashes, #117068
	win.webContents.on('render-process-gone', (evt, details) => {
		if (!runner.didEnd) {
			console.error(`Renderer process crashed with: ${JSON.stringify(details)}`);
			app.exit(1);
		}
	});

	if (argv.tfs) {
		new mocha.reporters.Spec(runner);
		new MochaJUnitReporter(runner, {
			reporterOptions: {
				testsuitesTitle: `${argv.tfs} ${process.platform}`,
				mochaFile: process.env.BUILD_ARTIFACTSTAGINGDIRECTORY ? path.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY, `test-results/${process.platform}-${process.arch}-${argv.tfs.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`) : undefined
			}
		});
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

		applyReporter(runner, argv);
	}

	if (!argv.dev) {
		ipcMain.on('all done', () => app.exit(runner.didFail ? 1 : 0));
	}
});
