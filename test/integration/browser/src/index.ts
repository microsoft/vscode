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
	.describe('debug', 'do not run browsers headless').boolean('debug')
	.describe('browser', 'browser in which integration tests should run').string('browser').default('browser', 'chromium')
	.describe('help', 'show the help').alias('help', 'h');

let serverProcess: cp.ChildProcess | undefined = undefined;

function teardownServer() {
	if (serverProcess) {
		serverProcess.kill();
		serverProcess = undefined;
	}
}

async function runTestsInBrowser(browserType: string, endpoint: string): Promise<void> {
	const browser = await playwright[browserType].launch({ headless: !Boolean(optimist.argv.debug) });
	const page = (await browser.defaultContext().pages())[0];

	const host = url.parse(endpoint).host;
	const protocol = 'vscode-remote';

	const integrationTestsPath = path.join(__dirname, '..', '..', '..', '..', 'extensions', 'vscode-api-tests');
	const testWorkspaceUri = url.format({ pathname: path.join(integrationTestsPath, 'testWorkspace'), protocol, host, slashes: true });
	const testExtensionUri = url.format({ pathname: path.join(integrationTestsPath), protocol, host, slashes: true });
	const testFilesUri = url.format({ pathname: path.join(integrationTestsPath, 'out', 'singlefolder-tests'), protocol, host, slashes: true });

	const folderParam = testWorkspaceUri;
	const payloadParam = `[["extensionDevelopmentPath","${testExtensionUri}"],["extensionTestsPath","${testFilesUri}"]]`;

	await page.goto(`${endpoint}&folder=${folderParam}&payload=${payloadParam}`);

	// const emitter = new events.EventEmitter();
	// await page.exposeFunction('mocha_report', (type, data1, data2) => {
	// 	emitter.emit(type, data1, data2)
	// });

	page.on('console', async (msg: playwright.ConsoleMessage) => {
		const msgText = msg.text();
		console[msg.type()](msgText, await Promise.all(msg.args().map(async arg => await arg.jsonValue())));

		if (msgText.indexOf('vscode:exit') >= 0) {
			browser.close();
			teardownServer();
			setTimeout(() => process.exit(msgText === 'vscode:exit 0' ? 0 : 1), 10);
		}
	});
}

async function launchServer(): Promise<string> {
	const tmpDir = tmp.dirSync({ prefix: 't' });
	const testDataPath = tmpDir.name;
	process.once('exit', () => rimraf.sync(testDataPath));

	const userDataDir = path.join(testDataPath, 'd');

	const env = {
		VSCODE_AGENT_FOLDER: userDataDir,
		...process.env
	};

	let serverLocation;
	if (process.env.VSCODE_REMOTE_SERVER_PATH) {
		serverLocation = path.join(process.env.VSCODE_REMOTE_SERVER_PATH, `server.${process.platform === 'win32' ? 'cmd' : 'sh'}`);
	} else {
		serverLocation = path.join(__dirname, '..', '..', '..', '..', `resources/server/web.${process.platform === 'win32' ? 'bat' : 'sh'}`);

		process.env.VSCODE_DEV = '1';
	}

	serverProcess = cp.spawn(
		serverLocation,
		['--browser', 'none', '--driver', 'web'],
		{ env }
	);

	serverProcess?.stderr?.on('data', e => console.log(`Server stderr: ${e}`));
	serverProcess?.stdout?.on('data', e => console.log(`Server stdout: ${e}`));

	process.on('exit', teardownServer);
	process.on('SIGINT', teardownServer);
	process.on('SIGTERM', teardownServer);

	return new Promise(r => {
		serverProcess?.stdout?.on('data', d => {
			const matches = d.toString('ascii').match(/Web UI available at (.+)/);
			if (matches !== null) {
				r(matches[1]);
			}
		});
	});
}

launchServer().then(async endpoint => {
	return runTestsInBrowser(optimist.argv.browser, endpoint);
}, console.error);
