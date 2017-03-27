/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import { join } from 'vs/base/common/paths';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';

class ServiceAccessor {
	constructor(
		@IUntitledEditorService public untitledEditorService: UntitledEditorService,
		@IModeService public modeService: ModeServiceImpl,
		@IConfigurationService public testConfigurationService: TestConfigurationService) {
	}
}

suite('Workbench - Untitled Editor', () => {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		accessor.untitledEditorService.revertAll();
		accessor.untitledEditorService.dispose();
	});

	test('Untitled Editor Service', function (done) {
		const service = accessor.untitledEditorService;
		assert.equal(service.getAll().length, 0);

		const input1 = service.createOrGet();
		assert.equal(input1, service.createOrGet(input1.getResource()));

		const input2 = service.createOrGet();

		// get() / getAll()
		assert.equal(service.get(input1.getResource()), input1);
		assert.equal(service.getAll().length, 2);
		assert.equal(service.getAll([input1.getResource(), input2.getResource()]).length, 2);

		// revertAll()
		service.revertAll([input1.getResource()]);
		assert.ok(input1.isDisposed());
		assert.equal(service.getAll().length, 1);

		// dirty
		input2.resolve().then((model: UntitledEditorModel) => {
			assert.ok(!service.isDirty(input2.getResource()));

			const listener = service.onDidChangeDirty(resource => {
				listener.dispose();

				assert.equal(resource.toString(), input2.getResource().toString());

				assert.ok(service.isDirty(input2.getResource()));
				assert.equal(service.getDirty()[0].toString(), input2.getResource().toString());

				service.revertAll();
				assert.equal(service.getAll().length, 0);
				assert.ok(!input2.isDirty());
				assert.ok(!model.isDirty());

				input2.dispose();

				done();
			});

			model.textEditorModel.setValue('foo bar');
		});
	});

	test('Untitled with associated resource', function () {
		const service = accessor.untitledEditorService;
		const file = URI.file(join('C:\\', '/foo/file.txt'));
		const untitled = service.createOrGet(file);

		assert.ok(service.hasAssociatedFilePath(untitled.getResource()));

		untitled.dispose();
	});

	test('Untitled no longer dirty when content gets empty', function (done) {
		const service = accessor.untitledEditorService;
		const input = service.createOrGet();

		// dirty
		input.resolve().then((model: UntitledEditorModel) => {
			model.textEditorModel.setValue('foo bar');
			assert.ok(model.isDirty());

			model.textEditorModel.setValue('');
			assert.ok(!model.isDirty());

			input.dispose();

			done();
		});
	});

	test('Untitled with associated path remains dirty when content gets empty', function (done) {
		const service = accessor.untitledEditorService;
		const file = URI.file(join('C:\\', '/foo/file.txt'));
		const input = service.createOrGet(file);

		// dirty
		input.resolve().then((model: UntitledEditorModel) => {
			model.textEditorModel.setValue('foo bar');
			assert.ok(model.isDirty());

			model.textEditorModel.setValue('');
			assert.ok(model.isDirty());

			input.dispose();

			done();
		});
	});

	test('Untitled created with files.defaultLanguage setting', function () {
		const defaultLanguage = 'javascript';
		const config = accessor.testConfigurationService;
		config.setUserConfiguration('files', { 'defaultLanguage': defaultLanguage });

		const service = accessor.untitledEditorService;
		const input = service.createOrGet();

		assert.equal(input.getModeId(), defaultLanguage);

		config.setUserConfiguration('files', { 'defaultLanguage': undefined });

		input.dispose();
	});

	test('Untitled created with modeId overrides files.defaultLanguage setting', function () {
		const modeId = 'typescript';
		const defaultLanguage = 'javascript';
		const config = accessor.testConfigurationService;
		config.setUserConfiguration('files', { 'defaultLanguage': defaultLanguage });

		const service = accessor.untitledEditorService;
		const input = service.createOrGet(null, modeId);

		assert.equal(input.getModeId(), modeId);

		config.setUserConfiguration('files', { 'defaultLanguage': undefined });

		input.dispose();
	});

	test('encoding change event', function (done) {
		const service = accessor.untitledEditorService;
		const input = service.createOrGet();

		let counter = 0;

		service.onDidChangeEncoding(r => {
			counter++;
			assert.equal(r.toString(), input.getResource().toString());
		});

		// dirty
		input.resolve().then((model: UntitledEditorModel) => {
			model.setEncoding('utf16');

			assert.equal(counter, 1);

			input.dispose();

			done();
		});
	});

	test('onDidChangeContent event', done => {
		const service = accessor.untitledEditorService;
		const input = service.createOrGet();

		UntitledEditorModel.DEFAULT_CONTENT_CHANGE_BUFFER_DELAY = 0;

		let counter = 0;

		service.onDidChangeContent(r => {
			counter++;
			assert.equal(r.toString(), input.getResource().toString());
		});

		input.resolve().then((model: UntitledEditorModel) => {
			model.textEditorModel.setValue('foo');
			assert.equal(counter, 0, 'Dirty model should not trigger event immediately');

			TPromise.timeout(3).then(() => {
				assert.equal(counter, 1, 'Dirty model should trigger event');

				model.textEditorModel.setValue('bar');
				TPromise.timeout(3).then(() => {
					assert.equal(counter, 2, 'Content change when dirty should trigger event');

					model.textEditorModel.setValue('');
					TPromise.timeout(3).then(() => {
						assert.equal(counter, 3, 'Manual revert should trigger event');

						model.textEditorModel.setValue('foo');
						TPromise.timeout(3).then(() => {
							assert.equal(counter, 4, 'Dirty model should trigger event');

							model.revert();
							TPromise.timeout(3).then(() => {
								assert.equal(counter, 5, 'Revert should trigger event');

								input.dispose();

								done();
							});
						});
					});
				});
			});
		});
	});

	test('onDidDisposeModel event', done => {
		const service = accessor.untitledEditorService;
		const input = service.createOrGet();

		let counter = 0;

		service.onDidDisposeModel(r => {
			counter++;
			assert.equal(r.toString(), input.getResource().toString());
		});

		input.resolve().then((model: UntitledEditorModel) => {
			assert.equal(counter, 0);
			input.dispose();
			assert.equal(counter, 1);

			done();
		});
	});
});