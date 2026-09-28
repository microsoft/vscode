/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INewSessionComposer, INewSessionOptionSummaryProvider, NewSessionComposerService } from '../../browser/newSessionComposerService.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
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

	test('aggregates non-default option summaries and releases disposed providers', () => {
		const service = disposables.add(new NewSessionComposerService());
		const firstChanged = disposables.add(new Emitter<void>());
		const first: INewSessionOptionSummaryProvider = {
			onDidChange: firstChanged.event,
			getNonDefaultOptions: () => [{ id: 'harness', label: 'Cloud' }],
		};
		const second: INewSessionOptionSummaryProvider = {
			onDidChange: Event.None,
			getNonDefaultOptions: () => [{ id: 'isolation', label: 'Branch' }],
		};
		const changes: number[] = [];
		disposables.add(service.onDidChangeOptionSummaries(() => changes.push(changes.length + 1)));
		const firstRegistration = service.registerOptionSummaryProvider(first);
		disposables.add(service.registerOptionSummaryProvider(second));

		const session = {} as Parameters<typeof service.getNonDefaultOptions>[0];
		const registered = service.getNonDefaultOptions(session);
		firstChanged.fire();
		firstRegistration.dispose();
		firstChanged.fire();
		const remaining = service.getNonDefaultOptions(session);

		assert.deepStrictEqual({ registered, remaining, changeCount: changes.length }, {
			registered: [{ id: 'harness', label: 'Cloud' }, { id: 'isolation', label: 'Branch' }],
			remaining: [{ id: 'isolation', label: 'Branch' }],
			changeCount: 4,
		});
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
