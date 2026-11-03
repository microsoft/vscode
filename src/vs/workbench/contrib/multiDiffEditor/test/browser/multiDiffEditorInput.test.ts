/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, observableFromValueWithChangeEvent, observableValue, ValueWithChangeEventFromObservable, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationChangeEvent, ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { ByteSize, FileSystemProviderCapabilities, FileType, IFileService, IFileStatWithPartialMetadata, IFileSystemProvider, IStat } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IResolvedTextFileEditorModel, ITextFileEditorModel, ITextFileEditorModelManager, ITextFileService, TextFileOperationError, TextFileOperationResult } from '../../../../services/textfile/common/textfiles.js';
import { MultiDiffEditorInput } from '../../browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from '../../browser/multiDiffSourceResolverService.js';

suite('MultiDiffEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// File systems that read files in chunks, like the local one, load files without checking their size
	const streamingFileService = new class extends mock<IFileService>() {
		override hasProvider() { return true; }
		override hasCapability() { return true; }
	}();

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
			streamingFileService,
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
			streamingFileService,
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
				streamingFileService,
			));
			const viewModel = await input.getViewModel();
			const documents = observableFromValueWithChangeEvent(input, viewModel.model.documents);
			const publishedDocuments: string[][] = [];
			disposables.add(autorun(reader => {
				const value = documents.read(reader);
				if (value !== 'loading') {
					publishedDocuments.push(value.map(document => document.object.modified!.uri.path));
				}
			}));

			resources.set([removed, slow], undefined);
			await slowReferenceRequested.p;
			if (update === 'dispose') {
				input.dispose();
			} else {
				resources.set(update === 'replace' ? [current] : [], undefined);
				await waitForState(documents, value => value !== 'loading' && (update === 'replace'
					? value.length === 1 && value[0].object.modified?.uri.path === current.modifiedUri!.path
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
					...(update === 'dispose' ? [] : [update === 'replace' ? ['/modified/current.ts'] : []]),
				],
				releasedReferences: ['/modified/removed.ts', '/modified/slow.ts', '/original/removed.ts', '/original/slow.ts'],
			});
		});
	}

	test('preserves explicit original line number setting values and updates', async () => {
		const originalUri = URI.parse('file:///original.ts');
		const modifiedUri = URI.parse('file:///modified.ts');
		const textModelService = new class extends mock<ITextModelService>() {
			override createModelReference(): Promise<IReference<IResolvedTextEditorModel>> {
				return Promise.reject(new TextFileOperationError('binary', TextFileOperationResult.FILE_IS_BINARY));
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
			streamingFileService,
		));
		const viewModel = await input.getViewModel();
		const documentItem = viewModel.items.get()[0].documentDiffItem;
		const values = [documentItem.options?.hideOriginalLineNumbers];
		disposables.add(documentItem.onOptionsDidChange!(() => values.push(documentItem.options?.hideOriginalLineNumbers)));

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
			streamingFileService,
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

	suite('files from file systems that only read whole files', () => {

		const agentHostUri = (path: string) => URI.from({ scheme: Schemas.vscodeAgentHost, authority: 'host', path });

		/**
		 * Creates an input whose text model service records the paths of the files it loads.
		 */
		function createInput(resources: readonly MultiDiffEditorItem[], fileService: IFileService, textFileService: ITextFileService) {
			const services = new ServiceCollection();
			services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
			const instantiationService = createCodeEditorServices(disposables, services);
			const loaded: string[] = [];
			const textModelService = new class extends mock<ITextModelService>() {
				override canHandleResource() { return false; }
				override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
					loaded.push(resource.path);
					const model = disposables.add(instantiateTextModel(instantiationService, 'text', undefined, undefined, resource));
					return {
						object: new class extends mock<IResolvedTextEditorModel>() {
							override readonly textEditorModel = model;
							override isReadonly() { return true; }
						}(),
						dispose: () => { },
					};
				}
			}();
			const input = disposables.add(new MultiDiffEditorInput(
				URI.parse('multi-diff-editor:test'),
				'Test',
				resources,
				false,
				textModelService,
				new class extends mock<ITextResourceConfigurationService>() {
					override readonly onDidChangeConfiguration = Event.None;
					override getValue<T>(): T { return {} as T; }
					override inspect<T>(): IConfigurationValue<Readonly<T>> { return {}; }
				}(),
				instantiationService,
				new class extends mock<IMultiDiffSourceResolverService>() { }(),
				textFileService,
				fileService,
			));
			return { input, loaded };
		}

		/**
		 * Creates a file service like the agent host's: no streamed or ranged reads, so loading a file transfers all of it.
		 */
		function createWholeFileReadsFileService(sizes: ReadonlyMap<string, number>, statted: string[] = []) {
			return new class extends mock<IFileService>() {
				override hasProvider() { return true; }
				override hasCapability(_resource: URI, capability: FileSystemProviderCapabilities) {
					return (FileSystemProviderCapabilities.FileReadWrite & capability) !== 0;
				}
				override async stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
					statted.push(resource.path);
					return new class extends mock<IFileStatWithPartialMetadata>() {
						override readonly size = sizes.get(resource.toString())!;
					}();
				}
			}();
		}

		/**
		 * Creates a text file service where `openAndDirty` have resolved, dirty models, and that records saves and reverts.
		 */
		function createTextFileService(openAndDirty: readonly URI[] = []) {
			const isOpenAndDirty = (resource: URI) => openAndDirty.some(uri => uri.toString() === resource.toString());
			const resolvedModel = new class extends mock<ITextFileEditorModel>() {
				override isResolved(): this is IResolvedTextFileEditorModel { return true; }
			}();
			const saved: string[] = [];
			const reverted: string[] = [];
			const textFileService = new class extends mock<ITextFileService>() {
				override readonly files = new class extends mock<ITextFileEditorModelManager>() {
					override readonly onDidChangeDirty = Event.None;
					override get(resource: URI) { return isOpenAndDirty(resource) ? resolvedModel : undefined; }
				}();
				override isDirty(resource: URI) { return isOpenAndDirty(resource); }
				override async save(resource: URI) {
					saved.push(resource.path);
					return resource;
				}
				override async revert(resource: URI) {
					reverted.push(resource.path);
				}
			}();
			return { textFileService, saved, reverted };
		}

		test('does not load files above the large file limit', async () => {
			const large = agentHostUri('/repo/capture.pcapng');
			const small = agentHostUri('/repo/README.md');
			const { input, loaded } = createInput(
				[new MultiDiffEditorItem(undefined, large, undefined), new MultiDiffEditorItem(undefined, small, undefined)],
				createWholeFileReadsFileService(new Map([[large.toString(), 150 * ByteSize.MB], [small.toString(), 80]])),
				createTextFileService().textFileService,
			);

			const viewModel = await input.getViewModel();

			assert.deepStrictEqual({
				loaded,
				items: viewModel.items.get().map(item => ({ path: item.modifiedUri?.path, isBinary: item.isBinary, isTooLarge: item.isTooLarge })),
			}, {
				loaded: ['/repo/README.md'],
				items: [
					{ path: '/repo/capture.pcapng', isBinary: true, isTooLarge: true },
					{ path: '/repo/README.md', isBinary: false, isTooLarge: false },
				],
			});
		});

		test('uses the open models of large files, and saves and reverts large files that are open and dirty', async () => {
			const opened = agentHostUri('/repo/opened.log');
			const editedOriginal = agentHostUri('/original/repo/edited.log');
			const edited = agentHostUri('/repo/edited.log');
			const statted: string[] = [];
			const { textFileService, saved, reverted } = createTextFileService([opened, edited]);
			const { input, loaded } = createInput(
				[new MultiDiffEditorItem(undefined, opened, undefined), new MultiDiffEditorItem(editedOriginal, edited, undefined)],
				createWholeFileReadsFileService(new Map([opened, editedOriginal, edited].map(uri => [uri.toString(), 150 * ByteSize.MB])), statted),
				textFileService,
			);

			const viewModel = await input.getViewModel();
			await input.save(1);
			await input.revert(1);

			assert.deepStrictEqual({
				loaded,
				statted,
				items: viewModel.items.get().map(item => ({ path: item.modifiedUri?.path, isBinary: item.isBinary, isTooLarge: item.isTooLarge })),
				saved: saved.sort(),
				reverted: reverted.sort(),
			}, {
				loaded: ['/repo/opened.log'],
				statted: ['/original/repo/edited.log'],
				items: [
					{ path: '/repo/opened.log', isBinary: false, isTooLarge: false },
					// The original is too large to load, so the item shows a placeholder
					{ path: '/repo/edited.log', isBinary: true, isTooLarge: true },
				],
				saved: ['/repo/edited.log', '/repo/opened.log'],
				reverted: ['/repo/edited.log', '/repo/opened.log'],
			});
		});

		test('checks the size of files from a file system provider that registers when activated', async () => {
			const scheme = 'on-demand';
			const large = URI.from({ scheme, path: '/repo/capture.pcapng' });
			const fileService = disposables.add(new FileService(new NullLogService()));
			const provider = new class extends mock<IFileSystemProvider>() {
				override readonly capabilities = FileSystemProviderCapabilities.FileReadWrite;
				override readonly onDidChangeCapabilities = Event.None;
				override readonly onDidChangeFile = Event.None;
				override async stat(): Promise<IStat> {
					return { type: FileType.File, ctime: 0, mtime: 0, size: 2048 * ByteSize.MB };
				}
			}();
			// Like a file system that an extension registers when it activates
			let registration: Promise<void> | undefined;
			disposables.add(fileService.onWillActivateFileSystemProvider(e => {
				if (e.scheme === scheme) {
					registration ??= (async () => {
						await timeout(0);
						disposables.add(fileService.registerProvider(scheme, provider));
					})();
					e.join(registration);
				}
			}));
			const { input, loaded } = createInput(
				[new MultiDiffEditorItem(undefined, large, undefined)],
				fileService,
				createTextFileService().textFileService,
			);

			const viewModel = await input.getViewModel();

			assert.deepStrictEqual({
				loaded,
				items: viewModel.items.get().map(item => ({ path: item.modifiedUri?.path, isBinary: item.isBinary, isTooLarge: item.isTooLarge })),
			}, {
				loaded: [],
				items: [{ path: '/repo/capture.pcapng', isBinary: true, isTooLarge: true }],
			});
		});
	});
});
