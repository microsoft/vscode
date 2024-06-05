/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { mockObject } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IProgress } from 'vs/platform/progress/common/progress';
import { UndoRedoGroup, UndoRedoSource } from 'vs/platform/undoRedo/common/undoRedo';
import { BulkCellEdits, ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellEditType, CellUri, IResolvedNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { TestEditorService } from 'vs/workbench/test/browser/workbenchTestServices';

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
