/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as assert from 'assert';
import { join } from 'vs/base/common/paths';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { workbenchInstantiationService } from 'vs/test/utils/servicesTestUtils';
import { UntitledEditorModel } from 'vs/workbench/common/editor/untitledEditorModel';
import { UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';

class ServiceAccessor {
	constructor( @IUntitledEditorService public untitledEditorService: UntitledEditorService) {
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
});