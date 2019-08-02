/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application } from '../../application';

export function setup() {
	describe('Dataloss', () => {
		it(`verifies that 'hot exit' works for dirty files`, async function () {
			const app = this.app as Application;
			await app.workbench.editors.newUntitledFile();

			const untitled = 'Untitled-1';
			const textToTypeInUntitled = 'Hello, Untitled Code';
			await app.workbench.editor.waitForTypeInEditor(untitled, textToTypeInUntitled);

			const readmeMd = 'readme.md';
			const textToType = 'Hello, Code';
			await app.workbench.quickopen.openFile(readmeMd);
			await app.workbench.editor.waitForTypeInEditor(readmeMd, textToType);

			await app.reload();

			await app.workbench.editors.waitForActiveTab(readmeMd, true);
			await app.workbench.editor.waitForEditorContents(readmeMd, c => c.indexOf(textToType) > -1);

			await app.workbench.editors.waitForTab(untitled, true);
			await app.workbench.editors.selectTab(untitled, true);
			await app.workbench.editor.waitForEditorContents(untitled, c => c.indexOf(textToTypeInUntitled) > -1);
		});
	});
}
