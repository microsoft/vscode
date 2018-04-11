/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as stripJsonComments from 'strip-json-comments';
import { SpectronApplication } from '../../application';

export function setup() {
	describe('Debug', () => {
		before(async function () {
			const app = this.app as SpectronApplication;
			app.suiteName = 'Debug';
		});

		it('configure launch json', async function () {
			const app = this.app as SpectronApplication;

			await app.workbench.debug.openDebugViewlet();
			await app.workbench.quickopen.openFile('app.js');
			await app.workbench.debug.configure();

			const launchJsonPath = path.join(app.workspacePath, '.vscode', 'launch.json');
			const content = fs.readFileSync(launchJsonPath, 'utf8');
			const config = JSON.parse(stripJsonComments(content));
			config.configurations[0].protocol = 'inspector';
			fs.writeFileSync(launchJsonPath, JSON.stringify(config, undefined, 4), 'utf8');

			await app.workbench.editor.waitForEditorContents('launch.json', contents => /"protocol": "inspector"/.test(contents));

			assert.equal(config.configurations[0].request, 'launch');
			assert.equal(config.configurations[0].type, 'node');
			if (process.platform === 'win32') {
				assert.equal(config.configurations[0].program, '${workspaceFolder}\\bin\\www');
			} else {
				assert.equal(config.configurations[0].program, '${workspaceFolder}/bin/www');
			}
		});

		it('breakpoints', async function () {
			const app = this.app as SpectronApplication;

			await app.workbench.quickopen.openFile('index.js');
			await app.workbench.debug.setBreakpointOnLine(6);
		});

		let port: number;
		it('start debugging', async function () {
			const app = this.app as SpectronApplication;

			// TODO@isidor
			await new Promise(c => setTimeout(c, 100));

			port = await app.workbench.debug.startDebugging();

			await new Promise((c, e) => {
				const request = http.get(`http://localhost:${port}`);
				request.on('error', e);
				app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 6, 'looking for index.js and line 6').then(c, e);
			});
		});

		it('focus stack frames and variables', async function () {
			const app = this.app as SpectronApplication;

			await app.api.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 4, 'there should be 4 local variables');

			await app.workbench.debug.focusStackFrame('layer.js', 'looking for layer.js');
			await app.api.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 5, 'there should be 5 local variables');

			await app.workbench.debug.focusStackFrame('route.js', 'looking for route.js');
			await app.api.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 3, 'there should be 3 local variables');

			await app.workbench.debug.focusStackFrame('index.js', 'looking for index.js');
			await app.api.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 4, 'there should be 4 local variables');
		});

		it('stepOver, stepIn, stepOut', async function () {
			const app = this.app as SpectronApplication;

			await app.workbench.debug.stepIn();

			const first = await app.workbench.debug.waitForStackFrame(sf => sf.name === 'response.js', 'looking for response.js');
			await app.workbench.debug.stepOver();

			await app.workbench.debug.waitForStackFrame(sf => sf.name === 'response.js' && sf.lineNumber === first.lineNumber + 1, `looking for response.js and line ${first.lineNumber + 1}`);
			await app.workbench.debug.stepOut();

			await app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 7, `looking for index.js and line 7`);
		});

		it('continue', async function () {
			const app = this.app as SpectronApplication;

			await app.workbench.debug.continue();

			await new Promise((c, e) => {
				const request = http.get(`http://localhost:${port}`);
				request.on('error', e);
				app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 6, `looking for index.js and line 6`).then(c, e);
			});

		});

		it('debug console', async function () {
			const app = this.app as SpectronApplication;

			await app.workbench.debug.waitForReplCommand('2 + 2', r => r === '4');
		});

		it('stop debugging', async function () {
			const app = this.app as SpectronApplication;

			await app.workbench.debug.stopDebugging();
		});
	});
}