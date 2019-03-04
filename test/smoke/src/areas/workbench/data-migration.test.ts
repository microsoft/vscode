/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Quality } from '../../application';
import * as rimraf from 'rimraf';

export interface ICreateAppFn {
	(quality: Quality): Application;
}

export function setup(userDataDir: string, createApp: ICreateAppFn) {

	describe('Data Migration', () => {

		afterEach(async function () {
			await new Promise((c, e) => rimraf(userDataDir, { maxBusyTries: 10 }, err => err ? e(err) : c()));
		});

		// it('checks if the Untitled file is restored migrating from stable to latest', async function () {
		// 	const stableApp = createApp(Quality.Stable);

		// 	if (!stableApp) {
		// 		this.skip();
		// 		return;
		// 	}

		// 	await stableApp.start();

		// 	const textToType = 'Very dirty file';

		// 	await stableApp.workbench.editors.newUntitledFile();
		// 	await stableApp.workbench.editor.waitForTypeInEditor('Untitled-1', textToType);

		// 	await stableApp.stop();
		// 	await new Promise(c => setTimeout(c, 500)); // wait until all resources are released (e.g. locked local storage)

		// 	// Checking latest version for the restored state
		// 	const app = createApp(Quality.Insiders);

		// 	await app.start(false);

		// 	await app.workbench.editors.waitForActiveTab('Untitled-1', true);
		// 	await app.workbench.editor.waitForEditorContents('Untitled-1', c => c.indexOf(textToType) > -1);

		// 	await app.stop();
		// });

		// it('checks if the newly created dirty file is restored migrating from stable to latest', async function () {
		// 	const stableApp = createApp(Quality.Stable);

		// 	if (!stableApp) {
		// 		this.skip();
		// 		return;
		// 	}

		// 	await stableApp.start();

		// 	const fileName = 'app.js';
		// 	const textPart = 'This is going to be an unsaved file';

		// 	await stableApp.workbench.quickopen.openFile(fileName);

		// 	await stableApp.workbench.editor.waitForTypeInEditor(fileName, textPart);

		// 	await stableApp.stop();
		// 	await new Promise(c => setTimeout(c, 500)); // wait until all resources are released (e.g. locked local storage)

		// 	// Checking latest version for the restored state
		// 	const app = createApp(Quality.Insiders);

		// 	await app.start(false);

		// 	await app.workbench.editors.waitForActiveTab(fileName);
		// 	await app.workbench.editor.waitForEditorContents(fileName, c => c.indexOf(textPart) > -1);

		// 	await app.stop();
		// });

		// it('checks if opened tabs are restored migrating from stable to latest', async function () {
		// 	const stableApp = createApp(Quality.Stable);

		// 	if (!stableApp) {
		// 		this.skip();
		// 		return;
		// 	}

		// 	await stableApp.start();

		// 	const fileName1 = 'app.js', fileName2 = 'jsconfig.json', fileName3 = 'readme.md';

		// 	await stableApp.workbench.quickopen.openFile(fileName1);
		// 	await stableApp.workbench.runCommand('View: Keep Editor');
		// 	await stableApp.workbench.quickopen.openFile(fileName2);
		// 	await stableApp.workbench.runCommand('View: Keep Editor');
		// 	await stableApp.workbench.quickopen.openFile(fileName3);
		// 	await stableApp.stop();

		// 	const app = createApp(Quality.Insiders);

		// 	await app.start(false);

		// 	await app.workbench.editors.waitForTab(fileName1);
		// 	await app.workbench.editors.waitForTab(fileName2);
		// 	await app.workbench.editors.waitForTab(fileName3);

		// 	await app.stop();
		// });
	});
}