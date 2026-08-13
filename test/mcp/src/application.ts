/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDevElectronPath, Quality, ConsoleLogger, FileLogger, Logger, MultiLogger, getBuildElectronPath, getBuildVersion, measureAndLog, Application } from '../../automation';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscodetest from '@vscode/test-electron';
import * as sqlite3 from '@vscode/sqlite3';
import type { Page } from '@playwright/test';
import { createApp, retry, parseVersion } from './utils';
import { opts } from './options';

export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

type ApplicationLaunchOptions = { recordVideo?: boolean; workspacePath?: string; userSettings?: Record<string, JSONValue>; extraArgs?: string[] };

const rootPath = path.join(__dirname, '..', '..', '..');
const logsRootPath = path.join(rootPath, '.build', 'vscode-playwright-mcp', 'logs');
const crashesRootPath = path.join(rootPath, '.build', 'vscode-playwright-mcp', 'crashes');
const videoRootPath = path.join(rootPath, '.build', 'vscode-playwright-mcp', 'videos');
const sourceVersion = (JSON.parse(fs.readFileSync(path.join(rootPath, 'package.json'), 'utf8')) as { version: string }).version;

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

export function getProductVersion(): string {
	return version ?? sourceVersion;
}

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
			// Visual Studio Code.app/Contents/MacOS/Code
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

export async function getApplication({ recordVideo, workspacePath, userSettings, extraArgs }: { recordVideo?: boolean; workspacePath?: string; userSettings?: Record<string, JSONValue>; extraArgs?: string[] } = {}) {
	if (opts.web && extraArgs?.length) {
		throw new Error('Per-run extraArgs are not supported by the web automation launcher.');
	}
	if (extraArgs?.some(arg => arg === '--user-data-dir' || arg.startsWith('--user-data-dir='))) {
		throw new Error('Per-run extraArgs cannot override the isolated user data directory.');
	}
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
		quality,
		version: parseVersion(version ?? '0.0.0'),
		codePath: opts.build,
		// Use provided workspace path, or fall back to rootPath on CI (GitHub Actions)
		workspacePath: workspacePath ?? (process.env.GITHUB_ACTIONS ? rootPath : undefined),
		userDataDir: path.join(testDataPath, 'd'),
		useInMemorySecretStorage: true,
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
		extraArgs: [
			...(opts.electronArgs || '').split(' ').map(arg => arg.trim()).filter(arg => !!arg),
			...(extraArgs ?? [])
		],
		extensionDevelopmentPath: opts.extensionDevelopmentPath,
	});
	try {
		await preseedUserData(application.userDataPath, userSettings, !!opts.web);
		await application.start();
		return application;
	} catch (error) {
		try {
			await application.stop();
		} catch {
			// Preserve the startup error.
		}
		await removeProfileData(application.userDataPath);
		throw error;
	}
}

async function removeProfileData(userDataPath: string | undefined): Promise<void> {
	if (!userDataPath) {
		return;
	}
	for (const profilePath of [userDataPath, `${userDataPath}-server`]) {
		try {
			await fs.promises.rm(profilePath, { recursive: true, force: true, maxRetries: 10 });
		} catch (error) {
			logger.log(`Failed to remove test profile '${profilePath}': ${error}`);
		}
	}
}

async function preseedUserData(userDataDir: string | undefined, userSettings: Record<string, JSONValue> | undefined, web: boolean): Promise<void> {
	if (!userDataDir) {
		throw new Error('Cannot pre-seed the MCP test profile without a user data directory.');
	}

	const userDir = path.join(userDataDir, ...(web ? ['data', 'User'] : ['User']));
	fs.mkdirSync(userDir, { recursive: true });
	if (userSettings) {
		fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify(userSettings, undefined, 2));
	}

	const globalStorageDir = path.join(userDir, 'globalStorage');
	fs.mkdirSync(globalStorageDir, { recursive: true });
	const database = await new Promise<sqlite3.Database>((resolve, reject) => {
		const instance = new sqlite3.Database(path.join(globalStorageDir, 'state.vscdb'), error => error ? reject(error) : resolve(instance));
	});
	try {
		await new Promise<void>((resolve, reject) => database.exec([
			'CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);',
			'INSERT INTO ItemTable (key, value) VALUES (\'builtinChatExtensionEnablementMigration\', \'true\');',
		].join(' '), error => error ? reject(error) : resolve()));
	} finally {
		await new Promise<void>((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
	}
}

function launchOptionsEqual(first: ApplicationLaunchOptions, second: ApplicationLaunchOptions): boolean {
	return !!first.recordVideo === !!second.recordVideo
		&& first.workspacePath === second.workspacePath
		&& jsonValueEqual(first.userSettings, second.userSettings)
		&& jsonValueEqual(first.extraArgs, second.extraArgs);
}

function jsonValueEqual(first: JSONValue | Record<string, JSONValue> | undefined, second: JSONValue | Record<string, JSONValue> | undefined): boolean {
	if (first === second) {
		return true;
	}
	if (first === undefined || second === undefined || first === null || second === null || typeof first !== 'object' || typeof second !== 'object') {
		return false;
	}
	if (Array.isArray(first) || Array.isArray(second)) {
		return Array.isArray(first) && Array.isArray(second) && first.length === second.length && first.every((value, index) => jsonValueEqual(value, second[index]));
	}
	const firstKeys = Object.keys(first);
	const secondKeys = Object.keys(second);
	return firstKeys.length === secondKeys.length && firstKeys.every(key => Object.prototype.hasOwnProperty.call(second, key) && jsonValueEqual(first[key], second[key]));
}

export class ApplicationService {
	private _application: Application | undefined;
	private _creating: { options: ApplicationLaunchOptions; promise: Promise<Application> } | undefined;
	private _closing: Promise<void> | undefined;
	private _profileCleanup: Promise<void> | undefined;
	private readonly _profileCleanupDelays = new Set<Promise<void>>();
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

	deferProfileCleanup(until: Promise<void>): void {
		this._profileCleanupDelays.add(until);
		void until.finally(() => this._profileCleanupDelays.delete(until));
	}

	async waitForProfileCleanup(): Promise<void> {
		await this._profileCleanup;
	}

	async getOrCreateApplication(options: ApplicationLaunchOptions = {}): Promise<Application> {
		if (this._creating) {
			if (!launchOptionsEqual(this._creating.options, options)) {
				throw new Error('An application launch is already in progress with different launch options.');
			}
			return this._creating.promise;
		}
		if (this._application) {
			return this._application;
		}

		const creating = (async () => {
			if (this._closing) {
				await this._closing;
			}
			if (this._profileCleanup) {
				await this._profileCleanup;
			}
			if (this._application) {
				return this._application;
			}

			this._application = await getApplication(options);
			const application = this._application;
			const observedPages = new Set<Page>();
			const observePage = (page: Page) => {
				if (observedPages.has(page)) {
					return;
				}
				observedPages.add(page);
				page.once('close', () => void this._handlePageClose(application).catch(error => logger.log(`Failed to handle page close: ${error}`)));
			};
			for (const page of application.code.driver.getAllWindows()) {
				observePage(page);
			}
			application.code.driver.browserContext.on('page', observePage);
			await this._runAllListeners();
			return application;
		})();
		this._creating = { options, promise: creating };
		try {
			return await creating;
		} finally {
			if (this._creating?.promise === creating) {
				this._creating = undefined;
			}
		}
	}

	async getApplicationIfRunning(): Promise<Application | undefined> {
		if (this._closing) {
			await this._closing;
		}
		if (!this._application) {
			return undefined;
		}
		try {
			const driver = this._application.code.driver;
			const openWindowIndex = driver.getAllWindows().findIndex(page => !page.isClosed());
			if (openWindowIndex < 0) {
				return undefined;
			}
			if (driver.currentPage.isClosed()) {
				driver.switchToWindow(openWindowIndex);
			}
			return this._application;
		} catch {
			return undefined;
		}
	}

	async stopApplication(application?: Application): Promise<void> {
		if (application) {
			if (this._application === application) {
				await this._closeApplication(application);
			} else if (this._closing) {
				await this._closing;
			}
			return;
		}
		if (this._creating) {
			try {
				await this._creating.promise;
			} catch {
				return;
			}
		}
		if (this._application) {
			await this._closeApplication(this._application);
		} else if (this._closing) {
			await this._closing;
		}
	}

	private async _handlePageClose(application: Application): Promise<void> {
		if (this._application !== application) {
			return;
		}
		try {
			const driver = application.code.driver;
			const openWindowIndex = driver.getAllWindows().findIndex(page => !page.isClosed());
			if (openWindowIndex >= 0) {
				if (driver.currentPage.isClosed()) {
					driver.switchToWindow(openWindowIndex);
				}
				return;
			}
		} catch {
			// Fall through to closing the application.
		}
		await this._closeApplication(application);
	}

	private async _closeApplication(application: Application): Promise<void> {
		if (this._application !== application) {
			await this._closing;
			return;
		}
		if (!this._closing) {
			const closing = (async () => {
				try {
					application.code.driver.browserContext.removeAllListeners();
					await application.stop();
				} finally {
					if (this._application === application) {
						this._application = undefined;
						await this._runAllListeners();
						this._scheduleProfileCleanup(application.userDataPath);
					}
				}
			})();
			this._closing = closing;
			try {
				await closing;
			} finally {
				if (this._closing === closing) {
					this._closing = undefined;
				}
			}
		} else {
			await this._closing;
		}
	}

	private _scheduleProfileCleanup(userDataPath: string | undefined): void {
		const previousCleanup = this._profileCleanup ?? Promise.resolve();
		const cleanupDelays = [...this._profileCleanupDelays];
		const cleanup = (async () => {
			await previousCleanup;
			await Promise.all(cleanupDelays);
			await removeProfileData(userDataPath);
		})();
		this._profileCleanup = cleanup;
		void cleanup.finally(() => {
			if (this._profileCleanup === cleanup) {
				this._profileCleanup = undefined;
			}
		});
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
