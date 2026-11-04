/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INewSessionComposer, NewSessionComposerService } from '../../browser/newSessionComposerService.js';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { IWorkspaceSelectionSnapshot, WorkspaceSelectionOrigin } from '../../../../common/workspaceSelection.js';
import { URI } from '../../../../../base/common/uri.js';

suite('NewSessionComposerService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function composer(): INewSessionComposer {
		return {
			animatePrompt: async (_text, _durationMs, _placeholder, _token: CancellationToken) => true,
			showPromptOptions: () => true,
		};
	}

	test('tracks the newest mounted composer and falls back when it is disposed', () => {
		const store = disposables.add(new DisposableStore());
		const service = store.add(new NewSessionComposerService());
		const first = composer();
		const second = composer();
		store.add(service.registerComposer(first));
		const secondRegistration = service.registerComposer(second);

		const newest = service.activeComposer.get() === second;
		secondRegistration.dispose();

		assert.deepStrictEqual({ newest, fallback: service.activeComposer.get() === first }, { newest: true, fallback: true });
	});

	test('observes workspace changes and releases replaced composer listeners', () => {
		const service = disposables.add(new NewSessionComposerService());
		const changed = disposables.add(new Emitter<void>());
		const selection: IWorkspaceSelectionSnapshot = {
			folderUri: URI.file('/private/workspace'), state: 'selected', origin: WorkspaceSelectionOrigin.VSCodeRecent,
			historyState: 'loaded', sessionFallbackState: 'idle', registeredProviderCount: 1,
		};
		let currentSelection: IWorkspaceSelectionSnapshot | undefined;
		const first = { ...composer(), get workspaceSelection() { return currentSelection; }, onDidChangeWorkspaceSelection: changed.event };
		disposables.add(service.registerComposer(first));
		const snapshots: (WorkspaceSelectionOrigin | undefined)[] = [];
		disposables.add(autorun(reader => snapshots.push(service.workspaceSelection.read(reader)?.origin)));
		currentSelection = selection;
		changed.fire();
		const replacement = disposables.add(service.registerComposer(composer()));
		currentSelection = { ...selection, origin: WorkspaceSelectionOrigin.WindowOpen };
		changed.fire();
		replacement.dispose();
		service.notifyUserWorkspaceSelection();
		assert.deepStrictEqual({ snapshots, userVersion: service.userWorkspaceSelectionVersion.get() }, {
			snapshots: [undefined, WorkspaceSelectionOrigin.VSCodeRecent, undefined, WorkspaceSelectionOrigin.WindowOpen],
			userVersion: 1,
		});
	});

	test('routes model picker actions back to the normal composer after Inbox is hidden', () => {
		const service = disposables.add(new NewSessionComposerService());
		const inboxVisible = observableValue('inboxVisible', false);
		const opened: string[] = [];
		const normal = { ...composer(), modelPicker: { getDomNode: () => undefined, open: () => opened.push('normal') } };
		const inbox = { ...composer(), modelPicker: { getDomNode: () => undefined, open: () => opened.push('inbox') } };
		disposables.add(service.registerComposer(normal));
		const registration = disposables.add(service.registerComposer(inbox, inboxVisible));
		service.activeComposer.get()?.modelPicker?.open();
		inboxVisible.set(true, undefined);
		service.activeComposer.get()?.modelPicker?.open();
		inboxVisible.set(false, undefined);
		service.activeComposer.get()?.modelPicker?.open();
		inboxVisible.set(true, undefined);
		registration.dispose();
		service.activeComposer.get()?.modelPicker?.open();
		inboxVisible.set(false, undefined);
		inboxVisible.set(true, undefined);
		assert.deepStrictEqual({ opened, active: service.activeComposer.get() === normal }, {
			opened: ['normal', 'inbox', 'normal', 'normal'], active: true,
		});
	});

	test('focus selects a visible composer and hiding it restores the last visible one', () => {
		const service = disposables.add(new NewSessionComposerService());
		const firstFocus = disposables.add(new Emitter<void>());
		const secondFocus = disposables.add(new Emitter<void>());
		const firstVisible = observableValue('firstVisible', true);
		const secondVisible = observableValue('secondVisible', true);
		const first = { ...composer(), onDidFocus: firstFocus.event };
		const second = { ...composer(), onDidFocus: secondFocus.event };
		disposables.add(service.registerComposer(first, firstVisible));
		disposables.add(service.registerComposer(second, secondVisible));
		const states: string[] = [];
		disposables.add(autorun(reader => {
			const active = service.activeComposer.read(reader);
			states.push(active === first ? 'first' : active === second ? 'second' : 'none');
		}));
		firstFocus.fire();
		firstVisible.set(false, undefined);
		firstFocus.fire();
		secondVisible.set(false, undefined);
		secondFocus.fire();
		firstVisible.set(true, undefined);
		assert.deepStrictEqual(states, ['second', 'first', 'second', 'none', 'first']);
	});

	test('hidden composers still protect their unsent drafts', () => {
		const service = disposables.add(new NewSessionComposerService());
		const resource = URI.parse('test:/hidden-draft');
		const changed = disposables.add(new Emitter<void>());
		const hidden = observableValue('visible', false);
		const registration = disposables.add(service.registerComposer({
			...composer(),
			sessionResource: observableValue('sessionResource', resource),
			hasInput: true,
			onDidChangeInput: changed.event,
		}, hidden));
		changed.fire();
		const before = {
			active: service.activeComposer.get(),
			hasDraft: service.hasDraftInputForSession(resource),
			inputState: service.getDraftInputStateForSession(resource),
			version: service.draftInputVersion.get(),
		};
		registration.dispose();
		changed.fire();
		assert.deepStrictEqual({ before, hasDraft: service.hasDraftInputForSession(resource), version: service.draftInputVersion.get() }, {
			before: { active: undefined, hasDraft: true, inputState: true, version: 1 },
			hasDraft: false, version: 1,
		});
	});

	test('tracks draft input changes and excludes unready composers from live content checks', () => {
		const service = disposables.add(new NewSessionComposerService());
		const changed = disposables.add(new Emitter<void>());
		let ready = false;
		let hasInput = false;
		const registration = service.registerComposer({
			...composer(),
			get isInputReady() { return ready; },
			get hasInput() { return hasInput; },
			onDidChangeInput: changed.event,
		});
		const beforeReady = service.hasDraftInput;
		ready = true;
		const empty = service.hasDraftInput;
		hasInput = true;
		changed.fire();
		const occupied = service.hasDraftInput;
		const scopedOccupied = service.getDraftInputStateForSession(undefined);
		const draftInputVersion = service.draftInputVersion.get();
		registration.dispose();
		changed.fire();
		assert.deepStrictEqual({ beforeReady, empty, occupied, scopedOccupied, draftInputVersion, disposed: service.hasDraftInput, version: service.inputVersion.get() }, {
			beforeReady: undefined, empty: false, occupied: true, scopedOccupied: true, draftInputVersion: 1, disposed: undefined, version: 3,
		});
	});

	test('scopes draft input to its session and observes composer retargeting', () => {
		const service = disposables.add(new NewSessionComposerService());
		const first = URI.parse('test:/first');
		const second = URI.parse('test:/second');
		const resource = observableValue('sessionResource', first);
		const changed = disposables.add(new Emitter<void>());
		let ready = false;
		let input = '';
		let attachments = 0;
		const registration = disposables.add(service.registerComposer({
			...composer(),
			sessionResource: resource,
			get isInputReady() { return ready; },
			get hasInput() { return !!input || attachments > 0; },
			onDidChangeInput: changed.event,
		}));
		const values: boolean[][] = [];
		disposables.add(autorun(reader => {
			service.inputVersion.read(reader);
			values.push([service.hasDraftInputForSession(first), service.hasDraftInputForSession(second)]);
		}));
		ready = true;
		changed.fire();
		input = 'Unsent message';
		changed.fire();
		resource.set(second, undefined);
		input = '';
		attachments = 1;
		changed.fire();
		attachments = 0;
		changed.fire();
		registration.dispose();
		assert.deepStrictEqual(values, [
			[true, false], [false, false], [true, false], [false, true], [false, true], [false, false], [false, false],
		]);
	});
});
