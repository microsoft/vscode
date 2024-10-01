/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService, TestServiceAccessor, ITestTextFileEditorModelManager } from '../../../../test/browser/workbenchTestServices.js';
import { TextFileEditorModel } from '../../common/textFileEditorModel.js';
import { FileChangesEvent, FileChangeType, FileOperationError, FileOperationResult } from '../../../../../platform/files/common/files.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { ITextFileEditorModel } from '../../common/textfiles.js';
import { createTextBufferFactory } from '../../../../../editor/common/model/textModel.js';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';

suite('Files - TextFileEditorModelManager', () => {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(toDisposable(() => accessor.textFileService.files as ITestTextFileEditorModelManager));
	});

	teardown(() => {
		disposables.clear();
	});

	test('add, remove, clear, get, getAll', function () {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;

		const model1: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random1.txt'), 'utf8', undefined));
		const model2: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random2.txt'), 'utf8', undefined));
		const model3: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random3.txt'), 'utf8', undefined));

		manager.add(URI.file('/test.html'), model1);
		manager.add(URI.file('/some/other.html'), model2);
		manager.add(URI.file('/some/this.txt'), model3);

		const fileUpper = URI.file('/TEST.html');

		assert(!manager.get(URI.file('foo')));
		assert.strictEqual(manager.get(URI.file('/test.html')), model1);

		assert.ok(!manager.get(fileUpper));

		let results = manager.models;
		assert.strictEqual(3, results.length);

		let result = manager.get(URI.file('/yes'));
		assert.ok(!result);

		result = manager.get(URI.file('/some/other.txt'));
		assert.ok(!result);

		result = manager.get(URI.file('/some/other.html'));
		assert.ok(result);

		result = manager.get(fileUpper);
		assert.ok(!result);

		manager.remove(URI.file(''));

		results = manager.models;
		assert.strictEqual(3, results.length);

		manager.remove(URI.file('/some/other.html'));
		results = manager.models;
		assert.strictEqual(2, results.length);

		manager.remove(fileUpper);
		results = manager.models;
		assert.strictEqual(2, results.length);

		manager.dispose();
		results = manager.models;
		assert.strictEqual(0, results.length);
	});

	test('resolve', async () => {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;
		const resource = URI.file('/test.html');
		const encoding = 'utf8';

		const events: ITextFileEditorModel[] = [];
		disposables.add(manager.onDidCreate(model => {
			events.push(model);
		}));

		const modelPromise = manager.resolve(resource, { encoding });
		assert.ok(manager.get(resource)); // model known even before resolved()

		const model1 = await modelPromise;
		assert.ok(model1);
		assert.strictEqual(model1.getEncoding(), encoding);
		assert.strictEqual(manager.get(resource), model1);

		const model2 = await manager.resolve(resource, { encoding });
		assert.strictEqual(model2, model1);
		model1.dispose();

		const model3 = await manager.resolve(resource, { encoding });
		assert.notStrictEqual(model3, model2);
		assert.strictEqual(manager.get(resource), model3);
		model3.dispose();

		assert.strictEqual(events.length, 2);
		assert.strictEqual(events[0].resource.toString(), model1.resource.toString());
		assert.strictEqual(events[1].resource.toString(), model2.resource.toString());
	});

	test('resolve (async)', async () => {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;
		const resource = URI.file('/path/index.txt');

		disposables.add(await manager.resolve(resource));

		let didResolve = false;
		const onDidResolve = new Promise<void>(resolve => {
			disposables.add(manager.onDidResolve(({ model }) => {
				if (model.resource.toString() === resource.toString()) {
					didResolve = true;
					resolve();
				}
			}));
		});

		manager.resolve(resource, { reload: { async: true } });

		await onDidResolve;

		assert.strictEqual(didResolve, true);
	});

	test('resolve (sync)', async () => {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;
		const resource = URI.file('/path/index.txt');

		disposables.add(await manager.resolve(resource));

		let didResolve = false;
		disposables.add(manager.onDidResolve(({ model }) => {
			if (model.resource.toString() === resource.toString()) {
				didResolve = true;
			}
		}));

		await manager.resolve(resource, { reload: { async: false } });
		assert.strictEqual(didResolve, true);
	});

	test('resolve (sync) - model disposed when error and first call to resolve', async () => {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;
		const resource = URI.file('/path/index.txt');

		accessor.textFileService.setReadStreamErrorOnce(new FileOperationError('fail', FileOperationResult.FILE_OTHER_ERROR));

		let error: Error | undefined = undefined;
		try {
			disposables.add(await manager.resolve(resource));
		} catch (e) {
			error = e;
		}

		assert.ok(error);
		assert.strictEqual(manager.models.length, 0);
	});

	test('resolve (sync) - model not disposed when error and model existed before', async () => {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;
		const resource = URI.file('/path/index.txt');

		disposables.add(await manager.resolve(resource));

		accessor.textFileService.setReadStreamErrorOnce(new FileOperationError('fail', FileOperationResult.FILE_OTHER_ERROR));

		let error: Error | undefined = undefined;
		try {
			disposables.add(await manager.resolve(resource, { reload: { async: false } }));
		} catch (e) {
			error = e;
		}

		assert.ok(error);
		assert.strictEqual(manager.models.length, 1);
	});

	test('resolve with initial contents', async () => {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;
		const resource = URI.file('/test.html');

		const model = disposables.add(await manager.resolve(resource, { contents: createTextBufferFactory('Hello World') }));
		assert.strictEqual(model.textEditorModel?.getValue(), 'Hello World');
		assert.strictEqual(model.isDirty(), true);

		disposables.add(await manager.resolve(resource, { contents: createTextBufferFactory('More Changes') }));
		assert.strictEqual(model.textEditorModel?.getValue(), 'More Changes');
		assert.strictEqual(model.isDirty(), true);
	});

	test('multiple resolves execute in sequence', async () => {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;
		const resource = URI.file('/test.html');

		let resolvedModel: unknown;

		const contents: string[] = [];
		disposables.add(manager.onDidResolve(e => {
			if (e.model.resource.toString() === resource.toString()) {
				resolvedModel = disposables.add(e.model as TextFileEditorModel);
				contents.push(e.model.textEditorModel!.getValue());
			}
		}));

		await Promise.all([
			manager.resolve(resource),
			manager.resolve(resource, { contents: createTextBufferFactory('Hello World') }),
			manager.resolve(resource, { reload: { async: false } }),
			manager.resolve(resource, { contents: createTextBufferFactory('More Changes') })
		]);

		assert.ok(resolvedModel instanceof TextFileEditorModel);

		assert.strictEqual(resolvedModel.textEditorModel?.getValue(), 'More Changes');
		assert.strictEqual(resolvedModel.isDirty(), true);

		assert.strictEqual(contents[0], 'Hello Html');
		assert.strictEqual(contents[1], 'Hello World');
		assert.strictEqual(contents[2], 'More Changes');
	});

	test('removed from cache when model disposed', function () {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;

		const model1: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random1.txt'), 'utf8', undefined));
		const model2: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random2.txt'), 'utf8', undefined));
		const model3: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/random3.txt'), 'utf8', undefined));

		manager.add(URI.file('/test.html'), model1);
		manager.add(URI.file('/some/other.html'), model2);
		manager.add(URI.file('/some/this.txt'), model3);

		assert.strictEqual(manager.get(URI.file('/test.html')), model1);

		model1.dispose();
		assert(!manager.get(URI.file('/test.html')));
	});

	test('events', async function () {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;

		const resource1 = toResource.call(this, '/path/index.txt');
		const resource2 = toResource.call(this, '/path/other.txt');

		let resolvedCounter = 0;
		let removedCounter = 0;
		let gotDirtyCounter = 0;
		let gotNonDirtyCounter = 0;
		let revertedCounter = 0;
		let savedCounter = 0;
		let encodingCounter = 0;

		disposables.add(manager.onDidResolve(({ model }) => {
			if (model.resource.toString() === resource1.toString()) {
				resolvedCounter++;
			}
		}));

		disposables.add(manager.onDidRemove(resource => {
			if (resource.toString() === resource1.toString() || resource.toString() === resource2.toString()) {
				removedCounter++;
			}
		}));

		disposables.add(manager.onDidChangeDirty(model => {
			if (model.resource.toString() === resource1.toString()) {
				if (model.isDirty()) {
					gotDirtyCounter++;
				} else {
					gotNonDirtyCounter++;
				}
			}
		}));

		disposables.add(manager.onDidRevert(model => {
			if (model.resource.toString() === resource1.toString()) {
				revertedCounter++;
			}
		}));

		disposables.add(manager.onDidSave(({ model }) => {
			if (model.resource.toString() === resource1.toString()) {
				savedCounter++;
			}
		}));

		disposables.add(manager.onDidChangeEncoding(model => {
			if (model.resource.toString() === resource1.toString()) {
				encodingCounter++;
			}
		}));

		const model1 = await manager.resolve(resource1, { encoding: 'utf8' });
		assert.strictEqual(resolvedCounter, 1);

		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.DELETED }], false));
		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource: resource1, type: FileChangeType.ADDED }], false));

		const model2 = await manager.resolve(resource2, { encoding: 'utf8' });
		assert.strictEqual(resolvedCounter, 2);

		(model1 as TextFileEditorModel).updateTextEditorModel(createTextBufferFactory('changed'));
		model1.updatePreferredEncoding('utf16');

		await model1.revert();
		(model1 as TextFileEditorModel).updateTextEditorModel(createTextBufferFactory('changed again'));

		await model1.save();
		model1.dispose();
		model2.dispose();

		await model1.revert();
		assert.strictEqual(removedCounter, 2);
		assert.strictEqual(gotDirtyCounter, 2);
		assert.strictEqual(gotNonDirtyCounter, 2);
		assert.strictEqual(revertedCounter, 1);
		assert.strictEqual(savedCounter, 1);
		assert.strictEqual(encodingCounter, 2);

		model1.dispose();
		model2.dispose();
		assert.ok(!accessor.modelService.getModel(resource1));
		assert.ok(!accessor.modelService.getModel(resource2));
	});

	test('disposing model takes it out of the manager', async function () {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;

		const resource = toResource.call(this, '/path/index_something.txt');

		const model = await manager.resolve(resource, { encoding: 'utf8' });
		model.dispose();
		assert.ok(!manager.get(resource));
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('canDispose with dirty model', async function () {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;

		const resource = toResource.call(this, '/path/index_something.txt');

		const model = disposables.add(await manager.resolve(resource, { encoding: 'utf8' }));
		(model as TextFileEditorModel).updateTextEditorModel(createTextBufferFactory('make dirty'));

		const canDisposePromise = manager.canDispose(model as TextFileEditorModel);
		assert.ok(canDisposePromise instanceof Promise);

		let canDispose = false;
		(async () => {
			canDispose = await canDisposePromise;
		})();

		assert.strictEqual(canDispose, false);
		model.revert({ soft: true });

		await timeout(0);

		assert.strictEqual(canDispose, true);

		const canDispose2 = manager.canDispose(model as TextFileEditorModel);
		assert.strictEqual(canDispose2, true);
	});

	test('language', async function () {

		const languageId = 'text-file-model-manager-test';
		disposables.add(accessor.languageService.registerLanguage({
			id: languageId,
		}));

		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;

		const resource: URI = toResource.call(this, '/path/index_something.txt');

		let model = disposables.add(await manager.resolve(resource, { languageId: languageId }));
		assert.strictEqual(model.textEditorModel!.getLanguageId(), languageId);

		model = await manager.resolve(resource, { languageId: 'text' });
		assert.strictEqual(model.textEditorModel!.getLanguageId(), PLAINTEXT_LANGUAGE_ID);
	});

	test('file change events trigger reload (on a resolved model)', async () => {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;
		const resource = URI.file('/path/index.txt');

		disposables.add(await manager.resolve(resource));

		let didResolve = false;
		const onDidResolve = new Promise<void>(resolve => {
			disposables.add(manager.onDidResolve(({ model }) => {
				if (model.resource.toString() === resource.toString()) {
					didResolve = true;
					resolve();
				}
			}));
		});

		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }], false));

		await onDidResolve;
		assert.strictEqual(didResolve, true);
	});

	test('file change events trigger reload (after a model is resolved: https://github.com/microsoft/vscode/issues/132765)', async () => {
		const manager = accessor.textFileService.files as ITestTextFileEditorModelManager;
		const resource = URI.file('/path/index.txt');

		manager.resolve(resource);

		let didResolve = false;
		let resolvedCounter = 0;
		const onDidResolve = new Promise<void>(resolve => {
			disposables.add(manager.onDidResolve(({ model }) => {
				disposables.add(model);
				if (model.resource.toString() === resource.toString()) {
					resolvedCounter++;
					if (resolvedCounter === 2) {
						didResolve = true;
						resolve();
					}
				}
			}));
		});

		accessor.fileService.fireFileChanges(new FileChangesEvent([{ resource, type: FileChangeType.UPDATED }], false));

		await onDidResolve;
		assert.strictEqual(didResolve, true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
