/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChatWindowTerminalHost } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowService } from '../../browser/chatWindowService.js';

suite('Chat window - empty terminal row', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(disposables: DisposableStore) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly windowSessions = observableValue('windowSessions', []);
		}());
		return disposables.add(instantiationService.createInstance(ChatWindowService));
	}

	function createWindow() {
		const terminalGroup = observableValue<IEditorGroup | undefined>('terminalGroup', undefined);
		const removed: IEditorGroup[] = [];
		const row = new class extends mock<IEditorGroup>() {
			override readonly id = 7;
			override readonly isEmpty = true;
			override readonly scopedContextKeyService = instantiationServiceContext();
			override readonly onWillMoveEditor = Event.None;
			override readonly onDidCloseEditor = Event.None;
			override lock() { }
		}();
		const window = {
			editorGroup: {},
			content: observableValue('content', { editorArea: true }),
			state: { terminalGroup },
			chatGroup: {},
			part: {
				addGroup: () => row,
				removeGroup: (group: IEditorGroup) => { removed.push(group); },
			},
		};
		return { window, terminalGroup, removed, row };
	}

	function instantiationServiceContext() {
		const disposables = store.add(new DisposableStore());
		return workbenchInstantiationService(undefined, disposables).get(IContextKeyService);
	}

	test('a row shown with no terminal to show hides, also when the host returns early', async () => {
		const disposables = store.add(new DisposableStore());
		const service = createService(disposables);
		const host: IChatWindowTerminalHost = { show: async () => false, hide: () => { }, release: () => { } };
		disposables.add(service.registerTerminalHost(host));
		const { window, terminalGroup, removed, row } = createWindow();

		await service.setTerminalShown(window as never, true, false);

		assert.deepStrictEqual({ shown: terminalGroup.get() === row, removed: removed.length }, { shown: false, removed: 1 });
	});

	test('a restored empty row hides when the host that registers late has no terminal to show', async () => {
		const disposables = store.add(new DisposableStore());
		const service = createService(disposables);
		const { window, terminalGroup, removed, row } = createWindow();
		await service.setTerminalShown(window as never, true, false);
		assert.strictEqual(terminalGroup.get(), row);

		const shows: boolean[] = [];
		service.showTerminalAgain(window as never);
		disposables.add(service.registerTerminalHost({ show: async () => { shows.push(true); return false; }, hide: () => { }, release: () => { } }));
		service.showTerminalAgain(window as never);
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({ shows: shows.length, shown: terminalGroup.get() === row, removed: removed.length }, { shows: 1, shown: false, removed: 1 });
	});

	test('a row whose terminal opens a moment after the host handed it over stays', async () => {
		const disposables = store.add(new DisposableStore());
		const service = createService(disposables);
		disposables.add(service.registerTerminalHost({ show: async () => true, hide: () => { }, release: () => { } }));
		const { window, terminalGroup, removed, row } = createWindow();

		await service.setTerminalShown(window as never, true, false);
		await new Promise(resolve => setTimeout(resolve, 0));

		const result = { shown: terminalGroup.get() === row, removed: removed.length };
		await service.setTerminalShown(window as never, false, false);

		assert.deepStrictEqual(result, { shown: true, removed: 0 });
	});
});
