/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import {EditorModel} from 'vs/workbench/common/editor';
import {BaseTextEditorModel} from 'vs/workbench/common/editor/textEditorModel';
import {TextDiffEditorModel} from 'vs/workbench/common/editor/textDiffEditorModel';
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import { createMockModelService } from 'vs/test/utils/servicesTestUtils';

class MyEditorModel extends EditorModel { }
class MyTextEditorModel extends BaseTextEditorModel { }

suite('Workbench - EditorModel', () => {

	let instantiationService: TestInstantiationService;
	let modeService: IModeService;

	setup(() => {
		instantiationService= new TestInstantiationService();
		modeService= instantiationService.stub(IModeService);
	});

	test('EditorModel', function (done) {
		let m = new MyEditorModel();
		m.load().then(function (model) {
			assert(model === m);
			assert.strictEqual(m.isResolved(), true);
		}).done(() => done());
	});

	test('BaseTextEditorModel', function (done) {
		let modelService = createMockModelService(instantiationService);

		let m = new MyTextEditorModel(modelService, modeService);
		m.load().then(function (model: any) {
			assert(model === m);
			return model.createTextEditorModel('foo', null, 'text/plain').then(function () {
				assert.strictEqual(m.isResolved(), true);
			});
		}).done(() => {
			m.dispose();
			done();
		});
	});

	test('TextDiffEditorModel', function (done) {
		instantiationService.stub(IModelService, createMockModelService(instantiationService));
		let input = instantiationService.createInstance(StringEditorInput, 'name', 'description', 'value', 'text/plain', false);
		let otherInput = instantiationService.createInstance(StringEditorInput, 'name2', 'description', 'value2', 'text/plain', false);
		let diffInput = new DiffEditorInput('name', 'description', input, otherInput);

		diffInput.resolve(true).then(function (model: any) {
			assert(model);
			assert(model instanceof TextDiffEditorModel);

			let diffEditorModel = model.textDiffEditorModel;
			assert(diffEditorModel.original);
			assert(diffEditorModel.modified);

			return diffInput.resolve(true).then(function (model: any) {
				assert(model.isResolved());

				assert(diffEditorModel !== model.textDiffEditorModel);
				diffInput.dispose();
				assert(!model.textDiffEditorModel);
			});
		}).done(() => {
			done();
		});
	});
});