/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isHTMLElement } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import type { IChat, IChatBackgroundShell } from '../../../../services/sessions/common/session.js';
import { SessionBackgroundShellsControl } from '../../browser/sessionBackgroundShellsControl.js';

suite('SessionBackgroundShellsControl', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('updates elapsed time while observed and stops when the list becomes empty', () => runWithFakedTimers({}, async () => {
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [{
			id: 'running', description: 'Run tests', command: 'npm test',
			status: 'running', startedAt: new Date(0).toISOString(), attachmentMode: 'attached',
		}]);
		const chat = new class extends mock<IChat>() {
			override readonly backgroundShells = shells;
		}();
		const control = store.add(new SessionBackgroundShellsControl(constObservable(chat)));
		let badge: string | undefined;
		const observer = store.add(autorun(reader => {
			badge = control.sections.read(reader)[0]?.entries[0].badge;
		}));
		const initial = badge;
		const details = control.sections.get()[0].entries[0].hover?.content;
		assert.ok(isHTMLElement(details));
		const initialDetails = details.firstElementChild?.textContent;
		await timeout(2100);
		const elapsed = badge;
		const elapsedDetails = details.firstElementChild?.textContent;
		const sameDetails = control.sections.get()[0].entries[0].hover?.content === details;
		shells.set([], undefined);
		await timeout(2000);
		observer.dispose();

		assert.deepStrictEqual({ initial, elapsed, initialDetails, elapsedDetails, sameDetails, empty: badge }, {
			initial: 'Running, Attached, 0ms',
			elapsed: 'Running, Attached, 2s',
			initialDetails: 'Running, Attached, 0ms',
			elapsedDetails: 'Running, Attached, 2s',
			sameDetails: true,
			empty: undefined,
		});
	}));

	test('updates shell rows independently of turns and exposes the full command as plain text', () => {
		const shell: IChatBackgroundShell = {
			id: 'silent', description: 'Run tests', command: 'npm test -- --grep "<script>"',
			status: 'running', startedAt: new Date(0).toISOString(), attachmentMode: 'attached',
		};
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [shell]);
		const chat = new class extends mock<IChat>() {
			override readonly backgroundShells = shells;
		}();
		const control = store.add(new SessionBackgroundShellsControl(constObservable(chat)));
		const entry = control.sections.get()[0].entries[0];
		const details = entry.hover?.content;
		assert.ok(isHTMLElement(details));
		shells.set([{ ...shell, status: 'idle', attachmentMode: 'detached' }], undefined);
		const updated = control.sections.get()[0].entries[0];
		shells.set([], undefined);

		assert.deepStrictEqual({
			entry: { id: entry.id, label: entry.label, active: entry.badge?.startsWith('Running, Attached, ') },
			updated: updated.badge?.startsWith('Waiting, Detached, '),
			plainCommand: details.textContent?.includes(shell.command),
			noMarkup: details.querySelector('script') === null,
			liveDetails: details.firstElementChild?.textContent?.startsWith('Waiting, Detached, '),
			sameDetails: updated.hover?.content === details,
			expandable: updated.hover?.expandable,
			aboveInput: updated.hover?.alignToParentBottom,
			empty: control.sections.get(),
		}, {
			entry: { id: 'silent', label: 'Run tests', active: true },
			updated: true,
			plainCommand: true,
			noMarkup: true,
			liveDetails: true,
			sameDetails: true,
			expandable: true,
			aboveInput: true,
			empty: [],
		});
	});

	test('omits the attached or detached mode when the agent does not report it', () => {
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [{
			id: 'plain', description: 'Build', command: 'npm run build',
			status: 'idle', startedAt: new Date(0).toISOString(),
		}]);
		const chat = new class extends mock<IChat>() {
			override readonly backgroundShells = shells;
		}();
		const control = store.add(new SessionBackgroundShellsControl(constObservable(chat)));
		const badge = control.sections.get()[0].entries[0].badge ?? '';

		assert.deepStrictEqual({ waiting: badge.startsWith('Waiting, '), mentionsMode: /Attached|Detached/.test(badge) }, { waiting: true, mentionsMode: false });
	});

	test('does not show shells from a previously viewed chat or an unsupported provider', () => {
		const createChat = (command: string) => new class extends mock<IChat>() {
			override readonly backgroundShells = constObservable<readonly IChatBackgroundShell[]>([{
				id: 'shared-id', description: command, command, status: 'running',
				startedAt: new Date(0).toISOString(), attachmentMode: 'attached',
			}]);
		}();
		const current = observableValue<IChat | undefined>('chat', createChat('npm test'));
		const control = store.add(new SessionBackgroundShellsControl(current));
		const first = control.sections.get()[0].entries.map(entry => entry.label);
		current.set(createChat('npm run build'), undefined);
		const second = control.sections.get()[0].entries.map(entry => entry.label);
		current.set(undefined, undefined);

		assert.deepStrictEqual({ first, second, empty: control.sections.get() }, {
			first: ['npm test'], second: ['npm run build'], empty: [],
		});
	});
});
