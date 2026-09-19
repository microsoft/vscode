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
import { autorun } from '../../../../../base/common/observable.js';
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
});
