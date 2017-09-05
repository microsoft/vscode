/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';

const DIFF_EDITOR_LINE_INSERT = '.monaco-diff-editor .editor.modified .line-insert';
const SYNC_STATUSBAR = 'div[id="workbench.parts.statusbar"] .statusbar-entry a[title$="Synchronize Changes"]';

describe('Git', () => {
	let app: SpectronApplication;
	before(() => {
		app = new SpectronApplication(LATEST_PATH, '', 0, [WORKSPACE_PATH]);
		return app.start();
	});
	after(() => app.stop());

	it('reflects working tree changes', async function () {
		await app.workbench.scm.openSCMViewlet();

		await app.workbench.openFile('app.js');
		await app.type('.foo{}');
		await app.workbench.saveOpenedFile();

		await app.workbench.openFile('index.jade');
		await app.type('hello world');
		await app.workbench.saveOpenedFile();

		await app.workbench.scm.refreshSCMViewlet();
		const appJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js');
		const indexJade = await app.workbench.scm.waitForChange(c => c.name === 'index.jade');

		assert.equal(appJs.name, 'app.js');
		assert.equal(appJs.type, 'Modified');

		assert.equal(indexJade.name, 'index.jade');
		assert.equal(indexJade.type, 'Modified');
	});

	it('opens diff editor', async function () {
		await app.workbench.scm.openSCMViewlet();
		const appJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js');
		await app.workbench.scm.openChange(appJs);
		await app.client.waitForElement(DIFF_EDITOR_LINE_INSERT);
	});

	it('stages correctly', async function () {
		await app.workbench.scm.openSCMViewlet();

		const appJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Modified');
		await app.workbench.scm.stage(appJs);

		const indexAppJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Index Modified');
		await app.workbench.scm.unstage(indexAppJs);

		await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Modified');
	});

	it(`stages, commits change to 'app.js' locally and verifies outgoing change`, async function () {
		await app.workbench.scm.openSCMViewlet();

		const appJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Modified');
		await app.workbench.scm.stage(appJs);
		await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Index Modified');

		await app.workbench.scm.commit('hello world');
		await app.client.waitForText(SYNC_STATUSBAR, ' 0↓ 1↑');
	});
});