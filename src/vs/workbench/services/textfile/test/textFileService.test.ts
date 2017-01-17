/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as assert from 'assert';
import { ILifecycleService, ShutdownEvent, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { workbenchInstantiationService, TestLifecycleService, TestTextFileService, TestWindowsService } from 'vs/workbench/test/workbenchTestServices';
import { onError, toResource } from 'vs/base/test/common/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ConfirmResult } from 'vs/workbench/common/editor';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { HotExitConfiguration } from 'vs/platform/files/common/files';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';

class ServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IUntitledEditorService public untitledEditorService: IUntitledEditorService,
		@IWindowsService public windowsService: TestWindowsService
	) {
	}
}

class ShutdownEventImpl implements ShutdownEvent {

	public value: boolean | TPromise<boolean>;
	public reason = ShutdownReason.CLOSE;

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
	});

	teardown(() => {
		model.dispose();
		(<TextFileEditorModelManager>accessor.textFileService.models).clear();
		(<TextFileEditorModelManager>accessor.textFileService.models).dispose();
		accessor.untitledEditorService.revertAll();
	});

	test('confirm onWillShutdown - no veto', function () {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const event = new ShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		const veto = event.value;
		if (typeof veto === 'boolean') {
			assert.ok(!veto);
		} else {
			veto.then(veto => {
				assert.ok(!veto);
			});
		}
	});

	test('confirm onWillShutdown - veto if user cancels', function (done) {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setConfirmResult(ConfirmResult.CANCEL);

		model.load().done(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(service.getDirty().length, 1);

			const event = new ShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			assert.ok(event.value);

			done();
		}, error => onError(error, done));
	});

	test('confirm onWillShutdown - no veto and backups cleaned up if user does not want to save', function (done) {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setConfirmResult(ConfirmResult.DONT_SAVE);

		model.load().done(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(service.getDirty().length, 1);

			const event = new ShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			const veto = event.value;
			if (typeof veto === 'boolean') {
				assert.ok(service.cleanupBackupsBeforeShutdownCalled);
				assert.ok(!veto);

				done();
			} else {
				veto.then(veto => {
					assert.ok(service.cleanupBackupsBeforeShutdownCalled);
					assert.ok(!veto);

					done();
				});
			}
		}, error => onError(error, done));
	});

	test('confirm onWillShutdown - save', function (done) {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setConfirmResult(ConfirmResult.SAVE);

		model.load().done(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(service.getDirty().length, 1);

			const event = new ShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			return (<TPromise<boolean>>event.value).then(veto => {
				assert.ok(!veto);
				assert.ok(!model.isDirty());

				done();
			});
		}, error => onError(error, done));
	});

	test('isDirty/getDirty - files and untitled', function (done) {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		model.load().done(() => {
			assert.ok(!service.isDirty(model.getResource()));
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));
			assert.equal(service.getDirty().length, 1);
			assert.equal(service.getDirty([model.getResource()])[0].toString(), model.getResource().toString());

			const untitled = accessor.untitledEditorService.createOrGet();
			return untitled.resolve().then((model: UntitledEditorModel) => {
				assert.ok(!service.isDirty(untitled.getResource()));
				assert.equal(service.getDirty().length, 1);
				model.textEditorModel.setValue('changed');

				assert.ok(service.isDirty(untitled.getResource()));
				assert.equal(service.getDirty().length, 2);
				assert.equal(service.getDirty([untitled.getResource()])[0].toString(), untitled.getResource().toString());

				done();
			});
		}, error => onError(error, done));
	});

	test('save - file', function (done) {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;

		model.load().done(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.save(model.getResource()).then(res => {
				assert.ok(res);
				assert.ok(!service.isDirty(model.getResource()));

				done();
			});
		}, error => onError(error, done));
	});

	test('saveAll - file', function (done) {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;

		model.load().done(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.saveAll([model.getResource()]).then(res => {
				assert.ok(res);
				assert.ok(!service.isDirty(model.getResource()));
				assert.equal(res.results.length, 1);
				assert.equal(res.results[0].source.toString(), model.getResource().toString());

				done();
			});
		}, error => onError(error, done));
	});

	test('saveAs - file', function (done) {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setPromptPath(model.getResource().fsPath);

		model.load().done(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.saveAs(model.getResource()).then(res => {
				assert.equal(res.toString(), model.getResource().toString());
				assert.ok(!service.isDirty(model.getResource()));

				done();
			});
		}, error => onError(error, done));
	});

	test('revert - file', function (done) {
		model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
		(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

		const service = accessor.textFileService;
		service.setPromptPath(model.getResource().fsPath);

		model.load().done(() => {
			model.textEditorModel.setValue('foo');

			assert.ok(service.isDirty(model.getResource()));

			return service.revert(model.getResource()).then(res => {
				assert.ok(res);
				assert.ok(!service.isDirty(model.getResource()));

				done();
			});
		}, error => onError(error, done));
	});

	suite('Hot Exit', () => {
		suite('"onExit" setting', () => {
			test('should hot exit (setting: onExit, reason: CLOSE, windows: single)', function (done) {
				const service = accessor.textFileService;
				hotExitTest.call(this, HotExitConfiguration.ON_EXIT, function () {
					// Set cancel to force a veto under regular circumstances
					service.setConfirmResult(ConfirmResult.CANCEL);
				}, function (veto) {
					assert.ok(!service.cleanupBackupsBeforeShutdownCalled);
					assert.ok(!veto);
				}, done);
			});

			test('should NOT hot exit (setting: onExit, reason: CLOSE, windows: multiple)', function (done) {
				const service = accessor.textFileService;
				hotExitTest.call(this, HotExitConfiguration.ON_EXIT, function () {
					// Set multiple windows
					accessor.windowsService.windowCount = 2;
					// Set cancel to force a veto under regular circumstances
					service.setConfirmResult(ConfirmResult.CANCEL);
				}, function (veto) {
					assert.ok(!service.cleanupBackupsBeforeShutdownCalled);
					assert.ok(veto);
				}, done);
			});
		});

		suite('"onExitAndWindowClose" setting', () => {
			test('should hot exit (reason: CLOSE, windows: single)', function (done) {
				const service = accessor.textFileService;
				hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, function () {
					// Force veto when hot exit fails
					service.setConfirmResult(ConfirmResult.CANCEL);
				}, function (veto) {
					assert.ok(!service.cleanupBackupsBeforeShutdownCalled);
					assert.ok(!veto);
				}, done);
			});

			test('should hot exit (reason: CLOSE, windows: multiple)', function (done) {
				const service = accessor.textFileService;
				hotExitTest.call(this, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE, function () {
					// Set multiple windows
					accessor.windowsService.windowCount = 2;
					// Set cancel to force a veto under regular circumstances
					service.setConfirmResult(ConfirmResult.CANCEL);
				}, function (veto) {
					assert.ok(!service.cleanupBackupsBeforeShutdownCalled);
					assert.ok(!veto);
				}, done);
			});
		});

		function hotExitTest(setting: string, setup: () => void, assertions: (veto: boolean) => void, done): void {
			model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/file.txt'), 'utf8');
			(<TextFileEditorModelManager>accessor.textFileService.models).add(model.getResource(), model);

			const service = accessor.textFileService;
			service.onConfigurationChange({ files: { hotExit: setting } });
			setup();

			model.load().done(() => {
				model.textEditorModel.setValue('foo');

				assert.equal(service.getDirty().length, 1);

				const event = new ShutdownEventImpl();
				accessor.lifecycleService.fireWillShutdown(event);

				return (<TPromise<boolean>>event.value).then(veto => {
					assertions(veto);

					done();
				});
			}, error => onError(error, done));
		}
	});
});