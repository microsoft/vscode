/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { Action } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SessionHeaderMetaActionViewItem } from '../../../browser/parts/sessionHeaderMetaActionViewItem.js';

suite('SessionHeaderMetaActionViewItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('runs without bubbling pointer activation to its host', async () => {
		let actionRuns = 0;
		let hostClicks = 0;
		const host = mainWindow.document.createElement('div');
		const container = mainWindow.document.createElement('div');
		host.appendChild(container);
		mainWindow.document.body.appendChild(host);
		disposables.add({ dispose: () => host.remove() });
		host.addEventListener('click', () => hostClicks++);

		const action = disposables.add(new Action('test.action', 'Test', undefined, true, async () => {
			actionRuns++;
		}));
		const item = disposables.add(new SessionHeaderMetaActionViewItem(undefined, action, {}));
		item.render(container);
		const didRun = Event.toPromise(item.actionRunner.onDidRun);

		item.element?.querySelector<HTMLElement>('.monaco-button')?.click();
		await didRun;

		assert.deepStrictEqual({ actionRuns, hostClicks }, { actionRuns: 1, hostClicks: 0 });
	});
});
