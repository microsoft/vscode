/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from '@playwright/test';
import { ChildProcess, spawn } from 'child_process';
import { join } from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';
import { Logger, measureAndLog } from './logger';
import type { LaunchOptions } from './code';
import { PlaywrightDriver } from './playwrightDriver';

const root = join(__dirname, '..', '..', '..');

let port = 9000;

export async function launch(options: LaunchOptions): Promise<{ serverProcess: ChildProcess; driver: PlaywrightDriver }> {

	// Launch server
	const { serverProcess, endpoint } = await launchServer(options);

	// Launch browser
	const { browser, context, page, pageLoadedPromise } = await launchBrowser(options, endpoint);

	return {
		serverProcess,
		driver: new PlaywrightDriver(browser, context, page, serverProcess, pageLoadedPromise, options)
	};
}

async function launchServer(options: LaunchOptions) {
	const { userDataDir, codePath, extensionsPath, logger, logsPath } = options;
	const serverLogsPath = join(logsPath, 'server');
	const codeServerPath = codePath ?? process.env.VSCODE_REMOTE_SERVER_PATH;
	const agentFolder = userDataDir;
	await measureAndLog(() => fs.promises.mkdir(agentFolder, { recursive: true }), `mkdirp(${agentFolder})`, logger);

	const env = {
		VSCODE_REMOTE_SERVER_PATH: codeServerPath,
		...process.env
	};

	const args = [
		'--disable-telemetry',
		'--disable-workspace-trust',
		`--port=${port++}`,
		'--enable-smoke-test-driver',
		`--extensions-dir=${extensionsPath}`,
		`--server-data-dir=${agentFolder}`,
		'--accept-server-license-terms',
		`--logsPath=${serverLogsPath}`
	];

	if (options.verbose) {
		args.push('--log=trace');
	}

	let serverLocation: string | undefined;
	if (codeServerPath) {
		const { serverApplicationName } = require(join(codeServerPath, 'product.json'));
		serverLocation = join(codeServerPath, 'bin', `${serverApplicationName}${process.platform === 'win32' ? '.cmd' : ''}`);

		logger.log(`Starting built server from '${serverLocation}'`);
	} else {
		serverLocation = join(root, `scripts/code-server.${process.platform === 'win32' ? 'bat' : 'sh'}`);

		logger.log(`Starting server out of sources from '${serverLocation}'`);
	}

	logger.log(`Storing log files into '${serverLogsPath}'`);

	logger.log(`Command line: '${serverLocation}' ${args.join(' ')}`);
	const shell: boolean = (process.platform === 'win32');
	const serverProcess = spawn(
		serverLocation,
		args,
		{ env, shell }
	);

	logger.log(`Started server for browser smoke tests (pid: ${serverProcess.pid})`);

	return {
		serverProcess,
		endpoint: await measureAndLog(() => waitForEndpoint(serverProcess, logger), 'waitForEndpoint(serverProcess)', logger)
	};
}

async function launchBrowser(options: LaunchOptions, endpoint: string) {
	const { logger, workspacePath, tracing, headless } = options;

	const browser = await measureAndLog(() => playwright[options.browser ?? 'chromium'].launch({
		headless: headless ?? false,
		timeout: 0
	}), 'playwright#launch', logger);

	browser.on('disconnected', () => logger.log(`Playwright: browser disconnected`));

	const context = await measureAndLog(() => browser.newContext(), 'browser.newContext', logger);

	if (tracing) {
		try {
			await measureAndLog(() => context.tracing.start({ screenshots: true, /* remaining options are off for perf reasons */ }), 'context.tracing.start()', logger);
		} catch (error) {
			logger.log(`Playwright (Browser): Failed to start playwright tracing (${error})`); // do not fail the build when this fails
		}
	}

	const page = await measureAndLog(() => context.newPage(), 'context.newPage()', logger);
	await measureAndLog(() => page.setViewportSize({ width: 1200, height: 800 }), 'page.setViewportSize', logger);

	if (options.verbose) {
		context.on('page', () => logger.log(`Playwright (Browser): context.on('page')`));
		context.on('requestfailed', e => logger.log(`Playwright (Browser): context.on('requestfailed') [${e.failure()?.errorText} for ${e.url()}]`));

		page.on('console', e => logger.log(`Playwright (Browser): window.on('console') [${e.text()}]`));
		page.on('dialog', () => logger.log(`Playwright (Browser): page.on('dialog')`));
		page.on('domcontentloaded', () => logger.log(`Playwright (Browser): page.on('domcontentloaded')`));
		page.on('load', () => logger.log(`Playwright (Browser): page.on('load')`));
		page.on('popup', () => logger.log(`Playwright (Browser): page.on('popup')`));
		page.on('framenavigated', () => logger.log(`Playwright (Browser): page.on('framenavigated')`));
		page.on('requestfailed', e => logger.log(`Playwright (Browser): page.on('requestfailed') [${e.failure()?.errorText} for ${e.url()}]`));
	}

	page.on('pageerror', async (error) => logger.log(`Playwright (Browser) ERROR: page error: ${error}`));
	page.on('crash', () => logger.log('Playwright (Browser) ERROR: page crash'));
	page.on('close', () => logger.log('Playwright (Browser): page close'));
	page.on('response', async (response) => {
		if (response.status() >= 400) {
			logger.log(`Playwright (Browser) ERROR: HTTP status ${response.status()} for ${response.url()}`);
		}
	});

	const payloadParam = `[${[
		'["enableProposedApi",""]',
		'["skipWelcome", "true"]',
		'["skipReleaseNotes", "true"]',
		`["logLevel","${options.verbose ? 'trace' : 'info'}"]`
	].join(',')}]`;

	const gotoPromise = measureAndLog(() => page.goto(`${endpoint}&${workspacePath.endsWith('.code-workspace') ? 'workspace' : 'folder'}=${URI.file(workspacePath!).path}&payload=${payloadParam}`), 'page.goto()', logger);
	const pageLoadedPromise = page.waitForLoadState('load');

	await gotoPromise;

	return { browser, context, page, pageLoadedPromise };
}

function waitForEndpoint(server: ChildProcess, logger: Logger): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		let endpointFound = false;

		server.stdout?.on('data', data => {
			if (!endpointFound) {
				logger.log(`[server] stdout: ${data}`); // log until endpoint found to diagnose issues
			}

			const matches = data.toString('ascii').match(/Web UI available at (.+)/);
			if (matches !== null) {
				endpointFound = true;

				resolve(matches[1]);
			}
		});

		server.stderr?.on('data', error => {
			if (!endpointFound) {
				logger.log(`[server] stderr: ${error}`); // log until endpoint found to diagnose issues
			}

			if (error.toString().indexOf('EADDRINUSE') !== -1) {
				reject(new Error(error));
			}
		});
	});
}
