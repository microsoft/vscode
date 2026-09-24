/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDevElectronPath, Quality, ConsoleLogger, FileLogger, Logger, MultiLogger, getBuildElectronPath, getBuildVersion, Application } from '../../automation';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as sqlite3 from '@vscode/sqlite3';
import type { Page } from '@playwright/test';
import { createApp, parseVersion } from './utils';
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
// Keep the launched instance out of the real extensions directory. Without this
// a `--build` run loads whatever the user has installed, which both changes the
// product under test and copies that extension's logs into the evidence bundle.
const extensionsPath = path.join(testDataPath, 'extensions-dir');
fs.mkdirSync(extensionsPath, { recursive: true });
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

/**
 * Read the `quality` a build was stamped with.
 *
 * `parseQuality` reads the environment, which only describes a build made from
 * this checkout. An installed build carries its own quality in `product.json`,
 * and without it every installed run is labelled `Dev` in the evidence, which
 * misreports which product was actually validated.
 */
function readBuildQuality(root: string): string | undefined {
	// Windows installs nest the app under a commit-stamped directory, so the
	// manifest is not always directly under the application root.
	const candidates = [path.join(root, 'resources', 'app', 'product.json')];
	try {
		for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				candidates.push(path.join(root, entry.name, 'resources', 'app', 'product.json'));
			}
		}
	} catch {
		// an unreadable root is reported by the electron path check below
	}
	candidates.push(path.join(root, 'Contents', 'Resources', 'app', 'product.json')); // macOS bundle
	for (const candidate of candidates) {
		try {
			const product = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { quality?: string };
			if (product.quality) {
				return product.quality;
			}
		} catch {
			// try the next location
		}
	}
	return undefined;
}

function parseQuality(stamped?: string): Quality {
	if (!stamped && process.env.VSCODE_DEV === '1') {
		return Quality.Dev;
	}

	const quality = stamped ?? process.env.VSCODE_QUALITY ?? '';

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
/**
 * Locate an installed VS Code Insiders, then Stable.
 *
 * Reproducing a reported issue is the common case, and that means running the
 * shipped product rather than a build from this checkout, so an installed build
 * is used when the caller did not choose a target.
 */
function findInstalledBuild(): string | undefined {
	const candidates: string[] = [];
	switch (process.platform) {
		case 'win32': {
			const roots = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((root): root is string => !!root);
			for (const root of roots) {
				candidates.push(path.join(root, 'Programs', 'Microsoft VS Code Insiders'), path.join(root, 'Microsoft VS Code Insiders'));
			}
			for (const root of roots) {
				candidates.push(path.join(root, 'Programs', 'Microsoft VS Code'), path.join(root, 'Microsoft VS Code'));
			}
			break;
		}
		case 'darwin':
			candidates.push(
				'/Applications/Visual Studio Code - Insiders.app',
				path.join(os.homedir(), 'Applications', 'Visual Studio Code - Insiders.app'),
				'/Applications/Visual Studio Code.app',
				path.join(os.homedir(), 'Applications', 'Visual Studio Code.app')
			);
			break;
		default:
			candidates.push(
				'/usr/share/code-insiders',
				'/opt/visual-studio-code-insiders',
				// Snap keeps the app under a read-only revision root.
				'/snap/code-insiders/current/usr/share/code-insiders',
				'/usr/share/code',
				'/opt/visual-studio-code',
				'/snap/code/current/usr/share/code'
			);
			break;
	}
	return candidates.find(candidate => {
		try {
			return fs.existsSync(candidate) && fs.existsSync(getBuildElectronPath(candidate));
		} catch {
			return false; // an incomplete install is not a usable target
		}
	});
}

if (!opts.web) {
	let testCodePath = opts.build;
	let electronPath: string | undefined;

	if (!testCodePath && !opts.dev) {
		testCodePath = findInstalledBuild();
		if (testCodePath) {
			// `getApplication` launches whatever `opts.build` names, so record the
			// choice there rather than only in this block.
			opts.build = testCodePath;
			logger.log(`No target given, using the installed build at ${testCodePath}. Pass --dev to run this checkout instead.`);
		}
	}

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
		fail(`Cannot find VS Code at ${electronPath}. Install VS Code Insiders, pass --build <app-root>, or build this checkout and pass --dev.`);
	}

	// Windows applies a downloaded update by swapping the executable during
	// startup, so the launched process exits before it ever shows a window and
	// the failure reads as a crash. Insiders updates daily, so say what is
	// actually wrong instead of leaving a 60s timeout to be misread.
	if (electronPath && fs.existsSync(path.join(path.dirname(electronPath), `new_${path.basename(electronPath)}`))) {
		fail(`${electronPath} has a downloaded update waiting to be applied, and it exits during startup to install it instead of opening a window. Start and quit VS Code once to apply the update, then run this again.`);
	}

	quality = parseQuality(testCodePath ? readBuildQuality(testCodePath) : undefined);

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

/**
 * Reject per-run arguments that would move the launched instance off its
 * isolated profile.
 *
 * VS Code keeps the last value of a repeated string option, and per-run
 * arguments are appended after the generated ones, so a caller-supplied
 * `--user-data-dir` or `--extensions-dir` would silently replace the isolated
 * directory and let the real profile and its extensions back into the run.
 */
export function assertNoProfileOverrides(extraArgs: string[] | undefined): void {
	for (const option of ['--user-data-dir', '--extensions-dir']) {
		if (extraArgs?.some(arg => arg === option || arg.startsWith(`${option}=`))) {
			throw new Error(`Per-run extraArgs cannot override the isolated profile directory '${option}'.`);
		}
	}
}

export async function getApplication({ recordVideo, workspacePath, userSettings, extraArgs }: { recordVideo?: boolean; workspacePath?: string; userSettings?: Record<string, JSONValue>; extraArgs?: string[] } = {}) {
	if (opts.web && extraArgs?.length) {
		throw new Error('Per-run extraArgs are not supported by the web automation launcher.');
	}
	assertNoProfileOverrides(extraArgs);
	// The from-source environment is resolved once at module load, which is also
	// where the Electron path is validated. Re-applying it here would set
	// `VSCODE_DEV=1` for `--build` runs as well: a packaged build then behaves as
	// if it were running from a checkout and never opens a window, so launching
	// against an installed build times out waiting for its first window.
	delete process.env.ELECTRON_RUN_AS_NODE; // Ensure we run as Node.js

	const application = createApp({
		quality,
		version: parseVersion(version ?? '0.0.0'),
		codePath: opts.build,
		// Use provided workspace path, or fall back to rootPath on CI (GitHub Actions)
		workspacePath: workspacePath ?? (process.env.GITHUB_ACTIONS ? rootPath : undefined),
		userDataDir: path.join(testDataPath, 'd'),
		extensionsPath,
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
		throw new Error('Cannot pre-seed the isolated test profile without a user data directory.');
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
