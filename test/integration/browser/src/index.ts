/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as  path from 'path';
import * as  cp from 'child_process';
import * as  playwright from 'playwright';
import * as  url from 'url';
import * as  tmp from 'tmp';
import * as  rimraf from 'rimraf';

const optimist = require('optimist')
	.describe('workspacePath', 'path to the workspace to open in the test').string()
	.describe('extensionDevelopmentPath', 'path to the extension to test').string()
	.describe('extensionTestsPath', 'path to the extension tests').string()
	.describe('debug', 'do not run browsers headless').boolean('debug')
	.describe('browser', 'browser in which integration tests should run').string('browser').default('browser', 'chromium')
	.describe('help', 'show the help').alias('help', 'h');

if (optimist.argv.help) {
	optimist.showHelp();
	process.exit(0);
}

const width = 1200;
const height = 800;

async function runTestsInBrowser(browserType: string, endpoint: string): Promise<void> {
	const browser = await playwright[browserType].launch({ headless: !Boolean(optimist.argv.debug) });
	const page = (await browser.defaultContext().pages())[0];
	await page.setViewport({ width, height });

	const host = url.parse(endpoint).host;
	const protocol = 'vscode-remote';

	const testWorkspaceUri = url.format({ pathname: path.resolve(optimist.argv.workspacePath), protocol, host, slashes: true });
	const testExtensionUri = url.format({ pathname: path.resolve(optimist.argv.extensionDevelopmentPath), protocol, host, slashes: true });
	const testFilesUri = url.format({ pathname: path.resolve(optimist.argv.extensionTestsPath), protocol, host, slashes: true });

	const folderParam = testWorkspaceUri;
	const payloadParam = `[["extensionDevelopmentPath","${testExtensionUri}"],["extensionTestsPath","${testFilesUri}"]]`;

	await page.goto(`${endpoint}&folder=${folderParam}&payload=${payloadParam}`);

	await page.exposeFunction('codeAutomationLog', (type: string, args: any[]) => {
		console[type](...args);
	});

	page.on('console', async (msg: playwright.ConsoleMessage) => {
		const msgText = msg.text();
		if (msgText.indexOf('vscode:exit') >= 0) {
			await browser.close();
			process.exit(msgText === 'vscode:exit 0' ? 0 : 1);
		}
	});
}

async function launchServer(): Promise<string> {

	// Ensure a tmp user-data-dir is used for the tests
	const tmpDir = tmp.dirSync({ prefix: 't' });
	const testDataPath = tmpDir.name;
	process.once('exit', () => rimraf.sync(testDataPath));

	const userDataDir = path.join(testDataPath, 'd');

	const env = {
		VSCODE_AGENT_FOLDER: userDataDir,
		...process.env
	};

	let serverLocation: string;
	if (process.env.VSCODE_REMOTE_SERVER_PATH) {
		serverLocation = path.join(process.env.VSCODE_REMOTE_SERVER_PATH, `server.${process.platform === 'win32' ? 'cmd' : 'sh'}`);
	} else {
		serverLocation = path.join(__dirname, '..', '..', '..', '..', `resources/server/web.${process.platform === 'win32' ? 'bat' : 'sh'}`);

		process.env.VSCODE_DEV = '1';
	}

	let serverProcess = cp.spawn(
		serverLocation,
		['--browser', 'none', '--driver', 'web'],
		{ env }
	);

	serverProcess?.stderr?.on('data', error => console.log(`Server stderr: ${error}`));

	if (optimist.argv.debug) {
		serverProcess?.stdout?.on('data', data => console.log(`Server stdout: ${data}`));
	}

	function teardownServer() {
		if (serverProcess) {
			serverProcess.kill();
		}
	}

	process.on('exit', teardownServer);
	process.on('SIGINT', teardownServer);
	process.on('SIGTERM', teardownServer);

	return new Promise(c => {
		serverProcess?.stdout?.on('data', data => {
			const matches = data.toString('ascii').match(/Web UI available at (.+)/);
			if (matches !== null) {
				c(matches[1]);
			}
		});
	});
}

launchServer().then(async endpoint => {
	return runTestsInBrowser(optimist.argv.browser, endpoint);
}, console.error);
