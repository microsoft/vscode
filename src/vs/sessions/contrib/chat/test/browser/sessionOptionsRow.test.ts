/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionOptionsRow } from '../../browser/sessionOptionsRow.js';

suite('Sessions - SessionOptionsRow', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Tab and the arrow keys move through the row\'s buttons and checkboxes in order', () => {
		const document = mainWindow.document;
		const container = document.body.appendChild(document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const row = container.appendChild(document.createElement('div'));
		const control = (parent: HTMLElement, name: string, role: string) => {
			const element = parent.appendChild(document.createElement('a'));
			element.tabIndex = 0;
			element.role = role;
			element.setAttribute('aria-label', name);
			return element;
		};
		const folder = control(row, 'folder', 'button');
		const sessionOptionsRow = store.add(new SessionOptionsRow(row, container, {
			user: 'test',
			useExperimentalLayout: constObservable(true),
			screenReaderOptimized: constObservable(false),
			expanded: constObservable(true),
			collapsedShowIcons: constObservable(true),
			setExpanded: () => { },
		}));
		control(sessionOptionsRow.repositoryControlsHost, 'worktree', 'checkbox');
		control(sessionOptionsRow.repositoryControlsHost, 'branch', 'button');

		const visit = (key: string, count: number) => {
			folder.focus();
			const visited: (string | null)[] = [];
			for (let i = 0; i < count; i++) {
				visited.push(document.activeElement?.getAttribute('aria-label') ?? null);
				document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
			}
			return visited;
		};

		assert.deepStrictEqual({ tab: visit('Tab', 4), arrow: visit('ArrowRight', 5) }, {
			tab: ['folder', 'worktree', 'branch', 'Hide Session Options'],
			arrow: ['folder', 'worktree', 'branch', 'Hide Session Options', 'folder'],
		});
	});
});
