/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { EditorModel } from 'vs/workbench/common/editor';
import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { ITextBufferFactory } from 'vs/editor/common/model';
import { URI } from 'vs/base/common/uri';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { TestTextResourcePropertiesService } from 'vs/workbench/test/workbenchTestServices';

class MyEditorModel extends EditorModel { }
class MyTextEditorModel extends BaseTextEditorModel {
	public createTextEditorModel(value: ITextBufferFactory, resource?: URI, preferredMode?: string) {
		return super.createTextEditorModel(value, resource, preferredMode);
	}

	isReadonly(): boolean {
		return false;
	}
}

suite('Workbench editor model', () => {

	let instantiationService: TestInstantiationService;
	let modeService: IModeService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		modeService = instantiationService.stub(IModeService, ModeServiceImpl);
	});

	test('EditorModel', async () => {
		let counter = 0;

		let m = new MyEditorModel();

		m.onDispose(() => {
			assert(true);
			counter++;
		});

		const model = await m.load();
		assert(model === m);
		assert.strictEqual(m.isResolved(), true);
		m.dispose();
		assert.equal(counter, 1);
	});

	test('BaseTextEditorModel', async () => {
		let modelService = stubModelService(instantiationService);

		let m = new MyTextEditorModel(modelService, modeService);
		const model = await m.load() as MyTextEditorModel;

		assert(model === m);
		model.createTextEditorModel(createTextBufferFactory('foo'), null!, 'text/plain');
		assert.strictEqual(m.isResolved(), true);
		m.dispose();
	});

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(ITextResourcePropertiesService, new TestTextResourcePropertiesService(instantiationService.get(IConfigurationService)));
		return instantiationService.createInstance(ModelServiceImpl);
	}
});