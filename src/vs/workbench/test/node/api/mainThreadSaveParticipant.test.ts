/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FinalNewLineParticipant } from 'vs/workbench/api/node/mainThreadSaveParticipant';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { workbenchInstantiationService, TestTextFileService } from 'vs/workbench/test/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { IModelService } from 'vs/editor/common/services/modelService';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService, SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';

class ServiceAccessor {
	constructor( @ITextFileService public textFileService: TestTextFileService, @IModelService public modelService: IModelService) {
	}
}

suite('MainThreadSaveParticipant', function () {

	let instantiationService: IInstantiationService;
	let accessor: ServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);
	});

	teardown(() => {
		(<TextFileEditorModelManager>accessor.textFileService.models).clear();
		TextFileEditorModel.setSaveParticipant(null); // reset any set participant
	});

	test('insert final new line', function (done) {
		const model: TextFileEditorModel = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/final_new_line.txt'), 'utf8');

		model.load().then(() => {
			const configService = new TestConfigurationService();
			configService.setUserConfiguration('files', { 'insertFinalNewline': true });

			const participant = new FinalNewLineParticipant(configService, undefined);

			// No new line for empty lines
			let lineContent = '';
			model.textEditorModel.setValue(lineContent);
			participant.participate(model, { reason: SaveReason.EXPLICIT });
			assert.equal(model.getValue(), lineContent);

			// No new line if last line already empty
			lineContent = `Hello New Line${model.textEditorModel.getEOL()}`;
			model.textEditorModel.setValue(lineContent);
			participant.participate(model, { reason: SaveReason.EXPLICIT });
			assert.equal(model.getValue(), lineContent);

			// New empty line added (single line)
			lineContent = 'Hello New Line';
			model.textEditorModel.setValue(lineContent);
			participant.participate(model, { reason: SaveReason.EXPLICIT });
			assert.equal(model.getValue(), `${lineContent}${model.textEditorModel.getEOL()}`);

			// New empty line added (multi line)
			lineContent = `Hello New Line${model.textEditorModel.getEOL()}Hello New Line${model.textEditorModel.getEOL()}Hello New Line`;
			model.textEditorModel.setValue(lineContent);
			participant.participate(model, { reason: SaveReason.EXPLICIT });
			assert.equal(model.getValue(), `${lineContent}${model.textEditorModel.getEOL()}`);

			done();
		});
	});
});