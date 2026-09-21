/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationError, errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { observableValue, ValueWithChangeEventFromObservable, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ITextFileEditorModelManager, ITextFileService, TextFileOperationError, TextFileOperationResult } from '../../../../services/textfile/common/textfiles.js';
import { MultiDiffEditorInput } from '../../browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from '../../browser/multiDiffSourceResolverService.js';

suite('MultiDiffEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createOnDemandInput(resources: readonly MultiDiffEditorItem[], resolve: (resource: URI) => Promise<IReference<IResolvedTextEditorModel>>, textFileService?: ITextFileService) {
		const services = new ServiceCollection();
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(ITextModelService, new class extends mock<ITextModelService>() {
			override createModelReference(resource: URI) {
				return resolve(resource);
			}
		});
		services.set(ITextResourceConfigurationService, new class extends mock<ITextResourceConfigurationService>() {
			override readonly onDidChangeConfiguration = Event.None;
			override getValue<T>(): T { return {} as T; }
		});
		services.set(ITextFileService, textFileService ?? new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			};
		});
		services.set(IMultiDiffSourceResolverService, new class extends mock<IMultiDiffSourceResolverService>() {
			override async resolve() {
				return { resources: ValueWithChangeEvent.const(resources), loadOnDemand: true };
			}
		});
		const instantiationService = createCodeEditorServices(disposables, services);
		return disposables.add(instantiationService.createInstance(MultiDiffEditorInput, URI.parse('multi-diff-editor:test'), 'Test', undefined, false));
	}

	function textReference(resource: URI): IReference<IResolvedTextEditorModel> {
		const model = createTextModel('changed', undefined, undefined, resource);
		return {
			object: new class extends mock<IResolvedTextEditorModel>() {
				override readonly textEditorModel = model;
				override isReadonly() { return false; }
			},
			dispose: () => model.dispose(),
		};
	}

	test('resolves only requested rows of an on-demand source', async () => {
		const reads: string[] = [];
		const resources = Array.from({ length: 100 }, (_, index) => new MultiDiffEditorItem(undefined, URI.file(`/workspace/file${index}.ts`), undefined));
		const input = createOnDemandInput(resources, async resource => {
			reads.push(resource.path);
			return textReference(resource);
		});
		const viewModel = await input.getViewModel();
		const initialReads = reads.length;
		const item = viewModel.items.get()[99];
		const reference = disposables.add(item.acquire());
		await reference.object;
		assert.deepStrictEqual({
			initialReads,
			items: viewModel.items.get().length,
			reads,
			loaded: !item.isLoading.get(),
			otherRowsUnresolved: viewModel.items.get().slice(0, 99).every(item => item.diffEditorViewModel === undefined),
		}, {
			initialReads: 0,
			items: 100,
			reads: ['/workspace/file99.ts'],
			loaded: true,
			otherRowsUnresolved: true,
		});
	});

	test('bounds concurrent loads and skips cancelled queued rows', async () => {
		const pending: { resource: URI; result: DeferredPromise<IReference<IResolvedTextEditorModel>> }[] = [];
		const released = observableValue('released', 0);
		const input = createOnDemandInput(Array.from({ length: 12 }, (_, index) =>
			new MultiDiffEditorItem(undefined, URI.file(`/workspace/file${index}.ts`), undefined)), resource => {
			const result = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
			pending.push({ resource, result });
			return result.p;
		});
		const viewModel = await input.getViewModel();
		const references = viewModel.items.get().map(item => disposables.add(item.acquire()));
		const settled = Promise.allSettled(references.map(reference => reference.object));
		const started = pending.length;
		for (const reference of references) {
			reference.dispose();
		}
		for (const { result } of pending) {
			await result.complete({
				object: new class extends mock<IResolvedTextEditorModel>() { },
				dispose: () => released.set(released.get() + 1, undefined),
			});
		}
		await waitForState(released, count => count === started);
		const results = await settled;
		assert.deepStrictEqual({
			started,
			totalReads: pending.length,
			released: released.get(),
			cancelled: results.filter(result => result.status === 'rejected' && result.reason instanceof CancellationError).length,
			loaded: viewModel.items.get().filter(item => item.diffEditorViewModel).length,
		}, { started: 4, totalReads: 4, released: 4, cancelled: 12, loaded: 0 });
	});

	test('distinguishes unresolved files from binary files', async () => {
		const input = createOnDemandInput([new MultiDiffEditorItem(undefined, URI.file('/workspace/image.png'), undefined)], async () => {
			throw new TextFileOperationError('binary', TextFileOperationResult.FILE_IS_BINARY);
		});
		const viewModel = await input.getViewModel();
		const item = viewModel.items.get()[0];
		const before = { loading: item.isLoading.get(), binary: item.isBinary };
		await disposables.add(item.acquire()).object;
		assert.deepStrictEqual({ before, after: { loading: item.isLoading.get(), binary: item.isBinary } }, {
			before: { loading: true, binary: false },
			after: { loading: false, binary: true },
		});
	});

	test('saves and reverts dirty offscreen resources without loading their diffs', async () => {
		const resource = URI.file('/workspace/offscreen.ts');
		const operations: string[] = [];
		const input = createOnDemandInput([new MultiDiffEditorItem(undefined, resource, undefined)], async () => {
			throw new Error('Offscreen diffs must not be loaded for save or revert');
		}, new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			};
			override isDirty() { return true; }
			override async save(uri: URI): Promise<URI> {
				operations.push(`save:${uri.path}`);
				return uri;
			}
			override async revert(uri: URI): Promise<void> {
				operations.push(`revert:${uri.path}`);
			}
		});
		const viewModel = await input.getViewModel();
		await input.save(1);
		await input.revert(1);
		assert.deepStrictEqual({ operations, stillDeferred: viewModel.items.get()[0].isLoading.get() }, {
			operations: ['save:/workspace/offscreen.ts', 'revert:/workspace/offscreen.ts'],
			stillDeferred: true,
		});
	});

	test('reports failed file loads and retries when requested again', async () => {
		let attempts = 0;
		const reported: string[] = [];
		const previousErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error.message));
		try {
			const input = createOnDemandInput([new MultiDiffEditorItem(undefined, URI.file('/workspace/file.ts'), undefined)], async resource => {
				if (++attempts === 1) {
					throw new Error('Cannot read file');
				}
				return textReference(resource);
			});
			const item = (await input.getViewModel()).items.get()[0];
			const first = disposables.add(item.acquire());
			await assert.rejects(first.object, /Cannot read file/);
			const failed = item.loadFailed.get();
			first.dispose();
			await disposables.add(item.acquire()).object;
			assert.deepStrictEqual({ failed, reported, attempts, loading: item.isLoading.get(), retryFailed: item.loadFailed.get() }, {
				failed: true, reported: ['Cannot read file'], attempts: 2, loading: false, retryFailed: false,
			});
		} finally {
			setUnexpectedErrorHandler(previousErrorHandler);
		}
	});

	test('releases resolved text and retries if diff model creation fails', async () => {
		let attempts = 0;
		let released = 0;
		const reported: string[] = [];
		const previousErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error.message));
		try {
			const input = createOnDemandInput([new MultiDiffEditorItem(undefined, URI.file('/workspace/file.ts'), undefined)], async resource => {
				const reference = textReference(resource);
				if (++attempts !== 1) {
					return reference;
				}
				return {
					object: new class extends mock<IResolvedTextEditorModel>() {
						override readonly textEditorModel = reference.object.textEditorModel;
						override isReadonly(): boolean {
							throw new Error('Cannot read model options');
						}
					},
					dispose: () => {
						released++;
						reference.dispose();
					},
				};
			});
			const item = (await input.getViewModel()).items.get()[0];
			const first = disposables.add(item.acquire());
			await assert.rejects(first.object, /Cannot read model options/);
			first.dispose();
			await disposables.add(item.acquire()).object;
			assert.deepStrictEqual({ attempts, released, reported, loading: item.isLoading.get(), failed: item.loadFailed.get() }, {
				attempts: 2, released: 1, reported: ['Cannot read model options'], loading: false, failed: false,
			});
		} finally {
			setUnexpectedErrorHandler(previousErrorHandler);
		}
	});

	test('updates its name from the resolved source label', async () => {
		const sourceLabel = observableValue('sourceLabel', 'Current Turn Changes');
		const sourceResolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override resolve() {
				return Promise.resolve({
					resources: ValueWithChangeEvent.const([]),
					label: new ValueWithChangeEventFromObservable(sourceLabel),
				});
			}
		}();
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			}();
		}();
		const input = disposables.add(new MultiDiffEditorInput(
			URI.parse('multi-diff-editor:test'),
			'Fallback',
			undefined,
			false,
			new class extends mock<ITextModelService>() { }(),
			new class extends mock<ITextResourceConfigurationService>() { }(),
			new class extends mock<IInstantiationService>() { }(),
			sourceResolverService,
			textFileService,
		));
		await input.getViewModel();

		const names = [input.getName()];
		disposables.add(input.onDidChangeLabel(() => names.push(input.getName())));
		sourceLabel.set('Last Turn Changes', undefined);

		assert.deepStrictEqual(names, [
			'Current Turn Changes (0 files)',
			'Last Turn Changes (0 files)',
		]);
	});

	test('disposes models that finish resolving after input disposal', async () => {
		const referenceRequested = new DeferredPromise<void>();
		const referenceResult = new DeferredPromise<IReference<IResolvedTextEditorModel>>();
		let referenceDisposed = false;
		const textModelService = new class extends mock<ITextModelService>() {
			override createModelReference() {
				void referenceRequested.complete();
				return referenceResult.p;
			}
		}();
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			}();
		}();
		const input = disposables.add(new MultiDiffEditorInput(
			URI.parse('multi-diff-editor:test'),
			'Test',
			[new MultiDiffEditorItem(undefined, URI.parse('file:///modified.ts'), undefined)],
			false,
			textModelService,
			new class extends mock<ITextResourceConfigurationService>() { }(),
			new class extends mock<IInstantiationService>() { }(),
			new class extends mock<IMultiDiffSourceResolverService>() { }(),
			textFileService,
		));

		const viewModelPromise = input.getViewModel();
		await referenceRequested.p;
		input.dispose();
		await referenceResult.complete({
			object: new class extends mock<IResolvedTextEditorModel>() { }(),
			dispose: () => referenceDisposed = true,
		});

		await assert.rejects(viewModelPromise, CancellationError);
		assert.strictEqual(referenceDisposed, true);
	});

	test('keeps binary resources in the multi diff model', async () => {
		const originalUri = URI.parse('file:///original.png');
		const modifiedUri = URI.parse('file:///modified.png');
		const textModelService = new class extends mock<ITextModelService>() {
			override createModelReference(): Promise<IReference<IResolvedTextEditorModel>> {
				return Promise.reject(new TextFileOperationError('binary', TextFileOperationResult.FILE_IS_BINARY));
			}
		}();
		const textResourceConfigurationService = new class extends mock<ITextResourceConfigurationService>() {
			override readonly onDidChangeConfiguration = Event.None;
			override getValue<T>(): T { return {} as T; }
		}();
		let saveCallCount = 0;
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			}();
			override save(): Promise<undefined> {
				saveCallCount++;
				return Promise.resolve(undefined);
			}
		}();
		const services = new ServiceCollection();
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		const instantiationService = createCodeEditorServices(disposables, services);
		const input = disposables.add(new MultiDiffEditorInput(
			URI.parse('multi-diff-editor:test'),
			'Test',
			[new MultiDiffEditorItem(originalUri, modifiedUri, undefined)],
			false,
			textModelService,
			textResourceConfigurationService,
			instantiationService,
			new class extends mock<IMultiDiffSourceResolverService>() { }(),
			textFileService,
		));

		const viewModel = await input.getViewModel();
		const item = viewModel.items.get()[0];
		await input.save(1);

		assert.deepStrictEqual({
			itemCount: viewModel.items.get().length,
			originalUri: item.originalUri?.toString(),
			modifiedUri: item.modifiedUri?.toString(),
			isBinary: item.isBinary,
			originalSourceUri: item.documentDiffItem.original?.uri.toString(),
			modifiedSourceUri: item.documentDiffItem.modified?.uri.toString(),
			hasOriginalTextModel: item.documentDiffItem.original?.textModel !== undefined,
			hasModifiedTextModel: item.documentDiffItem.modified?.textModel !== undefined,
			saveCallCount,
		}, {
			itemCount: 1,
			originalUri: originalUri.toString(),
			modifiedUri: modifiedUri.toString(),
			isBinary: true,
			originalSourceUri: originalUri.toString(),
			modifiedSourceUri: modifiedUri.toString(),
			hasOriginalTextModel: false,
			hasModifiedTextModel: false,
			saveCallCount: 0,
		});
	});
});
