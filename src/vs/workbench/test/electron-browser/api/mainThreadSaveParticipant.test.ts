/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FinalNewLineParticipant, TrimFinalNewLinesParticipant } from 'vs/workbench/api/browser/mainThreadSaveParticipant';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { workbenchInstantiationService, TestTextFileService } from 'vs/workbench/test/workbenchTestServices';
import { toResource } from 'vs/base/test/common/utils';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextFileService, SaveReason, IResolvedTextFileEditorModel, snapshotToString } from 'vs/workbench/services/textfile/common/textfiles';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';

class ServiceAccessor {
	constructor(@ITextFileService public textFileService: TestTextFileService, @IModelService public modelService: IModelService) {
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

	test('insert final new line', async function () {
		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel;

		await model.load();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'insertFinalNewline': true });
		const participant = new FinalNewLineParticipant(configService, undefined!);

		// No new line for empty lines
		let lineContent = '';
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.equal(snapshotToString(model.createSnapshot()!), lineContent);

		// No new line if last line already empty
		lineContent = `Hello New Line${model.textEditorModel.getEOL()}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.equal(snapshotToString(model.createSnapshot()!), lineContent);

		// New empty line added (single line)
		lineContent = 'Hello New Line';
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.equal(snapshotToString(model.createSnapshot()!), `${lineContent}${model.textEditorModel.getEOL()}`);

		// New empty line added (multi line)
		lineContent = `Hello New Line${model.textEditorModel.getEOL()}Hello New Line${model.textEditorModel.getEOL()}Hello New Line`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.equal(snapshotToString(model.createSnapshot()!), `${lineContent}${model.textEditorModel.getEOL()}`);
	});

	test('trim final new lines', async function () {
		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel;

		await model.load();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
		const participant = new TrimFinalNewLinesParticipant(configService, undefined!);
		const textContent = 'Trim New Line';
		const eol = `${model.textEditorModel.getEOL()}`;

		// No new line removal if last line is not new line
		let lineContent = `${textContent}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.equal(snapshotToString(model.createSnapshot()!), lineContent);

		// No new line removal if last line is single new line
		lineContent = `${textContent}${eol}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.equal(snapshotToString(model.createSnapshot()!), lineContent);

		// Remove new line (single line with two new lines)
		lineContent = `${textContent}${eol}${eol}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.equal(snapshotToString(model.createSnapshot()!), `${textContent}${eol}`);

		// Remove new lines (multiple lines with multiple new lines)
		lineContent = `${textContent}${eol}${textContent}${eol}${eol}${eol}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.equal(snapshotToString(model.createSnapshot()!), `${textContent}${eol}${textContent}${eol}`);
	});

	test('trim final new lines bug#39750', async function () {
		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel;

		await model.load();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
		const participant = new TrimFinalNewLinesParticipant(configService, undefined!);
		const textContent = 'Trim New Line';

		// single line
		let lineContent = `${textContent}`;
		model.textEditorModel.setValue(lineContent);

		// apply edits and push to undo stack.
		let textEdits = [{ range: new Range(1, 14, 1, 14), text: '.', forceMoveMarkers: false }];
		model.textEditorModel.pushEditOperations([new Selection(1, 14, 1, 14)], textEdits, () => { return [new Selection(1, 15, 1, 15)]; });

		// undo
		model.textEditorModel.undo();
		assert.equal(snapshotToString(model.createSnapshot()!), `${textContent}`);

		// trim final new lines should not mess the undo stack
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		model.textEditorModel.redo();
		assert.equal(snapshotToString(model.createSnapshot()!), `${textContent}.`);
	});

	test('trim final new lines bug#46075', async function () {
		const model = instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel;

		await model.load();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
		const participant = new TrimFinalNewLinesParticipant(configService, undefined!);
		const textContent = 'Test';
		const eol = `${model.textEditorModel.getEOL()}`;
		let content = `${textContent}${eol}${eol}`;
		model.textEditorModel.setValue(content);

		// save many times
		for (let i = 0; i < 10; i++) {
			await participant.participate(model, { reason: SaveReason.EXPLICIT });
		}

		// confirm trimming
		assert.equal(snapshotToString(model.createSnapshot()!), `${textContent}${eol}`);

		// undo should go back to previous content immediately
		model.textEditorModel.undo();
		assert.equal(snapshotToString(model.createSnapshot()!), `${textContent}${eol}${eol}`);
		model.textEditorModel.redo();
		assert.equal(snapshotToString(model.createSnapshot()!), `${textContent}${eol}`);
	});
});
