/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Application } from '../../application';

const DIFF_EDITOR_LINE_INSERT = '.monaco-diff-editor .editor.modified .line-insert';
const SYNC_STATUSBAR = 'div[id="workbench.parts.statusbar"] .statusbar-item[title$="Synchronize Changes"]';

export function setup() {
	describe('Git', () => {
		before(async function () {
			const app = this.app as Application;

			cp.execSync('git config user.name testuser', { cwd: app.workspacePathOrFolder });
			cp.execSync('git config user.email monacotools@microsoft.com', { cwd: app.workspacePathOrFolder });
		});

		it('reflects working tree changes', async function () {
			const app = this.app as Application;

			await app.workbench.scm.openSCMViewlet();

			await app.workbench.quickopen.openFile('app.js');
			await app.workbench.editor.waitForTypeInEditor('app.js', '.foo{}');
			await app.workbench.editors.saveOpenedFile();

			await app.workbench.quickopen.openFile('index.pug');
			await app.workbench.editor.waitForTypeInEditor('index.pug', 'hello world');
			await app.workbench.editors.saveOpenedFile();

			await app.workbench.scm.refreshSCMViewlet();
			await app.workbench.scm.waitForChange('app.js', 'Modified');
			await app.workbench.scm.waitForChange('index.pug', 'Modified');
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
			await app.workbench.scm.unstage('app.js');
		});

		it(`stages, commits changes and verifies outgoing change`, async function () {
			const app = this.app as Application;

			await app.workbench.scm.openSCMViewlet();
			await app.workbench.scm.waitForChange('app.js', 'Modified');

			await app.workbench.scm.stage('app.js');

			await app.workbench.scm.commit('first commit');
			await app.code.waitForTextContent(SYNC_STATUSBAR, ' 0↓ 1↑');

			await app.workbench.quickopen.runCommand('Git: Stage All Changes');
			await app.workbench.scm.waitForChange('index.pug', 'Index Modified');

			await app.workbench.scm.commit('second commit');
			await app.code.waitForTextContent(SYNC_STATUSBAR, ' 0↓ 2↑');

			cp.execSync('git reset --hard origin/master', { cwd: app.workspacePathOrFolder });
		});
	});
}