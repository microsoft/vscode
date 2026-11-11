/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationError, errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromValueWithChangeEvent, observableValue, ValueWithChangeEventFromObservable, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationChangeEvent, ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IDocumentDiffProvider } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ITextFileEditorModelManager, ITextFileService, TextFileOperationError, TextFileOperationResult } from '../../../../services/textfile/common/textfiles.js';
import { MultiDiffEditorInput } from '../../browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from '../../browser/multiDiffSourceResolverService.js';

suite('MultiDiffEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createLazyInput(count: number) {
		const requests: string[] = [];
		const diffs: string[] = [];
		const released: string[] = [];
		const pending = new Map<string, DeferredPromise<void>>();
		const resources = observableValue('resources', Array.from({ length: count }, (_, index) => new MultiDiffEditorItem(
			URI.parse(`test:///original/${index}`), URI.parse(`test:///modified/${index}`), undefined,
		)));
		const services = new ServiceCollection();
		services.set(IDiffProviderFactoryService, new class extends TestDiffProviderFactoryService {
			override createDiffProvider(): IDocumentDiffProvider {
				const provider = super.createDiffProvider();
				return {
					onDidChange: provider.onDidChange,
					computeDiff: (...args) => {
						diffs.push(args[1].uri.path);
						return provider.computeDiff(...args);
					},
				};
			}
		}());
		const instantiationService = createCodeEditorServices(disposables, services);
		const textModelService = new class extends mock<ITextModelService>() {
			override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				requests.push(resource.path);
				await pending.get(resource.path)?.p;
				const model = instantiateTextModel(instantiationService, resource.path, undefined, undefined, resource);
				return {
					object: new class extends mock<IResolvedTextEditorModel>() {
						override readonly textEditorModel = model;
						override isReadonly() { return true; }
					}(),
					dispose: () => {
						released.push(resource.path);
						model.dispose();
					},
				};
			}
		}();
		const saved: string[] = [];
		const dirty = new Set<string>();
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			}();
			override isDirty(resource: URI) { return dirty.has(resource.path); }
			override async save(resource: URI) { saved.push(resource.path); return undefined; }
		}();
		const input = disposables.add(new MultiDiffEditorInput(
			URI.parse('multi-diff-editor:test'),
			'Test',
			undefined,
			false,
			textModelService,
			new class extends mock<ITextResourceConfigurationService>() {
				override readonly onDidChangeConfiguration = Event.None;
				override getValue<T>(): T { return {} as T; }
			}(),
			instantiationService,
			new class extends mock<IMultiDiffSourceResolverService>() {
				override async resolve() {
					return { resources: new ValueWithChangeEventFromObservable(resources) };
				}
			}(),
			textFileService,
		));
		return { input, requests, diffs, released, pending, resources, saved, dirty };
	}

	test('loads and computes only the first five diffs until another item is requested', async () => {
		const { input, requests, diffs } = createLazyInput(1000);
		const viewModel = await input.getViewModel();
		const initial = { items: viewModel.items.get().length, requests: [...requests], diffs: [...diffs] };
		const last = viewModel.items.get()[999];
		await Promise.all([last.load(), last.load()]);
		await last.diffEditorViewModel.waitForDiff();
		await timeout(0);
		assert.deepStrictEqual({
			initial,
			additionalRequests: requests.slice(10),
			additionalDiffs: diffs.slice(5),
			unloaded: viewModel.items.get().slice(5, 999).every(item => !item.isLoaded.get() && !item.isBinary),
		}, {
			initial: {
				items: 1000,
				requests: Array.from({ length: 5 }, (_, i) => [`/original/${i}`, `/modified/${i}`]).flat(),
				diffs: Array.from({ length: 5 }, (_, i) => `/modified/${i}`),
			},
			additionalRequests: ['/original/999', '/modified/999'],
			additionalDiffs: ['/modified/999'],
			unloaded: true,
		});
	});

	test('releases a requested item removed while its contents are loading', async () => {
		const { input, requests, diffs, released, pending, resources } = createLazyInput(10);
		const viewModel = await input.getViewModel();
		const finish = new DeferredPromise<void>();
		pending.set('/modified/9', finish);
		const item = viewModel.items.get()[9];
		const loading = item.load();
		resources.set(resources.get().slice(0, 9), undefined);
		await finish.complete();
		await loading;
		assert.deepStrictEqual({
			items: viewModel.items.get().length,
			alive: item.isAlive.get(),
			additionalRequests: requests.slice(10),
			additionalDiffs: diffs.slice(5),
			released: released.sort(),
		}, {
			items: 9, alive: false,
			additionalRequests: ['/original/9', '/modified/9'],
			additionalDiffs: [],
			released: ['/modified/9', '/original/9'],
		});
	});

	test('publishes all entries and ready diffs without waiting for a slow initial file', async () => {
		const { input, requests, pending } = createLazyInput(1000);
		const finish = new DeferredPromise<void>();
		pending.set('/modified/0', finish);
		const viewModel = await input.getViewModel();
		const state = {
			items: viewModel.items.get().length,
			requests: requests.length,
			loaded: viewModel.items.get().slice(0, 6).map(item => item.isLoaded.get()),
		};
		await finish.complete();
		await viewModel.waitForDiffOr1s();
		assert.deepStrictEqual(state, {
			items: 1000,
			requests: 10,
			loaded: [false, true, true, true, true, false],
		});
	});

	test('failed lazy resolution releases the other side and preserves the file entry', async () => {
		const { input, requests, diffs, pending, released } = createLazyInput(10);
		const viewModel = await input.getViewModel();
		const finish = new DeferredPromise<void>();
		pending.set('/modified/9', finish);
		const item = viewModel.items.get()[9];
		const error = new Error('File unavailable');
		const previousErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const reportedErrors: unknown[] = [];
		setUnexpectedErrorHandler(e => reportedErrors.push(e));
		try {
			const rejected = assert.rejects(item.load(), error);
			await finish.error(error);
			await rejected;
			await assert.rejects(item.load(), error);
		} finally {
			setUnexpectedErrorHandler(previousErrorHandler);
		}
		assert.deepStrictEqual({
			items: viewModel.items.get().length,
			loaded: item.isLoaded.get(),
			binary: item.isBinary,
			error: item.loadError.get(),
			reportedErrors,
			requests: requests.slice(10),
			diffs: diffs.slice(5),
			released,
		}, {
			items: 10, loaded: false, binary: false, error,
			reportedErrors: [error],
			requests: ['/original/9', '/modified/9'],
			diffs: [],
			released: ['/original/9'],
		});
	});

	test('reordering does not load collapsed files, and a failing file does not fail the files loaded up front', async () => {
		const { input, requests, pending } = createLazyInput(10);
		const fail = new DeferredPromise<void>();
		fail.p.catch(() => { });
		void fail.error(new Error('cannot load'));
		pending.set('/modified/2', fail);
		const previousErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const reportedErrors: string[] = [];
		setUnexpectedErrorHandler(e => reportedErrors.push(e.message));
		try {
			const viewModel = await input.getViewModel();
			await viewModel.waitForDiffOr1s();
			viewModel.collapseAll();
			input.setResourceOrder(resources => [...resources].reverse());
			await (await input.getViewModel()).waitForDiffOr1s();
			assert.deepStrictEqual({
				first: viewModel.items.get()[0].modifiedUri?.path,
				requests: requests.length,
				loaded: viewModel.items.get().filter(item => item.isLoaded.get()).length,
				reportedErrors,
			}, { first: '/modified/9', requests: 10, loaded: 4, reportedErrors: ['cannot load'] });
		} finally {
			setUnexpectedErrorHandler(previousErrorHandler);
		}
	});

	test('saving dirty unloaded resources does not load their diffs', async () => {
		const { input, requests, saved, dirty } = createLazyInput(10);
		await input.getViewModel();
		dirty.add('/modified/9');
		await input.save(1);
		assert.deepStrictEqual({ requests: requests.length, saved }, {
			requests: 10,
			saved: ['/modified/0', '/modified/1', '/modified/2', '/modified/3', '/modified/4', '/modified/9'],
		});
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
			createCodeEditorServices(disposables),
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
			createCodeEditorServices(disposables),
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

	for (const update of ['replace', 'remove', 'dispose'] as const) {
		test(`ignores stale document resolutions after ${update}`, async () => {
			const services = new ServiceCollection();
			services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			const instantiationService = createCodeEditorServices(disposables, services);
			const createResource = (name: string) => new MultiDiffEditorItem(
				URI.parse(`inmemory:/original/${name}.ts`),
				URI.parse(`inmemory:/modified/${name}.ts`),
				undefined,
			);
			const removed = createResource('removed');
			const slow = createResource('slow');
			const current = createResource('current');
			const resources = observableValue<readonly MultiDiffEditorItem[]>('resources', [removed]);
			const slowReferenceRequested = new DeferredPromise<void>();
			const slowReferenceReady = new DeferredPromise<void>();
			const releasedReferences: string[] = [];
			const textModelService = new class extends mock<ITextModelService>() {
				override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
					if (resource.path.endsWith('/slow.ts')) {
						void slowReferenceRequested.complete();
						await slowReferenceReady.p;
					}
					const model = disposables.add(instantiateTextModel(instantiationService, resource.path, undefined, undefined, resource));
					const reference = disposables.add(toDisposable(() => {
						releasedReferences.push(resource.path);
						model.dispose();
					}));
					return {
						object: new class extends mock<IResolvedTextEditorModel>() {
							override readonly textEditorModel = model;
							override isReadonly() { return true; }
						}(),
						dispose: () => reference.dispose(),
					};
				}
			}();
			const input = disposables.add(new MultiDiffEditorInput(
				URI.parse('multi-diff-editor:test'),
				'Test',
				undefined,
				false,
				textModelService,
				new class extends mock<ITextResourceConfigurationService>() {
					override readonly onDidChangeConfiguration = Event.None;
					override getValue<T>(): T { return {} as T; }
				}(),
				instantiationService,
				new class extends mock<IMultiDiffSourceResolverService>() {
					override resolve() {
						return Promise.resolve({ resources: new ValueWithChangeEventFromObservable(resources) });
					}
				}(),
				new class extends mock<ITextFileService>() {
					override readonly files = new class extends mock<ITextFileEditorModelManager>() {
						override readonly onDidChangeDirty = Event.None;
					}();
				}(),
			));
			const viewModel = await input.getViewModel();
			const documents = observableFromValueWithChangeEvent(input, viewModel.model.documents);
			const publishedDocuments: string[][] = [];
			disposables.add(autorun(reader => {
				const value = documents.read(reader);
				if (value !== 'loading') {
					publishedDocuments.push(value.map(document => document.object.modifiedUri!.path));
				}
			}));

			resources.set([removed, slow], undefined);
			await slowReferenceRequested.p;
			if (update === 'dispose') {
				input.dispose();
			} else {
				resources.set(update === 'replace' ? [current] : [], undefined);
				await waitForState(documents, value => value !== 'loading' && (update === 'replace'
					? value.length === 1 && value[0].object.modifiedUri?.path === current.modifiedUri!.path
					: value.length === 0));
				await viewModel.waitForDiffOr1s();
			}

			await slowReferenceReady.complete();
			await timeout(0);

			assert.deepStrictEqual({
				publishedDocuments,
				releasedReferences: releasedReferences.sort(),
			}, {
				publishedDocuments: [
					['/modified/removed.ts'],
					['/modified/removed.ts', '/modified/slow.ts'],
					...(update === 'dispose' ? [] : [update === 'replace' ? ['/modified/current.ts'] : []]),
				],
				releasedReferences: ['/modified/removed.ts', '/modified/slow.ts', '/original/removed.ts', '/original/slow.ts'],
			});
		});
	}

	for (const outcome of ['resolve', 'fail'] as const) {
		test(`shows resources set after its view model while their contents load (${outcome})`, async () => {
			const services = new ServiceCollection();
			services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			const instantiationService = createCodeEditorServices(disposables, services);
			const resources = observableValue<readonly MultiDiffEditorItem[]>('resources', []);
			const references = new DeferredPromise<void>();
			const textModelService = new class extends mock<ITextModelService>() {
				override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
					await references.p;
					if (outcome === 'fail') {
						throw new Error(`cannot resolve ${resource.path}`);
					}
					const model = disposables.add(instantiateTextModel(instantiationService, resource.path, undefined, undefined, resource));
					return {
						object: new class extends mock<IResolvedTextEditorModel>() {
							override readonly textEditorModel = model;
							override isReadonly() { return true; }
						}(),
						dispose: () => model.dispose(),
					};
				}
			}();
			const input = disposables.add(new MultiDiffEditorInput(
				URI.parse('multi-diff-editor:test'),
				'Test',
				undefined,
				false,
				textModelService,
				new class extends mock<ITextResourceConfigurationService>() {
					override readonly onDidChangeConfiguration = Event.None;
					override getValue<T>(): T { return {} as T; }
				}(),
				instantiationService,
				new class extends mock<IMultiDiffSourceResolverService>() {
					override resolve() {
						return Promise.resolve({ resources: new ValueWithChangeEventFromObservable(resources) });
					}
				}(),
				new class extends mock<ITextFileService>() {
					override readonly files = new class extends mock<ITextFileEditorModelManager>() {
						override readonly onDidChangeDirty = Event.None;
					}();
				}(),
			));
			const errors: unknown[] = [];
			const previousErrorHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(error => errors.push(error));
			try {
				const viewModel = await input.getViewModel();
				// Whether it shows no diffs while those of its resources still load.
				const pending: boolean[] = [];
				disposables.add(autorun(reader => {
					const value = viewModel.items.read(reader).length === 0 && (input.isResolvingDocuments.read(reader) || viewModel.isLoading.read(reader));
					if (pending.at(-1) !== value) {
						pending.push(value);
					}
				}));
				resources.set([new MultiDiffEditorItem(URI.parse('inmemory:/original/a.ts'), URI.parse('inmemory:/modified/a.ts'), undefined)], undefined);
				const whileResolving = { resolving: input.isResolvingDocuments.get(), loading: viewModel.isLoading.get() };
				await references.complete();
				await waitForState(input.isResolvingDocuments, resolving => !resolving);
				await waitForState(viewModel.isLoading, loading => !loading);

				assert.deepStrictEqual({ whileResolving, pending, items: viewModel.items.get().length, errors: errors.length }, {
					// The resources show right away while their contents load, also when loading them fails.
					whileResolving: { resolving: false, loading: true },
					pending: [false],
					items: 1,
					errors: outcome === 'resolve' ? 0 : 1,
				});
			} finally {
				setUnexpectedErrorHandler(previousErrorHandler);
			}
		});
	}

	test('preserves explicit original line number setting values and updates', async () => {
		const originalUri = URI.parse('file:///original.ts');
		const modifiedUri = URI.parse('file:///modified.ts');
		const textModelService = new class extends mock<ITextModelService>() {
			override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				const model = disposables.add(instantiateTextModel(instantiationService, resource.path, undefined, undefined, resource));
				return {
					object: new class extends mock<IResolvedTextEditorModel>() {
						override readonly textEditorModel = model;
						override isReadonly() { return true; }
					}(),
					dispose: () => model.dispose(),
				};
			}
		}();
		const configurationChanged = disposables.add(new Emitter<ITextResourceConfigurationChangeEvent>());
		let hideOriginalLineNumbers: boolean | null = null;
		const textResourceConfigurationService = new class extends mock<ITextResourceConfigurationService>() {
			override readonly onDidChangeConfiguration = configurationChanged.event;
			override getValue<T>(): T {
				return {
					editor: {},
					diffEditor: { hideOriginalLineNumbers },
				} as T;
			}
		}();
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			}();
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
		await item.load();
		const resolved = item.resolvedDocumentDiffItem;
		assert.strictEqual(resolved?.kind, 'text');
		const values = [resolved.options?.hideOriginalLineNumbers];
		disposables.add(resolved.onOptionsDidChange!(() => values.push(resolved.options?.hideOriginalLineNumbers)));

		hideOriginalLineNumbers = false;
		configurationChanged.fire({
			affectedKeys: new Set(['diffEditor.hideOriginalLineNumbers']),
			affectsConfiguration: (_resource, section) => section === 'diffEditor',
		});
		hideOriginalLineNumbers = true;
		configurationChanged.fire({
			affectedKeys: new Set(['diffEditor.hideOriginalLineNumbers']),
			affectsConfiguration: (_resource, section) => section === 'diffEditor',
		});
		hideOriginalLineNumbers = null;
		configurationChanged.fire({
			affectedKeys: new Set(['diffEditor.hideOriginalLineNumbers']),
			affectsConfiguration: (_resource, section) => section === 'diffEditor',
		});

		assert.deepStrictEqual(values, [undefined, false, true, undefined]);
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
			saveCallCount,
		}, {
			itemCount: 1,
			originalUri: originalUri.toString(),
			modifiedUri: modifiedUri.toString(),
			isBinary: true,
			saveCallCount: 0,
		});
	});
});
