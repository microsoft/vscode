/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as https from 'https';
import * as cp from 'child_process';
import * as path from 'path';
import * as minimist from 'minimist';
import * as tmp from 'tmp';
import * as rimraf from 'rimraf';
import * as mkdirp from 'mkdirp';
import { Application } from './application';

import { setup as setupDataMigrationTests } from './areas/workbench/data-migration.test';
import { setup as setupDataLossTests } from './areas/workbench/data-loss.test';
import { setup as setupDataExplorerTests } from './areas/explorer/explorer.test';
import { setup as setupDataPreferencesTests } from './areas/preferences/preferences.test';
import { setup as setupDataSearchTests } from './areas/search/search.test';
import { setup as setupDataCSSTests } from './areas/css/css.test';
import { setup as setupDataEditorTests } from './areas/editor/editor.test';
import { setup as setupDataDebugTests } from './areas/debug/debug.test';
import { setup as setupDataGitTests } from './areas/git/git.test';
import { setup as setupDataStatusbarTests } from './areas/statusbar/statusbar.test';
import { setup as setupDataExtensionTests } from './areas/extensions/extensions.test';
import { setup as setupTerminalTests } from './areas/terminal/terminal.test';
import { setup as setupDataMultirootTests } from './areas/multiroot/multiroot.test';
import { setup as setupDataLocalizationTests } from './areas/workbench/localization.test';
import { MultiLogger, Logger, ConsoleLogger, FileLogger } from './logger';

const tmpDir = tmp.dirSync({ prefix: 't' }) as { name: string; removeCallback: Function; };
const testDataPath = tmpDir.name;
process.once('exit', () => rimraf.sync(testDataPath));

const [, , ...args] = process.argv;
const opts = minimist(args, {
	string: [
		'build',
		'stable-build',
		'wait-time',
		'test-repo',
		'keybindings',
		'screenshots',
		'log'
	],
	boolean: [
		'verbose'
	],
	default: {
		verbose: false
	}
});

const workspaceFilePath = path.join(testDataPath, 'smoketest.code-workspace');
const testRepoUrl = 'https://github.com/Microsoft/vscode-smoketest-express';
const workspacePath = path.join(testDataPath, 'vscode-smoketest-express');
const keybindingsPath = path.join(testDataPath, 'keybindings.json');
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

if (parseInt(process.version.substr(1)) < 6) {
	fail('Please update your Node version to greater than 6 to run the smoke test.');
}

// if (!opts.build) {
// 	process.env.VSCODE_CLI = '1';
// }

const userDataDir = path.join(testDataPath, 'd');
// process.env.VSCODE_WORKSPACE_PATH = workspaceFilePath;
process.env.VSCODE_KEYBINDINGS_PATH = keybindingsPath;

function getKeybindingPlatform(): string {
	switch (process.platform) {
		case 'darwin': return 'osx';
		case 'win32': return 'win';
		default: return process.platform;
	}
}

function toUri(path: string): string {
	if (process.platform === 'win32') {
		return `${path.replace(/\\/g, '/')}`;
	}

	return `${path}`;
}

async function getKeybindings(): Promise<void> {
	if (opts.keybindings) {
		console.log('*** Using keybindings: ', opts.keybindings);
		const rawKeybindings = fs.readFileSync(opts.keybindings);
		fs.writeFileSync(keybindingsPath, rawKeybindings);
	} else {
		const keybindingsUrl = `https://raw.githubusercontent.com/Microsoft/vscode-docs/master/build/keybindings/doc.keybindings.${getKeybindingPlatform()}.json`;
		console.log('*** Fetching keybindings...');

		await new Promise((c, e) => {
			https.get(keybindingsUrl, res => {
				const output = fs.createWriteStream(keybindingsPath);
				res.on('error', e);
				output.on('error', e);
				output.on('close', c);
				res.pipe(output);
			}).on('error', e);
		});
	}
}

async function createWorkspaceFile(): Promise<void> {
	if (fs.existsSync(workspaceFilePath)) {
		return;
	}

	console.log('*** Creating workspace file...');
	const workspace = {
		folders: [
			{
				path: toUri(path.join(workspacePath, 'public'))
			},
			{
				path: toUri(path.join(workspacePath, 'routes'))
			},
			{
				path: toUri(path.join(workspacePath, 'views'))
			}
		]
	};

	fs.writeFileSync(workspaceFilePath, JSON.stringify(workspace, null, '\t'));
}

async function setupRepository(): Promise<void> {
	if (opts['test-repo']) {
		console.log('*** Copying test project repository:', opts['test-repo']);
		rimraf.sync(workspacePath);
		// not platform friendly
		cp.execSync(`cp -R "${opts['test-repo']}" "${workspacePath}"`);
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

		console.log('*** Running npm install...');
		cp.execSync('npm install', { cwd: workspacePath, stdio: 'inherit' });
	}
}

async function setup(): Promise<void> {
	console.log('*** Test data:', testDataPath);
	console.log('*** Preparing smoketest setup...');

	await getKeybindings();
	await createWorkspaceFile();
	await setupRepository();

	console.log('*** Smoketest setup done!\n');
}

function createApp(): Application {
	const loggers: Logger[] = [];

	if (opts.verbose) {
		loggers.push(new ConsoleLogger());
	}

	if (opts.log) {
		loggers.push(new FileLogger(opts.log));
	}

	return new Application({
		codePath: opts.build,
		workspacePath,
		userDataDir,
		extensionsPath,
		workspaceFilePath,
		waitTime: parseInt(opts['wait-time'] || '0') || 20,
		logger: new MultiLogger(loggers)
	});
}

before(async function () {
	// allow two minutes for setup
	this.timeout(2 * 60 * 1000);
	await setup();
});

after(async function () {
	await new Promise(c => setTimeout(c, 500)); // wait for shutdown
	await new Promise((c, e) => rimraf(testDataPath, { maxBusyTries: 10 }, err => err ? e(err) : c()));
});

describe('Data Migration', () => {
	setupDataMigrationTests(userDataDir, createApp);
});

describe('Test', () => {
	before(async function () {
		const app = createApp();
		await app!.start();
		this.app = app;
	});

	after(async function () {
		await this.app.stop();
	});

	if (screenshotsPath) {
		afterEach(async function () {
			if (this.currentTest.state !== 'failed') {
				return;
			}

			const app = this.app as Application;
			const raw = await app.capturePage();
			const buffer = new Buffer(raw, 'base64');

			const name = this.currentTest.fullTitle().replace(/[^a-z0-9\-]/ig, '_');
			const screenshotPath = path.join(screenshotsPath, `${name}.png`);

			if (opts.log) {
				app.logger.log('*** Screenshot recorded:', screenshotPath);
			}

			fs.writeFileSync(screenshotPath, buffer);
		});
	}

	if (opts.log) {
		beforeEach(async function () {
			const app = this.app as Application;
			const title = this.currentTest.fullTitle();

			app.logger.log('*** Test start:', title);
		});
	}

	setupDataLossTests();
	setupDataExplorerTests();
	setupDataPreferencesTests();
	setupDataSearchTests();
	setupDataCSSTests();
	setupDataEditorTests();
	setupDataDebugTests();
	setupDataGitTests();
	setupDataStatusbarTests();
	setupDataExtensionTests();
	setupTerminalTests();
	setupDataMultirootTests();
	setupDataLocalizationTests();
});
