/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../../base/test/common/utils.js';
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from '../../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import * as languages from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../../../editor/contrib/codeAction/common/types.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Progress } from '../../../../../../platform/progress/common/progress.js';
import { TextFileEditorModel } from '../../../../../services/textfile/common/textFileEditorModel.js';
import { IResolvedTextFileEditorModel } from '../../../../../services/textfile/common/textfiles.js';
import { TextFileEditorModelManager } from '../../../../../services/textfile/common/textFileEditorModelManager.js';
import { workbenchInstantiationService, TestServiceAccessor } from '../../../../../test/browser/workbenchTestServices.js';
import { CodeActionParticipantUtils } from '../../../browser/contrib/saveParticipants/saveParticipants.js';

suite('Notebook Save Participants', function () {
	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let accessor: TestServiceAccessor;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		accessor = instantiationService.createInstance(TestServiceAccessor);
		disposables.add(<TextFileEditorModelManager>accessor.textFileService.files);
	});

	teardown(() => disposables.clear());

	test('code actions on save cascade between providers, #174295', async function () {
		const model = disposables.add(instantiationService.createInstance(
			TextFileEditorModel,
			toResource.call(this, '/path/notebook_organize_imports.py'),
			'utf8',
			undefined
		) as IResolvedTextFileEditorModel);
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

		await instantiationService.invokeFunction(
			CodeActionParticipantUtils.applyOnSaveGenericCodeActions,
			model.textEditorModel,
			[CodeActionKind.SourceOrganizeImports],
			[],
			Progress.None,
			CancellationToken.None
		);

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
