/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../spectron/application';
import { CommonActions } from '../areas/common';
import { Git } from '../areas/git';

let app: SpectronApplication;
let common: CommonActions;

export function testGit() {
	describe('Git', () => {
		let git: Git;

		beforeEach(async function () {
			app = new SpectronApplication(LATEST_PATH, this.currentTest.fullTitle(), (this.currentTest as any).currentRetry(), [WORKSPACE_PATH]);
			common = new CommonActions(app);
			git = new Git(app, common);

			return await app.start();
		});
		afterEach(async function () {
			return await app.stop();
		});

		it('verifies current changes are picked up by Git viewlet', async function () {
			const changesCount = await git.getScmIconChanges();
			assert.equal(changesCount, 2);
			await git.openGitViewlet();
			assert.ok(await git.verifyScmChange('app.js'), 'app.js change does not appear in SCM viewlet.');
			assert.ok(await git.verifyScmChange('launch.json'), 'launch.json change does not appear in SCM viewlet.');
		});

		it(`verifies 'app.js' diff viewer changes`, async function () {
			await git.openGitViewlet();
			await common.openFile('app.js');
			const original = await git.getOriginalAppJsBodyVarName();
			assert.equal(original, 'bodyParser', 'Original value from diff view is wrong.');
			const modified = await git.getModifiedAppJsBodyVarName();
			assert.equal(modified, 'ydobParser', 'Modified value from diff view is wrong.');
		});

		it(`stages 'app.js' changes and checks stage count`, async function () {
			await git.openGitViewlet();
			await app.wait();
			await git.stageFile('app.js');
			const stagedCount = await git.getStagedCount();
			assert.equal(stagedCount, 1);

			// Return back to unstaged state
			await git.unstageFile('app.js');
		});

		it(`stages, commits change to 'app.js' locally and verifies outgoing change`, async function () {
			await git.openGitViewlet();
			await app.wait();
			await git.stageFile('app.js');
			await git.focusOnCommitBox();
			await common.type('Test commit');
			await git.pressCommit();
			const changes = await git.getOutgoingChanges();
			assert.equal(changes, ' 0↓ 1↑', 'Changes indicator is wrong in a status bar.');
		});
	});
}