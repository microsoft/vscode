/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as minimist from 'minimist';
import * as rimraf from 'rimraf';
import * as mkdirp from 'mkdirp';
import { ncp } from 'ncp';
import * as vscodetest from 'vscode-test';
import fetch from 'node-fetch';
import { Quality, ApplicationOptions, MultiLogger, Logger, ConsoleLogger, FileLogger } from '../../automation';

import { setup as setupDataMigrationTests } from './areas/workbench/data-migration.test';
import { setup as setupDataLossTests } from './areas/workbench/data-loss.test';
import { setup as setupPreferencesTests } from './areas/preferences/preferences.test';
import { setup as setupSearchTests } from './areas/search/search.test';
import { setup as setupNotebookTests } from './areas/notebook/notebook.test';
import { setup as setupLanguagesTests } from './areas/languages/languages.test';
import { setup as setupEditorTests } from './areas/editor/editor.test';
import { setup as setupStatusbarTests } from './areas/statusbar/statusbar.test';
import { setup as setupExtensionTests } from './areas/extensions/extensions.test';
import { setup as setupMultirootTests } from './areas/multiroot/multiroot.test';
import { setup as setupLocalizationTests } from './areas/workbench/localization.test';
import { setup as setupLaunchTests } from './areas/workbench/launch.test';
import { setup as setupTerminalProfileTests } from './areas/terminal/terminal-profiles.test';
import { setup as setupTerminalTabsTests } from './areas/terminal/terminal-tabs.test';

const testDataPath = path.join(os.tmpdir(), 'vscsmoke');
if (fs.existsSync(testDataPath)) {
	rimraf.sync(testDataPath);
}
fs.mkdirSync(testDataPath);
process.once('exit', () => {
	try {
		rimraf.sync(testDataPath);
	} catch {
		// noop
	}
});

const [, , ...args] = process.argv;
const opts = minimist(args, {
	string: [
		'browser',
		'build',
		'stable-build',
		'wait-time',
		'test-repo',
		'screenshots',
		'log',
		'electronArgs'
	],
	boolean: [
		'verbose',
		'remote',
		'web',
		'headless'
	],
	default: {
		verbose: false
	}
});

const testRepoUrl = 'https://github.com/microsoft/vscode-smoketest-express';
const workspacePath = path.join(testDataPath, 'vscode-smoketest-express');
const extensionsPath = path.join(testDataPath, 'extensions-dir');
mkdirp.sync(extensionsPath);

const screenshotsPath = opts.screenshots ? path.resolve(opts.screenshots) : null;
if (screenshotsPath) {
	mkdirp.sync(screenshotsPath);
}

function fail(errorMessage): void {
	console.error(errorMessage);
	process.exit(1);
}

const repoPath = path.join(__dirname, '..', '..', '..');

let quality: Quality;
let version: string | undefined;

function parseVersion(version: string): { major: number, minor: number, patch: number } {
	const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version)!;
	return { major: parseInt(major), minor: parseInt(minor), patch: parseInt(patch) };
}

//
// #### Electron Smoke Tests ####
//
if (!opts.web) {

	function getDevElectronPath(): string {
		const buildPath = path.join(repoPath, '.build');
		const product = require(path.join(repoPath, 'product.json'));

		switch (process.platform) {
			case 'darwin':
				return path.join(buildPath, 'electron', `${product.nameLong}.app`, 'Contents', 'MacOS', 'Electron');
			case 'linux':
				return path.join(buildPath, 'electron', `${product.applicationName}`);
			case 'win32':
				return path.join(buildPath, 'electron', `${product.nameShort}.exe`);
			default:
				throw new Error('Unsupported platform.');
		}
	}

	function getBuildElectronPath(root: string): string {
		switch (process.platform) {
			case 'darwin':
				return path.join(root, 'Contents', 'MacOS', 'Electron');
			case 'linux': {
				const product = require(path.join(root, 'resources', 'app', 'product.json'));
				return path.join(root, product.applicationName);
			}
			case 'win32': {
				const product = require(path.join(root, 'resources', 'app', 'product.json'));
				return path.join(root, `${product.nameShort}.exe`);
			}
			default:
				throw new Error('Unsupported platform.');
		}
	}

	function getBuildVersion(root: string): string {
		switch (process.platform) {
			case 'darwin':
				return require(path.join(root, 'Contents', 'Resources', 'app', 'package.json')).version;
			default:
				return require(path.join(root, 'resources', 'app', 'package.json')).version;
		}
	}

	let testCodePath = opts.build;
	let electronPath: string;

	if (testCodePath) {
		electronPath = getBuildElectronPath(testCodePath);
		version = getBuildVersion(testCodePath);
	} else {
		testCodePath = getDevElectronPath();
		electronPath = testCodePath;
		process.env.VSCODE_REPOSITORY = repoPath;
		process.env.VSCODE_DEV = '1';
		process.env.VSCODE_CLI = '1';
	}

	if (!fs.existsSync(electronPath || '')) {
		fail(`Can't find VSCode at ${electronPath}.`);
	}

	if (process.env.VSCODE_DEV === '1') {
		quality = Quality.Dev;
	} else if (electronPath.indexOf('Code - Insiders') >= 0 /* macOS/Windows */ || electronPath.indexOf('code-insiders') /* Linux */ >= 0) {
		quality = Quality.Insiders;
	} else {
		quality = Quality.Stable;
	}

	if (opts.remote) {
		console.log(`Running desktop remote smoke tests against ${electronPath}`);
	} else {
		console.log(`Running desktop smoke tests against ${electronPath}`);
	}
}

//
// #### Web Smoke Tests ####
//
else {
	const testCodeServerPath = opts.build || process.env.VSCODE_REMOTE_SERVER_PATH;

	if (typeof testCodeServerPath === 'string') {
		if (!fs.existsSync(testCodeServerPath)) {
			fail(`Can't find Code server at ${testCodeServerPath}.`);
		} else {
			console.log(`Running web smoke tests against ${testCodeServerPath}`);
		}
	}

	if (!testCodeServerPath) {
		process.env.VSCODE_REPOSITORY = repoPath;
		process.env.VSCODE_DEV = '1';
		process.env.VSCODE_CLI = '1';

		console.log(`Running web smoke out of sources`);
	}

	if (process.env.VSCODE_DEV === '1') {
		quality = Quality.Dev;
	} else {
		quality = Quality.Insiders;
	}
}

const userDataDir = path.join(testDataPath, 'd');

async function setupRepository(): Promise<void> {
	if (opts['test-repo']) {
		console.log('*** Copying test project repository:', opts['test-repo']);
		rimraf.sync(workspacePath);
		// not platform friendly
		if (process.platform === 'win32') {
			cp.execSync(`xcopy /E "${opts['test-repo']}" "${workspacePath}"\\*`);
		} else {
			cp.execSync(`cp -R "${opts['test-repo']}" "${workspacePath}"`);
		}

	} else {
		if (!fs.existsSync(workspacePath)) {
			console.log('*** Cloning test project repository...');
			cp.spawnSync('git', ['clone', testRepoUrl, workspacePath]);
		} else {
			console.log('*** Cleaning test project repository...');
			cp.spawnSync('git', ['fetch'], { cwd: workspacePath });
			cp.spawnSync('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: workspacePath });
			cp.spawnSync('git', ['clean', '-xdf'], { cwd: workspacePath });
		}

		// None of the current smoke tests have a dependency on the packages.
		// If new smoke tests are added that need the packages, uncomment this.
		// console.log('*** Running yarn...');
		// cp.execSync('yarn', { cwd: workspacePath, stdio: 'inherit' });
	}
}

async function ensureStableCode(): Promise<void> {
	if (opts.web || !opts['build']) {
		return;
	}

	let stableCodePath = opts['stable-build'];
	if (!stableCodePath) {
		const { major, minor } = parseVersion(version!);
		const majorMinorVersion = `${major}.${minor - 1}`;
		const versionsReq = await fetch('https://update.code.visualstudio.com/api/releases/stable', { headers: { 'x-api-version': '2' } });

		if (!versionsReq.ok) {
			throw new Error('Could not fetch releases from update server');
		}

		const versions: { version: string }[] = await versionsReq.json();
		const prefix = `${majorMinorVersion}.`;
		const previousVersion = versions.find(v => v.version.startsWith(prefix));

		if (!previousVersion) {
			throw new Error(`Could not find suitable stable version ${majorMinorVersion}`);
		}

		console.log(`*** Found VS Code v${version}, downloading previous VS Code version ${previousVersion.version}...`);

		const stableCodeExecutable = await vscodetest.download({
			cachePath: path.join(os.tmpdir(), 'vscode-test'),
			version: previousVersion.version
		});

		if (process.platform === 'darwin') {
			// Visual Studio Code.app/Contents/MacOS/Electron
			stableCodePath = path.dirname(path.dirname(path.dirname(stableCodeExecutable)));
		} else {
			// VSCode/Code.exe (Windows) | VSCode/code (Linux)
			stableCodePath = path.dirname(stableCodeExecutable);
		}
	}

	if (!fs.existsSync(stableCodePath)) {
		throw new Error(`Can't find Stable VSCode at ${stableCodePath}.`);
	}

	console.log(`*** Using stable build ${stableCodePath} for migration tests`);

	opts['stable-build'] = stableCodePath;
}

async function setup(): Promise<void> {
	console.log('*** Test data:', testDataPath);
	console.log('*** Preparing smoketest setup...');

	await ensureStableCode();
	await setupRepository();

	console.log('*** Smoketest setup done!\n');
}

function createOptions(): ApplicationOptions {
	const loggers: Logger[] = [];

	if (opts.verbose) {
		loggers.push(new ConsoleLogger());
	}

	let log: string | undefined = undefined;

	if (opts.log) {
		loggers.push(new FileLogger(opts.log));
		log = 'trace';
	}

	return {
		quality,
		codePath: opts.build,
		workspacePath,
		userDataDir,
		extensionsPath,
		waitTime: parseInt(opts['wait-time'] || '0') || 20,
		logger: new MultiLogger(loggers),
		verbose: opts.verbose,
		log,
		screenshotsPath,
		remote: opts.remote,
		web: opts.web,
		headless: opts.headless,
		browser: opts.browser,
		extraArgs: (opts.electronArgs || '').split(' ').map(a => a.trim()).filter(a => !!a)
	};
}

before(async function () {
	this.timeout(2 * 60 * 1000); // allow two minutes for setup
	await setup();
	this.defaultOptions = createOptions();
});

after(async function () {
	await new Promise(c => setTimeout(c, 500)); // wait for shutdown

	if (opts.log) {
		const logsDir = path.join(userDataDir, 'logs');
		const destLogsDir = path.join(path.dirname(opts.log), 'logs');
		await new Promise((c, e) => ncp(logsDir, destLogsDir, err => err ? e(err) : c(undefined)));
	}

	await new Promise((c, e) => rimraf(testDataPath, { maxBusyTries: 10 }, err => err ? e(err) : c(undefined)));
});

if (!opts.web && opts['build'] && !opts['remote']) {
	describe(`Stable vs Insiders Smoke Tests: This test MUST run before releasing`, () => {
		setupDataMigrationTests(opts, testDataPath);
	});
}

describe(`VSCode Smoke Tests (${opts.web ? 'Web' : 'Electron'})`, () => {
	if (!opts.web) { setupDataLossTests(opts); }
	if (!opts.web) { setupPreferencesTests(opts); }
	setupSearchTests(opts);
	setupNotebookTests(opts);
	setupLanguagesTests(opts);
	setupEditorTests(opts);
	setupStatusbarTests(opts);
	setupExtensionTests(opts);
	if (!opts.web) { setupMultirootTests(opts); }
	if (!opts.web) { setupLocalizationTests(opts); }
	if (!opts.web) { setupLaunchTests(opts); }

	// TODO: Enable terminal tests for non-web
	if (opts.web) { setupTerminalProfileTests(opts); }
	if (opts.web) { setupTerminalTabsTests(opts); }
});
