/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { EncodingMode, TextFileEditorModelState, snapshotToString, isTextFileEditorModel, ITextFileEditorModelSaveEvent } from 'vs/workbench/services/textfile/common/textfiles';
import { createFileEditorInput, workbenchInstantiationService, TestServiceAccessor, TestReadonlyTextFileEditorModel, getLastResolvedFileStat } from 'vs/workbench/test/browser/workbenchTestServices';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from 'vs/base/test/common/utils';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { FileOperationResult, FileOperationError } from 'vs/platform/files/common/files';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { assertIsDefined } from 'vs/base/common/types';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { SaveReason, SaveSourceRegistry } from 'vs/workbench/common/editor';
import { isEqual } from 'vs/base/common/resources';
import { UTF16be } from 'vs/workbench/services/textfile/common/encoding';
import { isWeb } from 'vs/base/common/platform';

suite('Files - TextFileEditorModel', () => {

	function getLastModifiedTime(model: TextFileEditorModel): number {
		const stat = getLastResolvedFileStat(model);

		return stat ? stat.mtime : -1;
	}

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;
	let content: string;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		content = accessor.fileService.getContent();
		disposables.add(<TextFileEditorModelManager>accessor.textFileService.files);
		disposables.add(toDisposable(() => accessor.fileService.setContent(content)));
	});

	teardown(async () => {
		for (const textFileEditorModel of accessor.textFileService.files.models) {
			textFileEditorModel.dispose();
		}

		disposables.clear();
	});

	test('basic events', async function () {
		const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));
		accessor.workingCopyService.testUnregisterWorkingCopy(model); // causes issues with subsequent resolves otherwise

		let onDidResolveCounter = 0;
		disposables.add(model.onDidResolve(() => onDidResolveCounter++));

		await model.resolve();

		assert.strictEqual(onDidResolveCounter, 1);

		let onDidChangeContentCounter = 0;
		disposables.add(model.onDidChangeContent(() => onDidChangeContentCounter++));

		let onDidChangeDirtyCounter = 0;
		disposables.add(model.onDidChangeDirty(() => onDidChangeDirtyCounter++));

		model.updateTextEditorModel(createTextBufferFactory('bar'));

		assert.strictEqual(onDidChangeContentCounter, 1);
		assert.strictEqual(onDidChangeDirtyCounter, 1);

		model.updateTextEditorModel(createTextBufferFactory('foo'));

		assert.strictEqual(onDidChangeContentCounter, 2);
		assert.strictEqual(onDidChangeDirtyCounter, 1);

		await model.revert();

		assert.strictEqual(onDidChangeDirtyCounter, 2);
	});

	test('isTextFileEditorModel', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		assert.strictEqual(isTextFileEditorModel(model), true);

		model.dispose();
	});

	test('save', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.resolve();

		assert.strictEqual(accessor.workingCopyService.dirtyCount, 0);

		let savedEvent: ITextFileEditorModelSaveEvent | undefined = undefined;
		disposables.add(model.onDidSave(e => savedEvent = e));

		await model.save();
		assert.ok(!savedEvent);

		model.updateTextEditorModel(createTextBufferFactory('bar'));
		assert.ok(getLastModifiedTime(model) <= Date.now());
		assert.ok(model.hasState(TextFileEditorModelState.DIRTY));
		assert.ok(model.isModified());

		assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
		assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);

		let workingCopyEvent = false;
		disposables.add(accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		}));

		const source = SaveSourceRegistry.registerSource('testSource', 'Hello Save');
		const pendingSave = model.save({ reason: SaveReason.AUTO, source });
		assert.ok(model.hasState(TextFileEditorModelState.PENDING_SAVE));

		await Promise.all([pendingSave, model.joinState(TextFileEditorModelState.PENDING_SAVE)]);

		assert.ok(model.hasState(TextFileEditorModelState.SAVED));
		assert.ok(!model.isDirty());
		assert.ok(!model.isModified());
		assert.ok(savedEvent);
		assert.ok((savedEvent as ITextFileEditorModelSaveEvent).stat);
		assert.strictEqual((savedEvent as ITextFileEditorModelSaveEvent).reason, SaveReason.AUTO);
		assert.strictEqual((savedEvent as ITextFileEditorModelSaveEvent).source, source);
		assert.ok(workingCopyEvent);

		assert.strictEqual(accessor.workingCopyService.dirtyCount, 0);
		assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), false);

		savedEvent = undefined;

		await model.save({ force: true });
		assert.ok(savedEvent);

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('save - touching also emits saved event', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.resolve();

		let savedEvent = false;
		disposables.add(model.onDidSave(() => savedEvent = true));

		let workingCopyEvent = false;
		disposables.add(accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		}));

		await model.save({ force: true });

		assert.ok(savedEvent);
		assert.ok(!workingCopyEvent);

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('save - touching with error turns model dirty', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.resolve();

		let saveErrorEvent = false;
		disposables.add(model.onDidSaveError(() => saveErrorEvent = true));

		let savedEvent = false;
		disposables.add(model.onDidSave(() => savedEvent = true));

		accessor.fileService.writeShouldThrowError = new Error('failed to write');
		try {
			await model.save({ force: true });

			assert.ok(model.hasState(TextFileEditorModelState.ERROR));
			assert.ok(model.isDirty());
			assert.ok(model.isModified());
			assert.ok(saveErrorEvent);

			assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
			assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}

		await model.save({ force: true });

		assert.ok(savedEvent);
		assert.strictEqual(model.isDirty(), false);

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('save - returns false when save fails', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.resolve();

		accessor.fileService.writeShouldThrowError = new Error('failed to write');
		try {
			const res = await model.save({ force: true });
			assert.strictEqual(res, false);
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}

		const res = await model.save({ force: true });
		assert.strictEqual(res, true);

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('save error (generic)', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.resolve();

		model.updateTextEditorModel(createTextBufferFactory('bar'));

		let saveErrorEvent = false;
		disposables.add(model.onDidSaveError(() => saveErrorEvent = true));

		accessor.fileService.writeShouldThrowError = new Error('failed to write');
		try {
			const pendingSave = model.save();
			assert.ok(model.hasState(TextFileEditorModelState.PENDING_SAVE));

			await pendingSave;

			assert.ok(model.hasState(TextFileEditorModelState.ERROR));
			assert.ok(model.isDirty());
			assert.ok(model.isModified());
			assert.ok(saveErrorEvent);

			assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
			assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);

			model.dispose();
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}
	});

	test('save error (conflict)', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.resolve();

		model.updateTextEditorModel(createTextBufferFactory('bar'));

		let saveErrorEvent = false;
		disposables.add(model.onDidSaveError(() => saveErrorEvent = true));

		accessor.fileService.writeShouldThrowError = new FileOperationError('save conflict', FileOperationResult.FILE_MODIFIED_SINCE);
		try {
			const pendingSave = model.save();
			assert.ok(model.hasState(TextFileEditorModelState.PENDING_SAVE));

			await pendingSave;

			assert.ok(model.hasState(TextFileEditorModelState.CONFLICT));
			assert.ok(model.isDirty());
			assert.ok(model.isModified());
			assert.ok(saveErrorEvent);

			assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
			assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);

			model.dispose();
		} finally {
			accessor.fileService.writeShouldThrowError = undefined;
		}
	});

	test('setEncoding - encode', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		let encodingEvent = false;
		disposables.add(model.onDidChangeEncoding(() => encodingEvent = true));

		await model.setEncoding('utf8', EncodingMode.Encode); // no-op
		assert.strictEqual(getLastModifiedTime(model), -1);

		assert.ok(!encodingEvent);

		await model.setEncoding('utf16', EncodingMode.Encode);

		assert.ok(encodingEvent);

		assert.ok(getLastModifiedTime(model) <= Date.now()); // indicates model was saved due to encoding change
	});

	test('setEncoding - decode', async function () {
		let model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));
		accessor.workingCopyService.testUnregisterWorkingCopy(model); // causes issues with subsequent resolves otherwise

		await model.setEncoding('utf16', EncodingMode.Decode);

		// we have to get the model again from working copy service
		// because `setEncoding` will resolve it again through the
		// text file service which is outside our scope
		model = accessor.workingCopyService.get(model) as TextFileEditorModel;

		assert.ok(model.isResolved()); // model got resolved due to decoding
	});

	test('setEncoding - decode dirty file saves first', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));
		accessor.workingCopyService.testUnregisterWorkingCopy(model); // causes issues with subsequent resolves otherwise

		await model.resolve();

		model.updateTextEditorModel(createTextBufferFactory('bar'));
		assert.strictEqual(model.isDirty(), true);

		await model.setEncoding('utf16', EncodingMode.Decode);

		assert.strictEqual(model.isDirty(), false);
	});

	test('encoding updates with language based configuration', async function () {
		const languageId = 'text-file-model-test';
		disposables.add(accessor.languageService.registerLanguage({
			id: languageId,
		}));

		accessor.testConfigurationService.setOverrideIdentifiers('files.encoding', [languageId]);

		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));
		accessor.workingCopyService.testUnregisterWorkingCopy(model); // causes issues with subsequent resolves otherwise

		await model.resolve();

		const deferredPromise = new DeferredPromise<TextFileEditorModel>();

		// We use this listener as a way to figure out that the working
		// copy was resolved again as part of the language change
		disposables.add(accessor.workingCopyService.onDidRegister(e => {
			if (isEqual(e.resource, model.resource)) {
				deferredPromise.complete(model as TextFileEditorModel);
			}
		}));

		accessor.testConfigurationService.setUserConfiguration('files.encoding', UTF16be);

		model.setLanguageId(languageId);

		await deferredPromise.p;

		assert.strictEqual(model.getEncoding(), UTF16be);
	});

	test('create with language', async function () {
		const languageId = 'text-file-model-test';
		disposables.add(accessor.languageService.registerLanguage({
			id: languageId,
		}));

		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', languageId);

		await model.resolve();

		assert.strictEqual(model.textEditorModel!.getLanguageId(), languageId);

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('disposes when underlying model is destroyed', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.resolve();

		model.textEditorModel!.dispose();
		assert.ok(model.isDisposed());
	});

	test('Resolve does not trigger save', async function () {
		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index.txt'), 'utf8', undefined);
		assert.ok(model.hasState(TextFileEditorModelState.SAVED));

		disposables.add(model.onDidSave(() => assert.fail()));
		disposables.add(model.onDidChangeDirty(() => assert.fail()));

		await model.resolve();
		assert.ok(model.isResolved());
		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('Resolve returns dirty model as long as model is dirty', async function () {
		const model = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));
		assert.ok(model.isDirty());
		assert.ok(model.hasState(TextFileEditorModelState.DIRTY));

		await model.resolve();
		assert.ok(model.isDirty());
	});

	test('Resolve with contents', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.resolve({ contents: createTextBufferFactory('Hello World') });

		assert.strictEqual(model.textEditorModel?.getValue(), 'Hello World');
		assert.strictEqual(model.isDirty(), true);

		await model.resolve({ contents: createTextBufferFactory('Hello Changes') });

		assert.strictEqual(model.textEditorModel?.getValue(), 'Hello Changes');
		assert.strictEqual(model.isDirty(), true);

		// verify that we do not mark the model as saved when undoing once because
		// we never really had a saved state
		await model.textEditorModel!.undo();
		assert.ok(model.isDirty());

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('Revert', async function () {
		let eventCounter = 0;

		let model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		disposables.add(model.onDidRevert(() => eventCounter++));

		let workingCopyEvent = false;
		disposables.add(accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		}));

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));
		assert.ok(model.isDirty());
		assert.ok(model.isModified());

		assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
		assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);

		accessor.workingCopyService.testUnregisterWorkingCopy(model); // causes issues with subsequent resolves otherwise

		await model.revert();

		// we have to get the model again from working copy service
		// because `setEncoding` will resolve it again through the
		// text file service which is outside our scope
		model = accessor.workingCopyService.get(model) as TextFileEditorModel;

		assert.strictEqual(model.isDirty(), false);
		assert.strictEqual(model.isModified(), false);
		assert.strictEqual(eventCounter, 1);

		assert.ok(workingCopyEvent);
		assert.strictEqual(accessor.workingCopyService.dirtyCount, 0);
		assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), false);
	});

	test('Revert (soft)', async function () {
		let eventCounter = 0;

		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		disposables.add(model.onDidRevert(() => eventCounter++));

		let workingCopyEvent = false;
		disposables.add(accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		}));

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));
		assert.ok(model.isDirty());
		assert.ok(model.isModified());

		assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
		assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);

		await model.revert({ soft: true });
		assert.strictEqual(model.isDirty(), false);
		assert.strictEqual(model.isModified(), false);
		assert.strictEqual(model.textEditorModel!.getValue(), 'foo');
		assert.strictEqual(eventCounter, 1);

		assert.ok(workingCopyEvent);
		assert.strictEqual(accessor.workingCopyService.dirtyCount, 0);
		assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), false);
	});

	test('Undo to saved state turns model non-dirty', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));
		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('Hello Text'));
		assert.ok(model.isDirty());

		await model.textEditorModel!.undo();
		assert.ok(!model.isDirty());
	});

	test('Resolve and undo turns model dirty', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));
		await model.resolve();
		accessor.fileService.setContent('Hello Change');

		await model.resolve();
		await model.textEditorModel!.undo();
		assert.ok(model.isDirty());

		assert.strictEqual(accessor.workingCopyService.dirtyCount, 1);
		assert.strictEqual(accessor.workingCopyService.isDirty(model.resource, model.typeId), true);
	});

	test('Update Dirty', async function () {
		let eventCounter = 0;

		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		model.setDirty(true);
		assert.ok(!model.isDirty()); // needs to be resolved

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));
		assert.ok(model.isDirty());

		await model.revert({ soft: true });
		assert.strictEqual(model.isDirty(), false);

		disposables.add(model.onDidChangeDirty(() => eventCounter++));

		let workingCopyEvent = false;
		disposables.add(accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		}));

		model.setDirty(true);
		assert.ok(model.isDirty());
		assert.strictEqual(eventCounter, 1);
		assert.ok(workingCopyEvent);

		model.setDirty(false);
		assert.strictEqual(model.isDirty(), false);
		assert.strictEqual(eventCounter, 2);
	});

	test('No Dirty or saving for readonly models', async function () {
		let workingCopyEvent = false;
		disposables.add(accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		}));

		const model = disposables.add(instantiationService.createInstance(TestReadonlyTextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		let saveEvent = false;
		disposables.add(model.onDidSave(() => {
			saveEvent = true;
		}));

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));
		assert.ok(!model.isDirty());

		await model.save({ force: true });
		assert.strictEqual(saveEvent, false);

		await model.revert({ soft: true });
		assert.ok(!model.isDirty());

		assert.ok(!workingCopyEvent);
	});

	test('File not modified error is handled gracefully', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		await model.resolve();

		const mtime = getLastModifiedTime(model);
		accessor.textFileService.setReadStreamErrorOnce(new FileOperationError('error', FileOperationResult.FILE_NOT_MODIFIED_SINCE));

		await model.resolve();

		assert.ok(model);
		assert.strictEqual(getLastModifiedTime(model), mtime);
	});

	test('Resolve error is handled gracefully if model already exists', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		await model.resolve();
		accessor.textFileService.setReadStreamErrorOnce(new FileOperationError('error', FileOperationResult.FILE_NOT_FOUND));

		await model.resolve();
		assert.ok(model);
	});

	test('save() and isDirty() - proper with check for mtimes', async function () {
		const input1 = disposables.add(createFileEditorInput(instantiationService, toResource.call(this, '/path/index_async2.txt')));
		const input2 = disposables.add(createFileEditorInput(instantiationService, toResource.call(this, '/path/index_async.txt')));

		const model1 = disposables.add(await input1.resolve() as TextFileEditorModel);
		const model2 = disposables.add(await input2.resolve() as TextFileEditorModel);

		model1.updateTextEditorModel(createTextBufferFactory('foo'));

		const m1Mtime = assertIsDefined(getLastResolvedFileStat(model1)).mtime;
		const m2Mtime = assertIsDefined(getLastResolvedFileStat(model2)).mtime;
		assert.ok(m1Mtime > 0);
		assert.ok(m2Mtime > 0);

		assert.ok(accessor.textFileService.isDirty(toResource.call(this, '/path/index_async2.txt')));
		assert.ok(!accessor.textFileService.isDirty(toResource.call(this, '/path/index_async.txt')));

		model2.updateTextEditorModel(createTextBufferFactory('foo'));
		assert.ok(accessor.textFileService.isDirty(toResource.call(this, '/path/index_async.txt')));

		await timeout(10);
		await accessor.textFileService.save(toResource.call(this, '/path/index_async.txt'));
		await accessor.textFileService.save(toResource.call(this, '/path/index_async2.txt'));
		assert.ok(!accessor.textFileService.isDirty(toResource.call(this, '/path/index_async.txt')));
		assert.ok(!accessor.textFileService.isDirty(toResource.call(this, '/path/index_async2.txt')));

		if (isWeb) {
			// web tests does not ensure timeouts are respected at all, so we cannot
			// really assert the mtime to be different, only that it is equal or greater.
			// https://github.com/microsoft/vscode/issues/161886
			assert.ok(assertIsDefined(getLastResolvedFileStat(model1)).mtime >= m1Mtime);
			assert.ok(assertIsDefined(getLastResolvedFileStat(model2)).mtime >= m2Mtime);
		} else {
			// on desktop we want to assert this condition more strictly though
			assert.ok(assertIsDefined(getLastResolvedFileStat(model1)).mtime > m1Mtime);
			assert.ok(assertIsDefined(getLastResolvedFileStat(model2)).mtime > m2Mtime);
		}
	});

	test('Save Participant', async function () {
		let eventCounter = 0;
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		disposables.add(model.onDidSave(() => {
			assert.strictEqual(snapshotToString(model.createSnapshot()!), eventCounter === 1 ? 'bar' : 'foobar');
			assert.ok(!model.isDirty());
			eventCounter++;
		}));

		const participant = accessor.textFileService.files.addSaveParticipant({
			participate: async model => {
				assert.ok(model.isDirty());
				(model as TextFileEditorModel).updateTextEditorModel(createTextBufferFactory('bar'));
				assert.ok(model.isDirty());
				eventCounter++;
			}
		});

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));
		assert.ok(model.isDirty());

		await model.save();
		assert.strictEqual(eventCounter, 2);

		participant.dispose();
		model.updateTextEditorModel(createTextBufferFactory('foobar'));
		assert.ok(model.isDirty());

		await model.save();
		assert.strictEqual(eventCounter, 3);
	});

	test('Save Participant - skip', async function () {
		let eventCounter = 0;
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		disposables.add(accessor.textFileService.files.addSaveParticipant({
			participate: async () => {
				eventCounter++;
			}
		}));

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));

		await model.save({ skipSaveParticipants: true });
		assert.strictEqual(eventCounter, 0);
	});

	test('Save Participant, async participant', async function () {
		let eventCounter = 0;
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		disposables.add(model.onDidSave(() => {
			assert.ok(!model.isDirty());
			eventCounter++;
		}));

		disposables.add(accessor.textFileService.files.addSaveParticipant({
			participate: model => {
				assert.ok(model.isDirty());
				(model as TextFileEditorModel).updateTextEditorModel(createTextBufferFactory('bar'));
				assert.ok(model.isDirty());
				eventCounter++;

				return timeout(10);
			}
		}));

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));

		const now = Date.now();
		await model.save();
		assert.strictEqual(eventCounter, 2);
		assert.ok(Date.now() - now >= 10);
	});

	test('Save Participant, bad participant', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		disposables.add(accessor.textFileService.files.addSaveParticipant({
			participate: async () => {
				new Error('boom');
			}
		}));

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));

		await model.save();
	});

	test('Save Participant, participant cancelled when saved again', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		const participations: boolean[] = [];

		disposables.add(accessor.textFileService.files.addSaveParticipant({
			participate: async (model, context, progress, token) => {
				await timeout(10);

				if (!token.isCancellationRequested) {
					participations.push(true);
				}
			}
		}));

		await model.resolve();

		model.updateTextEditorModel(createTextBufferFactory('foo'));
		const p1 = model.save();

		model.updateTextEditorModel(createTextBufferFactory('foo 1'));
		const p2 = model.save();

		model.updateTextEditorModel(createTextBufferFactory('foo 2'));
		const p3 = model.save();

		model.updateTextEditorModel(createTextBufferFactory('foo 3'));
		const p4 = model.save();

		await Promise.all([p1, p2, p3, p4]);
		assert.strictEqual(participations.length, 1);
	});

	test('Save Participant, calling save from within is unsupported but does not explode (sync save, no model change)', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		await testSaveFromSaveParticipant(model, false, false, false);
	});

	test('Save Participant, calling save from within is unsupported but does not explode (async save, no model change)', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		await testSaveFromSaveParticipant(model, true, false, false);
	});

	test('Save Participant, calling save from within is unsupported but does not explode (sync save, model change)', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		await testSaveFromSaveParticipant(model, false, true, false);
	});

	test('Save Participant, calling save from within is unsupported but does not explode (async save, model change)', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		await testSaveFromSaveParticipant(model, true, true, false);
	});

	test('Save Participant, calling save from within is unsupported but does not explode (force)', async function () {
		const model: TextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined));

		await testSaveFromSaveParticipant(model, false, false, true);
	});

	async function testSaveFromSaveParticipant(model: TextFileEditorModel, async: boolean, modelChange: boolean, force: boolean): Promise<void> {

		disposables.add(accessor.textFileService.files.addSaveParticipant({
			participate: async () => {
				if (async) {
					await timeout(10);
				}

				if (modelChange) {
					model.updateTextEditorModel(createTextBufferFactory('bar'));

					const newSavePromise = model.save(force ? { force } : undefined);

					// assert that this is not the same promise as the outer one
					assert.notStrictEqual(savePromise, newSavePromise);

					await newSavePromise;
				} else {
					const newSavePromise = model.save(force ? { force } : undefined);

					// assert that this is the same promise as the outer one
					assert.strictEqual(savePromise, newSavePromise);

					await savePromise;
				}
			}
		}));

		await model.resolve();
		model.updateTextEditorModel(createTextBufferFactory('foo'));

		const savePromise = model.save(force ? { force } : undefined);
		await savePromise;
	}

	ensureNoDisposablesAreLeakedInTestSuite();
});
