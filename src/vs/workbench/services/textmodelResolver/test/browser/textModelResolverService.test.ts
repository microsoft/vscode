/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ITextModel } from '../../../../../editor/common/model.js';
import { URI } from '../../../../../base/common/uri.js';
import { TextResourceEditorInput } from '../../../../common/editor/textResourceEditorInput.js';
import { TextResourceEditorModel } from '../../../../common/editor/textResourceEditorModel.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService, TestServiceAccessor, ITestTextFileEditorModelManager } from '../../../../test/browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { TextFileEditorModel } from '../../../textfile/common/textFileEditorModel.js';
import { snapshotToString } from '../../../textfile/common/textfiles.js';
import { TextFileEditorModelManager } from '../../../textfile/common/textFileEditorModelManager.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { timeout } from '../../../../../base/common/async.js';
import { UntitledTextEditorInput } from '../../../untitled/common/untitledTextEditorInput.js';
import { createTextBufferFactory } from '../../../../../editor/common/model/textModel.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { DiffItemSource, IDocumentDiffItem } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';

suite('Workbench - TextModelResolverService', () => {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(<TextFileEditorModelManager>accessor.textFileService.files);
	});

	teardown(() => {
		disposables.clear();
	});

	test('resolve resource', async () => {
		disposables.add(accessor.textModelResolverService.registerTextModelContentProvider('test', {
			provideTextContent: async function (resource: URI): Promise<ITextModel | null> {
				if (resource.scheme === 'test') {
					const modelContent = 'Hello Test';
					const languageSelection = accessor.languageService.createById('json');

					return accessor.modelService.createModel(modelContent, languageSelection, resource);
				}

				return null;
			}
		}));

		const resource = URI.from({ scheme: 'test', authority: null!, path: 'thePath' });
		const input = instantiationService.createInstance(TextResourceEditorInput, resource, 'The Name', 'The Description', undefined, undefined);

		const model = disposables.add(await input.resolve());
		assert.ok(model);
		assert.strictEqual(snapshotToString(((model as TextResourceEditorModel).createSnapshot()!)), 'Hello Test');
		let disposed = false;
		const disposedPromise = new Promise<void>(resolve => {
			Event.once(model.onWillDispose)(() => {
				disposed = true;
				resolve();
			});
		});
		input.dispose();

		await disposedPromise;
		assert.strictEqual(disposed, true);
	});

	test('resolve file', async function () {
		const textModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file_resolver.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(textModel.resource, textModel);

		await textModel.resolve();

		const ref = await accessor.textModelResolverService.createModelReference(textModel.resource);

		const model = ref.object;
		const editorModel = model.textEditorModel;

		assert.ok(editorModel);
		assert.strictEqual(editorModel.getValue(), 'Hello Html');

		let disposed = false;
		Event.once(model.onWillDispose)(() => {
			disposed = true;
		});

		ref.dispose();
		await timeout(0);  // due to the reference resolving the model first which is async
		assert.strictEqual(disposed, true);
	});

	test('resolved dirty file eventually disposes', async function () {
		const textModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file_resolver.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(textModel.resource, textModel);

		await textModel.resolve();

		textModel.updateTextEditorModel(createTextBufferFactory('make dirty'));

		const ref = await accessor.textModelResolverService.createModelReference(textModel.resource);

		let disposed = false;
		Event.once(textModel.onWillDispose)(() => {
			disposed = true;
		});

		ref.dispose();
		await timeout(0);
		assert.strictEqual(disposed, false); // not disposed because model still dirty

		textModel.revert();

		await timeout(0);
		assert.strictEqual(disposed, true); // now disposed because model got reverted
	});

	test('resolved dirty file does not dispose when new reference created', async function () {
		const textModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file_resolver.txt'), 'utf8', undefined));
		(<ITestTextFileEditorModelManager>accessor.textFileService.files).add(textModel.resource, textModel);

		await textModel.resolve();

		textModel.updateTextEditorModel(createTextBufferFactory('make dirty'));

		const ref1 = await accessor.textModelResolverService.createModelReference(textModel.resource);

		let disposed = false;
		Event.once(textModel.onWillDispose)(() => {
			disposed = true;
		});

		ref1.dispose();
		await timeout(0);
		assert.strictEqual(disposed, false); // not disposed because model still dirty

		const ref2 = await accessor.textModelResolverService.createModelReference(textModel.resource);

		textModel.revert();

		await timeout(0);
		assert.strictEqual(disposed, false); // not disposed because we got another ref meanwhile

		ref2.dispose();

		await timeout(0);
		assert.strictEqual(disposed, true); // now disposed because last ref got disposed
	});

	test('resolve untitled', async () => {
		const service = accessor.untitledTextEditorService;
		const untitledModel = disposables.add(service.create());
		const input = disposables.add(instantiationService.createInstance(UntitledTextEditorInput, untitledModel));

		await input.resolve();
		const ref = await accessor.textModelResolverService.createModelReference(input.resource);
		const model = ref.object;
		assert.strictEqual(untitledModel, model);
		const editorModel = model.textEditorModel;
		assert.ok(editorModel);
		ref.dispose();
		input.dispose();
		model.dispose();
	});

	test('even loading documents should be refcounted', async () => {
		let resolveModel!: Function;
		const waitForIt = new Promise(resolve => resolveModel = resolve);

		disposables.add(accessor.textModelResolverService.registerTextModelContentProvider('test', {
			provideTextContent: async (resource: URI): Promise<ITextModel> => {
				await waitForIt;

				const modelContent = 'Hello Test';
				const languageSelection = accessor.languageService.createById('json');
				return disposables.add(accessor.modelService.createModel(modelContent, languageSelection, resource));
			}
		}));

		const uri = URI.from({ scheme: 'test', authority: null!, path: 'thePath' });

		const modelRefPromise1 = accessor.textModelResolverService.createModelReference(uri);
		const modelRefPromise2 = accessor.textModelResolverService.createModelReference(uri);

		resolveModel();

		const modelRef1 = await modelRefPromise1;
		const model1 = modelRef1.object;
		const modelRef2 = await modelRefPromise2;
		const model2 = modelRef2.object;
		const textModel = model1.textEditorModel;

		assert.strictEqual(model1, model2, 'they are the same model');
		assert(!textModel.isDisposed(), 'the text model should not be disposed');

		modelRef1.dispose();
		assert(!textModel.isDisposed(), 'the text model should still not be disposed');

		const p1 = new Promise<void>(resolve => disposables.add(textModel.onWillDispose(resolve)));
		modelRef2.dispose();

		await p1;
		assert(textModel.isDisposed(), 'the text model should finally be disposed');
	});

	test('resolve inMemory', async () => {
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/test/inMemoryDoc' });
		const languageSelection = accessor.languageService.createById('json');
		disposables.add(accessor.modelService.createModel('Hello InMemory', languageSelection, resource));

		const ref = await accessor.textModelResolverService.createModelReference(resource);
		const model = ref.object;
		assert.ok(model);
		const textModel = model.textEditorModel;
		assert.ok(textModel);
		assert.strictEqual(textModel.getValue(), 'Hello InMemory');
		assert(!textModel.isDisposed(), 'the inMemory text model should not be disposed before releasing the reference');

		const p = new Promise<void>(resolve => disposables.add(textModel.onWillDispose(resolve)));
		ref.dispose();

		await p;
		assert(textModel.isDisposed(), 'the inMemory text model should be disposed after the reference is released');
	});

	for (const releaseCreatorFirst of [false, true]) {
		test(`shared model survives until both owners release (creator first: ${releaseCreatorFirst})`, async () => {
			const owner = disposables.add(accessor.modelService.createSharedModel('shared', null));
			const model = owner.object;
			let disposalCount = 0;
			disposables.add(model.onWillDispose(() => disposalCount++));
			const reference = disposables.add(await accessor.textModelResolverService.createModelReference(model.uri));
			if (releaseCreatorFirst) {
				owner.dispose();
			} else {
				reference.dispose();
				await timeout(0);
			}
			assert.deepStrictEqual({ value: model.getValue(), disposalCount }, { value: 'shared', disposalCount: 0 });

			const disposed = Event.toPromise(model.onWillDispose);
			owner.dispose();
			reference.dispose();
			await disposed;
			assert.deepStrictEqual({ disposed: model.isDisposed(), disposalCount }, { disposed: true, disposalCount: 1 });
		});
	}

	test('shared model is retained while a resolver reference is still opening', async () => {
		const owner = disposables.add(accessor.modelService.createSharedModel('shared', null));
		const pending = accessor.textModelResolverService.createModelReference(owner.object.uri);
		owner.dispose();
		const reference = disposables.add(await pending);
		assert.strictEqual(reference.object.textEditorModel.getValue(), 'shared');
		const disposed = Event.toPromise(owner.object.onWillDispose);
		reference.dispose();
		await disposed;
	});

	test('shared model can be reacquired during pending resolver disposal', async () => {
		const owner = disposables.add(accessor.modelService.createSharedModel('shared', null));
		const first = disposables.add(await accessor.textModelResolverService.createModelReference(owner.object.uri));
		first.dispose();
		const pending = accessor.textModelResolverService.createModelReference(owner.object.uri);
		owner.dispose();
		const second = disposables.add(await pending);
		assert.strictEqual(second.object.textEditorModel.getValue(), 'shared');
		const disposed = Event.toPromise(owner.object.onWillDispose);
		second.dispose();
		await disposed;
	});

	for (const added of [false, true]) {
		test(`multi-diff synthetic side shares its lifetime with document references (added: ${added})`, async () => {
			const services = disposables.add(instantiationService.createChild(new ServiceCollection(
				[IDiffProviderFactoryService, new TestDiffProviderFactoryService()],
			)));
			const textModel = accessor.modelService.createModel('content', null);
			const source = new DiffItemSource(textModel.uri, textModel);
			const document = disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
				original: added ? undefined : source,
				modified: added ? source : undefined,
			}, textModel));
			const parent = disposables.add(new MultiDiffEditorViewModel({ documents: ValueWithChangeEvent.const([]) }, services));
			const item = disposables.add(services.createInstance(DocumentDiffItemViewModel, document, parent));
			const diffReference = disposables.add(item.diffEditorViewModelRef.createNewRef());
			const empty = added ? item.diffEditorViewModel.model.original : item.diffEditorViewModel.model.modified;
			const first = disposables.add(await accessor.textModelResolverService.createModelReference(empty.uri));
			first.dispose();
			await timeout(0);
			assert.deepStrictEqual({
				empty: empty.getValue(),
				missingUri: added ? item.originalUri : item.modifiedUri,
				alive: item.isAlive.get(),
			}, { empty: '', missingUri: undefined, alive: true });

			const second = disposables.add(await accessor.textModelResolverService.createModelReference(empty.uri));
			item.dispose();
			assert.strictEqual(empty.isDisposed(), false);
			diffReference.dispose();
			assert.strictEqual(empty.isDisposed(), false);
			const disposed = Event.toPromise(empty.onWillDispose);
			second.dispose();
			await disposed;
		});
	}

	test('resolve inMemory throws when model not found', async () => {
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/test/nonExistent' });

		await assert.rejects(
			() => accessor.textModelResolverService.createModelReference(resource),
			/Unable to resolve text model content for resource/
		);
	});

	test('resolve inMemory disposes when last reference released', async () => {
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/test/inMemoryDispose' });
		const languageSelection = accessor.languageService.createById('json');
		accessor.modelService.createModel('Hello InMemory', languageSelection, resource);

		const ref = await accessor.textModelResolverService.createModelReference(resource);
		const textModel = ref.object.textEditorModel;
		assert.ok(textModel);
		assert(!textModel.isDisposed());

		const p = new Promise<void>(resolve => disposables.add(textModel.onWillDispose(resolve)));
		ref.dispose();

		await p;
		assert(textModel.isDisposed(), 'the inMemory text model should be disposed after last reference is released');
	});

	test('resolve inMemory is refcounted', async () => {
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/test/inMemoryRefcount' });
		const languageSelection = accessor.languageService.createById('json');
		accessor.modelService.createModel('Hello InMemory', languageSelection, resource);

		const ref1 = await accessor.textModelResolverService.createModelReference(resource);
		const ref2 = await accessor.textModelResolverService.createModelReference(resource);
		const textModel = ref1.object.textEditorModel;

		assert.strictEqual(ref1.object, ref2.object, 'they are the same model');
		assert(!textModel.isDisposed());

		ref1.dispose();
		assert(!textModel.isDisposed(), 'should not dispose while ref2 is still alive');

		const p = new Promise<void>(resolve => disposables.add(textModel.onWillDispose(resolve)));
		ref2.dispose();

		await p;
		assert(textModel.isDisposed(), 'should dispose after last reference released');
	});

	test('resolve inMemory reuses model when re-acquired during dispose', async () => {
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/test/inMemoryReuse' });
		const languageSelection = accessor.languageService.createById('json');
		accessor.modelService.createModel('Hello Reuse', languageSelection, resource);

		const ref1 = await accessor.textModelResolverService.createModelReference(resource);
		const model1 = ref1.object;

		// Release last reference, starts async dispose
		ref1.dispose();

		// Immediately re-acquire before the async dispose completes
		const ref2 = await accessor.textModelResolverService.createModelReference(resource);
		const model2 = ref2.object;

		assert.ok(model2);
		const textModel = model2.textEditorModel;
		assert.strictEqual(textModel.getValue(), 'Hello Reuse');
		assert.strictEqual(model1, model2, 'should reuse the same model instance');

		const p = new Promise<void>(resolve => disposables.add(textModel.onWillDispose(resolve)));
		ref2.dispose();

		await p;
		assert(textModel.isDisposed());
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
