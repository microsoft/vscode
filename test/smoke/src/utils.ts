/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sqlite3 from '@vscode/sqlite3';
import * as fs from 'fs';
import { Suite, Context } from 'mocha';
import { dirname, join } from 'path';
import { Application, ApplicationOptions, Logger } from '../../automation';

export interface MockLlmServer {
	readonly url: string;
	requestCount(): number;
	close(): Promise<void>;
}

export function describeRepeat(n: number, description: string, callback: (this: Suite) => void): void {
	for (let i = 0; i < n; i++) {
		describe(`${description} (iteration ${i})`, callback);
	}
}

export function itRepeat(n: number, description: string, callback: (this: Context) => any): void {
	for (let i = 0; i < n; i++) {
		it(`${description} (iteration ${i})`, callback);
	}
}

export function installAllHandlers(logger: Logger, optionsTransform?: (opts: ApplicationOptions) => ApplicationOptions, beforeStart?: (app: Application) => Promise<void> | void) {
	installDiagnosticsHandler(logger);
	installAppBeforeHandler(optionsTransform, beforeStart);
	installAppAfterHandler();
}

export function installDiagnosticsHandler(logger: Logger, appFn?: () => Application | undefined) {

	// Before each suite
	before(async function () {
		const suiteTitle = this.currentTest?.parent?.title;
		logger.log('');
		logger.log(`>>> Suite start: '${suiteTitle ?? 'unknown'}' <<<`);
		logger.log('');
	});

	// Before each test
	beforeEach(async function () {
		const testTitle = this.currentTest?.title;
		logger.log('');
		logger.log(`>>> Test start: '${testTitle ?? 'unknown'}' <<<`);
		logger.log('');

		const app: Application = appFn?.() ?? this.app;
		await app?.startTracing(testTitle ?? 'unknown');
	});

	// After each test
	afterEach(async function () {
		const currentTest = this.currentTest;
		if (!currentTest) {
			return;
		}

		const failed = currentTest.state === 'failed';
		const testTitle = currentTest.title;
		logger.log('');
		if (failed) {
			logger.log(`>>> !!! FAILURE !!! Test end: '${testTitle}' !!! FAILURE !!! <<<`);
		} else {
			logger.log(`>>> Test end: '${testTitle}' <<<`);
		}
		logger.log('');

		const app: Application = appFn?.() ?? this.app;
		await app?.stopTracing(testTitle.replace(/[^a-z0-9\-]/ig, '_'), failed);
	});
}

let logsCounter = 1;
let crashCounter = 1;

export function suiteLogsPath(options: ApplicationOptions, suiteName: string): string {
	return join(dirname(options.logsPath), `${logsCounter++}_suite_${suiteName.replace(/[^a-z0-9\-]/ig, '_')}`);
}

export function suiteCrashPath(options: ApplicationOptions, suiteName: string): string {
	return join(dirname(options.crashesPath), `${crashCounter++}_suite_${suiteName.replace(/[^a-z0-9\-]/ig, '_')}`);
}

function installAppBeforeHandler(optionsTransform?: (opts: ApplicationOptions) => ApplicationOptions, beforeStart?: (app: Application) => Promise<void> | void) {
	before(async function () {
		const suiteName = this.test?.parent?.title ?? 'unknown';

		this.app = createApp({
			...this.defaultOptions,
			logsPath: suiteLogsPath(this.defaultOptions, suiteName),
			crashesPath: suiteCrashPath(this.defaultOptions, suiteName)
		}, optionsTransform);
		await beforeStart?.(this.app);
		await this.app.start();
	});
}

export function installAppAfterHandler(appFn?: () => Application | undefined, joinFn?: () => Promise<unknown>) {
	after(async function () {
		const app: Application = appFn?.() ?? this.app;
		if (app) {
			await app.stop();
		}

		if (joinFn) {
			await joinFn();
		}
	});
}

export function createApp(options: ApplicationOptions, optionsTransform?: (opts: ApplicationOptions) => ApplicationOptions): Application {
	if (optionsTransform) {
		options = optionsTransform({ ...options });
	}

	const config = options.userDataDir
		? { ...options, userDataDir: getRandomUserDataDir(options.userDataDir) }
		: options;
	const app = new Application(config);

	return app;
}

/**
 * Pre-seed the default profile's storage DB so the
 * `BuiltinChatExtensionEnablementMigration` does not disable the built-in
 * copilot-chat extension on a fresh per-run profile. Without this, the first
 * chat send routes through chat-setup's install path, which fails for a merely
 * disabled built-in ("...is a built-in extension and not allowed to be
 * installed") and surfaces a "try again" dialog before the retry recovers.
 *
 * Mirrors the perf:chat harness (`scripts/chat-simulation/common/utils.js`).
 */
export async function preseedChatExtensionEnablement(userDataDir: string | undefined): Promise<void> {
	if (!userDataDir) {
		return;
	}

	const globalStorageDir = join(userDataDir, 'User', 'globalStorage');
	fs.mkdirSync(globalStorageDir, { recursive: true });
	const dbPath = join(globalStorageDir, 'state.vscdb');
	const database = await new Promise<sqlite3.Database>((resolve, reject) => {
		const instance = new sqlite3.Database(dbPath, error => error ? reject(error) : resolve(instance));
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

export function getMockLlmServerPath(): string {
	return join(__dirname, '..', '..', '..', 'scripts', 'chat-simulation', 'common', 'mock-llm-server.ts');
}

export function getMockLlmServerUrl(mockServer: MockLlmServer): string {
	const hostname = process.env.VSCODE_SMOKE_TEST_MOCK_HOST;
	if (!hostname) {
		return mockServer.url;
	}

	const url = new URL(mockServer.url);
	url.hostname = hostname;
	return url.toString().replace(/\/$/, '');
}

export function buildCopilotChatToken(mockUrl: string): string {
	return Buffer.from(JSON.stringify({
		token: 'smoketest-fake-token',
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		refresh_in: 1800,
		sku: 'free_limited_copilot',
		individual: true,
		isNoAuthUser: true,
		copilot_plan: 'free',
		organization_login_list: [],
		endpoints: { api: mockUrl, proxy: mockUrl },
	})).toString('base64');
}

export function getCopilotSmokeTestEnv(mockServer?: MockLlmServer, opts?: { userDataDir?: string }): Readonly<Record<string, string | undefined>> {
	// When `userDataDir` is provided, isolate the Copilot CLI session store
	// from the user's real `~/.copilot/` by pointing `XDG_STATE_HOME` at a
	// sibling of the per-run `userDataDir`. The extension's `getCopilotHome()`
	// / `getCopilotCLISessionStateDir()` (in
	// `extensions/copilot/src/extension/chatSessions/copilotcli/node/cliHelpers.ts`)
	// and the underlying CLI SDK both anchor to `XDG_STATE_HOME/.copilot/`
	// when that env var is set, otherwise to `~/.copilot/`. Pinning it under
	// the per-run `userDataDir` means the smoke-test cleanup (which removes
	// the whole `testDataPath`) also wipes the Copilot state, so repeated
	// local runs don't accumulate sessions that slow down `listSessions`
	// and other startup paths.
	let xdgStateHome: string | undefined;
	if (opts?.userDataDir) {
		xdgStateHome = `${opts.userDataDir}-copilot-state`;
		try {
			fs.mkdirSync(xdgStateHome, { recursive: true });
		} catch {
			// best effort — the dir will be created by the extension on first
			// write if mkdir fails here (e.g. due to a race with a sibling
			// suite). The env var is still honoured.
		}
	}

	return {
		// Mirror the env-var bypass used by `scripts/chat-simulation/common/utils.js#buildEnv`
		// for perf-regression / memory-leak runs:
		//   - GITHUB_PAT switches copilotTokenManager into FixedCopilotTokenManager,
		//     skipping the real GitHub OAuth flow.
		//   - IS_SCENARIO_AUTOMATION tells the Copilot extension this is an automation run
		//     so it suppresses sign-in prompts and uses NoAuth paths.
		//   - VSCODE_COPILOT_CHAT_TOKEN is a fake token whose endpoints.api/proxy
		//     point at the mock LLM server.
		GITHUB_PAT: 'smoketest-fake-pat',
		IS_SCENARIO_AUTOMATION: '1',
		VSCODE_COPILOT_CHAT_TOKEN: mockServer ? buildCopilotChatToken(getMockLlmServerUrl(mockServer)) : undefined,
		XDG_STATE_HOME: xdgStateHome,
	};
}

export function getRandomUserDataDir(baseUserDataDir: string): string {

	// Pick a random user data dir suffix that is not
	// too long to not run into max path length issues
	// https://github.com/microsoft/vscode/issues/34988
	const userDataPathSuffix = [...Array(8)].map(() => Math.random().toString(36)[3]).join('');

	return baseUserDataDir.concat(`-${userDataPathSuffix}`);
}

export function timeout(i: number) {
	return new Promise<void>(resolve => {
		setTimeout(() => {
			resolve();
		}, i);
	});
}

export async function retryWithRestart(app: Application, testFn: () => Promise<unknown>, retries = 3, timeoutMs = 20000): Promise<unknown> {
	let lastError: Error | undefined = undefined;
	for (let i = 0; i < retries; i++) {
		const result = await Promise.race([
			testFn().then(() => true, error => {
				lastError = error;
				return false;
			}),
			timeout(timeoutMs).then(() => false)
		]);

		if (result) {
			return;
		}

		await app.restart();
	}

	throw lastError ?? new Error('retryWithRestart failed with an unknown error');
}

export interface ITask<T> {
	(): T;
}

export async function retry<T>(task: ITask<Promise<T>>, delay: number, retries: number, onBeforeRetry?: () => Promise<unknown>): Promise<T> {
	let lastError: Error | undefined;

	for (let i = 0; i < retries; i++) {
		try {
			if (i > 0 && typeof onBeforeRetry === 'function') {
				try {
					await onBeforeRetry();
				} catch (error) {
					console.warn(`onBeforeRetry failed with: ${error}`);
				}
			}

			return await task();
		} catch (error) {
			lastError = error as Error;

			await timeout(delay);
		}
	}

	throw lastError;
}

/**
 * Best-effort failure diagnostics for the Copilot smoke tests.
 *
 * Writes (via `logger`) into `smoke-test-runner.log`:
 *  - Paths of every `playwright-trace-*.zip` / `playwright-screenshot-*.png`
 *    that has been persisted to the suite's logs directory so the artifact
 *    can be located in a CI logs bundle without searching.
 *  - The class list / attributes of the element matched by
 *    `sendButtonSelector` (if provided) so we can tell whether the button
 *    was `.disabled`, missing, or covered by an overlay when the test gave up.
 *  - The tail (last 80 lines) of the `GitHub Copilot Chat.log` extension
 *    host log for every `window*` directory under the suite logs that has
 *    an `exthost/GitHub.copilot-chat/` subfolder. This surfaces extension-side
 *    errors directly in the runner log so a CI failure does not require
 *    downloading the per-platform `logs-*-*-1` artifact.
 *
 * All steps are wrapped in try/catch — this helper must never throw, since
 * it runs inside a test's `catch` block right before re-throwing the
 * original error.
 */
export async function dumpFailureDiagnostics(
	app: Application,
	logger: Logger,
	label: string,
	options?: { sendButtonSelector?: string }
): Promise<void> {
	const logsPath = app.logsPath;
	logger.log(`[${label}] dumping failure diagnostics; logsPath=${logsPath}`);

	// 1. List playwright trace + screenshot artifacts persisted for this suite.
	try {
		const entries = await fs.promises.readdir(logsPath);
		const artifacts = entries.filter(e => e.startsWith('playwright-trace-') || e.startsWith('playwright-screenshot-'));
		if (artifacts.length === 0) {
			logger.log(`[${label}] no playwright trace/screenshot artifacts present in ${logsPath}`);
		} else {
			logger.log(`[${label}] playwright artifacts (${artifacts.length}):`);
			for (const a of artifacts.sort()) {
				logger.log(`[${label}]   ${join(logsPath, a)}`);
			}
		}
	} catch (err) {
		logger.log(`[${label}] failed to list playwright artifacts in ${logsPath}: ${err instanceof Error ? err.message : String(err)}`);
	}

	// 2. Capture send-button state (Agents Window flow only).
	const sendButtonSelector = options?.sendButtonSelector;
	if (sendButtonSelector) {
		try {
			const elements = await app.code.driver.getElements(sendButtonSelector, true);
			if (!elements || elements.length === 0) {
				logger.log(`[${label}] send-button selector matched 0 elements: ${sendButtonSelector}`);
			} else {
				for (const el of elements) {
					logger.log(`[${label}] send button: tag=${el.tagName} class='${el.className}' attrs=${JSON.stringify(el.attributes)} text='${(el.textContent ?? '').slice(0, 80)}'`);
				}
			}
		} catch (err) {
			logger.log(`[${label}] failed to query send-button selector '${sendButtonSelector}': ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// 3. Tail the Copilot Chat extension log for every window in this suite.
	try {
		const entries = await fs.promises.readdir(logsPath, { withFileTypes: true });
		const windowDirs = entries.filter(e => e.isDirectory() && /^window\d+$/.test(e.name)).map(e => e.name).sort();
		if (windowDirs.length === 0) {
			logger.log(`[${label}] no window* directories found under ${logsPath}`);
		}
		for (const w of windowDirs) {
			const chatLogPath = join(logsPath, w, 'exthost', 'GitHub.copilot-chat', 'GitHub Copilot Chat.log');
			try {
				const stat = await fs.promises.stat(chatLogPath);
				const content = await fs.promises.readFile(chatLogPath, 'utf8');
				const lines = content.split(/\r?\n/);
				const tail = lines.slice(-80);
				logger.log(`[${label}] --- BEGIN ${w}/GitHub Copilot Chat.log (size=${stat.size}; last ${tail.length} of ${lines.length} lines) ---`);
				for (const ln of tail) {
					logger.log(`[${label}] | ${ln}`);
				}
				logger.log(`[${label}] --- END ${w}/GitHub Copilot Chat.log ---`);
			} catch {
				// File does not exist for this window (e.g. windows without the
				// Copilot Chat extension activated). That's expected — skip.
			}
		}
	} catch (err) {
		logger.log(`[${label}] failed to enumerate window* logs under ${logsPath}: ${err instanceof Error ? err.message : String(err)}`);
	}
}
