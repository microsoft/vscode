/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
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
		let keeping = false;
		let addedWhileKeeping = false;
		let removedWhileKeeping = false;
		const rowClosed = store.add(new Emitter<never>());
		const added = store.add(new Emitter<IEditorGroup>());
		const merged: IEditorGroup[] = [];
		const row = new class extends mock<IEditorGroup>() {
			override readonly id = 7;
			override isEmpty = true;
			override readonly scopedContextKeyService = instantiationServiceContext();
			override readonly onWillMoveEditor = Event.None;
			override readonly onDidCloseEditor = rowClosed.event as never;
			override lock() { }
		}();
		const window = {
			editorGroup: {},
			content: observableValue('content', { editorArea: true }),
			state: { terminalGroup, keepLayoutWhile: <T>(fn: () => T) => { keeping = true; try { return fn(); } finally { keeping = false; } } },
			chatGroup: {},
			part: {
				activeGroup: row,
				onDidAddGroup: added.event,
				onDidRemoveGroup: Event.None,
				mergeGroup: (group: IEditorGroup) => { merged.push(group); row.isEmpty = false; return true; },
				addGroup: () => { addedWhileKeeping = keeping; return row; },
				removeGroup: (group: IEditorGroup) => { removedWhileKeeping = keeping; removed.push(group); },
			},
		};
		return { window, terminalGroup, removed, row, rowClosed, added, merged, addedWhileKeeping: () => addedWhileKeeping, removedWhileKeeping: () => removedWhileKeeping };
	}

	function instantiationServiceContext() {
		const disposables = store.add(new DisposableStore());
		return workbenchInstantiationService(undefined, disposables).get(IContextKeyService);
	}

	test('a row shown with no terminal to show hides, also when the host returns early', async () => {
		const disposables = store.add(new DisposableStore());
		const service = createService(disposables);
		const host: IChatWindowTerminalHost = { show: async () => false, hide: () => { }, release: () => { }, newTerminal: async () => true };
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
		disposables.add(service.registerTerminalHost({ show: async () => { shows.push(true); return false; }, hide: () => { }, release: () => { }, newTerminal: async () => true }));
		service.showTerminalAgain(window as never);
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({ shows: shows.length, shown: terminalGroup.get() === row, removed: removed.length }, { shows: 1, shown: false, removed: 1 });
	});

	test('a row whose terminal opens a moment after the host handed it over stays', async () => {
		const disposables = store.add(new DisposableStore());
		const service = createService(disposables);
		disposables.add(service.registerTerminalHost({ show: async () => true, hide: () => { }, release: () => { }, newTerminal: async () => true }));
		const { window, terminalGroup, removed, row } = createWindow();

		await service.setTerminalShown(window as never, true, false);
		await new Promise(resolve => setTimeout(resolve, 0));

		const result = { shown: terminalGroup.get() === row, removed: removed.length };
		await service.setTerminalShown(window as never, false, false);

		assert.deepStrictEqual(result, { shown: true, removed: 0 });
	});

	test('a row hides when the host fails to show its terminal', async () => {
		const disposables = store.add(new DisposableStore());
		const service = createService(disposables);
		disposables.add(service.registerTerminalHost({ show: async () => { throw new Error('no terminal'); }, hide: () => { }, release: () => { }, newTerminal: async () => true }));
		const { window, terminalGroup, removed } = createWindow();

		await assert.rejects(service.setTerminalShown(window as never, true, false), /no terminal/);

		assert.deepStrictEqual({ shown: !!terminalGroup.get(), removed: removed.length }, { shown: false, removed: 1 });
	});

	test('adds the row keeping the layout of the window, so closing its terminal leaves no empty editor group behind', async () => {
		const disposables = store.add(new DisposableStore());
		const service = createService(disposables);
		const host: IChatWindowTerminalHost = { show: async () => true, hide: () => { }, release: () => { }, newTerminal: async () => true };
		disposables.add(service.registerTerminalHost(host));
		const { window, addedWhileKeeping, removedWhileKeeping } = createWindow();

		await service.setTerminalShown(window as never, true, false);
		const added = addedWhileKeeping();
		await service.setTerminalShown(window as never, false, false);

		assert.deepStrictEqual({ added, removed: removedWhileKeeping() }, { added: true, removed: true });
	});

	function createSplit(empty: boolean) {
		const closed = store.add(new Emitter<never>());
		const split = new class extends mock<IEditorGroup>() {
			override id = 8;
			override isEmpty = empty;
			override readonly onDidCloseEditor = closed.event as never;
		}();
		return { split, closed };
	}

	async function showRowWithSplit(fill: boolean, openTerminal = true) {
		const disposables = store.add(new DisposableStore());
		const service = createService(disposables);
		const opened: IEditorGroup[] = [];
		disposables.add(service.registerTerminalHost({ show: async () => true, hide: () => { }, release: () => { }, newTerminal: async (_window, group) => { opened.push(group); return openTerminal; } }));
		const w = createWindow();
		await service.setTerminalShown(w.window as never, true, false);
		disposables.add(toDisposable(() => void service.setTerminalShown(w.window as never, false, false)));
		w.row.isEmpty = false;
		const { split, closed } = createSplit(!fill);
		w.added.fire(split);
		await new Promise(resolve => setTimeout(resolve, 0));
		await new Promise(resolve => setTimeout(resolve, 0));
		return { service, ...w, split, closed, opened };
	}

	test('a group split off the row opens a terminal when it stays empty, and none when it already has one', async () => {
		const empty = await showRowWithSplit(false);
		const filled = await showRowWithSplit(true);

		assert.deepStrictEqual({ empty: empty.opened.length, filled: filled.opened.length }, { empty: 1, filled: 0 });
	});

	test('a split of the row that no terminal opens in closes, and the terminal of the row stays', async () => {
		const t = await showRowWithSplit(false, false);

		assert.deepStrictEqual({ removed: t.removed, row: t.terminalGroup.get() === t.row }, { removed: [t.split], row: true });
	});

	test('closing the terminal of the second split closes its group', async () => {
		const t = await showRowWithSplit(true);
		(t.split as { isEmpty: boolean }).isEmpty = true;
		t.closed.fire(undefined as never);

		assert.deepStrictEqual({ removed: t.removed, row: t.terminalGroup.get() === t.row }, { removed: [t.split], row: true });
	});

	test('closing the terminal of the first group hands its place to the split, which takes the whole row', async () => {
		const t = await showRowWithSplit(true);
		t.row.isEmpty = true;
		t.rowClosed.fire(undefined as never);

		assert.deepStrictEqual({ merged: t.merged, removed: t.removed, row: t.terminalGroup.get() === t.row }, { merged: [t.split], removed: [], row: true });
	});

	test('closing the last terminal of the row and its split closes the row', async () => {
		const t = await showRowWithSplit(true);
		t.row.isEmpty = true;
		(t.split as { isEmpty: boolean }).isEmpty = true;
		t.rowClosed.fire(undefined as never);

		assert.deepStrictEqual({ removed: t.removed.includes(t.row), row: !!t.terminalGroup.get() }, { removed: true, row: false });
	});
});
