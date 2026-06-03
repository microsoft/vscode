/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export function installAllHandlers(logger: Logger, optionsTransform?: (opts: ApplicationOptions) => ApplicationOptions) {
	installDiagnosticsHandler(logger);
	installAppBeforeHandler(optionsTransform);
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

function installAppBeforeHandler(optionsTransform?: (opts: ApplicationOptions) => ApplicationOptions) {
	before(async function () {
		const suiteName = this.test?.parent?.title ?? 'unknown';

		this.app = createApp({
			...this.defaultOptions,
			logsPath: suiteLogsPath(this.defaultOptions, suiteName),
			crashesPath: suiteCrashPath(this.defaultOptions, suiteName)
		}, optionsTransform);
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

export function getMockLlmServerPath(): string {
	return join(__dirname, '..', '..', '..', 'scripts', 'chat-simulation', 'common', 'mock-llm-server.js');
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

export function getCopilotSmokeTestEnv(mockServer?: MockLlmServer): Readonly<Record<string, string | undefined>> {
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
		VSCODE_COPILOT_CHAT_TOKEN: mockServer ? buildCopilotChatToken(mockServer.url) : undefined,
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
