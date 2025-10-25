/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { FinalNewLineParticipant, TrimFinalNewLinesParticipant, TrimWhitespaceParticipant } from '../../browser/saveParticipants.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService, TestServiceAccessor } from '../../../../test/browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { TextFileEditorModel } from '../../../../services/textfile/common/textFileEditorModel.js';
import { IResolvedTextFileEditorModel, snapshotToString } from '../../../../services/textfile/common/textfiles.js';
import { SaveReason } from '../../../../common/editor.js';
import { TextFileEditorModelManager } from '../../../../services/textfile/common/textFileEditorModelManager.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

suite('Save Participants', function () {

	const disposables = new DisposableStore();
	let instantiationService: IInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(<TextFileEditorModelManager>accessor.textFileService.files);
	});

	teardown(() => {
		disposables.clear();
	});

	test('insert final new line', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'insertFinalNewline': true });
		const participant = new FinalNewLineParticipant(configService, undefined!);

		// No new line for empty lines
		let lineContent = '';
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), lineContent);

		// No new line if last line already empty
		lineContent = `Hello New Line${model.textEditorModel.getEOL()}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), lineContent);

		// New empty line added (single line)
		lineContent = 'Hello New Line';
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${lineContent}${model.textEditorModel.getEOL()}`);

		// New empty line added (multi line)
		lineContent = `Hello New Line${model.textEditorModel.getEOL()}Hello New Line${model.textEditorModel.getEOL()}Hello New Line`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${lineContent}${model.textEditorModel.getEOL()}`);
	});

	test('trim final new lines', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
		const participant = new TrimFinalNewLinesParticipant(configService, undefined!);
		const textContent = 'Trim New Line';
		const eol = `${model.textEditorModel.getEOL()}`;

		// No new line removal if last line is not new line
		let lineContent = `${textContent}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), lineContent);

		// No new line removal if last line is single new line
		lineContent = `${textContent}${eol}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), lineContent);

		// Remove new line (single line with two new lines)
		lineContent = `${textContent}${eol}${eol}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}`);

		// Remove new lines (multiple lines with multiple new lines)
		lineContent = `${textContent}${eol}${textContent}${eol}${eol}${eol}`;
		model.textEditorModel.setValue(lineContent);
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}${textContent}${eol}`);
	});

	test('trim final new lines bug#39750', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
		const participant = new TrimFinalNewLinesParticipant(configService, undefined!);
		const textContent = 'Trim New Line';

		// single line
		const lineContent = `${textContent}`;
		model.textEditorModel.setValue(lineContent);

		// apply edits and push to undo stack.
		const textEdits = [{ range: new Range(1, 14, 1, 14), text: '.', forceMoveMarkers: false }];
		model.textEditorModel.pushEditOperations([new Selection(1, 14, 1, 14)], textEdits, () => { return [new Selection(1, 15, 1, 15)]; });

		// undo
		await model.textEditorModel.undo();
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}`);

		// trim final new lines should not mess the undo stack
		await participant.participate(model, { reason: SaveReason.EXPLICIT });
		await model.textEditorModel.redo();
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}.`);
	});

	test('trim final new lines bug#46075', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimFinalNewlines': true });
		const participant = new TrimFinalNewLinesParticipant(configService, undefined!);
		const textContent = 'Test';
		const eol = `${model.textEditorModel.getEOL()}`;
		const content = `${textContent}${eol}${eol}`;
		model.textEditorModel.setValue(content);

		// save many times
		for (let i = 0; i < 10; i++) {
			await participant.participate(model, { reason: SaveReason.EXPLICIT });
		}

		// confirm trimming
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}`);

		// undo should go back to previous content immediately
		await model.textEditorModel.undo();
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}${eol}`);
		await model.textEditorModel.redo();
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}${eol}`);
	});

	test('trim whitespace', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/trim_final_new_line.txt'), 'utf8', undefined) as IResolvedTextFileEditorModel);

		await model.resolve();
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('files', { 'trimTrailingWhitespace': true });
		const participant = new TrimWhitespaceParticipant(configService, undefined!);
		const textContent = 'Test';
		const content = `${textContent} 	`;
		model.textEditorModel.setValue(content);

		// save many times
		for (let i = 0; i < 10; i++) {
			await participant.participate(model, { reason: SaveReason.EXPLICIT });
		}

		// confirm trimming
		assert.strictEqual(snapshotToString(model.createSnapshot()!), `${textContent}`);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
