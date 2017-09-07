/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SpectronApplication } from '../../spectron/application';

describe('Dataloss', () => {
	let app: SpectronApplication;
	before(() => { app = new SpectronApplication(); return app.start(); });
	after(() => app.stop());
	beforeEach(function () { app.createScreenshotCapturer(this.currentTest); });

	it(`verifies that 'hot exit' works for dirty files`, async function () {
		const textToType = 'Hello, Code', textToTypeInUntitled = 'Hello, Unitled Code', fileName = 'readme.md', untitled = 'Untitled-1';
		await app.workbench.newUntitledFile();
		await app.client.type(textToTypeInUntitled);
		await app.workbench.explorer.openFile(fileName);
		await app.client.type(textToType);

		await app.reload();

		assert.ok(await app.workbench.waitForActiveOpen(fileName, true), `${fileName} tab is not present or is not active after reopening.`);
		let actual = await app.workbench.editor.getEditorFirstLineText();
		app.screenshot.capture(fileName + ' text');
		assert.ok(actual.startsWith(textToType), `${actual} did not start with ${textToType}`);

		assert.ok(await app.workbench.waitForOpen(untitled, true), `${untitled} tab is not present after reopening.`);
		await app.workbench.selectTab('Untitled-1', true);
		actual = await app.workbench.editor.getEditorFirstLineText();
		app.screenshot.capture('Untitled file text');
		assert.ok(actual.startsWith(textToTypeInUntitled), `${actual} did not start with ${textToTypeInUntitled}`);
	});
});