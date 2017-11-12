/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as assert from 'assert';

// import { SpectronApplication, STABLE_PATH, LATEST_PATH } from '../../spectron/application';
// import { Util } from '../../helpers/utilities';

// describe('Data Migration', () => {

// 	if (!STABLE_PATH) {
// 		return;
// 	}

// 	let app: SpectronApplication;
// 	afterEach(() => app.stop());

// 	it('checks if the Untitled file is restored migrating from stable to latest', async function () {
// 		const textToType = 'Very dirty file';

// 		// Setting up stable version
// 		let app = new SpectronApplication(STABLE_PATH);
// 		await app.start('Data Migration');

// 		await app.workbench.newUntitledFile();
// 		await app.workbench.editor.waitForTypeInEditor('Untitled-1', textToType);

// 		await app.stop();
// 		await new Promise(c => setTimeout(c, 500)); // wait until all resources are released (e.g. locked local storage)
// 		// Checking latest version for the restored state

// 		app = new SpectronApplication(LATEST_PATH);
// 		await app.start('Data Migration');

// 		assert.ok(await app.workbench.waitForActiveTab('Untitled-1', true), `Untitled-1 tab is not present after migration.`);

// 		await app.workbench.editor.waitForEditorContents('Untitled-1', c => c.indexOf(textToType) > -1);
// 		await app.screenCapturer.capture('Untitled file text');
// 	});

// 	it('checks if the newly created dirty file is restored migrating from stable to latest', async function () {
// 		const fileName = 'test_data/plainFile',
// 			firstTextPart = 'This is going to be an unsaved file', secondTextPart = '_that is dirty.';

// 		// Setting up stable version
// 		let app = new SpectronApplication(STABLE_PATH, fileName);
// 		await Util.removeFile(`${fileName}`);
// 		await app.start('Data Migration');

// 		await app.workbench.editor.waitForTypeInEditor('plainFile', firstTextPart);
// 		await app.workbench.saveOpenedFile();
// 		await app.workbench.editor.waitForTypeInEditor('plainFile', secondTextPart);

// 		await app.stop();
// 		await new Promise(c => setTimeout(c, 1000)); // wait until all resources are released (e.g. locked local storage)

// 		// Checking latest version for the restored state
// 		app = new SpectronApplication(LATEST_PATH);
// 		await app.start('Data Migration');

// 		const filename = fileName.split('/')[1];
// 		assert.ok(await app.workbench.waitForActiveTab(filename), `Untitled-1 tab is not present after migration.`);
// 		await app.workbench.editor.waitForEditorContents(filename, c => c.indexOf(firstTextPart + secondTextPart) > -1);

// 		await Util.removeFile(`${fileName}`);
// 	});

// 	it('cheks if opened tabs are restored migrating from stable to latest', async function () {
// 		const fileName1 = 'app.js', fileName2 = 'jsconfig.json', fileName3 = 'readme.md';
// 		let app = new SpectronApplication(STABLE_PATH);
// 		await app.start('Data Migration');

// 		await app.workbench.quickopen.openFile(fileName1);
// 		await app.workbench.quickopen.openFile(fileName2);
// 		await app.workbench.quickopen.openFile(fileName3);
// 		await app.stop();

// 		app = new SpectronApplication(LATEST_PATH);
// 		await app.start('Data Migration');

// 		assert.ok(await app.workbench.waitForTab(fileName1), `${fileName1} tab was not restored after migration.`);
// 		assert.ok(await app.workbench.waitForTab(fileName2), `${fileName2} tab was not restored after migration.`);
// 		assert.ok(await app.workbench.waitForTab(fileName3), `${fileName3} tab was not restored after migration.`);
// 	});
// });