/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { toResource } from 'vs/base/test/common/utils';
import { workbenchInstantiationService, TestServiceAccessor, TestTextFileEditorModelManager } from 'vs/workbench/test/browser/workbenchTestServices';
import { URI } from 'vs/base/common/uri';
import { FileOperation } from 'vs/platform/files/common/files';
import { TestWorkingCopy } from 'vs/workbench/services/workingCopy/test/common/workingCopyService.test';

suite('WorkingCopyFileService', () => {

	let instantiationService: IInstantiationService;
	let model: TextFileEditorModel;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(TestServiceAccessor);
	});

	teardown(() => {
		model?.dispose();
		(<TextFileEditorModelManager>accessor.textFileService.files).dispose();
	});

	test('delete - dirty file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.load();
		model!.textEditorModel!.setValue('foo');
		assert.ok(accessor.workingCopyService.isDirty(model.resource));

		let eventCounter = 0;
		let correlationId: number | undefined = undefined;

		const participant = accessor.workingCopyFileService.addFileOperationParticipant({
			participate: async ([{ target }], operation) => {
				assert.equal(target.toString(), model.resource.toString());
				assert.equal(operation, FileOperation.DELETE);
				eventCounter++;
			}
		});

		const listener1 = accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => {
			assert.equal(e.target.toString(), model.resource.toString());
			assert.equal(e.operation, FileOperation.DELETE);
			correlationId = e.correlationId;
			eventCounter++;
		});

		const listener2 = accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => {
			assert.equal(e.target.toString(), model.resource.toString());
			assert.equal(e.operation, FileOperation.DELETE);
			assert.equal(e.correlationId, correlationId);
			eventCounter++;
		});

		await accessor.workingCopyFileService.delete(model.resource);
		assert.ok(!accessor.workingCopyService.isDirty(model.resource));

		assert.equal(eventCounter, 3);

		participant.dispose();
		listener1.dispose();
		listener2.dispose();
	});

	test('move - dirty file', async function () {
		await testMoveOrCopy([{ source: toResource.call(this, '/path/file.txt'), target: toResource.call(this, '/path/file_target.txt') }], true);
	});

	test('move - source identical to target', async function () {
		let sourceModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(sourceModel.resource, sourceModel);

		const eventCounter = await testEventsMoveOrCopy([{ source: sourceModel.resource, target: sourceModel.resource }], true);

		sourceModel.dispose();
		assert.equal(eventCounter, 1);
	});

	test('move - one source == target and another source != target', async function () {
		let sourceModel1: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file1.txt'), 'utf8', undefined);
		let sourceModel2: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file2.txt'), 'utf8', undefined);
		let targetModel2: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file_target2.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(sourceModel1.resource, sourceModel1);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(sourceModel2.resource, sourceModel2);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(targetModel2.resource, targetModel2);

		const eventCounter = await testEventsMoveOrCopy([
			{ source: sourceModel1.resource, target: sourceModel1.resource },
			{ source: sourceModel2.resource, target: targetModel2.resource }
		], true);

		sourceModel1.dispose();
		sourceModel2.dispose();
		targetModel2.dispose();
		assert.equal(eventCounter, 4);
	});

	test('move multiple - dirty file', async function () {
		await testMoveOrCopy([
			{ source: toResource.call(this, '/path/file1.txt'), target: toResource.call(this, '/path/file1_target.txt') },
			{ source: toResource.call(this, '/path/file2.txt'), target: toResource.call(this, '/path/file2_target.txt') }],
			true);
	});

	test('move - dirty file (target exists and is dirty)', async function () {
		await testMoveOrCopy([{ source: toResource.call(this, '/path/file.txt'), target: toResource.call(this, '/path/file_target.txt') }], true, true);
	});

	test('copy - dirty file', async function () {
		await testMoveOrCopy([{ source: toResource.call(this, '/path/file.txt'), target: toResource.call(this, '/path/file_target.txt') }], false);
	});

	test('copy - source identical to target', async function () {
		let sourceModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(sourceModel.resource, sourceModel);

		const eventCounter = await testEventsMoveOrCopy([{ source: sourceModel.resource, target: sourceModel.resource }]);

		sourceModel.dispose();
		assert.equal(eventCounter, 1);
	});

	test('copy - one source == target and another source != target', async function () {
		let sourceModel1: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file1.txt'), 'utf8', undefined);
		let sourceModel2: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file2.txt'), 'utf8', undefined);
		let targetModel2: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file_target2.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(sourceModel1.resource, sourceModel1);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(sourceModel2.resource, sourceModel2);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(targetModel2.resource, targetModel2);

		const eventCounter = await testEventsMoveOrCopy([
			{ source: sourceModel1.resource, target: sourceModel1.resource },
			{ source: sourceModel2.resource, target: targetModel2.resource }
		]);

		sourceModel1.dispose();
		sourceModel2.dispose();
		targetModel2.dispose();
		assert.equal(eventCounter, 4);
	});

	test('copy multiple - dirty file', async function () {
		await testMoveOrCopy([
			{ source: toResource.call(this, '/path/file1.txt'), target: toResource.call(this, '/path/file_target1.txt') },
			{ source: toResource.call(this, '/path/file2.txt'), target: toResource.call(this, '/path/file_target2.txt') },
			{ source: toResource.call(this, '/path/file3.txt'), target: toResource.call(this, '/path/file_target3.txt') }],
			false);
	});

	test('copy - dirty file (target exists and is dirty)', async function () {
		await testMoveOrCopy([{ source: toResource.call(this, '/path/file.txt'), target: toResource.call(this, '/path/file_target.txt') }], false, true);
	});

	async function testEventsMoveOrCopy(files: { source: URI, target: URI }[], move?: boolean): Promise<number> {
		let eventCounter = 0;

		const participant = accessor.workingCopyFileService.addFileOperationParticipant({
			participate: async files => {
				for (let i = 0; i < files.length; i++) {
					eventCounter++;
				}
			}
		});

		const listener1 = accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => {
			eventCounter++;
		});

		const listener2 = accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => {
			eventCounter++;
		});

		if (move) {
			await accessor.workingCopyFileService.move(files, true);
		} else {
			await accessor.workingCopyFileService.copy(files, true);
		}

		participant.dispose();
		listener1.dispose();
		listener2.dispose();
		return eventCounter;
	}

	async function testMoveOrCopy(files: { source: URI, target: URI }[], move: boolean, targetDirty?: boolean): Promise<void> {

		let eventCounter = 0;
		const models = await Promise.all(files.map(async ({ source, target }, i) => {
			let sourceModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, source, 'utf8', undefined);
			let targetModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, target, 'utf8', undefined);
			(<TestTextFileEditorModelManager>accessor.textFileService.files).add(sourceModel.resource, sourceModel);
			(<TestTextFileEditorModelManager>accessor.textFileService.files).add(targetModel.resource, targetModel);

			await sourceModel.load();
			sourceModel.textEditorModel!.setValue('foo' + i);
			assert.ok(accessor.textFileService.isDirty(sourceModel.resource));
			if (targetDirty) {
				await targetModel.load();
				targetModel.textEditorModel!.setValue('bar' + i);
				assert.ok(accessor.textFileService.isDirty(targetModel.resource));
			}

			return { sourceModel, targetModel };
		}));

		const participant = accessor.workingCopyFileService.addFileOperationParticipant({
			participate: async (files, operation) => {
				for (let i = 0; i < files.length; i++) {
					const { target, source } = files[i];
					const { targetModel, sourceModel } = models[i];

					assert.equal(target.toString(), targetModel.resource.toString());
					assert.equal(source?.toString(), sourceModel.resource.toString());
					assert.equal(operation, move ? FileOperation.MOVE : FileOperation.COPY);
					eventCounter++;
				}
			}
		});

		const correlationIds: Array<Number | undefined> = [];

		const listener1 = accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => {
			const foundIndex = models.findIndex(m => e.target.toString() === m.targetModel.resource.toString() &&
				e.source?.toString() === m.sourceModel.resource.toString());

			assert.equal(foundIndex !== -1, true);
			assert.equal(e.operation, move ? FileOperation.MOVE : FileOperation.COPY);
			eventCounter++;
			correlationIds.push(e.correlationId);
		});

		const listener2 = accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => {
			const foundIndex = models.findIndex(m => e.target.toString() === m.targetModel.resource.toString() &&
				e.source?.toString() === m.sourceModel.resource.toString());

			assert.equal(foundIndex !== -1, true);
			assert.equal(e.operation, move ? FileOperation.MOVE : FileOperation.COPY);
			eventCounter++;

			assert.equal(correlationIds.includes(e.correlationId), true);
		});

		if (move) {
			await accessor.workingCopyFileService.move(models.map(m => ({ source: m.sourceModel.resource, target: m.targetModel.resource })), true);
		} else {
			await accessor.workingCopyFileService.copy(models.map(m => ({ source: m.sourceModel.resource, target: m.targetModel.resource })), true);
		}

		for (let i = 0; i < models.length; i++) {
			const { sourceModel, targetModel } = models[i];

			assert.equal(targetModel.textEditorModel!.getValue(), 'foo' + i);

			if (move) {
				assert.ok(!accessor.textFileService.isDirty(sourceModel.resource));
			} else {
				assert.ok(accessor.textFileService.isDirty(sourceModel.resource));
			}
			assert.ok(accessor.textFileService.isDirty(targetModel.resource));

			sourceModel.dispose();
			targetModel.dispose();
		}
		assert.equal(eventCounter, 3 * models.length);

		participant.dispose();
		listener1.dispose();
		listener2.dispose();
	}

	test('getDirty', async function () {
		const model1 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file-1.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		const model2 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file-2.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		let dirty = accessor.workingCopyFileService.getDirty(model1.resource);
		assert.equal(dirty.length, 0);

		await model1.load();
		model1.textEditorModel!.setValue('foo');

		dirty = accessor.workingCopyFileService.getDirty(model1.resource);
		assert.equal(dirty.length, 1);
		assert.equal(dirty[0], model1);

		dirty = accessor.workingCopyFileService.getDirty(toResource.call(this, '/path'));
		assert.equal(dirty.length, 1);
		assert.equal(dirty[0], model1);

		await model2.load();
		model2.textEditorModel!.setValue('bar');

		dirty = accessor.workingCopyFileService.getDirty(toResource.call(this, '/path'));
		assert.equal(dirty.length, 2);

		model1.dispose();
		model2.dispose();
	});

	test('registerWorkingCopyProvider', async function () {
		const model1 = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file-1.txt'), 'utf8', undefined);
		(<TestTextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);
		await model1.load();
		model1.textEditorModel!.setValue('foo');

		const testWorkingCopy = new TestWorkingCopy(toResource.call(this, '/path/file-2.txt'), true);
		const registration = accessor.workingCopyFileService.registerWorkingCopyProvider(() => {
			return [model1, testWorkingCopy];
		});

		let dirty = accessor.workingCopyFileService.getDirty(model1.resource);
		assert.strictEqual(dirty.length, 2, 'Should return default working copy + working copy from provider');
		assert.strictEqual(dirty[0], model1);
		assert.strictEqual(dirty[1], testWorkingCopy);

		registration.dispose();

		dirty = accessor.workingCopyFileService.getDirty(model1.resource);
		assert.strictEqual(dirty.length, 1, 'Should have unregistered our provider');
		assert.strictEqual(dirty[0], model1);

		model1.dispose();
	});
});
