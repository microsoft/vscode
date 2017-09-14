/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, STABLE_PATH, LATEST_PATH } from '../../spectron/application';
import { Util } from '../../helpers/utilities';

describe('Data Migration', () => {

	if (!STABLE_PATH) {
		return;
	}

	let app: SpectronApplication;
	afterEach(() => app.stop());

	it('checks if the Untitled file is restored migrating from stable to latest', async function () {
		const textToType = 'Very dirty file';
		console.log(STABLE_PATH);
		// Setting up stable version
		let app = new SpectronApplication(STABLE_PATH);
		await app.start('Data Migration');
		app.screenCapturer.testName = 'Untitled is restorted';

		await app.workbench.newUntitledFile();
		await app.client.type(textToType);

		await app.stop();
		await app.wait(.5); // wait until all resources are released (e.g. locked local storage)
		// Checking latest version for the restored state

		app = new SpectronApplication(LATEST_PATH);
		await app.start('Data Migration');
		app.screenCapturer.testName = 'Untitled is restorted';

		assert.ok(await app.workbench.waitForActiveTab('Untitled-1', true), `Untitled-1 tab is not present after migration.`);
		const actual = await app.workbench.editor.getEditorFirstLineText();
		await app.screenCapturer.capture('Untitled file text');
		assert.ok(actual.startsWith(textToType), `${actual} did not start with ${textToType}`);
	});

	it('checks if the newly created dirty file is restored migrating from stable to latest', async function () {
		const fileName = 'test_data/plainFile',
			firstTextPart = 'This is going to be an unsaved file', secondTextPart = '_that is dirty.';

		// Setting up stable version
		let app = new SpectronApplication(STABLE_PATH, fileName);
		await Util.removeFile(`${fileName}`);
		await app.start('Data Migration');
		app.screenCapturer.testName = 'Newly created dirty file is restorted';

		await app.workbench.waitForActiveTab(fileName);
		await app.client.type(firstTextPart);
		await app.workbench.saveOpenedFile();
		await app.client.type(secondTextPart);

		await app.stop();
		await app.wait(); // wait until all resources are released (e.g. locked local storage)

		// Checking latest version for the restored state
		app = new SpectronApplication(LATEST_PATH);
		await app.start('Data Migration');
		app.screenCapturer.testName = 'Newly created dirty file is restorted';

		assert.ok(await app.workbench.waitForActiveTab(fileName.split('/')[1]), `Untitled-1 tab is not present after migration.`);
		const actual = await app.workbench.editor.getEditorFirstLineText();
		await app.screenCapturer.capture(fileName + ' text');
		assert.ok(actual.startsWith(firstTextPart.concat(secondTextPart)), `${actual} did not start with ${firstTextPart.concat(secondTextPart)}`);

		await Util.removeFile(`${fileName}`);
	});

	it('cheks if opened tabs are restored migrating from stable to latest', async function () {
		const fileName1 = 'app.js', fileName2 = 'jsconfig.json', fileName3 = 'readme.md';
		let app = new SpectronApplication(STABLE_PATH);
		await app.start('Data Migration');
		app.screenCapturer.testName = 'Opened tabs are restored';

		await app.workbench.quickopen.openFile(fileName1);
		await app.workbench.quickopen.openFile(fileName2);
		await app.workbench.quickopen.openFile(fileName3);
		await app.stop();

		app = new SpectronApplication(LATEST_PATH);
		await app.start('Data Migration');
		app.screenCapturer.testName = 'Opened tabs are restored';

		assert.ok(await app.workbench.waitForTab(fileName1), `${fileName1} tab was not restored after migration.`);
		assert.ok(await app.workbench.waitForTab(fileName2), `${fileName2} tab was not restored after migration.`);
		assert.ok(await app.workbench.waitForTab(fileName3), `${fileName3} tab was not restored after migration.`);
	});
});