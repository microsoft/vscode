/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isHTMLElement } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { SessionBackgroundShellsControl, type IChatBackgroundShellsSource } from '../../browser/sessionBackgroundShellsControl.js';
import type { IChatBackgroundShell } from '../../common/sessionChatPills.js';

suite('SessionBackgroundShellsControl', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('updates elapsed time while observed and stops when the list becomes empty', () => runWithFakedTimers({}, async () => {
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [{
			id: 'running', description: 'Run tests', command: 'npm test',
			startedAt: new Date(0).toISOString(), attachmentMode: 'attached',
		}]);
		const control = store.add(new SessionBackgroundShellsControl(constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));
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
			initial: '0ms',
			elapsed: '2s',
			initialDetails: '0ms',
			elapsedDetails: '2s',
			sameDetails: true,
			empty: undefined,
		});
	}));

	test('updates shell rows independently of turns and exposes the full command as plain text', () => {
		const shell: IChatBackgroundShell = {
			id: 'silent', description: 'Run tests', command: 'npm test -- --grep "<script>"',
			startedAt: new Date(0).toISOString(), attachmentMode: 'attached',
		};
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [shell]);
		const control = store.add(new SessionBackgroundShellsControl(constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));
		const entry = control.sections.get()[0].entries[0];
		const details = entry.hover?.content;
		assert.ok(isHTMLElement(details));
		shells.set([{ ...shell, attachmentMode: 'detached' }], undefined);
		const updated = control.sections.get()[0].entries[0];
		shells.set([], undefined);

		assert.deepStrictEqual({
			entry: { id: entry.id, label: entry.label, detached: entry.badge?.startsWith('Detached, ') },
			updated: updated.badge?.startsWith('Detached, '),
			plainCommand: details.textContent?.includes(shell.command),
			noMarkup: details.querySelector('script') === null,
			liveDetails: details.firstElementChild?.textContent?.startsWith('Detached, '),
			sameDetails: updated.hover?.content === details,
			expandable: updated.hover?.expandable,
			aboveInput: updated.hover?.alignToParentBottom,
			empty: control.sections.get(),
		}, {
			entry: { id: 'silent', label: 'Run tests', detached: false },
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

	test('labels only detached shells, treating an unlabeled shell as attached', () => runWithFakedTimers({}, async () => {
		const startedAt = new Date(0).toISOString();
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [
			{ id: 'attached', description: 'Watch', command: 'npm run watch', startedAt, attachmentMode: 'attached' },
			{ id: 'detached', description: 'Serve', command: 'npm start', startedAt, attachmentMode: 'detached' },
			{ id: 'unknown', description: 'Build', command: 'npm run build', startedAt },
		]);
		const control = store.add(new SessionBackgroundShellsControl(constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));

		assert.deepStrictEqual(control.sections.get()[0].entries.map(entry => entry.badge), ['0ms', 'Detached, 0ms', '0ms']);
	}));

	test('keys rows by entry id and shows the shell ID only when the agent reports one', () => {
		const startedAt = new Date(0).toISOString();
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [
			{ id: 'shell:3', shellId: '3', description: 'Run tests', command: 'npm test', startedAt },
			{ id: 'build', description: 'Build', command: 'npm run build', startedAt },
		]);
		const control = store.add(new SessionBackgroundShellsControl(constObservable<IChatBackgroundShellsSource>({ backgroundShells: shells })));

		assert.deepStrictEqual(control.sections.get()[0].entries.map(entry => {
			const details = entry.hover?.content;
			return {
				id: entry.id,
				described: entry.ariaDescription?.split('\n').filter(line => line.startsWith('Shell ID')),
				shown: isHTMLElement(details) ? details.textContent?.includes('Shell ID') : undefined,
			};
		}), [
			{ id: 'shell:3', described: ['Shell ID: 3'], shown: true },
			{ id: 'build', described: [], shown: false },
		]);
	});

	test('does not show shells from a previously viewed chat or an unsupported provider', () => {
		const createChat = (command: string): IChatBackgroundShellsSource => ({
			backgroundShells: constObservable<readonly IChatBackgroundShell[]>([{
				id: 'shared-id', description: command, command,
				startedAt: new Date(0).toISOString(), attachmentMode: 'attached',
			}]),
		});
		const current = observableValue<IChatBackgroundShellsSource | undefined>('chat', createChat('npm test'));
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
