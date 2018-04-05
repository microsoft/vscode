/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../application';

export function setup() {
	describe('Dataloss', () => {
		before(function () {
			this.app.suiteName = 'Dataloss';
		});

		it(`verifies that 'hot exit' works for dirty files`, async function () {
			const app = this.app as SpectronApplication;
			await app.workbench.editors.newUntitledFile();

			const untitled = 'Untitled-1';
			const textToTypeInUntitled = 'Hello, Unitled Code';
			await app.workbench.editor.waitForTypeInEditor(untitled, textToTypeInUntitled);
			await app.screenCapturer.capture('Untitled file before reload');

			const readmeMd = 'readme.md';
			const textToType = 'Hello, Code';
			await app.workbench.explorer.openFile(readmeMd);
			await app.workbench.editor.waitForTypeInEditor(readmeMd, textToType);
			await app.screenCapturer.capture(`${readmeMd} before reload`);

			await app.reload();
			await app.screenCapturer.capture('After reload');

			await app.workbench.editors.waitForActiveTab(readmeMd, true);
			await app.screenCapturer.capture(`${readmeMd} after reload`);
			await app.workbench.editor.waitForEditorContents(readmeMd, c => c.indexOf(textToType) > -1);

			await app.workbench.editors.waitForTab(untitled, true);
			await app.workbench.editors.selectTab(untitled, true);
			await app.screenCapturer.capture('Untitled file after reload');
			await app.workbench.editor.waitForEditorContents(untitled, c => c.indexOf(textToTypeInUntitled) > -1);
		});
	});
}