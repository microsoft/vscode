/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from 'vs/workbench/contrib/notebook/test/browser/testNotebookEditor';
import { Emitter, Event } from 'vs/base/common/event';
import { INotebookKernel, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { NotebookKernelService } from 'vs/workbench/contrib/notebook/browser/services/notebookKernelServiceImpl';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { mock } from 'vs/base/test/common/mock';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { NotebookKernelHistoryService } from 'vs/workbench/contrib/notebook/browser/services/notebookKernelHistoryServiceImpl';
import { IApplicationStorageValueChangeEvent, IProfileStorageValueChangeEvent, IStorageService, IStorageValueChangeEvent, IWillSaveStateEvent, IWorkspaceStorageValueChangeEvent, StorageScope } from 'vs/platform/storage/common/storage';
import { INotebookLoggingService } from 'vs/workbench/contrib/notebook/common/notebookLoggingService';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('NotebookKernelHistoryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let kernelService: INotebookKernelService;

	let onDidAddNotebookDocument: Emitter<NotebookTextModel>;

	setup(function () {

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

		const k1 = new TestNotebookKernel({ label: 'z', viewType: 'foo' });
		const k2 = new TestNotebookKernel({ label: 'a', viewType: 'foo' });

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

		let info = kernelHistoryService.getKernels({ uri: u1, viewType: 'foo' });
		assert.equal(info.all.length, 0);
		assert.ok(!info.selected);

		// update priorities for u1 notebook
		kernelService.updateKernelNotebookAffinity(k2, u1, 2);

		info = kernelHistoryService.getKernels({ uri: u1, viewType: 'foo' });
		assert.equal(info.all.length, 0);
		// MRU only auto selects kernel if there is only one
		assert.deepStrictEqual(info.selected, undefined);
	});

	test('notebook kernel history restore', function () {

		const u1 = URI.parse('foo:///one');

		const k1 = new TestNotebookKernel({ label: 'z', viewType: 'foo' });
		const k2 = new TestNotebookKernel({ label: 'a', viewType: 'foo' });
		const k3 = new TestNotebookKernel({ label: 'b', viewType: 'foo' });

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
		let info = kernelHistoryService.getKernels({ uri: u1, viewType: 'foo' });
		assert.equal(info.all.length, 1);
		assert.deepStrictEqual(info.selected, undefined);

		kernelHistoryService.addMostRecentKernel(k3);
		info = kernelHistoryService.getKernels({ uri: u1, viewType: 'foo' });
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

	constructor(opts?: { languages?: string[]; label?: string; viewType?: string }) {
		this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
		this.label = opts?.label ?? this.label;
		this.viewType = opts?.viewType ?? this.viewType;
	}
}
