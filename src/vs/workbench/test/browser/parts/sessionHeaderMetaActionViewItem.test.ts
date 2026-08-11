/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { Action } from '../../../../base/common/actions.js';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SessionChangesMetaActionViewItem, SessionHeaderMetaActionViewItem } from '../../../browser/parts/sessionHeaderMetaActionViewItem.js';
import { workbenchInstantiationService } from '../workbenchTestServices.js';

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

	test('renders animated changes counters and updates live', async () => {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		const action = disposables.add(new Action('test.changes', 'Changes'));
		const stats = observableValue('testSessionDiffStats', {
			branch: 'main',
			files: 3,
			insertions: 12,
			deletions: 4,
		});
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const item = disposables.add(instantiationService.createInstance(SessionChangesMetaActionViewItem, undefined, action, {}, reader => stats.read(reader)));

		item.render(container);
		await timeout(0);

		const initial = {
			isChanges: container.classList.contains('session-changes-meta-action'),
			label: container.querySelector('.chat-composite-bar-meta-item-label')?.textContent,
			added: container.querySelector('.chat-composite-bar-meta-added')?.textContent,
			removed: container.querySelector('.chat-composite-bar-meta-removed')?.textContent,
			animatedCounters: container.querySelectorAll('.monaco-animated-counter').length,
		};

		stats.set({
			branch: 'main',
			files: 4,
			insertions: 20,
			deletions: 6,
		}, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			initial,
			updated: {
				label: container.querySelector('.chat-composite-bar-meta-item-label')?.textContent,
				added: container.querySelector('.chat-composite-bar-meta-added')?.textContent,
				removed: container.querySelector('.chat-composite-bar-meta-removed')?.textContent,
				animatedCounters: container.querySelectorAll('.monaco-animated-counter').length,
			},
		}, {
			initial: {
				isChanges: true,
				label: '3 files',
				added: '+12',
				removed: '-4',
				animatedCounters: 2,
			},
			updated: {
				label: '4 files',
				added: '+20',
				removed: '-6',
				animatedCounters: 2,
			},
		});
	});
});
