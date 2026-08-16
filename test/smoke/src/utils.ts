/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sqlite3 from '@vscode/sqlite3';
import * as fs from 'fs';
import { Suite, Context } from 'mocha';
import { dirname, join } from 'path';
import { Application, ApplicationOptions, IModelConfigSection, Logger } from '../../automation';

export interface MockLlmServer {
	readonly url: string;
	requestCount(): number;
	close(): Promise<void>;
}

/**
 * The model-configuration button label the mock server's `mock-config-model`
 * must show before any option is picked, i.e. the labels of its two schema
 * defaults: reasoning effort `medium` (the `mock-config` family default) and the
 * `default` billing tier's 272000-token context window.
 */
export const MOCK_CONFIG_MODEL_DEFAULT_LABEL = 'Medium 272K';

/**
 * Every option `mock-config-model` declares in its configuration schema, in the
 * order the model-configuration dropdown renders them. The `Thinking Effort`
 * options come from `capabilities.supports.reasoning_effort`, the `Context Size`
 * options from the `default` / `long_context` billing tiers (272000 and
 * `max_context_window_tokens - max_output_tokens` = 922000, which
 * `formatTokenCount` renders as "1M" via its `>900K → 1M` branch).
 *
 * `checked` reflects the pristine state — the schema default of each group — so
 * this snapshot is only valid before any option has been selected.
 */
export const MOCK_CONFIG_MODEL_DEFAULT_SECTIONS: readonly IModelConfigSection[] = [
	{
		header: 'Thinking Effort',
		options: [
			{ label: 'Low', description: '', checked: false },
			{ label: 'Medium', description: 'Default', checked: true },
			{ label: 'High', description: '', checked: false },
		],
	},
	{
		header: 'Context Size',
		options: [
			{ label: '272K', description: 'Default', checked: true },
			{ label: '1M', description: '', checked: false },
		],
	},
];

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
	if (options.userDataDir) {
		options = { ...options, userDataDir: getRandomUserDataDir(options.userDataDir) };
	}

	if (optionsTransform) {
		options = optionsTransform({ ...options });
	}

	const app = new Application(options);

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
	// and other startup paths. Codex uses its own `CODEX_HOME`, so isolate it
	// under the same per-run state root.
	let xdgStateHome: string | undefined;
	let copilotHome: string | undefined;
	let codexHome: string | undefined;
	if (opts?.userDataDir) {
		xdgStateHome = `${opts.userDataDir}-copilot-state`;
		codexHome = join(opts.userDataDir, 'codex-home');
		fs.mkdirSync(codexHome, { recursive: true });
		// Anchor the Copilot runtime's home (`COPILOT_HOME`) at the same
		// `.copilot` directory the extension resolves from `XDG_STATE_HOME`,
		// so the runtime's process logs land in a known, per-run location we
		// can attach on failure (see `getCopilotRuntimeLogDir` /
		// `dumpFailureDiagnostics`). The runtime resolves its process-log dir
		// as `${COPILOT_HOME}/logs` and is NOT influenced by `XDG_STATE_HOME`,
		// so without this the logs would go to the agent's real `~/.copilot`.
		copilotHome = join(xdgStateHome, '.copilot');
		codexHome = join(xdgStateHome, '.codex');
		try {
			fs.mkdirSync(copilotHome, { recursive: true });
			fs.mkdirSync(codexHome, { recursive: true });
		} catch {
			// Best effort: the runtimes create their home directories on first write.
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
		COPILOT_HOME: copilotHome,
		CODEX_HOME: codexHome,
	};
}

/**
 * The directory that holds the Copilot runtime's `process-*.log` files for a
 * smoke run, or `undefined` when this run did not pin a per-run `COPILOT_HOME`.
 *
 * The runtime writes its process logs to `${COPILOT_HOME}/logs`, and
 * `getCopilotSmokeTestEnv` pins `COPILOT_HOME` for the run. Diagnostics resolve
 * the directory from the *exact* `COPILOT_HOME` the app launched with (read back
 * via `app.extraEnv`) rather than reconstructing it from `app.userDataPath`.
 * There is deliberately no fall back to the
 * ambient `~/.copilot/logs` — on a reused CI agent that could surface an
 * unrelated session's trace log (session/model/auth diagnostics), which we must
 * never copy into an uploaded artifact.
 */
export function getCopilotRuntimeLogDir(copilotHome: string | undefined): string | undefined {
	return copilotHome ? join(copilotHome, 'logs') : undefined;
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
 *  - The Copilot runtime (`@github/copilot` CLI) `process-*.log` files: the
 *    most recent are copied into `<logsPath>/copilot-runtime-logs/` (so they
 *    ship in the published `logs-*` artifact that the SDK-integration canary
 *    and bump workflows consume) and their tail is written into the runner
 *    log. These are the SDK/CLI's own diagnostics — the key signal when an
 *    SDK-backed session hangs and the test only reports a timeout.
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

	// 4. Capture the Copilot runtime (`@github/copilot` CLI) process logs.
	//    These are the SDK/CLI's OWN diagnostics — the single most useful
	//    signal when a Copilot-runtime session hangs or times out, which the
	//    mocha "Timed out waiting for response" failure on its own does not
	//    explain. The runtime writes `process-*.log` files to `${COPILOT_HOME}/logs`;
	//    we resolve that from the exact `COPILOT_HOME` the app launched with (see
	//    `getCopilotRuntimeLogDir`).
	//    NOTE: every Copilot-runtime session spawns this runtime, but the detail
	//    differs. Agent Host sessions (Agents Window / local AgentHost) write a
	//    full, verbose account (run at `trace`). The Chat Sessions editor (Copilot
	//    CLI / Claude) and Local sessions run the SDK in-process and install their
	//    own log writer that routes the detailed model/turn diagnostics to
	//    `logService` (the `GitHub Copilot Chat.log` tailed in step 3), so their
	//    `process-*.log` is usually just the runtime's startup/lifecycle — enough
	//    to tell whether the runtime came up (if it did but the turn never
	//    completed, the stall is renderer/extension-side, not the CLI). We copy
	//    the most recent log(s) into the suite `logsPath` so they ship in the
	//    published `logs-*` build artifact (the SDK-integration canary + bump
	//    workflows read these), and tail them into the runner log for quick triage.
	try {
		const logDir = getCopilotRuntimeLogDir(app.extraEnv?.COPILOT_HOME);
		if (!logDir) {
			logger.log(`[${label}] Copilot runtime logs unavailable (COPILOT_HOME not pinned for this suite)`);
			return;
		}
		const collected: { path: string; mtimeMs: number }[] = [];
		let names: string[];
		try {
			names = await fs.promises.readdir(logDir);
		} catch {
			logger.log(`[${label}] no Copilot runtime logs under ${logDir} (no Copilot CLI session spawned the runtime for this suite)`);
			return;
		}
		for (const name of names) {
			if (!/^process-.*\.log$/.test(name)) {
				continue;
			}
			const full = join(logDir, name);
			try {
				const stat = await fs.promises.stat(full);
				collected.push({ path: full, mtimeMs: stat.mtimeMs });
			} catch {
				// racing cleanup — skip
			}
		}
		if (collected.length === 0) {
			logger.log(`[${label}] no Copilot runtime process-*.log found under ${logDir}`);
		} else {
			// Newest first; the active session's log is the relevant one. Cap
			// at the two most recent to bound noise/artifact size.
			collected.sort((a, b) => b.mtimeMs - a.mtimeMs);
			const runtimeLogsDest = join(logsPath, 'copilot-runtime-logs');
			try {
				await fs.promises.mkdir(runtimeLogsDest, { recursive: true });
			} catch {
				// best effort — copy below still logs on failure
			}
			for (const { path: logPath } of collected.slice(0, 2)) {
				try {
					const content = await fs.promises.readFile(logPath, 'utf8');
					// Persist the full file into the uploaded artifact bundle.
					const destName = logPath.split(/[\\/]/).pop() ?? 'process.log';
					try {
						await fs.promises.copyFile(logPath, join(runtimeLogsDest, destName));
					} catch (copyErr) {
						logger.log(`[${label}] failed to copy ${logPath} into ${runtimeLogsDest}: ${copyErr instanceof Error ? copyErr.message : String(copyErr)}`);
					}
					// Tail into the runner log for immediate triage.
					const lines = content.split(/\r?\n/);
					const tail = lines.slice(-200);
					logger.log(`[${label}] --- BEGIN copilot runtime ${destName} (${logPath}; last ${tail.length} of ${lines.length} lines) ---`);
					for (const ln of tail) {
						logger.log(`[${label}] # ${ln}`);
					}
					logger.log(`[${label}] --- END copilot runtime ${destName} ---`);
				} catch (readErr) {
					logger.log(`[${label}] failed to read runtime log ${logPath}: ${readErr instanceof Error ? readErr.message : String(readErr)}`);
				}
			}
		}
	} catch (err) {
		logger.log(`[${label}] failed to capture Copilot runtime logs: ${err instanceof Error ? err.message : String(err)}`);
	}
}
