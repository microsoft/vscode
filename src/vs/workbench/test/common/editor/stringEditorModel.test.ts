/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { StringEditorModel } from 'vs/workbench/common/editor/stringEditorModel';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';

suite('Workbench - StringEditorModel', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IModeService, ModeServiceImpl);
	});

	test('StringEditorModel', function (done) {
		instantiationService.stub(IModelService, stubModelService(instantiationService));
		let m = instantiationService.createInstance(StringEditorModel, 'value', 'mode', null);
		m.load().then(model => {
			assert(model === m);

			let textEditorModel = m.textEditorModel;
			assert.strictEqual(textEditorModel.getValue(), 'value');

			assert.strictEqual(m.isResolved(), true);

			(<any>m).value = 'something';
			return m.load().then(model => {
				assert(textEditorModel === m.textEditorModel);
				assert.strictEqual(m.getValue(), 'something');
			});
		}).done(() => {
			m.dispose();
			done();
		});
	});

	test('StringEditorModel - setValue, clearValue, append, trim', function (done) {
		instantiationService.stub(IModelService, stubModelService(instantiationService));
		let m = instantiationService.createInstance(StringEditorModel, 'value', 'mode', null);
		m.load().then(model => {
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

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		return instantiationService.createInstance(ModelServiceImpl);
	}
});