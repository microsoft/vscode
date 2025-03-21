/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Application, Logger } from '../../../../automation';
import { installAllHandlers, retry } from '../../utils';

export function setup(logger: Logger) {
	describe('Search', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		after(function () {
			const app = this.app as Application;
			retry(async () => cp.execSync('git checkout . --quiet', { cwd: app.workspacePathOrFolder }), 0, 5);
			retry(async () => cp.execSync('git reset --hard HEAD --quiet', { cwd: app.workspacePathOrFolder }), 0, 5);
		});

		it('verifies the sidebar moves to the right', async function () {
			const app = this.app as Application;
			await app.workbench.search.openSearchViewlet();

			await app.code.sendKeybinding('PageUp', async () => {
				await app.workbench.search.hasActivityBarMoved();
			});

			await app.code.sendKeybinding('PageUp', async () => {
				await app.workbench.search.hasActivityBarMoved();
			});
		});

		it('searches for body & checks for correct result number', async function () {
			const app = this.app as Application;
			await app.workbench.search.openSearchViewlet();
			await app.workbench.search.searchFor('body');

			await app.workbench.search.waitForResultText('6 results in 3 files');
		});

		it('searches only for *.js files & checks for correct result number', async function () {
			const app = this.app as Application;
			try {
				await app.workbench.search.setFilesToIncludeText('*.js');
				await app.workbench.search.searchFor('body');
				await app.workbench.search.showQueryDetails();

				await app.workbench.search.waitForResultText('4 results in 1 file');
			} finally {
				await app.workbench.search.setFilesToIncludeText('');
				await app.workbench.search.hideQueryDetails();
			}
		});

		it('dismisses result & checks for correct result number', async function () {
			const app = this.app as Application;
			await app.workbench.search.searchFor('body');
			await app.workbench.search.waitForResultText('6 results in 3 files');
			await app.workbench.search.removeFileMatch('app.js', '2 results in 2 files');
		});

		it.skip('replaces first search result with a replace term', async function () { // TODO@roblourens https://github.com/microsoft/vscode/issues/137195
			const app = this.app as Application;

			await app.workbench.search.searchFor('body');
			await app.workbench.search.waitForResultText('6 results in 3 files');
			await app.workbench.search.expandReplace();
			await app.workbench.search.setReplaceText('ydob');
			await app.workbench.search.replaceFileMatch('app.js', '2 results in 2 files');

			await app.workbench.search.searchFor('ydob');
			await app.workbench.search.waitForResultText('4 results in 1 file');
			await app.workbench.search.setReplaceText('body');
			await app.workbench.search.replaceFileMatch('app.js', '0 results in 0 files');
			await app.workbench.search.waitForResultText('0 results in 0 files');
		});
	});

	describe('Quick Open', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('quick open search produces correct result', async function () {
			const app = this.app as Application;
			const expectedNames = [
				'.eslintrc.json',
				'tasks.json',
				'settings.json',
				'app.js',
				'index.js',
				'users.js',
				'package.json',
				'jsconfig.json'
			];

			await app.workbench.quickaccess.openFileQuickAccessAndWait('.js', 8);
			await app.workbench.quickinput.waitForQuickInputElements(names => expectedNames.every(expectedName => names.some(name => expectedName === name)));
			await app.workbench.quickinput.closeQuickInput();
		});

		it('quick open respects fuzzy matching', async function () {
			const app = this.app as Application;
			const expectedNames = [
				'tasks.json',
				'app.js',
				'package.json'
			];

			await app.workbench.quickaccess.openFileQuickAccessAndWait('a.s', 3);
			await app.workbench.quickinput.waitForQuickInputElements(names => expectedNames.every(expectedName => names.some(name => expectedName === name)));
			await app.workbench.quickinput.closeQuickInput();
		});
	});
}
