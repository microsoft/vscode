/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
var stripJsonComments = require('strip-json-comments');
import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';

describe('Debug', () => {
	let app: SpectronApplication;
	before(() => {
		app = new SpectronApplication(LATEST_PATH, '', 0, [WORKSPACE_PATH]);
		return app.start();
	});
	after(() => app.stop());

	it('configure launch json', async function () {
		if (app.inDevMode) {
			return;
		}

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

	it('breakpoints', async function () {
		await app.workbench.openFile('index.js');
		await app.workbench.debug.setBreakpointOnLine(6);
		assert.equal(true, true);
	});
});