/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Application } from '../../application';

const DIFF_EDITOR_LINE_INSERT = '.monaco-diff-editor .editor.modified .line-insert';
const SYNC_STATUSBAR = 'div[id="workbench.parts.statusbar"] .statusbar-entry a[title$="Synchronize Changes"]';

export function setup() {
	describe('Git', () => {
		it('reflects working tree changes', async function () {
			const app = this.app as Application;

			await app.workbench.scm.openSCMViewlet();

			await app.workbench.quickopen.openFile('app.js');
			await app.workbench.editor.waitForTypeInEditor('app.js', '.foo{}');
			await app.workbench.editors.saveOpenedFile();

			await app.workbench.quickopen.openFile('index.jade');
			await app.workbench.editor.waitForTypeInEditor('index.jade', 'hello world');
			await app.workbench.editors.saveOpenedFile();

			await app.workbench.scm.refreshSCMViewlet();
			await app.workbench.scm.waitForChange('app.js', 'Modified');
			await app.workbench.scm.waitForChange('index.jade', 'Modified');
		});

		it('opens diff editor', async function () {
			const app = this.app as Application;

			await app.workbench.scm.openSCMViewlet();
			await app.workbench.scm.openChange('app.js');
			await app.code.waitForElement(DIFF_EDITOR_LINE_INSERT);
		});

		it('stages correctly', async function () {
			const app = this.app as Application;

			await app.workbench.scm.openSCMViewlet();

			await app.workbench.scm.waitForChange('app.js', 'Modified');
			await app.workbench.scm.stage('app.js');

			await app.workbench.scm.waitForChange('app.js', 'Index Modified');
			await app.workbench.scm.unstage('app.js');

			await app.workbench.scm.waitForChange('app.js', 'Modified');
		});

		it(`stages, commits changes and verifies outgoing change`, async function () {
			const app = this.app as Application;

			await app.workbench.scm.openSCMViewlet();

			await app.workbench.scm.waitForChange('app.js', 'Modified');
			await app.workbench.scm.stage('app.js');
			await app.workbench.scm.waitForChange('app.js', 'Index Modified');

			await app.workbench.scm.commit('first commit');
			await app.code.waitForTextContent(SYNC_STATUSBAR, ' 0↓ 1↑');

			await app.workbench.runCommand('Git: Stage All Changes');
			await app.workbench.scm.waitForChange('index.jade', 'Index Modified');

			await app.workbench.scm.commit('second commit');
			await app.code.waitForTextContent(SYNC_STATUSBAR, ' 0↓ 2↑');

			cp.execSync('git reset --hard origin/master', { cwd: app.workspacePath });
		});
	});
}