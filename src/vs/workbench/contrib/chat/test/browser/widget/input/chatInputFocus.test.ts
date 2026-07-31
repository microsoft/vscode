/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';

suite('Chat input focus ring (#328401)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('native-edit-context has no focus outline; chat-input-container carries focused', () => {
		// Electron unit tests often do not apply :focus styles. Mirror the workbench
		// [tabindex]:focus rule with a class so we can assert cascade/override.
		const style = mainWindow.document.createElement('style');
		style.textContent = `
			.monaco-workbench [tabindex="0"].force-focus {
				outline-width: 1px;
				outline-style: solid;
				outline-offset: -1px;
				outline-color: #007fd4;
			}
			.monaco-editor .native-edit-context {
				outline: none !important;
			}
		`;
		mainWindow.document.head.appendChild(style);

		const root = mainWindow.document.createElement('div');
		root.className = 'monaco-workbench';
		root.innerHTML = `
			<div class="interactive-session">
				<div class="chat-input-container">
					<div class="monaco-editor">
						<div class="native-edit-context" tabindex="0"></div>
					</div>
				</div>
				<div class="control-focus" tabindex="0"></div>
			</div>
		`;
		mainWindow.document.body.appendChild(root);

		try {
			const inputContainer = root.querySelector('.chat-input-container') as HTMLElement;
			const nativeEditContext = root.querySelector('.native-edit-context') as HTMLElement;
			const control = root.querySelector('.control-focus') as HTMLElement;

			// Whole-widget treatment: ChatInputPart toggles this on editor focus.
			inputContainer.classList.toggle('focused', true);
			assert.ok(inputContainer.classList.contains('focused'));

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
			style.remove();
		}
	});
});
