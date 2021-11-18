/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as cp from 'child_process';
import * as playwright from 'playwright';
import * as url from 'url';
import * as tmp from 'tmp';
import * as rimraf from 'rimraf';
import { URI } from 'vscode-uri';
import * as kill from 'tree-kill';
import * as optimistLib from 'optimist';
import { StdioOptions } from 'node:child_process';

const optimist = optimistLib
	.describe('workspacePath', 'path to the workspace (folder or *.code-workspace file) to open in the test').string('workspacePath')
	.describe('extensionDevelopmentPath', 'path to the extension to test').string('extensionDevelopmentPath')
	.describe('extensionTestsPath', 'path to the extension tests').string('extensionTestsPath')
	.describe('debug', 'do not run browsers headless').boolean('debug')
	.describe('browser', 'browser in which integration tests should run').string('browser').default('browser', 'chromium')
	.describe('help', 'show the help').alias('help', 'h');

if (optimist.argv.help) {
	optimist.showHelp();
	process.exit(0);
}

const width = 1200;
const height = 800;

type BrowserType = 'chromium' | 'firefox' | 'webkit';

async function runTestsInBrowser(browserType: BrowserType, endpoint: url.UrlWithStringQuery, server: cp.ChildProcess): Promise<void> {
	const browser = await playwright[browserType].launch({ headless: !Boolean(optimist.argv.debug) });
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.setViewportSize({ width, height });

	page.on('pageerror', async error => console.error(`Playwright ERROR: page error: ${error}`));
	page.on('crash', page => console.error('Playwright ERROR: page crash'));
	page.on('response', async response => {
		if (response.status() >= 400) {
			console.error(`Playwright ERROR: HTTP status ${response.status()} for ${response.url()}`);
		}
	});
	page.on('console', async msg => {
		try {
			if (msg.type() === 'error' || msg.type() === 'warning') {
				consoleLogFn(msg)(msg.text(), await Promise.all(msg.args().map(async arg => await arg.jsonValue())));
			}
		} catch (err) {
			console.error('Error logging console', err);
		}
	});
	page.on('requestfailed', e => {
		console.error('Request Failed', e.url(), e.failure()?.errorText);
	});

	const host = endpoint.host;
	const protocol = 'vscode-remote';

	const testWorkspaceUri = url.format({ pathname: URI.file(path.resolve(optimist.argv.workspacePath)).path, protocol, host, slashes: true });
	const testExtensionUri = url.format({ pathname: URI.file(path.resolve(optimist.argv.extensionDevelopmentPath)).path, protocol, host, slashes: true });
	const testFilesUri = url.format({ pathname: URI.file(path.resolve(optimist.argv.extensionTestsPath)).path, protocol, host, slashes: true });

	const payloadParam = `[["extensionDevelopmentPath","${testExtensionUri}"],["extensionTestsPath","${testFilesUri}"],["enableProposedApi",""],["webviewExternalEndpointCommit","dc1a6699060423b8c4d2ced736ad70195378fddf"],["skipWelcome","true"]]`;

	if (path.extname(testWorkspaceUri) === '.code-workspace') {
		await page.goto(`${endpoint.href}&workspace=${testWorkspaceUri}&payload=${payloadParam}`);
	} else {
		await page.goto(`${endpoint.href}&folder=${testWorkspaceUri}&payload=${payloadParam}`);
	}

	await page.exposeFunction('codeAutomationLog', (type: string, args: any[]) => {
		console[type](...args);
	});

	await page.exposeFunction('codeAutomationExit', async (code: number) => {
		try {
			await browser.close();
		} catch (error) {
			console.error(`Error when closing browser: ${error}`);
		}

		try {
			await pkill(server.pid);
		} catch (error) {
			console.error(`Error when killing server process tree: ${error}`);
		}

		process.exit(code);
	});
}

function consoleLogFn(msg) {
	const type = msg.type();
	const candidate = console[type];
	if (candidate) {
		return candidate;
	}

	if (type === 'warning') {
		return console.warn;
	}

	return console.log;
}

function pkill(pid: number): Promise<void> {
	return new Promise((c, e) => {
		kill(pid, error => error ? e(error) : c());
	});
}

async function launchServer(browserType: BrowserType): Promise<{ endpoint: url.UrlWithStringQuery, server: cp.ChildProcess }> {

	// Ensure a tmp user-data-dir is used for the tests
	const tmpDir = tmp.dirSync({ prefix: 't' });
	const testDataPath = tmpDir.name;
	process.once('exit', () => rimraf.sync(testDataPath));

	const userDataDir = path.join(testDataPath, 'd');

	const env = {
		VSCODE_AGENT_FOLDER: userDataDir,
		VSCODE_BROWSER: browserType,
		...process.env
	};

	const root = path.join(__dirname, '..', '..', '..', '..');
	const logsPath = path.join(root, '.build', 'logs', 'integration-tests-browser');

	const serverArgs = ['--browser', 'none', '--driver', 'web', '--enable-proposed-api', '--disable-telemetry'];

	let serverLocation: string;
	if (process.env.VSCODE_REMOTE_SERVER_PATH) {
		serverLocation = path.join(process.env.VSCODE_REMOTE_SERVER_PATH, `server.${process.platform === 'win32' ? 'cmd' : 'sh'}`);
		serverArgs.push(`--logsPath=${logsPath}`);

		if (optimist.argv.debug) {
			console.log(`Starting built server from '${serverLocation}'`);
			console.log(`Storing log files into '${logsPath}'`);
		}
	} else {
		serverLocation = path.join(root, `resources/server/web.${process.platform === 'win32' ? 'bat' : 'sh'}`);
		serverArgs.push('--logsPath', logsPath);
		process.env.VSCODE_DEV = '1';

		if (optimist.argv.debug) {
			console.log(`Starting server out of sources from '${serverLocation}'`);
			console.log(`Storing log files into '${logsPath}'`);
		}
	}

	const stdio: StdioOptions = optimist.argv.debug ? 'pipe' : ['ignore', 'pipe', 'ignore'];

	let serverProcess = cp.spawn(
		serverLocation,
		serverArgs,
		{ env, stdio }
	);

	if (optimist.argv.debug) {
		serverProcess.stderr!.on('data', error => console.log(`Server stderr: ${error}`));
		serverProcess.stdout!.on('data', data => console.log(`Server stdout: ${data}`));
	}

	process.on('exit', () => serverProcess.kill());
	process.on('SIGINT', () => serverProcess.kill());
	process.on('SIGTERM', () => serverProcess.kill());

	return new Promise(c => {
		serverProcess.stdout!.on('data', data => {
			const matches = data.toString('ascii').match(/Web UI available at (.+)/);
			if (matches !== null) {
				c({ endpoint: url.parse(matches[1]), server: serverProcess });
			}
		});
	});
}

launchServer(optimist.argv.browser).then(async ({ endpoint, server }) => {
	return runTestsInBrowser(optimist.argv.browser, endpoint, server);
}, error => {
	console.error(error);
	process.exit(1);
});
