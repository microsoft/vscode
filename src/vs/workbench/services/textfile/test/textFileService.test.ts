/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {ILifecycleService, ShutdownEvent} from 'vs/platform/lifecycle/common/lifecycle';
import {workbenchInstantiationService, TestLifecycleService, TestTextFileService} from 'vs/test/utils/servicesTestUtils';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {TextFileEditorModel} from 'vs/workbench/services/textfile/common/textFileEditorModel';
import {ITextFileService} from 'vs/workbench/services/textfile/common/textfiles';
import {ConfirmResult} from 'vs/workbench/common/editor';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {UntitledEditorModel} from 'vs/workbench/common/editor/untitledEditorModel';
import {TextFileEditorModelManager} from 'vs/workbench/services/textfile/common/textFileEditorModelManager';

function toResource(path) {
	return URI.file(paths.join('C:\\', path));
}

class ServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IUntitledEditorService public untitledEditorService: IUntitledEditorService
	) {
	}
}

class ShutdownEventImpl implements ShutdownEvent {

	public value: boolean | TPromise<boolean>;

	veto(value: boolean | TPromise<boolean>): void {
		this.value = value;
	}
}

suite('Files - TextFileService', () => {

	let instantiationService: IInstantiationService;
	let model: TextFileEditorModel;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
		model = instantiationService.createInstance(TextFileEditorModel, toResource('/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);
	});

	teardown(() => {
		model.dispose();
		(<TextFileEditorModelManager>accessor.textFileService.models).clear();
		(<TextFileEditorModelManager>accessor.textFileService.models).dispose();
		accessor.untitledEditorService.revertAll();
	});

	test('confirm onWillShutdown - no veto', function () {
		const event = new ShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		assert.ok(!event.value);
	});

	test('confirm onWillShutdown - veto if user cancels', function (done) {
		const service = accessor.textFileService;
		service.setConfirmResult(ConfirmResult.CANCEL);

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(service.getDirty().length, 1);

			const event = new ShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			assert.ok(event.value);

			done();
		});
	});

	test('confirm onWillShutdown - no veto if user does not want to save', function (done) {
		const service = accessor.textFileService;
		service.setConfirmResult(ConfirmResult.DONT_SAVE);

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(service.getDirty().length, 1);

			const event = new ShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			assert.ok(!event.value);

			done();
		});
	});

	test('confirm onWillShutdown - save', function (done) {
		const service = accessor.textFileService;
		service.setConfirmResult(ConfirmResult.SAVE);

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(service.getDirty().length, 1);

			const event = new ShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			return (<TPromise<boolean>>event.value).then(veto => {
				assert.ok(!veto);
				assert.ok(!model.isDirty());

				done();
			});
		});
	});

	test('isDirty/getDirty - files and untitled', function (done) {
		const service = accessor.textFileService;
		model.load().then(() => {
			assert.ok(!service.isDirty(model.getResource()));
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));
			assert.equal(service.getDirty().length, 1);
			assert.equal(service.getDirty([model.getResource()])[0].toString(), model.getResource().toString());

			const untitled = accessor.untitledEditorService.createOrGet();
			return untitled.resolve().then((model: UntitledEditorModel) => {
				assert.ok(!service.isDirty(untitled.getResource()));
				assert.equal(service.getDirty().length, 1);
				model.setValue('changed');

				assert.ok(service.isDirty(untitled.getResource()));
				assert.equal(service.getDirty().length, 2);
				assert.equal(service.getDirty([untitled.getResource()])[0].toString(), untitled.getResource().toString());

				done();
			});
		});
	});

	test('save - file', function (done) {
		const service = accessor.textFileService;

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.save(model.getResource()).then(res => {
				assert.ok(res);
				assert.ok(!service.isDirty(model.getResource()));

				done();
			});
		});
	});

	test('saveAll - file', function (done) {
		const service = accessor.textFileService;

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.saveAll([model.getResource()]).then(res => {
				assert.ok(res);
				assert.ok(!service.isDirty(model.getResource()));
				assert.equal(res.results.length, 1);
				assert.equal(res.results[0].source.toString(), model.getResource().toString());

				done();
			});
		});
	});

	test('saveAs - file', function (done) {
		const service = accessor.textFileService;
		service.setPromptPath(model.getResource().fsPath);

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.saveAs(model.getResource()).then(res => {
				assert.equal(res.toString(), model.getResource().toString());
				assert.ok(!service.isDirty(model.getResource()));

				done();
			});
		});
	});

	test('revert - file', function (done) {
		const service = accessor.textFileService;
		service.setPromptPath(model.getResource().fsPath);

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.revert(model.getResource()).then(res => {
				assert.ok(res);
				assert.ok(!service.isDirty(model.getResource()));

				done();
			});
		});
	});
});