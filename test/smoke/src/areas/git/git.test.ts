/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';

describe('Git', () => {
	let app: SpectronApplication = new SpectronApplication(LATEST_PATH, '', 0, [WORKSPACE_PATH]);
	before(() => app.start());
	after(() => app.stop());

	it('verifies current changes are picked up by Git viewlet', async function () {
		// await app.wait(2);
		await app.workbench.scm.openSCMViewlet();
		assert(true);

		await app.workbench.quickopen.openFile('app.js');
		await app.client.waitForElement(`.monaco-editor.focused`);
		await app.type('.foo{}');
		await app.workbench.saveOpenedFile();

		await app.workbench.quickopen.openFile('index.jade');
		await app.client.waitForElement(`.monaco-editor.focused`);
		await app.type('hello world');
		await app.workbench.saveOpenedFile();

		// wait

		await app.workbench.scm.waitForChange(c => c.name === 'app.js');
		await app.workbench.scm.waitForChange(c => c.name === 'index.jade');

		// const changes = await app.workbench.scm.getChanges(context);

		// assert(changes.indexOf('app.js'))
		// assert(changes);
		// console.log(changes);
		// await git.openGitViewlet();
		// assert.ok(await git.verifyScmChange('app.js'), 'app.js change does not appear in SCM viewlet.');
		// assert.ok(await git.verifyScmChange('launch.json'), 'launch.json change does not appear in SCM viewlet.');
	});

	// it(`verifies 'app.js' diff viewer changes`, async function () {
	// 	await git.openGitViewlet();
	// 	await common.openFile('app.js');
	// 	const original = await git.getOriginalAppJsBodyVarName();
	// 	assert.equal(original, 'bodyParser', 'Original value from diff view is wrong.');
	// 	const modified = await git.getModifiedAppJsBodyVarName();
	// 	assert.equal(modified, 'ydobParser', 'Modified value from diff view is wrong.');
	// });

	// it(`stages 'app.js' changes and checks stage count`, async function () {
	// 	await git.openGitViewlet();
	// 	await app.wait();
	// 	await git.stageFile('app.js');
	// 	const stagedCount = await git.getStagedCount();
	// 	assert.equal(stagedCount, 1);

	// 	// Return back to unstaged state
	// 	await git.unstageFile('app.js');
	// });

	// it(`stages, commits change to 'app.js' locally and verifies outgoing change`, async function () {
	// 	await git.openGitViewlet();
	// 	await app.wait();
	// 	await git.stageFile('app.js');
	// 	await git.focusOnCommitBox();
	// 	await common.type('Test commit');
	// 	await git.pressCommit();
	// 	const changes = await git.getOutgoingChanges();
	// 	assert.equal(changes, ' 0↓ 1↑', 'Changes indicator is wrong in a status bar.');
	// });
});