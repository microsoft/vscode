/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, USER_DIR, STABLE_PATH, LATEST_PATH, WORKSPACE_PATH, EXTENSIONS_DIR } from '../spectron/application';
import { CommonActions } from '../areas/common';

let app: SpectronApplication;
let common: CommonActions;

export function testDataMigration() {
	if (!STABLE_PATH) {
		return;
	}

	describe('Data Migration', () => {

		afterEach(async function () {
			await app.stop();
			await common.removeDirectory(USER_DIR);
			return await common.removeDirectory(EXTENSIONS_DIR);
		});

		function setupSpectron(context: Mocha.ITestCallbackContext, appPath: string, args?: string[]): void {
			if (!args) {
				args = [];
			}
			args.push(`--extensions-dir=${EXTENSIONS_DIR}`);

			app = new SpectronApplication(appPath, context.test.fullTitle(), context.test.currentRetry(), args, [`--user-data-dir=${USER_DIR}`]);
			common = new CommonActions(app);
		}

		it('checks if the Untitled file is restored migrating from stable to latest', async function () {
			const textToType = 'Very dirty file';

			// Setting up stable version
			setupSpectron(this, STABLE_PATH);
			await app.start();

			await common.newUntitledFile();
			await common.type(textToType);
			await app.stop();

			await app.wait(); // wait until all resources are released (e.g. locked local storage)

			// Checking latest version for the restored state
			setupSpectron(this, LATEST_PATH);
			await app.start();

			assert.ok(await common.getTab('Untitled-1'), 'Untitled-1 tab was not restored after migration.');
			await common.selectTab('Untitled-1');
			const editorText = await common.getEditorFirstLinePlainText();
			assert.equal(editorText, textToType, 'Typed editor text does not match to the one after migration.');
		});

		it('checks if the newly created dirty file is restored migrating from stable to latest', async function () {
			const fileName = 'test_data/plainFile',
				firstTextPart = 'This is going to be an unsaved file', secondTextPart = '_that is dirty.';

			// Setting up stable version
			setupSpectron(this, STABLE_PATH, [fileName]);
			await common.removeFile(`${fileName}`);
			await app.start();

			await common.type(firstTextPart);
			await common.saveOpenedFile();
			await app.wait();
			await common.type(secondTextPart);

			await app.stop();
			await app.wait(); // wait until all resources are released (e.g. locked local storage)

			// Checking latest version for the restored state
			setupSpectron(this, LATEST_PATH);
			await app.start();
			assert.ok(await common.getTab(fileName.split('/')[1]), `${fileName} was not restored after migration.`);
			await common.selectTab(fileName.split('/')[1]);
			const editorText = await common.getEditorFirstLinePlainText();
			assert.equal(editorText, firstTextPart.concat(secondTextPart), 'Entered text was not correctly restored after migration.');

			// Cleanup
			await common.removeFile(`${fileName}`);
		});

		it('cheks if opened tabs are restored migrating from stable to latest', async function () {
			const fileName1 = 'app.js', fileName2 = 'jsconfig.json', fileName3 = 'readme.md';
			setupSpectron(this, STABLE_PATH, [WORKSPACE_PATH]);
			await app.start();
			await common.openFile(fileName1, true);
			await common.openFile(fileName2, true);
			await common.openFile(fileName3, true);
			await app.stop();

			setupSpectron(this, LATEST_PATH, [WORKSPACE_PATH]);
			await app.start();
			assert.ok(await common.getTab(fileName1), `${fileName1} tab was not restored after migration.`);
			assert.ok(await common.getTab(fileName2), `${fileName2} tab was not restored after migration.`);
			assert.ok(await common.getTab(fileName3), `${fileName3} tab was not restored after migration.`);
		});
	});
}