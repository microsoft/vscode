/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * attach.ts — connect the repo's own UI automation page objects
 * (`test/automation`) to an already-running Code OSS instance over CDP.
 *
 * The smoke-test harness normally *spawns* Electron via
 * `playwright._electron.launch()` and keeps the resulting `ElectronApplication`.
 * `launch.sh` has already spawned a window, so instead we hand `PlaywrightDriver`
 * a `Browser` obtained from `chromium.connectOverCDP()`. The driver only uses
 * that object for `windows()` / `close()` and already branches on
 * `'windows' in application`, so a CDP `Browser` works in its place.
 *
 * Why this is a module and not a documented snippet: three of the steps below
 * are invisible from the type definitions and each fails in a way that does not
 * point at its own cause.
 *   1. `test/automation/out` is CommonJS, so `import { Code } from ...` throws
 *      `SyntaxError: Named export 'Code' not found`.
 *   2. `Quality` is a `const enum`, which TypeScript erases at compile time. It
 *      has no runtime value, so importing it yields `undefined` and the failure
 *      surfaces later as `Cannot read properties of undefined`.
 *   3. `window.driver` — which every page object ultimately calls through — is
 *      only registered when the window was started with
 *      `--enable-smoke-test-driver`. Without it, page objects hang or throw
 *      obscure errors instead of reporting the missing flag.
 *
 * Usage:
 *   import { attach } from '<skill-dir>/scripts/attach.ts';
 *   const session = await attach(cdpPort);
 *   await session.workbench.chat.sendMessage('hello');
 *   await session.detach();
 *
 * Run your script from the vscode repo root so that `playwright` and
 * `test/automation/out` resolve. Node strips the type annotations natively, so
 * this file is imported directly with no build step.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);

/**
 * The automation page objects and Playwright are loaded from the repo at
 * runtime rather than imported statically, so that this file works from any
 * checkout without a build step. Type-only imports still give callers full
 * checking and completion: Node erases them along with the annotations.
 */
type PlaywrightPage = import('playwright').Page;
type PlaywrightBrowser = import('playwright').Browser;
type PlaywrightContext = import('playwright').BrowserContext;
type AutomationCode = import('../../../../test/automation/out/code.js').Code;
type AutomationWorkbench = import('../../../../test/automation/out/workbench.js').Workbench;

export interface IAttachedSession {
	/** The CDP `Browser`; `detach()` is preferred over closing this directly. */
	readonly browser: PlaywrightBrowser;
	/** The workbench page, for anything the page objects do not cover. */
	readonly page: PlaywrightPage;
	/** Low-level automation helpers, e.g. `waitAndClick`, `waitForElement`. */
	readonly code: AutomationCode;
	/** Page objects: `chat`, `agentsWindow`, `quickaccess`, `terminal`, ... */
	readonly workbench: AutomationWorkbench;
	/** Disconnect this CDP client, leaving the Code OSS process running. */
	detach(): Promise<void>;
}

export interface IAttachOptions {
	/** Which window to drive. Defaults to `'any'`. */
	readonly window?: 'workbench' | 'agents' | 'any';
	/** Forward the automation logger's per-retry output to stderr. */
	readonly verbose?: boolean;
	/** Repo root, if it cannot be inferred from this file's location. */
	readonly repoRoot?: string;
	/** Where page objects may write logs. */
	readonly logsPath?: string;
	/** Budget for finding the window. */
	readonly timeoutMs?: number;
}

/**
 * Runtime stand-in for the `Quality` const enum in
 * `test/automation/src/application.ts`, which is erased at compile time and so
 * cannot be imported. Keep in sync with that declaration.
 */
const Quality = Object.freeze({ Dev: 0, Insiders: 1, Stable: 2, Exploration: 3, OSS: 4 });

/** Default time budget for discovering the workbench page on the CDP endpoint. */
const DEFAULT_PAGE_TIMEOUT_MS = 30_000;

/**
 * The workbench and the Agents window are served from different entry points.
 * Dev builds append a `-dev` suffix (`workbench-dev.html`, `sessions-dev.html`),
 * so match on the stable stem rather than a full file name.
 */
const PAGE_URL_HINTS = Object.freeze({
	workbench: /\/workbench(-dev)?\.html/,
	agents: /\/sessions(-dev)?\.html/,
	any: undefined
});

function repoRootFrom(explicitRepoRoot: string | undefined): string {
	if (explicitRepoRoot) {
		return explicitRepoRoot;
	}
	// scripts/ -> launch/ -> skills/ -> .agents/ -> <repo root>
	return resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
}

function loadAutomation(repoRoot: string) {
	const outDir = resolvePath(repoRoot, 'test', 'automation', 'out');
	if (!existsSync(resolvePath(outDir, 'workbench.js'))) {
		throw new Error(
			`test/automation is not compiled at ${outDir}. ` +
			`Run \`npm run compile\` in the repo root (or \`npm run compile\` inside test/automation).`
		);
	}
	return {
		PlaywrightDriver: require(resolvePath(outDir, 'playwrightDriver.js')).PlaywrightDriver,
		Code: require(resolvePath(outDir, 'code.js')).Code,
		Workbench: require(resolvePath(outDir, 'workbench.js')).Workbench
	};
}

async function findPage(context: PlaywrightContext, urlHint: RegExp | undefined, timeoutMs: number): Promise<PlaywrightPage> {
	const deadline = Date.now() + timeoutMs;
	let seen: string[] = [];
	for (;;) {
		seen = context.pages().map((page: PlaywrightPage) => page.url());
		const match = context.pages().find((page: PlaywrightPage) => {
			const url = page.url();
			if (!url.startsWith('vscode-file:')) {
				return false;
			}
			return urlHint ? urlHint.test(url) : true;
		});
		if (match) {
			return match;
		}
		if (Date.now() >= deadline) {
			throw new Error(
				`Timed out after ${timeoutMs}ms looking for a ${urlHint ? `${urlHint} ` : ''}window. ` +
				`Pages on this CDP endpoint: ${seen.length ? seen.join(', ') : '(none)'}.`
			);
		}
		await new Promise(resolve => setTimeout(resolve, 250));
	}
}

/**
 * `launch.sh` treats the endpoint as ready as soon as `/json/version` responds,
 * which can happen before the workbench has run `setupDriver()`. Poll rather
 * than sampling once, so a correctly launched instance is not misreported as
 * missing the flag purely because it was still starting up.
 */
async function waitForSmokeTestDriver(page: PlaywrightPage, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const hasDriver = await page.evaluate(
			() => typeof (globalThis as { driver?: unknown }).driver !== 'undefined');
		if (hasDriver) {
			return;
		}
		if (Date.now() >= deadline) {
			throw new Error(
				`window.driver was still not registered after ${timeoutMs}ms, so the automation page ` +
				'objects cannot work. This usually means the window was launched without the ' +
				'smoke-test driver: relaunch with `launch.sh -- --enable-smoke-test-driver`.'
			);
		}
		await new Promise(resolve => setTimeout(resolve, 250));
	}
}

/**
 * Attach the `test/automation` page objects to a running Code OSS instance.
 *
 * @param cdpPort `cdpPort` from the `launch.sh` JSON output.
 * @param options See {@link IAttachOptions}.
 */
export async function attach(cdpPort: number | string, options: IAttachOptions = {}): Promise<IAttachedSession> {
	const {
		window: windowKind = 'any',
		verbose = false,
		repoRoot: explicitRepoRoot,
		logsPath = '/tmp/vscode-attach-logs',
		timeoutMs = DEFAULT_PAGE_TIMEOUT_MS
	} = options;

	if (cdpPort === undefined || cdpPort === null || `${cdpPort}`.trim() === '') {
		throw new Error('attach(cdpPort) requires the cdpPort printed by launch.sh.');
	}
	if (!Object.hasOwn(PAGE_URL_HINTS, windowKind)) {
		throw new Error(`Unknown window kind "${windowKind}". Expected one of: ${Object.keys(PAGE_URL_HINTS).join(', ')}.`);
	}

	const repoRoot = repoRootFrom(explicitRepoRoot);
	const { PlaywrightDriver, Code, Workbench } = loadAutomation(repoRoot);
	const { chromium } = require(resolvePath(repoRoot, 'node_modules', 'playwright'));

	const endpoint = `http://127.0.0.1:${cdpPort}`;
	let browser;
	try {
		browser = await chromium.connectOverCDP(endpoint);
	} catch (error) {
		throw new Error(
			`Could not connect to Code OSS over CDP at ${endpoint}: ${error instanceof Error ? error.message : error}. ` +
			`Confirm the instance is still running and that this is the cdpPort from its launch.sh output.`
		);
	}

	try {
		const context = browser.contexts()[0];
		if (!context) {
			throw new Error(`No browser context on ${endpoint}; the window may still be starting up.`);
		}

		const deadline = Date.now() + timeoutMs;
		const page = await findPage(context, PAGE_URL_HINTS[windowKind], timeoutMs);
		await waitForSmokeTestDriver(page, Math.max(deadline - Date.now(), 1_000));

		const logger = { log: (...args: unknown[]) => { if (verbose) { console.error('[automation]', ...args); } } };
		const launchOptions = {
			logger,
			logsPath,
			crashesPath: logsPath,
			quality: Quality.Dev,
			version: { major: 1, minor: 999, patch: 0 }
		};

		// `serverProcess` and `safeToKill` are only consulted when the harness owns
		// the process lifetime. Here launch.sh owns it, so both are omitted and the
		// caller kills the pid from its JSON output.
		const driver = new PlaywrightDriver(browser, context, page, undefined, Promise.resolve(), launchOptions, undefined);
		const code = new Code(driver, logger, undefined, undefined, Quality.Dev, launchOptions.version);

		// `Code.exit()` shuts down a process this module never spawned, and would
		// otherwise fail obscurely on `this.mainProcess.pid`. Replace it with an
		// explanation of what to do instead.
		code.exit = () => Promise.reject(new Error(
			'Code.exit() is not available on an attached instance, because launch.sh owns the process. ' +
			'Call detach() to disconnect, then kill the `pid` from the launch.sh JSON output.'
		));

		return {
			browser,
			page,
			code,
			workbench: new Workbench(code),
			detach: () => browser.close()
		};
	} catch (error) {
		await browser.close().catch(() => { });
		throw error;
	}
}
