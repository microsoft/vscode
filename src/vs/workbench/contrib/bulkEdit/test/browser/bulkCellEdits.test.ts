/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { mockObject } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IProgress } from '../../../../../platform/progress/common/progress.js';
import { UndoRedoGroup, UndoRedoSource } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { BulkCellEdits, ResourceNotebookCellEdit } from '../../browser/bulkCellEdits.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { CellEditType, CellUri, IResolvedNotebookEditorModel } from '../../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../../notebook/common/notebookEditorModelResolverService.js';
import { TestEditorService } from '../../../../test/browser/workbenchTestServices.js';

suite('BulkCellEdits', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function runTest(inputUri: URI, resolveUri: URI) {
		const progress: IProgress<void> = { report: _ => { } };
		const editorService = store.add(new TestEditorService());

		const notebook = mockObject<NotebookTextModel>()();
		notebook.uri.returns(URI.file('/project/notebook.ipynb'));

		const notebookEditorModel = mockObject<IResolvedNotebookEditorModel>()({ notebook: notebook as any });
		notebookEditorModel.isReadonly.returns(false);

		const notebookService = mockObject<INotebookEditorModelResolverService>()();
		notebookService.resolve.returns({ object: notebookEditorModel, dispose: () => { } });

		const edits = [
			new ResourceNotebookCellEdit(inputUri, { index: 0, count: 1, editType: CellEditType.Replace, cells: [] })
		];
		const bce = new BulkCellEdits(new UndoRedoGroup(), new UndoRedoSource(), progress, CancellationToken.None, edits, editorService, notebookService as any);
		await bce.apply();

		const resolveArgs = notebookService.resolve.args[0];
		assert.strictEqual(resolveArgs[0].toString(), resolveUri.toString());
	}

	const notebookUri = URI.file('/foo/bar.ipynb');
	test('works with notebook URI', async () => {
		await runTest(notebookUri, notebookUri);
	});

	test('maps cell URI to notebook URI', async () => {
		await runTest(CellUri.generate(notebookUri, 5), notebookUri);
	});

	test('throws for invalid cell URI', async () => {
		const badCellUri = CellUri.generate(notebookUri, 5).with({ fragment: '' });
		await assert.rejects(async () => await runTest(badCellUri, notebookUri));
	});
});
