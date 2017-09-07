/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import * as stripJsonComments from 'strip-json-comments';
import { SpectronApplication, VSCODE_BUILD } from '../../spectron/application';

describe('Debug', () => {
	let app: SpectronApplication = new SpectronApplication();
	before(() => app.start());
	after(() => app.stop());

	if (app.build !== VSCODE_BUILD.DEV) {
		it('configure launch json', async function () {

			await app.workbench.debug.openDebugViewlet();
			await app.workbench.openFile('app.js');
			await app.workbench.debug.configure();
			const content = await app.workbench.editor.getEditorVisibleText();
			const json = JSON.parse(stripJsonComments(content));

			assert.equal(json.configurations[0].request, 'launch');
			assert.equal(json.configurations[0].type, 'node');
			if (process.platform === 'win32') {
				assert.equal(json.configurations[0].program, '${workspaceRoot}\\bin\\www');
			} else {
				assert.equal(json.configurations[0].program, '${workspaceRoot}/bin/www');
			}
		});
	}

	it('breakpoints', async function () {
		await app.workbench.openFile('index.js');
		await app.workbench.debug.setBreakpointOnLine(6);
	});

	it('start debugging', async function () {
		await app.workbench.debug.startDebugging();
		setTimeout(() => http.get('http://localhost:3000').on('error', e => void 0), 200);
		await app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 6);
	});

	it('focus stack frames and variables', async function () {
		assert.equal(await app.workbench.debug.getLocalVariableCount(), 4);
		await app.workbench.debug.focusStackFrame('layer.js');
		assert.equal(await app.workbench.debug.getLocalVariableCount(), 5);
		await app.workbench.debug.focusStackFrame('route.js');
		assert.equal(await app.workbench.debug.getLocalVariableCount(), 3);
		await app.workbench.debug.focusStackFrame('index.js');
		assert.equal(await app.workbench.debug.getLocalVariableCount(), 4);
	});

	it('stepOver, stepIn, stepOut', async function () {
		await app.workbench.debug.stepIn();
		const first = await app.workbench.debug.waitForStackFrame(sf => sf.name === 'response.js');
		await app.workbench.debug.stepOver();
		await app.workbench.debug.waitForStackFrame(sf => sf.name === 'response.js' && sf.lineNumber === first.lineNumber + 1);
		await app.workbench.debug.stepOut();
		await app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 7);
	});

	it('continue', async function () {
		await app.workbench.debug.continue();
		setTimeout(() => http.get('http://localhost:3000').on('error', e => void 0), 200);
		await app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 6);
	});

	it('debug console', async function () {
		const result = await app.workbench.debug.console('2 + 2 \n', 'number');
		assert.equal(result, '4');
	});

	it('stop debugging', async function () {
		await app.workbench.debug.stopDebugging();
	});
});
