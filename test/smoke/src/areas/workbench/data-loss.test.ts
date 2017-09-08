/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication } from '../../spectron/application';

describe('Dataloss', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start('Dataloss'); });
	after(() => app.stop());
	beforeEach(function () { app.screenCapturer.testName = this.currentTest.title; });

	it(`verifies that 'hot exit' works for dirty files`, async function () {
		const textToType = 'Hello, Code', textToTypeInUntitled = 'Hello, Unitled Code', fileName = 'readme.md', untitled = 'Untitled-1';
		await app.workbench.newUntitledFile();
		await app.client.type(textToTypeInUntitled);
		await app.workbench.explorer.openFile(fileName);
		await app.client.type(textToType);

		await app.reload();
		await app.screenCapturer.capture('After reload');

		await app.workbench.waitForActiveOpen(fileName, true);
		let actual = await app.workbench.editor.getEditorFirstLineText();
		await app.screenCapturer.capture(fileName + ' text');
		assert.ok(actual.startsWith(textToType), `${actual} did not start with ${textToType}`);

		await app.workbench.waitForOpen(untitled, true);
		await app.workbench.selectTab('Untitled-1', true);
		actual = await app.workbench.editor.getEditorFirstLineText();
		await app.screenCapturer.capture('Untitled file text');
		assert.ok(actual.startsWith(textToTypeInUntitled), `${actual} did not start with ${textToTypeInUntitled}`);
	});
});