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
 * The launcher has already spawned a window, so instead we hand `PlaywrightDriver`
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
import { dirname, join as joinPath, resolve as resolvePath } from 'path';
import { tmpdir } from 'os';
import { existsSync, mkdtempSync, rmSync } from 'fs';

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
	/**
	 * Where page objects may write logs. Defaults to a fresh private directory
	 * removed by `detach()`, because `PlaywrightDriver` names traces and screenshots
	 * from per-process counters that both start at 1 - a shared directory would let
	 * concurrent agents overwrite each other's artifacts. Caller-supplied paths are
	 * never removed.
	 */
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
			`Run \`npm --prefix test/automation run compile\`. The root \`npm run compile\` ` +
			`does not build this package.`
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
 * The launcher treats the endpoint as ready as soon as `/json/version` responds,
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
				'smoke-test driver: relaunch with `launch.sh` (or `launch.ps1` on Windows) and ' +
				'pass `-- --enable-smoke-test-driver`.'
			);
		}
		await new Promise(resolve => setTimeout(resolve, 250));
	}
}

/**
 * `Code.editContextEnabled` is unconditionally `true` for a dev build, so every
 * text-input page object waits for `.native-edit-context`. The launcher forces
 * `editor.editContext: true` in the profile, but that only covers *user* scope:
 * `editor.*` settings are `LANGUAGE_OVERRIDABLE` and also valid at workspace and
 * folder scope, and those models are merged after user configuration. A launched
 * workspace whose `.vscode/settings.json` disables the setting therefore renders
 * a `textarea` and the page objects time out 20s later on a selector that never
 * appears.
 *
 * Detect that here, where the cause is still obvious. Only a rendered editor can
 * answer the question, so this runs after `whenWorkbenchRestored()`, once the
 * workspace's editors are actually back - the smoke-test driver is registered
 * well before that, and checking earlier usually finds no editor at all. It is
 * still a no-op for a window that restores none, so it converts a mystery
 * timeout into an actionable message whenever it can without ever blocking an
 * otherwise healthy attach.
 *
 * A few editors opt out of `EditContext` on their own for speed, independent of
 * configuration - the inline-edit previews pass `editContext: false` directly.
 * Those all live inside an inline-edits view, so they are excluded by ancestor
 * rather than by counting: requiring *every* editor to be textarea-backed would
 * miss a scoped override, which is the common case. `editor.editContext` is
 * `LANGUAGE_OVERRIDABLE` and valid per folder, so one file's editor can be
 * textarea-backed while Chat stays native-backed - and it is precisely that
 * file's page object that would hang.
 */
async function assertEditContextMode(page: PlaywrightPage): Promise<void> {
	const mismatched = await page.evaluate(() => {
		const OPT_OUT = '.inline-edits-view, .inline-edits-custom-view';
		return Array.from(document.querySelectorAll('.monaco-editor')).some(editor =>
			editor.querySelector('textarea.inputarea') !== null &&
			editor.querySelector('.native-edit-context') === null &&
			editor.closest(OPT_OUT) === null);
	});
	if (mismatched) {
		throw new Error(
			'This window renders Monaco with a `textarea` rather than `.native-edit-context`, ' +
			'so the automation page objects would time out on every text input. The launcher ' +
			'normalizes `editor.editContext` in the profile, but workspace and folder settings ' +
			'are merged after it: check for `editor.editContext: false` in the opened ' +
			'workspace\'s `.vscode/settings.json`, or in the `settings` section of its ' +
			'`.code-workspace` file (including any `[language]` override), and remove it.'
		);
	}
}

/**
 * Attach the `test/automation` page objects to a running Code OSS instance.
 *
 * @param cdpPort `cdpPort` from the launcher (`launch.sh` / `launch.ps1`) JSON output.
 * @param options See {@link IAttachOptions}.
 */
export async function attach(cdpPort: number | string, options: IAttachOptions = {}): Promise<IAttachedSession> {
	const {
		window: windowKind = 'any',
		verbose = false,
		repoRoot: explicitRepoRoot,
		logsPath: explicitLogsPath,
		timeoutMs = DEFAULT_PAGE_TIMEOUT_MS
	} = options;

	if (cdpPort === undefined || cdpPort === null || `${cdpPort}`.trim() === '') {
		throw new Error('attach(cdpPort) requires the cdpPort printed by the launcher (launch.sh / launch.ps1).');
	}
	// The port is interpolated into the endpoint URL, so anything other than a
	// plain port number could rewrite the URL authority (`80@example.com:9222`)
	// and send this loopback-only helper to another host.
	const port = Number(`${cdpPort}`.trim());
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`attach(): cdpPort must be an integer between 1 and 65535, got ${JSON.stringify(cdpPort)}.`);
	}
	// NaN and Infinity are valid numbers but make every deadline comparison false,
	// so a mistyped or unparsed option would hang instead of timing out.
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		throw new Error(`attach(): timeoutMs must be a positive finite number, got ${timeoutMs}.`);
	}
	if (!Object.hasOwn(PAGE_URL_HINTS, windowKind)) {
		throw new Error(`Unknown window kind "${windowKind}". Expected one of: ${Object.keys(PAGE_URL_HINTS).join(', ')}.`);
	}

	const repoRoot = repoRootFrom(explicitRepoRoot);
	const { PlaywrightDriver, Code, Workbench } = loadAutomation(repoRoot);
	const { chromium } = require(resolvePath(repoRoot, 'node_modules', 'playwright'));

	const endpoint = `http://127.0.0.1:${port}`;
	let ownedLogsPath: string | undefined;
	let browser;
	try {
		browser = await chromium.connectOverCDP(endpoint);
	} catch (error) {
		throw new Error(
			`Could not connect to Code OSS over CDP at ${endpoint}: ${error instanceof Error ? error.message : error}. ` +
			`Confirm the instance is still running and that this is the cdpPort from its launcher output.`
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

		const logsPath = explicitLogsPath ?? (ownedLogsPath = mkdtempSync(joinPath(tmpdir(), 'vscode-attach-logs-')));

		const logger = { log: (...args: unknown[]) => { if (verbose) { console.error('[automation]', ...args); } } };
		const launchOptions = {
			logger,
			logsPath,
			crashesPath: logsPath,
			quality: Quality.Dev,
			version: { major: 1, minor: 999, patch: 0 }
		};

		// `serverProcess` and `safeToKill` are only consulted when the harness owns
		// the process lifetime. Here the launcher owns it, so both are omitted and the
		// caller kills the pid from its JSON output.
		const driver = new PlaywrightDriver(browser, context, page, undefined, Promise.resolve(), launchOptions, undefined);
		const code = new Code(driver, logger, undefined, undefined, Quality.Dev, launchOptions.version);

		// `Code.exit()` shuts down a process this module never spawned, and would
		// otherwise fail obscurely on `this.mainProcess.pid`. Replace it with an
		// explanation of what to do instead.
		code.exit = () => Promise.reject(new Error(
			'Code.exit() is not available on an attached instance, because the launcher owns the process. ' +
			'Call detach() to disconnect, then kill the `pid` from the launcher JSON output.'
		));

		// `window.driver` is registered by `setupDriver()`, which runs before the
		// workbench has restored. Mirror `Application#checkWindowReady` so the first
		// page-object call cannot race startup: commands and providers are still
		// registering at the point the driver appears.
		await code.waitForElement('.monaco-workbench');
		await code.whenWorkbenchRestored();

		// Only now, once restoration has reopened the workspace's editors, is there
		// anything to inspect: the driver is registered before that, so checking any
		// earlier usually finds no editor at all and silently proves nothing.
		await assertEditContextMode(page);

		return {
			browser,
			page,
			code,
			workbench: new Workbench(code),
			detach: async () => {
				try { await browser.close(); }
				finally {
					if (ownedLogsPath) { rmSync(ownedLogsPath, { recursive: true, force: true }); }
				}
			}
		};
	} catch (error) {
		await browser.close().catch(() => { });
		if (ownedLogsPath) { rmSync(ownedLogsPath, { recursive: true, force: true }); }
		throw error;
	}
}
