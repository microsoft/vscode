/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const path = require('path');
const cp = require('child_process');
const playwright = require('playwright');
const url = require('url');

// opts
const optimist = require('optimist')
	.describe('debug', 'do not run browsers headless').boolean('debug')
	.describe('browser', 'browser in which integration tests should run').string('browser').default('browser', 'chromium')
	.describe('help', 'show the help').alias('help', 'h');

// logic
const argv = optimist.argv;

let serverProcess;

function teardownServer() {
	if (serverProcess) {
		serverProcess.kill();
		serverProcess = undefined;
	}
}

/**
 * @param {string} browserType
 * @param {string} endpoint
 */
async function runTestsInBrowser(browserType, endpoint) {
	const browser = await playwright[browserType].launch({ headless: !Boolean(argv.debug) });
	const page = (await browser.defaultContext().pages())[0];

	const integrationTestsPath = path.join(__dirname, '..', '..', '..', 'extensions', 'vscode-api-tests');
	const testWorkspaceUri = url.format({ pathname: path.join(integrationTestsPath, 'testWorkspace'), protocol: 'vscode-remote:', slashes: true, host: 'localhost:9888' });
	const testExtensionUri = url.format({ pathname: path.join(integrationTestsPath), protocol: 'vscode-remote:', slashes: true, host: 'localhost:9888' });
	const testFilesUri = url.format({ pathname: path.join(integrationTestsPath, 'out', 'singlefolder-tests'), protocol: 'vscode-remote:', slashes: true, host: 'localhost:9888' });

	const folderParam = testWorkspaceUri;
	const payloadParam = `[["extensionDevelopmentPath","${testExtensionUri}"],["extensionTestsPath","${testFilesUri}"]]`;

	await page.goto(`${endpoint}&folder=${folderParam}&payload=${payloadParam}`);

	// const emitter = new events.EventEmitter();
	// await page.exposeFunction('mocha_report', (type, data1, data2) => {
	// 	emitter.emit(type, data1, data2)
	// });

	page.on('console', async msg => {
		const msgText = msg.text();
		console[msg.type()](msgText, await Promise.all(msg.args().map(async arg => await arg.jsonValue())));

		if (msgText.indexOf('vscode:exit') >= 0) {
			browser.close();
			teardownServer();
			setTimeout(() => process.exit(msgText === 'vscode:exit 0' ? 0 : 1), 10);
		}
	});
}

async function launch() {
	// workspacePath = _workspacePath;
	// const agentFolder = userDataDir;
	// await promisify(mkdir)(agentFolder);
	const env = {
		// VSCODE_AGENT_FOLDER: agentFolder,
		...process.env
	};

	let serverLocation;
	if (process.env.VSCODE_REMOTE_SERVER_PATH) {
		serverLocation = path.join(process.env.VSCODE_REMOTE_SERVER_PATH, `server.${process.platform === 'win32' ? 'cmd' : 'sh'}`);
	} else {
		serverLocation = path.join(__dirname, '..', '..', '..', `resources/server/web.${process.platform === 'win32' ? 'bat' : 'sh'}`);
	}

	serverProcess = cp.spawn(
		serverLocation,
		['--browser', 'none', '--driver', 'web'],
		{ env }
	);

	serverProcess.stderr.on('data', e => console.log('Server stderr: ' + e));
	serverProcess.stdout.on('data', e => console.log('Server stdout: ' + e));

	process.on('exit', teardownServer);
	process.on('SIGINT', teardownServer);
	process.on('SIGTERM', teardownServer);

	return new Promise(r => {
		serverProcess.stdout.on('data', d => {
			const matches = d.toString('ascii').match(/Web UI available at (.+)/);
			if (matches !== null) {
				r(matches[1]);
			}
		});
	});
}

launch().then(async endpoint => {
	return runTestsInBrowser(argv.browser, endpoint);
}, console.error);
