/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import { SpectronApplication } from '../../spectron/application';

const DIFF_EDITOR_LINE_INSERT = '.monaco-diff-editor .editor.modified .line-insert';
const SYNC_STATUSBAR = 'div[id="workbench.parts.statusbar"] .statusbar-entry a[title$="Synchronize Changes"]';

describe('Git', () => {
	before(function () {
		this.app.suiteName = 'Git';
	});

	it('reflects working tree changes', async function () {
		const app = this.app as SpectronApplication;

		await app.workbench.scm.openSCMViewlet();

		await app.workbench.quickopen.openFile('app.js');
		await app.workbench.editor.waitForTypeInEditor('app.js', '.foo{}');
		await app.workbench.saveOpenedFile();

		await app.workbench.quickopen.openFile('index.jade');
		await app.workbench.editor.waitForTypeInEditor('index.jade', 'hello world');
		await app.workbench.saveOpenedFile();

		await app.workbench.scm.refreshSCMViewlet();
		const appJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js');
		const indexJade = await app.workbench.scm.waitForChange(c => c.name === 'index.jade');
		await app.screenCapturer.capture('changes');

		assert.equal(appJs.name, 'app.js');
		assert.equal(appJs.type, 'Modified');

		assert.equal(indexJade.name, 'index.jade');
		assert.equal(indexJade.type, 'Modified');
	});

	it('opens diff editor', async function () {
		const app = this.app as SpectronApplication;

		await app.workbench.scm.openSCMViewlet();
		const appJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js');
		await app.workbench.scm.openChange(appJs);
		await app.client.waitForElement(DIFF_EDITOR_LINE_INSERT);
	});

	it('stages correctly', async function () {
		const app = this.app as SpectronApplication;

		// TODO@joao get these working once joh fixes scm viewlet
		if (!false) {
			this.skip();
			return;
		}

		await app.workbench.scm.openSCMViewlet();

		const appJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Modified');
		await app.workbench.scm.stage(appJs);

		const indexAppJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Index Modified');
		await app.workbench.scm.unstage(indexAppJs);

		await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Modified');
	});

	it(`stages, commits changes and verifies outgoing change`, async function () {
		const app = this.app as SpectronApplication;

		// TODO@joao get these working once joh fixes scm viewlet
		if (!false) {
			cp.execSync('git reset --hard origin/master', { cwd: app.workspacePath });
			this.skip();
			return;
		}

		await app.workbench.scm.openSCMViewlet();

		const appJs = await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Modified');
		await app.workbench.scm.stage(appJs);
		await app.workbench.scm.waitForChange(c => c.name === 'app.js' && c.type === 'Index Modified');

		await app.workbench.scm.commit('first commit');
		await app.client.waitForText(SYNC_STATUSBAR, ' 0↓ 1↑');

		await app.workbench.quickopen.runCommand('Git: Stage All Changes');
		await app.workbench.scm.waitForChange(c => c.name === 'index.jade' && c.type === 'Index Modified');

		await app.workbench.scm.commit('second commit');
		await app.client.waitForText(SYNC_STATUSBAR, ' 0↓ 2↑');

		cp.execSync('git reset --hard origin/master', { cwd: app.workspacePath });
	});
});