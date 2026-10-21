/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionOptionsRow } from '../../browser/sessionOptionsRow.js';

suite('Sessions - SessionOptionsRow', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Tab and the arrow keys move through the row\'s pickers and the disclosure toggle in order', () => {
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
		control(sessionOptionsRow.repositoryControlsHost, 'isolation', 'button');
		control(sessionOptionsRow.repositoryControlsHost, 'branch', 'button');
		const harness = control(sessionOptionsRow.details, 'harness', 'button');
		harness.setAttribute('aria-disabled', 'true');
		harness.classList.add('disabled');

		const visit = (key: string, count: number) => {
			folder.focus();
			const visited: (string | null)[] = [];
			for (let i = 0; i < count; i++) {
				visited.push(document.activeElement?.getAttribute('aria-label') ?? null);
				document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
			}
			return visited;
		};

		assert.deepStrictEqual({ tab: visit('Tab', 4), arrow: visit('ArrowRight', 6), reverseArrow: visit('ArrowLeft', 6) }, {
			tab: ['folder', 'isolation', 'branch', 'Hide Session Options'],
			arrow: ['folder', 'isolation', 'branch', 'harness', 'Hide Session Options', 'folder'],
			reverseArrow: ['folder', 'Hide Session Options', 'harness', 'branch', 'isolation', 'folder'],
		});
	});

	test('focus moves to the primary picker, not the hidden toggle, when the options go away', () => {
		const document = mainWindow.document;
		const container = document.body.appendChild(document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const row = container.appendChild(document.createElement('div'));
		const folder = row.appendChild(document.createElement('a'));
		folder.tabIndex = 0;
		folder.role = 'button';
		folder.setAttribute('aria-label', 'folder');
		const hasDetails = observableValue('hasDetails', true);
		const sessionOptionsRow = store.add(new SessionOptionsRow(row, container, {
			user: 'test',
			useExperimentalLayout: constObservable(true),
			screenReaderOptimized: constObservable(false),
			expanded: constObservable(true),
			collapsedShowIcons: constObservable(true),
			hasDetails,
			setExpanded: () => { },
		}));
		const isolation = sessionOptionsRow.repositoryControlsHost.appendChild(document.createElement('a'));
		isolation.tabIndex = 0;
		isolation.role = 'button';
		isolation.focus();
		hasDetails.set(false, undefined);

		assert.deepStrictEqual({ focused: document.activeElement?.getAttribute('aria-label'), toggleHidden: sessionOptionsRow.toggle.element.hidden }, { focused: 'folder', toggleHidden: true });
	});
});
