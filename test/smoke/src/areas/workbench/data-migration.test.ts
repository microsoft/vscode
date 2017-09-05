/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { SpectronApplication, USER_DIR, STABLE_PATH, LATEST_PATH, WORKSPACE_PATH, EXTENSIONS_DIR } from '../../spectron/application';
import { Util } from '../../helpers/utilities';

let app: SpectronApplication;

export function testDataMigration() {
	if (!STABLE_PATH) {
		return;
	}

	describe('Data Migration', () => {

		afterEach(async function () {
			await app.stop();
			await Util.rimraf(USER_DIR);
			return await Util.rimraf(EXTENSIONS_DIR);
		});

		function setupSpectron(context: Mocha.ITestCallbackContext, appPath: string, args?: string[]): void {
			if (!args) {
				args = [];
			}
			args.push(`--extensions-dir=${EXTENSIONS_DIR}`);

			app = new SpectronApplication(appPath, context.test.fullTitle(), context.test.currentRetry(), args, [`--user-data-dir=${USER_DIR}`]);
		}

		it('checks if the Untitled file is restored migrating from stable to latest', async function () {
			const textToType = 'Very dirty file';

			// Setting up stable version
			setupSpectron(this, STABLE_PATH);
			await app.start();

			await app.workbench.newUntitledFile();
			await app.type(textToType);

			await app.stop();
			await app.wait(.5); // wait until all resources are released (e.g. locked local storage)
			// Checking latest version for the restored state
			setupSpectron(this, LATEST_PATH);
			await app.start();

			assert.ok(await app.workbench.waitForActiveOpen('Untitled-1', true), `Untitled-1 tab is not present after migration.`);
			const actual = await app.workbench.editor.getEditorFirstLineText();
			assert.ok(actual.startsWith(textToType), `${actual} did not start with ${textToType}`);
		});

		it('checks if the newly created dirty file is restored migrating from stable to latest', async function () {
			const fileName = 'test_data/plainFile',
				firstTextPart = 'This is going to be an unsaved file', secondTextPart = '_that is dirty.';

			// Setting up stable version
			setupSpectron(this, STABLE_PATH, [fileName]);
			await Util.removeFile(`${fileName}`);
			await app.start();

			await app.workbench.waitForActiveOpen(fileName);
			await app.type(firstTextPart);
			await app.workbench.saveOpenedFile();
			await app.type(secondTextPart);

			await app.stop();
			await app.wait(); // wait until all resources are released (e.g. locked local storage)
			// Checking latest version for the restored state
			setupSpectron(this, LATEST_PATH);
			await app.start();

			assert.ok(await app.workbench.waitForActiveOpen(fileName.split('/')[1]), `Untitled-1 tab is not present after migration.`);
			const actual = await app.workbench.editor.getEditorFirstLineText();
			assert.ok(actual.startsWith(firstTextPart.concat(secondTextPart)), `${actual} did not start with ${firstTextPart.concat(secondTextPart)}`);

			await Util.removeFile(`${fileName}`);
		});

		it('cheks if opened tabs are restored migrating from stable to latest', async function () {
			const fileName1 = 'app.js', fileName2 = 'jsconfig.json', fileName3 = 'readme.md';
			setupSpectron(this, STABLE_PATH, [WORKSPACE_PATH]);
			await app.start();

			await app.workbench.quickopen.openFile(fileName1);
			await app.workbench.quickopen.openFile(fileName2);
			await app.workbench.quickopen.openFile(fileName3);
			await app.stop();

			setupSpectron(this, LATEST_PATH, [WORKSPACE_PATH]);
			await app.start();

			assert.ok(await app.workbench.waitForOpen(fileName1), `${fileName1} tab was not restored after migration.`);
			assert.ok(await app.workbench.waitForOpen(fileName2), `${fileName2} tab was not restored after migration.`);
			assert.ok(await app.workbench.waitForOpen(fileName3), `${fileName3} tab was not restored after migration.`);
		});
	});
}