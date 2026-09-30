/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NotebookKernelService } from '../../browser/services/notebookKernelServiceImpl.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { INotebookService } from '../../common/notebookService.js';
import { setupInstantiationService } from './testNotebookEditor.js';

suite('Notebook kernel source menu lifetime', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let service: NotebookKernelService;
	let onWillRemoveNotebook: Emitter<NotebookTextModel>;
	let contextKeyService: IContextKeyService;
	let commandResult: Promise<void>;

	setup(() => {
		instantiationService = setupInstantiationService(disposables);
		onWillRemoveNotebook = disposables.add(new Emitter<NotebookTextModel>());
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override readonly onDidAddNotebookDocument = Event.None;
			override readonly onWillRemoveNotebookDocument = onWillRemoveNotebook.event;
		});
		commandResult = Promise.resolve();
		const commandService = new class extends mock<ICommandService>() {
			override executeCommand<T>(): Promise<T> { return commandResult as Promise<T>; }
		};
		instantiationService.stub(IMenuService, disposables.add(new MenuService(commandService, new MockKeybindingService(), disposables.add(new InMemoryStorageService()))));
		contextKeyService = instantiationService.get(IContextKeyService);
		service = disposables.add(instantiationService.createInstance(NotebookKernelService));
		disposables.add(MenuRegistry.appendMenuItem(MenuId.NotebookKernelSource, { command: { id: 'test.notebookSource', title: 'Test Kernel', precondition: ContextKeyExpr.equals('testNotebookKernelEnabled', true) } }));
	});

	function createNotebook(path = 'closed'): NotebookTextModel {
		return instantiationService.createInstance(NotebookTextModel, 'test-notebook', URI.parse(`test:///${path}`), [], {}, {
			transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}
		});
	}

	function closeNotebook(notebook: NotebookTextModel): void {
		onWillRemoveNotebook.fire(notebook);
		notebook.dispose();
	}

	test('reopening a notebook creates source actions with its current context', () => {
		const enabled = contextKeyService.createKey<boolean>('testNotebookKernelEnabled', false);
		const first = createNotebook();
		const initial = service.getSourceActions(first, contextKeyService).find(source => source.action.id === 'test.notebookSource')!.action.enabled;
		closeNotebook(first);
		enabled.set(true);
		const reopened = createNotebook();
		try {
			const current = service.getSourceActions(reopened, contextKeyService).find(source => source.action.id === 'test.notebookSource')!.action.enabled;
			assert.deepStrictEqual([initial, current], [false, true]);
		} finally {
			closeNotebook(reopened);
		}
	});

	test('callers can change the returned action list without changing the cache', () => {
		const notebook = createNotebook();
		try {
			const actions = service.getSourceActions(notebook, contextKeyService);
			actions.length = 0;
			assert.deepStrictEqual(service.getSourceActions(notebook, contextKeyService).map(source => source.action.id), ['test.notebookSource']);
		} finally {
			closeNotebook(notebook);
		}
	});

	test('closing one notebook preserves another notebook source action', async () => {
		contextKeyService.createKey('testNotebookKernelEnabled', true);
		const closing = createNotebook('closing');
		const remaining = createNotebook('remaining');
		service.getSourceActions(closing, contextKeyService);
		const action = service.getSourceActions(remaining, contextKeyService)[0];
		closeNotebook(closing);
		let updates = 0;
		disposables.add(action.onDidChangeState(() => updates++));
		try {
			await action.runAction();
			assert.deepStrictEqual([service.getSourceActions(remaining, contextKeyService)[0] === action, updates], [true, 2]);
		} finally {
			closeNotebook(remaining);
		}
	});

	test('menu refresh disposes obsolete source action events', async () => {
		contextKeyService.createKey('testNotebookKernelEnabled', true);
		const notebook = createNotebook();
		const oldAction = service.getSourceActions(notebook, contextKeyService)[0];
		let updates = 0;
		disposables.add(oldAction.onDidChangeState(() => updates++));
		try {
			const refreshed = Event.toPromise(service.onDidChangeSourceActions);
			disposables.add(MenuRegistry.appendMenuItem(MenuId.NotebookKernelSource, { command: { id: 'test.anotherNotebookSource', title: 'Another Kernel' } }));
			await refreshed;
			await oldAction.runAction();
			assert.deepStrictEqual({
				updates,
				hasNewAction: service.getSourceActions(notebook, contextKeyService).some(source => source.action.id === 'test.anotherNotebookSource')
			}, { updates: 0, hasNewAction: true });
		} finally {
			closeNotebook(notebook);
		}
	});

	test('an in-flight source command can complete after its notebook closes', async () => {
		contextKeyService.createKey('testNotebookKernelEnabled', true);
		const pending = new DeferredPromise<void>();
		commandResult = pending.p;
		const notebook = createNotebook();
		const action = service.getSourceActions(notebook, contextKeyService)[0];
		const execution = action.runAction();
		const runningBeforeClose = service.getRunningSourceActions(notebook).length;
		closeNotebook(notebook);
		const runningAfterClose = service.getRunningSourceActions(notebook).length;
		await pending.complete();
		await execution;
		assert.deepStrictEqual([runningBeforeClose, runningAfterClose, action.execution], [1, 0, undefined]);
	});

	test('service shutdown disposes live source action events', async () => {
		contextKeyService.createKey('testNotebookKernelEnabled', true);
		const notebook = createNotebook();
		const action = service.getSourceActions(notebook, contextKeyService)[0];
		let updates = 0;
		disposables.add(action.onDidChangeState(() => updates++));
		try {
			service.dispose();
			await action.runAction();
			assert.strictEqual(updates, 0);
		} finally {
			closeNotebook(notebook);
		}
	});
});
