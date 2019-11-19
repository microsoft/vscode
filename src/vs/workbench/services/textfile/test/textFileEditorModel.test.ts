/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EncodingMode } from 'vs/workbench/common/editor';
import { TextFileEditorModel, SaveSequentializer } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService, ModelState, StateChange, snapshotToString } from 'vs/workbench/services/textfile/common/textfiles';
import { workbenchInstantiationService, TestTextFileService, createFileInput, TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { FileOperationResult, FileOperationError, IFileService } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { timeout } from 'vs/base/common/async';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { assertIsDefined } from 'vs/base/common/types';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';

class ServiceAccessor {
	constructor(
		@ITextFileService public readonly textFileService: TestTextFileService,
		@IModelService public readonly modelService: IModelService,
		@IFileService public readonly fileService: TestFileService,
		@IWorkingCopyService public readonly workingCopyService: IWorkingCopyService
	) {
	}
}

function getLastModifiedTime(model: TextFileEditorModel): number {
	const stat = model.getStat();

	return stat ? stat.mtime : -1;
}

suite('Files - TextFileEditorModel', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;
	let content: string;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
		content = accessor.fileService.getContent();
	});

	teardown(() => {
		(<TextFileEditorModelManager>accessor.textFileService.models).clear();
		TextFileEditorModel.setSaveParticipant(null); // reset any set participant
		accessor.fileService.setContent(content);
	});

	test('save', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.load();

		assert.equal(accessor.workingCopyService.dirtyCount, 0);

		model.textEditorModel!.setValue('bar');
		assert.ok(getLastModifiedTime(model) <= Date.now());
		assert.ok(model.hasState(ModelState.DIRTY));

		assert.equal(accessor.workingCopyService.dirtyCount, 1);
		assert.equal(accessor.workingCopyService.isDirty(model.resource), true);

		let savedEvent = false;
		model.onDidStateChange(e => {
			if (e === StateChange.SAVED) {
				savedEvent = true;
			}
		});

		let workingCopyEvent = false;
		accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		});

		const pendingSave = model.save();
		assert.ok(model.hasState(ModelState.PENDING_SAVE));

		await pendingSave;

		assert.ok(model.getLastSaveAttemptTime() <= Date.now());
		assert.ok(model.hasState(ModelState.SAVED));
		assert.ok(!model.isDirty());
		assert.ok(savedEvent);
		assert.ok(workingCopyEvent);

		assert.equal(accessor.workingCopyService.dirtyCount, 0);
		assert.equal(accessor.workingCopyService.isDirty(model.resource), false);

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('save - touching also emits saved event', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.load();

		let savedEvent = false;
		model.onDidStateChange(e => {
			if (e === StateChange.SAVED) {
				savedEvent = true;
			}
		});

		let workingCopyEvent = false;
		accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		});

		await model.save({ force: true });

		assert.ok(savedEvent);
		assert.ok(!workingCopyEvent);

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('setEncoding - encode', function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		model.setEncoding('utf8', EncodingMode.Encode); // no-op
		assert.equal(getLastModifiedTime(model), -1);

		model.setEncoding('utf16', EncodingMode.Encode);

		assert.ok(getLastModifiedTime(model) <= Date.now()); // indicates model was saved due to encoding change

		model.dispose();
	});

	test('setEncoding - decode', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		model.setEncoding('utf16', EncodingMode.Decode);

		await timeout(0);
		assert.ok(model.isResolved()); // model got loaded due to decoding
		model.dispose();
	});

	test('create with mode', async function () {
		const mode = 'text-file-model-test';
		ModesRegistry.registerLanguage({
			id: mode,
		});

		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', mode);

		await model.load();

		assert.equal(model.textEditorModel!.getModeId(), mode);

		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('disposes when underlying model is destroyed', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.load();

		model.textEditorModel!.dispose();
		assert.ok(model.isDisposed());
	});

	test('Load does not trigger save', async function () {
		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index.txt'), 'utf8', undefined);
		assert.ok(model.hasState(ModelState.SAVED));

		model.onDidStateChange(e => {
			assert.ok(e !== StateChange.DIRTY && e !== StateChange.SAVED);
		});

		await model.load();
		assert.ok(model.isResolved());
		model.dispose();
		assert.ok(!accessor.modelService.getModel(model.resource));
	});

	test('Load returns dirty model as long as model is dirty', async function () {
		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(model.isDirty());
		assert.ok(model.hasState(ModelState.DIRTY));

		await model.load();
		assert.ok(model.isDirty());
		model.dispose();
	});

	test('Revert', async function () {
		let eventCounter = 0;

		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		model.onDidStateChange(e => {
			if (e === StateChange.REVERTED) {
				eventCounter++;
			}
		});

		let workingCopyEvent = false;
		accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		});

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(model.isDirty());

		assert.equal(accessor.workingCopyService.dirtyCount, 1);
		assert.equal(accessor.workingCopyService.isDirty(model.resource), true);

		await model.revert();
		assert.ok(!model.isDirty());
		assert.equal(model.textEditorModel!.getValue(), 'Hello Html');
		assert.equal(eventCounter, 1);

		assert.ok(workingCopyEvent);
		assert.equal(accessor.workingCopyService.dirtyCount, 0);
		assert.equal(accessor.workingCopyService.isDirty(model.resource), false);

		model.dispose();
	});

	test('Revert (soft)', async function () {
		let eventCounter = 0;

		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		model.onDidStateChange(e => {
			if (e === StateChange.REVERTED) {
				eventCounter++;
			}
		});

		let workingCopyEvent = false;
		accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		});

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(model.isDirty());

		assert.equal(accessor.workingCopyService.dirtyCount, 1);
		assert.equal(accessor.workingCopyService.isDirty(model.resource), true);

		await model.revert({ soft: true });
		assert.ok(!model.isDirty());
		assert.equal(model.textEditorModel!.getValue(), 'foo');
		assert.equal(eventCounter, 1);

		assert.ok(workingCopyEvent);
		assert.equal(accessor.workingCopyService.dirtyCount, 0);
		assert.equal(accessor.workingCopyService.isDirty(model.resource), false);

		model.dispose();
	});

	test('Load and undo turns model dirty', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);
		await model.load();
		accessor.fileService.setContent('Hello Change');

		await model.load();
		model.textEditorModel!.undo();
		assert.ok(model.isDirty());

		assert.equal(accessor.workingCopyService.dirtyCount, 1);
		assert.equal(accessor.workingCopyService.isDirty(model.resource), true);
	});

	test('Make Dirty', async function () {
		let eventCounter = 0;

		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		model.makeDirty();
		assert.ok(!model.isDirty()); // needs to be resolved

		await model.load();
		model.textEditorModel!.setValue('foo');
		assert.ok(model.isDirty());

		await model.revert({ soft: true });
		assert.ok(!model.isDirty());

		model.onDidStateChange(e => {
			if (e === StateChange.DIRTY) {
				eventCounter++;
			}
		});

		let workingCopyEvent = false;
		accessor.workingCopyService.onDidChangeDirty(e => {
			if (e.resource.toString() === model.resource.toString()) {
				workingCopyEvent = true;
			}
		});

		model.makeDirty();
		assert.ok(model.isDirty());
		assert.equal(eventCounter, 1);
		assert.ok(workingCopyEvent);

		model.dispose();
	});

	test('File not modified error is handled gracefully', async function () {
		let model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.load();

		const mtime = getLastModifiedTime(model);
		accessor.textFileService.setResolveTextContentErrorOnce(new FileOperationError('error', FileOperationResult.FILE_NOT_MODIFIED_SINCE));

		model = await model.load() as TextFileEditorModel;

		assert.ok(model);
		assert.equal(getLastModifiedTime(model), mtime);
		model.dispose();
	});

	test('Load error is handled gracefully if model already exists', async function () {
		let model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		await model.load();
		accessor.textFileService.setResolveTextContentErrorOnce(new FileOperationError('error', FileOperationResult.FILE_NOT_FOUND));

		model = await model.load() as TextFileEditorModel;
		assert.ok(model);
		model.dispose();
	});

	test('save() and isDirty() - proper with check for mtimes', async function () {
		const input1 = createFileInput(instantiationService, toResource.call(this, '/path/index_async2.txt'));
		const input2 = createFileInput(instantiationService, toResource.call(this, '/path/index_async.txt'));

		const model1 = await input1.resolve() as TextFileEditorModel;
		const model2 = await input2.resolve() as TextFileEditorModel;

		model1.textEditorModel!.setValue('foo');

		const m1Mtime = assertIsDefined(model1.getStat()).mtime;
		const m2Mtime = assertIsDefined(model2.getStat()).mtime;
		assert.ok(m1Mtime > 0);
		assert.ok(m2Mtime > 0);

		assert.ok(accessor.textFileService.isDirty());
		assert.ok(accessor.textFileService.isDirty(toResource.call(this, '/path/index_async2.txt')));
		assert.ok(!accessor.textFileService.isDirty(toResource.call(this, '/path/index_async.txt')));

		model2.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(toResource.call(this, '/path/index_async.txt')));

		await timeout(10);
		await accessor.textFileService.saveAll();
		assert.ok(!accessor.textFileService.isDirty(toResource.call(this, '/path/index_async.txt')));
		assert.ok(!accessor.textFileService.isDirty(toResource.call(this, '/path/index_async2.txt')));
		assert.ok(assertIsDefined(model1.getStat()).mtime > m1Mtime);
		assert.ok(assertIsDefined(model2.getStat()).mtime > m2Mtime);
		assert.ok(model1.getLastSaveAttemptTime() > m1Mtime);
		assert.ok(model2.getLastSaveAttemptTime() > m2Mtime);

		model1.dispose();
		model2.dispose();
	});

	test('Save Participant', async function () {
		let eventCounter = 0;
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		model.onDidStateChange(e => {
			if (e === StateChange.SAVED) {
				assert.equal(snapshotToString(model.createSnapshot()!), 'bar');
				assert.ok(!model.isDirty());
				eventCounter++;
			}
		});

		TextFileEditorModel.setSaveParticipant({
			participate: (model) => {
				assert.ok(model.isDirty());
				model.textEditorModel.setValue('bar');
				assert.ok(model.isDirty());
				eventCounter++;
				return Promise.resolve();
			}
		});

		await model.load();
		model.textEditorModel!.setValue('foo');

		await model.save();
		model.dispose();
		assert.equal(eventCounter, 2);
	});

	test('Save Participant, async participant', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		TextFileEditorModel.setSaveParticipant({
			participate: (model) => {
				return timeout(10);
			}
		});

		await model.load();
		model.textEditorModel!.setValue('foo');

		const now = Date.now();
		await model.save();
		assert.ok(Date.now() - now >= 10);
		model.dispose();
	});

	test('Save Participant, bad participant', async function () {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/index_async.txt'), 'utf8', undefined);

		TextFileEditorModel.setSaveParticipant({
			participate: (model) => {
				return Promise.reject(new Error('boom'));
			}
		});

		await model.load();
		model.textEditorModel!.setValue('foo');

		await model.save();
		model.dispose();
	});

	test('SaveSequentializer - pending basics', async function () {
		const sequentializer = new SaveSequentializer();

		assert.ok(!sequentializer.hasPendingSave());
		assert.ok(!sequentializer.hasPendingSave(2323));
		assert.ok(!sequentializer.pendingSave);

		// pending removes itself after done
		await sequentializer.setPending(1, Promise.resolve());
		assert.ok(!sequentializer.hasPendingSave());
		assert.ok(!sequentializer.hasPendingSave(1));
		assert.ok(!sequentializer.pendingSave);

		// pending removes itself after done (use timeout)
		sequentializer.setPending(2, timeout(1));
		assert.ok(sequentializer.hasPendingSave());
		assert.ok(sequentializer.hasPendingSave(2));
		assert.ok(!sequentializer.hasPendingSave(1));
		assert.ok(sequentializer.pendingSave);

		await timeout(2);
		assert.ok(!sequentializer.hasPendingSave());
		assert.ok(!sequentializer.hasPendingSave(2));
		assert.ok(!sequentializer.pendingSave);
	});

	test('SaveSequentializer - pending and next (finishes instantly)', async function () {
		const sequentializer = new SaveSequentializer();

		let pendingDone = false;
		sequentializer.setPending(1, timeout(1).then(() => { pendingDone = true; return; }));

		// next finishes instantly
		let nextDone = false;
		const res = sequentializer.setNext(() => Promise.resolve(null).then(() => { nextDone = true; return; }));

		await res;
		assert.ok(pendingDone);
		assert.ok(nextDone);
	});

	test('SaveSequentializer - pending and next (finishes after timeout)', async function () {
		const sequentializer = new SaveSequentializer();

		let pendingDone = false;
		sequentializer.setPending(1, timeout(1).then(() => { pendingDone = true; return; }));

		// next finishes after timeout
		let nextDone = false;
		const res = sequentializer.setNext(() => timeout(1).then(() => { nextDone = true; return; }));

		await res;
		assert.ok(pendingDone);
		assert.ok(nextDone);
	});

	test('SaveSequentializer - pending and multiple next (last one wins)', async function () {
		const sequentializer = new SaveSequentializer();

		let pendingDone = false;
		sequentializer.setPending(1, timeout(1).then(() => { pendingDone = true; return; }));

		// next finishes after timeout
		let firstDone = false;
		let firstRes = sequentializer.setNext(() => timeout(2).then(() => { firstDone = true; return; }));

		let secondDone = false;
		let secondRes = sequentializer.setNext(() => timeout(3).then(() => { secondDone = true; return; }));

		let thirdDone = false;
		let thirdRes = sequentializer.setNext(() => timeout(4).then(() => { thirdDone = true; return; }));

		await Promise.all([firstRes, secondRes, thirdRes]);
		assert.ok(pendingDone);
		assert.ok(!firstDone);
		assert.ok(!secondDone);
		assert.ok(thirdDone);
	});
});
