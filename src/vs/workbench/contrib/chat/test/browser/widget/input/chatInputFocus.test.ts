/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FileAccess } from '../../../../../../../base/common/network.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';

suite('Chat input focus ring (#328401)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function loadProductionEditContextCss(): Promise<HTMLLinkElement> {
		const link = mainWindow.document.createElement('link');
		link.rel = 'stylesheet';
		link.href = FileAccess.asFileUri('vs/editor/browser/controller/editContext/native/nativeEditContext.css').toString(true);
		await new Promise<void>((resolve, reject) => {
			link.addEventListener('load', () => resolve());
			link.addEventListener('error', () => reject(new Error('Failed to load production nativeEditContext.css')));
			mainWindow.document.head.appendChild(link);
		});
		return link;
	}

	test('native-edit-context has no focus outline under workbench tabindex focus styles', async () => {
		const productionLink = await loadProductionEditContextCss();

		// Electron unit tests often skip :focus; mirror workbench [tabindex]:focus only.
		const workbenchFocusStyle = mainWindow.document.createElement('style');
		workbenchFocusStyle.textContent = `
			.monaco-workbench [tabindex="0"].force-focus {
				outline-width: 1px;
				outline-style: solid;
				outline-offset: -1px;
				outline-color: #007fd4;
			}
		`;
		mainWindow.document.head.appendChild(workbenchFocusStyle);

		const root = mainWindow.document.createElement('div');
		root.className = 'monaco-workbench';
		root.innerHTML = `
			<div class="monaco-editor">
				<div class="native-edit-context" tabindex="0"></div>
			</div>
			<div class="control-focus" tabindex="0"></div>
		`;
		mainWindow.document.body.appendChild(root);

		try {
			const nativeEditContext = root.querySelector('.native-edit-context') as HTMLElement;
			const control = root.querySelector('.control-focus') as HTMLElement;

			nativeEditContext.classList.add('force-focus');
			assert.strictEqual(
				mainWindow.getComputedStyle(nativeEditContext).outlineStyle,
				'none',
				'EditContext must not draw an inner focus ring'
			);

			control.classList.add('force-focus');
			assert.strictEqual(
				mainWindow.getComputedStyle(control).outlineStyle,
				'solid',
				'Other tabindex elements still get a focus outline'
			);
		} finally {
			root.remove();
			workbenchFocusStyle.remove();
			productionLink.remove();
		}
	});
});
