/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Workbench } from '../../../../browser/workbench.js';
import '../../browser/media/sessionsViewPane.css';

const registerEditorTabHeightClass = Reflect.get(Workbench.prototype, 'registerEditorTabHeightClass') as (this: {
	readonly mainContainer: HTMLElement;
	readonly editorGroupService: {
		readonly partOptions: { readonly tabHeight: 'default' | 'compact' };
		readonly onDidChangeEditorPartOptions: Event<void>;
	};
	_register<T extends IDisposable>(disposable: T): T;
}) => void;

suite('Sessions - SessionsViewPane', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('matches the default and compact editor tab heights', () => {
		const editorPartOptionsChanged = disposables.add(new Emitter<void>());
		let tabHeight: 'default' | 'compact' = 'default';
		const workbench = mainWindow.document.createElement('div');
		workbench.className = 'agent-sessions-workbench';
		workbench.style.setProperty('--vscode-spacing-size280', '28px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		const viewPane = mainWindow.document.createElement('div');
		viewPane.className = 'agent-sessions-viewpane';
		const headerRow = mainWindow.document.createElement('div');
		headerRow.className = 'agent-sessions-header-row';
		viewPane.appendChild(headerRow);
		workbench.appendChild(viewPane);
		mainWindow.document.body.appendChild(workbench);

		const host = {
			mainContainer: workbench,
			editorGroupService: {
				get partOptions() { return { tabHeight }; },
				onDidChangeEditorPartOptions: editorPartOptionsChanged.event,
			},
			_register: <T extends IDisposable>(disposable: T) => disposables.add(disposable),
		};

		try {
			registerEditorTabHeightClass.call(host);
			const defaultHeight = mainWindow.getComputedStyle(headerRow).height;

			tabHeight = 'compact';
			editorPartOptionsChanged.fire();
			const compactHeight = mainWindow.getComputedStyle(headerRow).height;

			tabHeight = 'default';
			editorPartOptionsChanged.fire();
			const restoredHeight = mainWindow.getComputedStyle(headerRow).height;

			assert.deepStrictEqual({
				defaultHeight,
				compactHeight,
				restoredHeight,
				hasCompactClass: workbench.classList.contains('editor-tabs-compact-height'),
			}, {
				defaultHeight: '32px',
				compactHeight: '28px',
				restoredHeight: '32px',
				hasCompactClass: false,
			});
		} finally {
			workbench.remove();
		}
	});
});
