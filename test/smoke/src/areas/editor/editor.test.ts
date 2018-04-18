/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application } from '../../application';

export function setup() {
	describe('Editor', () => {
		it('shows correct quick outline', async function () {
			const app = this.app as Application;
			await app.workbench.quickopen.openFile('www');

			await app.workbench.quickopen.openQuickOutline();
			await app.workbench.quickopen.waitForQuickOpenElements(names => names.length >= 6);
		});

		it(`finds 'All References' to 'app'`, async function () {
			const app = this.app as Application;
			await app.workbench.quickopen.openFile('www');

			const references = await app.workbench.editor.findReferences('app', 7);

			await references.waitForReferencesCountInTitle(3);
			await references.waitForReferencesCount(3);
			await references.close();
		});

		it(`renames local 'app' variable`, async function () {
			const app = this.app as Application;
			await app.workbench.quickopen.openFile('www');
			await app.workbench.editor.rename('www', 7, 'app', 'newApp');
			await app.workbench.editor.waitForEditorContents('www', contents => contents.indexOf('newApp') > -1);
		});

		// it('folds/unfolds the code correctly', async function () {
		// 	await app.workbench.quickopen.openFile('www');

		// 	// Fold
		// 	await app.workbench.editor.foldAtLine(3);
		// 	await app.workbench.editor.waitUntilShown(3);
		// 	await app.workbench.editor.waitUntilHidden(4);
		// 	await app.workbench.editor.waitUntilHidden(5);

		// 	// Unfold
		// 	await app.workbench.editor.unfoldAtLine(3);
		// 	await app.workbench.editor.waitUntilShown(3);
		// 	await app.workbench.editor.waitUntilShown(4);
		// 	await app.workbench.editor.waitUntilShown(5);
		// });

		it(`verifies that 'Go To Definition' works`, async function () {
			const app = this.app as Application;
			await app.workbench.quickopen.openFile('app.js');

			await app.workbench.editor.gotoDefinition('express', 11);

			await app.workbench.editors.waitForActiveTab('index.d.ts');
		});

		it(`verifies that 'Peek Definition' works`, async function () {
			const app = this.app as Application;
			await app.workbench.quickopen.openFile('app.js');

			const peek = await app.workbench.editor.peekDefinition('express', 11);

			await peek.waitForFile('index.d.ts');
		});
	});
}