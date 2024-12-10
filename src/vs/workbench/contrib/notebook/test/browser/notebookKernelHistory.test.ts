/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { setupInstantiationService } from './testNotebookEditor.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { INotebookKernel, INotebookKernelService, VariablesResult } from '../../common/notebookKernelService.js';
import { NotebookKernelService } from '../../browser/services/notebookKernelServiceImpl.js';
import { INotebookService } from '../../common/notebookService.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { IMenu, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { NotebookKernelHistoryService } from '../../browser/services/notebookKernelHistoryServiceImpl.js';
import { IApplicationStorageValueChangeEvent, IProfileStorageValueChangeEvent, IStorageService, IStorageValueChangeEvent, IWillSaveStateEvent, IWorkspaceStorageValueChangeEvent, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { AsyncIterableObject } from '../../../../../base/common/async.js';

suite('NotebookKernelHistoryService', () => {

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let kernelService: INotebookKernelService;

	let onDidAddNotebookDocument: Emitter<NotebookTextModel>;

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		disposables = new DisposableStore();
		onDidAddNotebookDocument = new Emitter();
		disposables.add(onDidAddNotebookDocument);

		instantiationService = setupInstantiationService(disposables);
		instantiationService.stub(INotebookService, new class extends mock<INotebookService>() {
			override onDidAddNotebookDocument = onDidAddNotebookDocument.event;
			override onWillRemoveNotebookDocument = Event.None;
			override getNotebookTextModels() { return []; }
		});
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu() {
				return new class extends mock<IMenu>() {
					override onDidChange = Event.None;
					override getActions() { return []; }
					override dispose() { }
				};
			}
		});
		kernelService = disposables.add(instantiationService.createInstance(NotebookKernelService));
		instantiationService.set(INotebookKernelService, kernelService);
	});

	test('notebook kernel empty history', function () {

		const u1 = URI.parse('foo:///one');

		const k1 = new TestNotebookKernel({ label: 'z', notebookType: 'foo' });
		const k2 = new TestNotebookKernel({ label: 'a', notebookType: 'foo' });

		disposables.add(kernelService.registerKernel(k1));
		disposables.add(kernelService.registerKernel(k2));

		instantiationService.stub(IStorageService, new class extends mock<IStorageService>() {
			override onWillSaveState: Event<IWillSaveStateEvent> = Event.None;
			override onDidChangeValue(scope: StorageScope.WORKSPACE, key: string | undefined, disposable: DisposableStore): Event<IWorkspaceStorageValueChangeEvent>;
			override onDidChangeValue(scope: StorageScope.PROFILE, key: string | undefined, disposable: DisposableStore): Event<IProfileStorageValueChangeEvent>;
			override onDidChangeValue(scope: StorageScope.APPLICATION, key: string | undefined, disposable: DisposableStore): Event<IApplicationStorageValueChangeEvent>;
			override onDidChangeValue(scope: StorageScope, key: string | undefined, disposable: DisposableStore): Event<IStorageValueChangeEvent> {
				return Event.None;
			}
			override get(key: string, scope: StorageScope, fallbackValue: string): string;
			override get(key: string, scope: StorageScope, fallbackValue?: string | undefined): string | undefined;
			override get(key: unknown, scope: unknown, fallbackValue?: unknown): string | undefined {
				if (key === 'notebook.kernelHistory') {
					return JSON.stringify({
						'foo': {
							'entries': []
						}
					});
				}

				return undefined;
			}
		});

		instantiationService.stub(INotebookLoggingService, new class extends mock<INotebookLoggingService>() {
			override info() { }
			override debug() { }
		});

		const kernelHistoryService = disposables.add(instantiationService.createInstance(NotebookKernelHistoryService));

		let info = kernelHistoryService.getKernels({ uri: u1, notebookType: 'foo' });
		assert.equal(info.all.length, 0);
		assert.ok(!info.selected);

		// update priorities for u1 notebook
		kernelService.updateKernelNotebookAffinity(k2, u1, 2);

		info = kernelHistoryService.getKernels({ uri: u1, notebookType: 'foo' });
		assert.equal(info.all.length, 0);
		// MRU only auto selects kernel if there is only one
		assert.deepStrictEqual(info.selected, undefined);
	});

	test('notebook kernel history restore', function () {

		const u1 = URI.parse('foo:///one');

		const k1 = new TestNotebookKernel({ label: 'z', notebookType: 'foo' });
		const k2 = new TestNotebookKernel({ label: 'a', notebookType: 'foo' });
		const k3 = new TestNotebookKernel({ label: 'b', notebookType: 'foo' });

		disposables.add(kernelService.registerKernel(k1));
		disposables.add(kernelService.registerKernel(k2));
		disposables.add(kernelService.registerKernel(k3));

		instantiationService.stub(IStorageService, new class extends mock<IStorageService>() {
			override onWillSaveState: Event<IWillSaveStateEvent> = Event.None;
			override onDidChangeValue(scope: StorageScope.WORKSPACE, key: string | undefined, disposable: DisposableStore): Event<IWorkspaceStorageValueChangeEvent>;
			override onDidChangeValue(scope: StorageScope.PROFILE, key: string | undefined, disposable: DisposableStore): Event<IProfileStorageValueChangeEvent>;
			override onDidChangeValue(scope: StorageScope.APPLICATION, key: string | undefined, disposable: DisposableStore): Event<IApplicationStorageValueChangeEvent>;
			override onDidChangeValue(scope: StorageScope, key: string | undefined, disposable: DisposableStore): Event<IStorageValueChangeEvent> {
				return Event.None;
			}
			override get(key: string, scope: StorageScope, fallbackValue: string): string;
			override get(key: string, scope: StorageScope, fallbackValue?: string | undefined): string | undefined;
			override get(key: unknown, scope: unknown, fallbackValue?: unknown): string | undefined {
				if (key === 'notebook.kernelHistory') {
					return JSON.stringify({
						'foo': {
							'entries': [
								k2.id
							]
						}
					});
				}

				return undefined;
			}
		});

		instantiationService.stub(INotebookLoggingService, new class extends mock<INotebookLoggingService>() {
			override info() { }
			override debug() { }
		});

		const kernelHistoryService = disposables.add(instantiationService.createInstance(NotebookKernelHistoryService));
		let info = kernelHistoryService.getKernels({ uri: u1, notebookType: 'foo' });
		assert.equal(info.all.length, 1);
		assert.deepStrictEqual(info.selected, undefined);

		kernelHistoryService.addMostRecentKernel(k3);
		info = kernelHistoryService.getKernels({ uri: u1, notebookType: 'foo' });
		assert.deepStrictEqual(info.all, [k3, k2]);
	});
});

class TestNotebookKernel implements INotebookKernel {
	id: string = Math.random() + 'kernel';
	label: string = 'test-label';
	viewType = '*';
	onDidChange = Event.None;
	extension: ExtensionIdentifier = new ExtensionIdentifier('test');
	localResourceRoot: URI = URI.file('/test');
	description?: string | undefined;
	detail?: string | undefined;
	preloadUris: URI[] = [];
	preloadProvides: string[] = [];
	supportedLanguages: string[] = [];
	executeNotebookCellsRequest(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	cancelNotebookCellExecution(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	provideVariables(notebookUri: URI, parentId: number | undefined, kind: 'named' | 'indexed', start: number, token: CancellationToken): AsyncIterableObject<VariablesResult> {
		return AsyncIterableObject.EMPTY;
	}

	constructor(opts?: { languages?: string[]; label?: string; notebookType?: string }) {
		this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
		this.label = opts?.label ?? this.label;
		this.viewType = opts?.notebookType ?? this.viewType;
	}
}
