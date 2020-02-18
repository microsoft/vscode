/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { toResource } from 'vs/base/test/common/utils';
import { workbenchInstantiationService, TestTextFileService } from 'vs/workbench/test/browser/workbenchTestServices';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { URI } from 'vs/base/common/uri';
import { FileOperation } from 'vs/platform/files/common/files';

class ServiceAccessor {
	constructor(
		@ITextFileService public textFileService: TestTextFileService,
		@IWorkingCopyFileService public workingCopyFileService: IWorkingCopyFileService,
		@IWorkingCopyService public workingCopyService: IWorkingCopyService
	) {
	}
}

suite('WorkingCopyFileService', () => {

	let instantiationService: IInstantiationService;
	let model: TextFileEditorModel;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		model?.dispose();
		(<TextFileEditorModelManager>accessor.textFileService.files).dispose();
	});

	test('delete - dirty file', async function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(model.resource, model);

		await model.load();
		model!.textEditorModel!.setValue('foo');
		assert.ok(accessor.workingCopyService.isDirty(model.resource));

		let eventCounter = 0;

		const listener0 = accessor.workingCopyFileService.onBeforeWorkingCopyFileOperation(e => {
			assert.equal(e.target.toString(), model.resource.toString());
			assert.equal(e.operation, FileOperation.DELETE);
			eventCounter++;
		});

		const listener1 = accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => {
			assert.equal(e.target.toString(), model.resource.toString());
			assert.equal(e.operation, FileOperation.DELETE);
			eventCounter++;
		});

		const listener2 = accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => {
			assert.equal(e.target.toString(), model.resource.toString());
			assert.equal(e.operation, FileOperation.DELETE);
			eventCounter++;
		});

		await accessor.workingCopyFileService.delete(model.resource);
		assert.ok(!accessor.workingCopyService.isDirty(model.resource));

		assert.equal(eventCounter, 3);

		listener0.dispose();
		listener1.dispose();
		listener2.dispose();
	});

	test('move - dirty file', async function () {
		await testMoveOrCopy(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'), true);
	});

	test('move - dirty file (target exists and is dirty)', async function () {
		await testMoveOrCopy(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'), true, true);
	});

	test('copy - dirty file', async function () {
		await testMoveOrCopy(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'), false);
	});

	test('copy - dirty file (target exists and is dirty)', async function () {
		await testMoveOrCopy(toResource.call(this, '/path/file.txt'), toResource.call(this, '/path/file_target.txt'), false, true);
	});

	async function testMoveOrCopy(source: URI, target: URI, move: boolean, targetDirty?: boolean): Promise<void> {
		let sourceModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, source, 'utf8', undefined);
		let targetModel: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, target, 'utf8', undefined);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(sourceModel.resource, sourceModel);
		(<TextFileEditorModelManager>accessor.textFileService.files).add(targetModel.resource, targetModel);

		await sourceModel.load();
		sourceModel.textEditorModel!.setValue('foo');
		assert.ok(accessor.textFileService.isDirty(sourceModel.resource));

		if (targetDirty) {
			await targetModel.load();
			targetModel.textEditorModel!.setValue('bar');
			assert.ok(accessor.textFileService.isDirty(targetModel.resource));
		}

		let eventCounter = 0;

		const listener0 = accessor.workingCopyFileService.onBeforeWorkingCopyFileOperation(e => {
			assert.equal(e.target.toString(), targetModel.resource.toString());
			assert.equal(e.source?.toString(), sourceModel.resource.toString());
			assert.equal(e.operation, move ? FileOperation.MOVE : FileOperation.COPY);
			eventCounter++;
		});

		const listener1 = accessor.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => {
			assert.equal(e.target.toString(), targetModel.resource.toString());
			assert.equal(e.source?.toString(), sourceModel.resource.toString());
			assert.equal(e.operation, move ? FileOperation.MOVE : FileOperation.COPY);
			eventCounter++;
		});

		const listener2 = accessor.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => {
			assert.equal(e.target.toString(), targetModel.resource.toString());
			assert.equal(e.source?.toString(), sourceModel.resource.toString());
			assert.equal(e.operation, move ? FileOperation.MOVE : FileOperation.COPY);
			eventCounter++;
		});

		if (move) {
			await accessor.workingCopyFileService.move(sourceModel.resource, targetModel.resource, true);
		} else {
			await accessor.workingCopyFileService.copy(sourceModel.resource, targetModel.resource, true);
		}

		assert.equal(targetModel.textEditorModel!.getValue(), 'foo');

		if (move) {
			assert.ok(!accessor.textFileService.isDirty(sourceModel.resource));
		} else {
			assert.ok(accessor.textFileService.isDirty(sourceModel.resource));
		}
		assert.ok(accessor.textFileService.isDirty(targetModel.resource));

		assert.equal(eventCounter, 3);

		sourceModel.dispose();
		targetModel.dispose();

		listener0.dispose();
		listener1.dispose();
		listener2.dispose();
	}
});
