/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication, USER_DIR, LATEST_PATH, WORKSPACE_PATH } from '../../spectron/application';

describe('Data Loss', () => {
	let app: SpectronApplication = new SpectronApplication(LATEST_PATH, '', 0, [WORKSPACE_PATH], [`--user-data-dir=${USER_DIR}`]);
	before(() => app.start());
	after(() => app.stop());

	// this used to run before each test
	// await Util.rimraf(USER_DIR);

	it(`verifies that 'hot exit' works for dirty files`, async function () {
		const textToType = 'Hello, Code', fileName = 'readme.md', untitled = 'Untitled-1';
		await app.workbench.newUntitledFile();
		await app.client.type(textToType);
		await app.workbench.explorer.openFile(fileName);
		await app.client.type(textToType);

		await app.reload();

		// check tab presence
		assert.ok(await app.workbench.waitForOpen(untitled, true), `${untitled} tab is not present after reopening.`);
		assert.ok(await app.workbench.waitForActiveOpen(fileName, true), `${fileName} tab is not present or is not active after reopening.`);
	});

	it(`verifies that contents of the dirty files are restored after 'hot exit'`, async function () {
		// make one dirty file,
		// create one untitled file
		const textToType = 'Hello, Code';

		// create one untitled file
		await app.workbench.newUntitledFile();
		await app.client.type(textToType);

		// make one dirty file,
		await app.workbench.explorer.openFile('readme.md');
		await app.client.type(textToType);

		await app.reload();

		await app.workbench.selectTab('readme.md');
		let actual = await app.workbench.editor.getEditorFirstLineText();
		assert.ok(actual.startsWith(textToType), `${actual} did not start with ${textToType}`);

		actual = await app.workbench.editor.getEditorFirstLineText();
		assert.ok(actual.startsWith(textToType), `${actual} did not start with ${textToType}`);
	});
});