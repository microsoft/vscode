/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/test/utils/instantiationTestUtils';
import {StringEditorModel} from 'vs/workbench/common/editor/stringEditorModel';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {createMockModelService} from 'vs/test/utils/servicesTestUtils';

suite('Workbench - StringEditorModel', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService= new TestInstantiationService();
		instantiationService.stub(IModeService);
	});

	test('StringEditorModel', function (done) {
		instantiationService.stub(IModelService, createMockModelService(instantiationService));
		let m = instantiationService.createInstance(StringEditorModel, 'value', 'mime', null);
		m.load().then(function (model) {
			assert(model === m);

			let textEditorModel = m.textEditorModel;
			assert.strictEqual(textEditorModel.getValue(), 'value');

			assert.strictEqual(m.isResolved(), true);

			(<any>m).value = 'something';
			return m.load().then(function (model) {
				assert(textEditorModel === m.textEditorModel);
				assert.strictEqual(m.getValue(), 'something');
			});
		}).done(() => {
			m.dispose();
			done();
		});
	});

	test('StringEditorModel - setValue, clearValue, append, trim', function (done) {
		instantiationService.stub(IModelService, createMockModelService(instantiationService));
		let m = instantiationService.createInstance(StringEditorModel, 'value', 'mime', null);
		m.load().then(function (model) {
			assert(model === m);

			let textEditorModel = m.textEditorModel;
			assert.strictEqual(textEditorModel.getValue(), 'value');

			m.setValue('foobar');
			assert.strictEqual(m.getValue(), 'foobar');
			assert.strictEqual(textEditorModel.getValue(), 'foobar');

			m.clearValue();
			assert(!m.getValue());
			assert(!textEditorModel.getValue());

			m.append('1');
			assert.strictEqual(m.getValue(), '1');
			assert.strictEqual(textEditorModel.getValue(), '1');

			m.append('1');
			assert.strictEqual(m.getValue(), '11');
			assert.strictEqual(textEditorModel.getValue(), '11');

			m.setValue('line\nline\nline');
			m.trim(2);

			assert.strictEqual(m.getValue(), 'line\nline');
			assert.strictEqual(textEditorModel.getValue(), 'line\nline');
		}).done(() => {
			m.dispose();
			done();
		});
	});
});