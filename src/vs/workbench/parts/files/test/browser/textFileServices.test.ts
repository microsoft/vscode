/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import 'vs/workbench/parts/files/browser/files.contribution'; // load our contribution into the test
import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {ILifecycleService, ShutdownEvent} from 'vs/platform/lifecycle/common/lifecycle';
import {textFileServiceInstantiationService, TestLifecycleService, TestTextFileService} from 'vs/test/utils/servicesTestUtils';
import {TestInstantiationService} from 'vs/test/utils/instantiationTestUtils';
import {TextFileEditorModel, CACHE} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {ITextFileService} from 'vs/workbench/parts/files/common/files';
import {ConfirmResult} from 'vs/workbench/common/editor';

function toResource(path) {
	return URI.file(paths.join('C:\\', path));
}

class ServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService
	) {
	}
}

class ShutdownEventImpl implements ShutdownEvent {

	public value: boolean | TPromise<boolean>;

	veto(value: boolean | TPromise<boolean>): void {
		this.value = value;
	}
}


let accessor: ServiceAccessor;

suite('Files - TextFileServices', () => {

	let instantiationService: TestInstantiationService;
	let model: TextFileEditorModel;

	setup(() => {
		instantiationService = textFileServiceInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
		model = instantiationService.createInstance(TextFileEditorModel, toResource('/path/file.txt'), 'utf8');
		CACHE.add(model.getResource(), model);
	});

	teardown(() => {
		model.dispose();
		CACHE.clear();
	});

	test('confirm onWillShutdown - no veto', function () {
		const event = new ShutdownEventImpl();
		accessor.lifecycleService.fireWillShutdown(event);

		assert.ok(!event.value);
	});

	test('confirm onWillShutdown - veto if user cancels', function (done) {
		accessor.textFileService.setConfirmResult(ConfirmResult.CANCEL);

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(accessor.textFileService.getDirty().length, 1);

			const event = new ShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			assert.ok(event.value);

			done();
		});
	});

	test('confirm onWillShutdown - no veto if user does not want to save', function (done) {
		accessor.textFileService.setConfirmResult(ConfirmResult.DONT_SAVE);

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(accessor.textFileService.getDirty().length, 1);

			const event = new ShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			assert.ok(!event.value);

			done();
		});
	});

	test('confirm onWillShutdown - save', function (done) {
		accessor.textFileService.setConfirmResult(ConfirmResult.SAVE);

		model.load().then(() => {
			model.textEditorModel.setValue('foo');

			assert.equal(accessor.textFileService.getDirty().length, 1);

			const event = new ShutdownEventImpl();
			accessor.lifecycleService.fireWillShutdown(event);

			return (<TPromise<boolean>>event.value).then(veto => {
				assert.ok(!veto);
				assert.ok(!model.isDirty());

				done();
			});
		});
	});
});