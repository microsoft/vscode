/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import * as languages from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../../editor/contrib/codeAction/common/types.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { SaveReason } from '../../../../common/editor.js';
import { TextFileEditorModel } from '../../../../services/textfile/common/textFileEditorModel.js';
import { IResolvedTextFileEditorModel, snapshotToString } from '../../../../services/textfile/common/textfiles.js';
import { TextFileEditorModelManager } from '../../../../services/textfile/common/textFileEditorModelManager.js';
import { workbenchInstantiationService, TestServiceAccessor } from '../../../../test/browser/workbenchTestServices.js';
import { CodeActionOnSaveParticipant, FinalNewLineParticipant, TrimFinalNewLinesParticipant, TrimWhitespaceParticipant } from '../../browser/saveParticipants.js';

suite('Save Participants', function () {

	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
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

	test('code actions on save cascade between providers, #174295', async function () {
		const model: IResolvedTextFileEditorModel = disposables.add(instantiationService.createInstance(TextFileEditorModel, toResource.call(this, '/path/organize_imports.py'), 'utf8', undefined) as IResolvedTextFileEditorModel);
		await model.resolve();
		model.textEditorModel.setValue('import os,sys\nlast');
		instantiationService.stub(IBulkEditService, new class extends mock<IBulkEditService>() {
			override async apply(edit: ResourceEdit[] | languages.WorkspaceEdit) {
				const edits = Array.isArray(edit) ? edit : ResourceEdit.convert(edit);
				for (const resourceEdit of edits) {
					if (resourceEdit instanceof ResourceTextEdit) {
						assert.strictEqual(resourceEdit.resource.toString(), model.resource.toString());
						model.textEditorModel.applyEdits([resourceEdit.textEdit]);
					}
				}
				return { ariaSummary: '', isApplied: true };
			}
		});

		accessor.testConfigurationService.setUserConfiguration('editor', {
			codeActionsOnSave: {
				[CodeActionKind.SourceOrganizeImports.value]: 'explicit'
			}
		});

		const providerInputs: string[] = [];
		const createProvider = (name: string, getEdit: (textModel: ITextModel) => languages.WorkspaceEdit | undefined): languages.CodeActionProvider => ({
			providedCodeActionKinds: [CodeActionKind.SourceOrganizeImports.value],
			provideCodeActions: (textModel: ITextModel): languages.CodeActionList => {
				providerInputs.push(`${name}: ${textModel.getValue()}`);
				const edit = getEdit(textModel);
				return {
					actions: edit ? [{ title: `${name} organizer`, kind: CodeActionKind.SourceOrganizeImports.value, edit }] : [],
					dispose: () => { }
				};
			}
		});
		const languageFeaturesService = instantiationService.invokeFunction(accessor => accessor.get(ILanguageFeaturesService));
		disposables.add(languageFeaturesService.codeActionProvider.register('*', createProvider('second', textModel => textModel.getValue().startsWith('import os,sys') ? {
			edits: [{
				resource: textModel.uri,
				textEdit: { range: new Range(1, 1, 1, 14), text: 'import os\nimport sys' },
				versionId: undefined
			}]
		} : undefined)));
		disposables.add(languageFeaturesService.codeActionProvider.register('*', createProvider('first', textModel => textModel.getValue().startsWith('import os,sys') ? {
			edits: [{
				resource: textModel.uri,
				textEdit: { range: new Range(1, 10, 1, 11), text: '\nimport ' },
				versionId: undefined
			}]
		} : undefined)));

		const participant = disposables.add(instantiationService.createInstance(CodeActionOnSaveParticipant));
		await participant.participate(model, { reason: SaveReason.EXPLICIT }, Progress.None, CancellationToken.None);

		assert.deepStrictEqual({
			providerInputs,
			value: model.textEditorModel.getValue()
		}, {
			providerInputs: [
				'first: import os,sys\nlast',
				'second: import os\nimport sys\nlast'
			],
			value: 'import os\nimport sys\nlast'
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
