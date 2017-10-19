/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as stripJsonComments from 'strip-json-comments';
import { SpectronApplication, VSCODE_BUILD, EXTENSIONS_DIR, findFreePort, WORKSPACE_PATH } from '../../spectron/application';

describe('Debug', () => {
	let app: SpectronApplication = new SpectronApplication();
	let port: number;

	if (app.build === VSCODE_BUILD.DEV) {
		const extensionsPath = path.join(os.homedir(), '.vscode-oss-dev', 'extensions');

		const debugPath = path.join(extensionsPath, 'vscode-node-debug');
		const debugExists = fs.existsSync(debugPath);

		const debug2Path = path.join(extensionsPath, 'vscode-node-debug2');
		const debug2Exists = fs.existsSync(debug2Path);

		if (!debugExists) {
			console.warn(`Skipping debug tests because vscode-node-debug extension was not found in ${extensionsPath}`);
			return;
		}

		if (!debug2Exists) {
			console.warn(`Skipping debug tests because vscode-node-debug2 extension was not found in ${extensionsPath}`);
			return;
		}

		fs.symlinkSync(debugPath, path.join(EXTENSIONS_DIR, 'vscode-node-debug'));
		fs.symlinkSync(debug2Path, path.join(EXTENSIONS_DIR, 'vscode-node-debug2'));
	}

	// We must get a different port for our smoketest express app
	// otherwise concurrent test runs will clash on those ports
	before(async () => await app.start('Debug', [], { PORT: String(await findFreePort()), ...process.env }));
	after(() => app.stop());

	it('configure launch json', async function () {
		await app.workbench.debug.openDebugViewlet();
		await app.workbench.quickopen.openFile('app.js');
		await app.workbench.debug.configure();

		const launchJsonPath = path.join(WORKSPACE_PATH, '.vscode', 'launch.json');
		const content = fs.readFileSync(launchJsonPath, 'utf8');
		const config = JSON.parse(stripJsonComments(content));
		config.configurations[0].protocol = 'inspector';
		fs.writeFileSync(launchJsonPath, JSON.stringify(config, undefined, 4), 'utf8');

		await app.workbench.editor.waitForEditorContents('launch.json', contents => /"protocol": "inspector"/.test(contents));
		await app.screenCapturer.capture('launch.json file');

		assert.equal(config.configurations[0].request, 'launch');
		assert.equal(config.configurations[0].type, 'node');
		if (process.platform === 'win32') {
			assert.equal(config.configurations[0].program, '${workspaceFolder}\\bin\\www');
		} else {
			assert.equal(config.configurations[0].program, '${workspaceFolder}/bin/www');
		}
	});

	it('breakpoints', async function () {
		await app.workbench.quickopen.openFile('index.js');
		await app.workbench.debug.setBreakpointOnLine(6);
		await app.screenCapturer.capture('breakpoints are set');
	});

	it('start debugging', async function () {
		port = await app.workbench.debug.startDebugging();
		await app.screenCapturer.capture('debugging has started');

		await new Promise((c, e) => {
			const request = http.get(`http://localhost:${port}`);
			request.on('error', e);
			app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 6, 'looking for index.js and line 6').then(c, e);
		});

		await app.screenCapturer.capture('debugging is paused');
	});

	it('focus stack frames and variables', async function () {
		await app.client.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 4, 'there should be 4 local variables');

		await app.workbench.debug.focusStackFrame('layer.js', 'looking for layer.js');
		await app.client.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 5, 'there should be 5 local variables');

		await app.workbench.debug.focusStackFrame('route.js', 'looking for route.js');
		await app.client.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 3, 'there should be 3 local variables');

		await app.workbench.debug.focusStackFrame('index.js', 'looking for index.js');
		await app.client.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 4, 'there should be 4 local variables');
	});

	it('stepOver, stepIn, stepOut', async function () {
		await app.workbench.debug.stepIn();
		await app.screenCapturer.capture('debugging has stepped in');

		const first = await app.workbench.debug.waitForStackFrame(sf => sf.name === 'response.js', 'looking for response.js');
		await app.workbench.debug.stepOver();
		await app.screenCapturer.capture('debugging has stepped over');

		await app.workbench.debug.waitForStackFrame(sf => sf.name === 'response.js' && sf.lineNumber === first.lineNumber + 1, `looking for response.js and line ${first.lineNumber + 1}`);
		await app.workbench.debug.stepOut();
		await app.screenCapturer.capture('debugging has stepped out');

		await app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 7, `looking for index.js and line 7`);
	});

	it('continue', async function () {
		await app.workbench.debug.continue();
		await app.screenCapturer.capture('debugging has continued');

		await new Promise((c, e) => {
			const request = http.get(`http://localhost:${port}`);
			request.on('error', e);
			app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 6, `looking for index.js and line 6`).then(c, e);
		});

		await app.screenCapturer.capture('debugging is paused');
	});

	it('debug console', async function () {
		await app.workbench.debug.waitForReplCommand('2 + 2', r => r === '4');
	});

	it('stop debugging', async function () {
		await app.workbench.debug.stopDebugging();
		await app.screenCapturer.capture('debugging has stopped');
	});
});
