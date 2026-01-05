/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from 'playwright';
import { getDevElectronPath, Quality, ConsoleLogger, FileLogger, Logger, MultiLogger, getBuildElectronPath, getBuildVersion, measureAndLog, Application } from '../../automation';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscodetest from '@vscode/test-electron';
import { createApp, retry } from './utils';
import { opts } from './options';

const rootPath = path.join(__dirname, '..', '..', '..');
const logsRootPath = path.join(rootPath, '.build', 'vscode-playwright-mcp', 'logs');
const crashesRootPath = path.join(rootPath, '.build', 'vscode-playwright-mcp', 'crashes');
const videoRootPath = path.join(rootPath, '.build', 'vscode-playwright-mcp', 'videos');

const logger = createLogger();

function createLogger(): Logger {
	const loggers: Logger[] = [];

	// Log to console if verbose
	if (opts.verbose) {
		loggers.push(new ConsoleLogger());
	}

	// Prepare logs rot path
	fs.rmSync(logsRootPath, { recursive: true, force: true, maxRetries: 3 });
	fs.mkdirSync(logsRootPath, { recursive: true });

	// Always log to log file
	loggers.push(new FileLogger(path.join(logsRootPath, 'smoke-test-runner.log')));

	return new MultiLogger(loggers);
}

const testDataPath = path.join(os.tmpdir(), 'vscsmoke');
if (fs.existsSync(testDataPath)) {
	fs.rmSync(testDataPath, { recursive: true, force: true, maxRetries: 10 });
}
fs.mkdirSync(testDataPath, { recursive: true });
process.once('exit', () => {
	try {
		fs.rmSync(testDataPath, { recursive: true, force: true, maxRetries: 10 });
	} catch {
		// noop
	}
});

function fail(errorMessage): void {
	logger.log(errorMessage);
	if (!opts.verbose) {
		console.error(errorMessage);
	}
	process.exit(1);
}

let quality: Quality;
let version: string | undefined;

function parseVersion(version: string): { major: number; minor: number; patch: number } {
	const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version)!;
	return { major: parseInt(major), minor: parseInt(minor), patch: parseInt(patch) };
}

function parseQuality(): Quality {
	if (process.env.VSCODE_DEV === '1') {
		return Quality.Dev;
	}

	const quality = process.env.VSCODE_QUALITY ?? '';

	switch (quality) {
		case 'stable':
			return Quality.Stable;
		case 'insider':
			return Quality.Insiders;
		case 'exploration':
			return Quality.Exploration;
		case 'oss':
			return Quality.OSS;
		default:
			return Quality.Dev;
	}
}

//
// #### Electron ####
//
if (!opts.web) {
	let testCodePath = opts.build;
	let electronPath: string | undefined;

	if (testCodePath) {
		electronPath = getBuildElectronPath(testCodePath);
		version = getBuildVersion(testCodePath);
	} else {
		testCodePath = getDevElectronPath();
		electronPath = testCodePath;
		process.env.VSCODE_REPOSITORY = rootPath;
		process.env.VSCODE_DEV = '1';
		process.env.VSCODE_CLI = '1';
	}

	if (!fs.existsSync(electronPath || '')) {
		fail(`Cannot find VSCode at ${electronPath}. Please run VSCode once first (scripts/code.sh, scripts\\code.bat) and try again.`);
	}

	quality = parseQuality();

	if (opts.remote) {
		logger.log(`Running desktop remote smoke tests against ${electronPath}`);
	} else {
		logger.log(`Running desktop smoke tests against ${electronPath}`);
	}
}

//
// #### Web Smoke Tests ####
//
else {
	const testCodeServerPath = opts.build || process.env.VSCODE_REMOTE_SERVER_PATH;

	if (typeof testCodeServerPath === 'string') {
		if (!fs.existsSync(testCodeServerPath)) {
			fail(`Cannot find Code server at ${testCodeServerPath}.`);
		} else {
			logger.log(`Running web smoke tests against ${testCodeServerPath}`);
		}
	}

	if (!testCodeServerPath) {
		process.env.VSCODE_REPOSITORY = rootPath;
		process.env.VSCODE_DEV = '1';
		process.env.VSCODE_CLI = '1';

		logger.log(`Running web smoke out of sources`);
	}

	quality = parseQuality();
}

logger.log(`VS Code product quality: ${quality}.`);

async function ensureStableCode(): Promise<void> {
	let stableCodePath = opts['stable-build'];
	if (!stableCodePath) {
		const current = parseVersion(version!);
		const versionsReq = await retry(() => measureAndLog(() => fetch('https://update.code.visualstudio.com/api/releases/stable'), 'versionReq', logger), 1000, 20);

		if (!versionsReq.ok) {
			throw new Error('Could not fetch releases from update server');
		}

		const versions: string[] = await measureAndLog(() => versionsReq.json(), 'versionReq.json()', logger);
		const stableVersion = versions.find(raw => {
			const version = parseVersion(raw);
			return version.major < current.major || (version.major === current.major && version.minor < current.minor);
		});

		if (!stableVersion) {
			throw new Error(`Could not find suitable stable version for ${version}`);
		}

		logger.log(`Found VS Code v${version}, downloading previous VS Code version ${stableVersion}...`);

		let lastProgressMessage: string | undefined = undefined;
		let lastProgressReportedAt = 0;
		const stableCodeDestination = path.join(testDataPath, 's');
		const stableCodeExecutable = await retry(() => measureAndLog(() => vscodetest.download({
			cachePath: stableCodeDestination,
			version: stableVersion,
			extractSync: true,
			reporter: {
				report: report => {
					let progressMessage = `download stable code progress: ${report.stage}`;
					const now = Date.now();
					if (progressMessage !== lastProgressMessage || now - lastProgressReportedAt > 10000) {
						lastProgressMessage = progressMessage;
						lastProgressReportedAt = now;

						if (report.stage === 'downloading') {
							progressMessage += ` (${report.bytesSoFar}/${report.totalBytes})`;
						}

						logger.log(progressMessage);
					}
				},
				error: error => logger.log(`download stable code error: ${error}`)
			}
		}), 'download stable code', logger), 1000, 3, () => new Promise<void>((resolve, reject) => {
			fs.rm(stableCodeDestination, { recursive: true, force: true, maxRetries: 10 }, error => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		}));

		if (process.platform === 'darwin') {
			// Visual Studio Code.app/Contents/MacOS/Electron
			stableCodePath = path.dirname(path.dirname(path.dirname(stableCodeExecutable)));
		} else {
			// VSCode/Code.exe (Windows) | VSCode/code (Linux)
			stableCodePath = path.dirname(stableCodeExecutable);
		}

		opts['stable-version'] = parseVersion(stableVersion);
	}

	if (!fs.existsSync(stableCodePath)) {
		throw new Error(`Cannot find Stable VSCode at ${stableCodePath}.`);
	}

	logger.log(`Using stable build ${stableCodePath} for migration tests`);

	opts['stable-build'] = stableCodePath;
}

async function setup(): Promise<void> {
	logger.log('Preparing smoketest setup...');

	if (!opts.web && !opts.remote && opts.build) {
		// only enabled when running with --build and not in web or remote
		await measureAndLog(() => ensureStableCode(), 'ensureStableCode', logger);
	}

	logger.log('Smoketest setup done!\n');
}

export async function getApplication({ recordVideo }: { recordVideo?: boolean } = {}) {
	const testCodePath = getDevElectronPath();
	const electronPath = testCodePath;
	if (!fs.existsSync(electronPath || '')) {
		throw new Error(`Cannot find VSCode at ${electronPath}. Please run VSCode once first (scripts/code.sh, scripts\\code.bat) and try again.`);
	}
	process.env.VSCODE_REPOSITORY = rootPath;
	process.env.VSCODE_DEV = '1';
	process.env.VSCODE_CLI = '1';
	delete process.env.ELECTRON_RUN_AS_NODE; // Ensure we run as Node.js

	await setup();
	const application = createApp({
		// Pass the alpha version of Playwright down... This is a hack since Playwright MCP
		// doesn't play nice with Playwright Test: https://github.com/microsoft/playwright-mcp/issues/917
		// eslint-disable-next-line local/code-no-any-casts
		playwright: playwright as any,
		quality,
		version: parseVersion(version ?? '0.0.0'),
		codePath: opts.build,
		workspacePath: rootPath,
		logger,
		logsPath: logsRootPath,
		crashesPath: crashesRootPath,
		videosPath: (recordVideo || opts.video) ? videoRootPath : undefined,
		verbose: opts.verbose,
		remote: opts.remote,
		web: opts.web,
		tracing: true,
		headless: opts.headless,
		browser: opts.browser,
		extraArgs: (opts.electronArgs || '').split(' ').map(arg => arg.trim()).filter(arg => !!arg),
	});
	await application.start();
	application.code.driver.currentPage.on('close', async () => {
		fs.rmSync(testDataPath, { recursive: true, force: true, maxRetries: 10 });
	});
	return application;
}

export class ApplicationService {
	private _application: Application | undefined;
	private _closing: Promise<void> | undefined;
	private _listeners: ((app: Application | undefined) => Promise<void> | void)[] = [];

	onApplicationChange(listener: (app: Application | undefined) => Promise<void> | void): void {
		this._listeners.push(listener);
	}

	removeApplicationChangeListener(listener: (app: Application | undefined) => void): void {
		const index = this._listeners.indexOf(listener);
		if (index >= 0) {
			this._listeners.splice(index, 1);
		}
	}

	get application(): Application | undefined {
		return this._application;
	}

	async getOrCreateApplication({ recordVideo }: { recordVideo?: boolean } = {}): Promise<Application> {
		if (this._closing) {
			await this._closing;
		}
		if (!this._application) {
			this._application = await getApplication({ recordVideo });
			this._application.code.driver.currentPage.on('close', () => {
				this._closing = (async () => {
					if (this._application) {
						this._application.code.driver.browserContext.removeAllListeners();
						await this._application.stop();
						this._application = undefined;
						await this._runAllListeners();
					}
				})();
			});
			await this._runAllListeners();
		}
		return this._application;
	}

	private async _runAllListeners() {
		for (const listener of this._listeners) {
			try {
				await listener(this._application);
			} catch (error) {
				console.error('Error occurred in application change listener:', error);
			}
		}
	}
}
