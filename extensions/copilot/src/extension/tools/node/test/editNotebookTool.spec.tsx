/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, describe, expect, test } from 'vitest';
import type { ChatResponseStream, LanguageModelToolInvocationOptions, NotebookDocument } from 'vscode';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IAlternativeNotebookContentService } from '../../../../platform/notebook/common/alternativeContent';
import { getCellId } from '../../../../platform/notebook/common/helpers';
import { PromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { ExtHostNotebookDocumentData } from '../../../../util/common/test/shims/notebookDocument';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { NotebookCellData, NotebookCellKind, NotebookData, NotebookEdit, NotebookRange, Range, TextEdit, Uri } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { EditNotebookTool, IEditNotebookToolParams } from '../editNotebookTool';

describe('Edit Notebook Tool', () => {
	const disposables = new DisposableStore();
	afterAll(() => {
		disposables.clear();
	});
	function initialize(notebook: NotebookDocument) {
		const accessor = disposables.add(createExtensionUnitTestingServices()).createTestingAccessor();
		const workspaceService = disposables.add(new TestWorkspaceService([], [], [notebook]));
		const editTool = new EditNotebookTool(
			new PromptPathRepresentationService(new TestWorkspaceService()),
			accessor.get(IInstantiationService),
			workspaceService,
			accessor.get(IAlternativeNotebookContentService),
			accessor.get(ILogService),
			accessor.get(ITelemetryService),
			accessor.get(IEndpointProvider),
			accessor.get(IFileSystemService),
		);
		return [editTool, workspaceService] as const;
	}
	async function waitForEditCount(count: number, notebookEdits: (NotebookEdit | [Uri, TextEdit])[]) {
		await new Promise<void>((resolve) => {
			const check = () => {
				if (notebookEdits.length >= count) {
					resolve();
				} else {
					setTimeout(check, 100);
				}
			};
			check();
		});
	}
	async function invokeOneTool(notebook: ExtHostNotebookDocumentData, editTool: EditNotebookTool, editsToPerform: IEditNotebookToolParams, notebookEdits: (NotebookEdit | [Uri, TextEdit])[]) {
		const options: LanguageModelToolInvocationOptions<IEditNotebookToolParams> = { input: editsToPerform, toolInvocationToken: undefined };
		const stream: Partial<ChatResponseStream> = {
			notebookEdit(target: Uri, edits: NotebookEdit | NotebookEdit[] | true) {
				if (edits === true) {
					return;
				}
				edits = Array.isArray(edits) ? edits : [edits];
				if (edits.length === 0) {
					return;
				}
				notebookEdits.push(...edits);
				ExtHostNotebookDocumentData.applyEdits(notebook, edits);
			},
			textEdit(target: Uri, edits: TextEdit | TextEdit[] | true) {
				if (edits === true) {
					return;
				}
				edits = Array.isArray(edits) ? edits : [edits];
				if (edits.length === 0) {
					return;
				}
				for (const edit of edits) {
					notebookEdits.push([target, edit]);
				}
			}
		};
		await editTool.resolveInput(options.input, { stream } as any);
		return editTool.invoke(options, CancellationToken.None);
	}
	async function invokeTool(notebook: ExtHostNotebookDocumentData, editTool: EditNotebookTool, editsToPerform: IEditNotebookToolParams[], notebookEdits: (NotebookEdit | [Uri, TextEdit])[]) {
		// all all editsToPerformn in sequence
		for (const edit of editsToPerform) {
			await invokeOneTool(notebook, editTool, edit, notebookEdits);
		}
	}
	function createNotebook() {
		const cells = [
			new NotebookCellData(NotebookCellKind.Markup, '# This is a sample notebook', 'markdown'),
			new NotebookCellData(NotebookCellKind.Code, '# Imports\nimport sys\nimport os\nimport pandas as pd', 'python'),
			new NotebookCellData(NotebookCellKind.Code, '', 'python'),
			new NotebookCellData(NotebookCellKind.Code, '', 'python'),
			new NotebookCellData(NotebookCellKind.Code, '', 'python'),
			new NotebookCellData(NotebookCellKind.Code, 'print("Hello World")', 'python'),
			new NotebookCellData(NotebookCellKind.Code, '', 'python'),
			new NotebookCellData(NotebookCellKind.Code, `data = {'Name': ['Tom', 'nick', 'krish', 'jack'],'Age': [20, 21, 19, 18]}\ndf = pd.DataFrame(data)\nprint(df)`, 'python'),
		];
		const notebook = ExtHostNotebookDocumentData.fromNotebookData(URI.file('notebook.ipynb'), new NotebookData(cells), 'jupyter-notebook');
		return notebook;
	}
	test(`Insert a cell at the top`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);

		const promise = invokeTool(notebook, editTool,
			[{ filePath: notebook.uri.toString(), editType: 'insert', newCode: 'print(1)', language: 'python', cellId: 'top' }]
			, notebookEdits);
		await waitForEditCount(1, notebookEdits);
		workspaceService.didChangeNotebookDocumentEmitter.fire({
			cellChanges: [],
			contentChanges: [{
				addedCells: [
					{ index: 0 } as any,
				],
				removedCells: [],
				range: new NotebookRange(0, 0),
			}
			],
			metadata: undefined,
			notebook: notebook.document,
		});
		await promise;

		expect(notebookEdits.length).to.equal(1);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		const edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(0);
		expect(edit.range.end).to.equal(0);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal(`print(1)`);
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);
	});
	test(`Insert 3 cells at the bottom`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);
		const cellCount = notebook.document.cellCount;

		const cellEdits = [
			{ editType: 'insert' as const, newCode: '# header', language: 'markdown', filePath: notebook.uri.toString(), explanation: 'Insert markdown header cell at the bottom', cellId: 'bottom' },
			{ editType: 'insert' as const, newCode: 'print(1)', language: 'python', filePath: notebook.uri.toString(), explanation: 'Insert first Python code cell at the bottom', cellId: 'bottom' },
			{ editType: 'insert' as const, newCode: 'print(2)', language: 'python', filePath: notebook.uri.toString(), explanation: 'Insert second Python code cell at the bottom', cellId: 'bottom' }
		];

		for (let i = 0; i < cellEdits.length; i++) {
			const promise = invokeTool(notebook, editTool, [cellEdits[i]], notebookEdits);
			await waitForEditCount(i + 1, notebookEdits);

			// Fire event for the added cell
			workspaceService.didChangeNotebookDocumentEmitter.fire({
				cellChanges: [],
				contentChanges: [{
					addedCells: [
						{ index: cellCount + i } as any,
					],
					removedCells: [],
					range: new NotebookRange(0, 0),
				}],
				metadata: undefined,
				notebook: notebook.document,
			});

			await promise;
		}

		expect(notebookEdits.length).to.equal(3);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		let edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount);
		expect(edit.range.end).to.equal(cellCount);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('# header');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Markup);

		expect(notebookEdits[1]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[1] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount + 1);
		expect(edit.range.end).to.equal(cellCount + 1);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(1)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);

		expect(notebookEdits[2]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[2] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount + 2);
		expect(edit.range.end).to.equal(cellCount + 2);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(2)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);
	});
	test(`Insert 3 cells at the bottom (BOTTOM id)`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);
		const cellCount = notebook.document.cellCount;

		const cellEdits = [
			{ editType: 'insert' as const, newCode: '# header', language: 'markdown', filePath: notebook.uri.toString(), explanation: '', cellId: 'BOTTOM' },
			{ editType: 'insert' as const, newCode: 'print(1)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: 'BOTTOM' },
			{ editType: 'insert' as const, newCode: 'print(2)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: 'BOTTOM' },
		];

		for (let i = 0; i < cellEdits.length; i++) {
			const promise = invokeTool(notebook, editTool, [cellEdits[i]], notebookEdits);
			await waitForEditCount(i + 1, notebookEdits);

			// Fire event for the added cell
			workspaceService.didChangeNotebookDocumentEmitter.fire({
				cellChanges: [],
				contentChanges: [{
					addedCells: [
						{ index: cellCount + i } as any,
					],
					removedCells: [],
					range: new NotebookRange(0, 0),
				}],
				metadata: undefined,
				notebook: notebook.document,
			});

			await promise;
		}

		expect(notebookEdits.length).to.equal(3);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		let edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount);
		expect(edit.range.end).to.equal(cellCount);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('# header');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Markup);

		expect(notebookEdits[1]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[1] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount + 1);
		expect(edit.range.end).to.equal(cellCount + 1);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(1)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);

		expect(notebookEdits[2]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[2] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount + 2);
		expect(edit.range.end).to.equal(cellCount + 2);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(2)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);
	});
	test(`Insert 1 cells at the bottom (with cell id for first insertion)`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);
		const cellCount = notebook.document.cellCount;

		const cellEdits = [
			{ editType: 'insert' as const, newCode: '# header', language: 'markdown', filePath: notebook.uri.toString(), explanation: '', cellId: getCellId(notebook.document.cellAt(cellCount - 1)) },
		];

		for (let i = 0; i < cellEdits.length; i++) {
			const promise = invokeTool(notebook, editTool, [cellEdits[i]], notebookEdits);
			await waitForEditCount(i + 1, notebookEdits);

			// Fire event for the added cell
			workspaceService.didChangeNotebookDocumentEmitter.fire({
				cellChanges: [],
				contentChanges: [{
					addedCells: [
						{ index: cellCount + i } as any,
					],
					removedCells: [],
					range: new NotebookRange(0, 0),
				}],
				metadata: undefined,
				notebook: notebook.document,
			});

			await promise;
		}

		expect(notebookEdits.length).to.equal(1);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		const edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount);
		expect(edit.range.end).to.equal(cellCount);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('# header');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Markup);
	});
	test(`Insert 3 cells at the bottom (with cell id for all insertions)`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);
		const cellCount = notebook.document.cellCount;

		const cellEdits = [
			{ editType: 'insert' as const, newCode: '# header', language: 'markdown', filePath: notebook.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(1)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(2)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: '' }
		];

		for (let i = 0; i < cellEdits.length; i++) {
			cellEdits[i].cellId = getCellId(notebook.document.cellAt(cellCount - 1 + i));
			const promise = invokeTool(notebook, editTool, [cellEdits[i]], notebookEdits);
			await waitForEditCount(i + 1, notebookEdits);

			// Fire event for the added cell
			workspaceService.didChangeNotebookDocumentEmitter.fire({
				cellChanges: [],
				contentChanges: [{
					addedCells: [
						{ index: cellCount + i } as any,
					],
					removedCells: [],
					range: new NotebookRange(0, 0),
				}],
				metadata: undefined,
				notebook: notebook.document,
			});

			await promise;
		}

		expect(notebookEdits.length).to.equal(3);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		let edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount);
		expect(edit.range.end).to.equal(cellCount);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('# header');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Markup);

		expect(notebookEdits[1]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[1] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount + 1);
		expect(edit.range.end).to.equal(cellCount + 1);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(1)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);

		expect(notebookEdits[2]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[2] as NotebookEdit;
		expect(edit.range.start).to.equal(cellCount + 2);
		expect(edit.range.end).to.equal(cellCount + 2);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(2)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);
	});
	test(`Insert a cell after the first cell`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);

		const promise = invokeTool(notebook, editTool,
			[{ filePath: notebook.uri.toString(), editType: 'insert', newCode: 'print(1234)', language: 'python', cellId: getCellId(notebook.document.cellAt(0)) }]
			, notebookEdits);
		await waitForEditCount(1, notebookEdits);
		workspaceService.didChangeNotebookDocumentEmitter.fire({
			cellChanges: [],
			contentChanges: [{
				addedCells: [
					{ index: 1 } as any,
				],
				removedCells: [],
				range: new NotebookRange(0, 0),
			}
			],
			metadata: undefined,
			notebook: notebook.document,
		});
		await promise;

		expect(notebookEdits.length).to.equal(1);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		const edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(1);
		expect(edit.range.end).to.equal(1);
		expect(edit.newCells.length).to.equal(1);
	});
	test(`Insert 3 cells after the first cell`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);

		const cellEdits = [
			{ editType: 'insert' as const, newCode: '# header', language: 'markdown', filePath: notebook.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(1)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(2)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: '' }
		];

		for (let i = 0; i < cellEdits.length; i++) {
			cellEdits[i].cellId = getCellId(notebook.document.cellAt(i));
			const promise = invokeTool(notebook, editTool, [cellEdits[i]], notebookEdits);
			await waitForEditCount(i + 1, notebookEdits);

			// Fire event for the added cell
			workspaceService.didChangeNotebookDocumentEmitter.fire({
				cellChanges: [],
				contentChanges: [{
					addedCells: [
						{ index: i + 1 } as any,
					],
					removedCells: [],
					range: new NotebookRange(0, 0),
				}],
				metadata: undefined,
				notebook: notebook.document,
			});

			await promise;
		}

		expect(notebookEdits.length).to.equal(3);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		let edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(1);
		expect(edit.range.end).to.equal(1);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('# header');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Markup);

		expect(notebookEdits[1]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[1] as NotebookEdit;
		expect(edit.range.start).to.equal(2);
		expect(edit.range.end).to.equal(2);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(1)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);

		expect(notebookEdits[2]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[2] as NotebookEdit;
		expect(edit.range.start).to.equal(3);
		expect(edit.range.end).to.equal(3);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(2)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);
	});
	test(`Insert 3 cells after the third cell`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);

		const cellEdits = [
			{ editType: 'insert' as const, newCode: '# header', language: 'markdown', filePath: notebook.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(1)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(2)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: '' }
		];

		for (let i = 0; i < cellEdits.length; i++) {
			cellEdits[i].cellId = getCellId(notebook.document.cellAt(2 + i));
			const promise = invokeTool(notebook, editTool, [cellEdits[i]], notebookEdits);
			await waitForEditCount(i + 1, notebookEdits);

			// Fire event for the added cell
			workspaceService.didChangeNotebookDocumentEmitter.fire({
				cellChanges: [],
				contentChanges: [{
					addedCells: [
						{ index: 3 + i } as any,
					],
					removedCells: [],
					range: new NotebookRange(0, 0),
				}],
				metadata: undefined,
				notebook: notebook.document,
			});

			await promise;
		}

		expect(notebookEdits.length).to.equal(3);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		let edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(3);
		expect(edit.range.end).to.equal(3);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('# header');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Markup);

		expect(notebookEdits[1]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[1] as NotebookEdit;
		expect(edit.range.start).to.equal(4);
		expect(edit.range.end).to.equal(4);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(1)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);

		expect(notebookEdits[2]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[2] as NotebookEdit;
		expect(edit.range.start).to.equal(5);
		expect(edit.range.end).to.equal(5);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(2)');
		expect(edit.newCells[0].kind).to.equal(NotebookCellKind.Code);
	});
	test(`Insert 3 cells after the last cell`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);

		const count = notebook.document.cellCount;
		const cellEdits = [
			{ editType: 'insert' as const, newCode: '# header', language: 'markdown', filePath: notebook.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(1)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(2)', language: 'python', filePath: notebook.uri.toString(), explanation: '', cellId: '' }
		];
		for (let i = 0; i < cellEdits.length; i++) {
			cellEdits[i].cellId = getCellId(notebook.document.cellAt(notebook.document.cellCount - 1));
			const promise = invokeTool(notebook, editTool, [cellEdits[i]], notebookEdits);
			await waitForEditCount(i + 1, notebookEdits);
			// Fire event for the added cell
			workspaceService.didChangeNotebookDocumentEmitter.fire({
				cellChanges: [],
				contentChanges: [{
					addedCells: [
						{ index: count + i } as any,
					],
					removedCells: [],
					range: new NotebookRange(0, 0)
				}],
				metadata: undefined,
				notebook: notebook.document,
			});
			await promise;
		}

		expect(notebookEdits.length).to.equal(3);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		let edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(count);
		expect(edit.range.end).to.equal(count);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('# header');

		expect(notebookEdits[1]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[1] as NotebookEdit;
		expect(edit.range.start).to.equal(count + 1);
		expect(edit.range.end).to.equal(count + 1);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(1)');

		expect(notebookEdits[2]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[2] as NotebookEdit;
		expect(edit.range.start).to.equal(count + 2);
		expect(edit.range.end).to.equal(count + 2);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal('print(2)');
	});
	test(`Insert a cell after the first cell (use notebook cell Uri)`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);

		const promise = invokeTool(notebook, editTool,
			[{ filePath: notebook.document.cellAt(0).document.uri.toString(), editType: 'insert', newCode: 'print(1234)', language: 'python', cellId: getCellId(notebook.document.cellAt(0)) }]
			, notebookEdits);
		await waitForEditCount(1, notebookEdits);
		workspaceService.didChangeNotebookDocumentEmitter.fire({
			cellChanges: [],
			contentChanges: [{
				addedCells: [
					{ index: 1 } as any,
				],
				removedCells: [],
				range: new NotebookRange(0, 0),
			}
			],
			metadata: undefined,
			notebook: notebook.document,
		});
		await promise;

		expect(notebookEdits.length).to.equal(1);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		const edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(1);
		expect(edit.range.end).to.equal(1);
		expect(edit.newCells.length).to.equal(1);
	});
	test(`Insert 3 cells after the first cell (use notebook cell Uri)`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);

		const cellEdits = [
			{ editType: 'insert' as const, newCode: 'print(1)', language: 'python', filePath: notebook.document.cellAt(0).document.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(2)', language: 'python', filePath: notebook.document.cellAt(0).document.uri.toString(), explanation: '', cellId: '' },
			{ editType: 'insert' as const, newCode: 'print(3)', language: 'python', filePath: notebook.document.cellAt(0).document.uri.toString(), explanation: '', cellId: '' },
		];

		for (let i = 0; i < cellEdits.length; i++) {
			cellEdits[i].cellId = getCellId(notebook.document.cellAt(i));
			cellEdits[i].filePath = notebook.document.cellAt(i).document.uri.toString();

			const promise = invokeTool(notebook, editTool, [cellEdits[i]], notebookEdits);
			await waitForEditCount(i + 1, notebookEdits);
			// Fire event for the added cell
			workspaceService.didChangeNotebookDocumentEmitter.fire({
				cellChanges: [],
				contentChanges: [{
					addedCells: [
						{ index: i + 1 } as any,
					],
					removedCells: [],
					range: new NotebookRange(0, 0),
				}],
				metadata: undefined,
				notebook: notebook.document,
			});
			await promise;
		}

		expect(notebookEdits.length).to.equal(3);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		let edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(1);
		expect(edit.range.end).to.equal(1);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal(`print(1)`);

		expect(notebookEdits[1]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[1] as NotebookEdit;
		expect(edit.range.start).to.equal(2);
		expect(edit.range.end).to.equal(2);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal(`print(2)`);

		expect(notebookEdits[2]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[2] as NotebookEdit;
		expect(edit.range.start).to.equal(3);
		expect(edit.range.end).to.equal(3);
		expect(edit.newCells.length).to.equal(1);
		expect(edit.newCells[0].value).to.equal(`print(3)`);
	});
	test(`Delete 4 cells`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);

		const removedCells = [
			notebook.document.cellAt(2),
			notebook.document.cellAt(3),
			notebook.document.cellAt(4),
			notebook.document.cellAt(6),
		];

		const cellEdits = [
			{ editType: 'delete' as const, filePath: notebook.uri.toString(), explanation: '', cellId: getCellId(notebook.document.cellAt(2)) },
			{ editType: 'delete' as const, filePath: notebook.uri.toString(), explanation: '', cellId: getCellId(notebook.document.cellAt(3)) },
			{ editType: 'delete' as const, filePath: notebook.uri.toString(), explanation: '', cellId: getCellId(notebook.document.cellAt(4)) },
			{ editType: 'delete' as const, filePath: notebook.uri.toString(), explanation: '', cellId: getCellId(notebook.document.cellAt(6)) },
		];

		for (let i = 0; i < cellEdits.length; i++) {
			const promise = invokeTool(notebook, editTool, [cellEdits[i]], notebookEdits);
			await waitForEditCount(i + 1, notebookEdits);

			// Fire event for the added cell
			workspaceService.didChangeNotebookDocumentEmitter.fire({
				cellChanges: [],
				contentChanges: [{
					addedCells: [],
					removedCells: [
						removedCells[i],
					],
					range: new NotebookRange(0, 0),
				}],
				metadata: undefined,
				notebook: notebook.document,
			});

			await promise;
		}

		expect(notebookEdits.length).to.equal(4);
		expect(notebookEdits[0]).to.be.instanceOf(NotebookEdit);
		let edit = notebookEdits[0] as NotebookEdit;
		expect(edit.range.start).to.equal(2);
		expect(edit.range.end).to.equal(3);
		expect(edit.newCells.length).to.equal(0);

		expect(notebookEdits[1]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[1] as NotebookEdit;
		expect(edit.range.start).to.equal(2);
		expect(edit.range.end).to.equal(3);
		expect(edit.newCells.length).to.equal(0);

		expect(notebookEdits[2]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[2] as NotebookEdit;
		expect(edit.range.start).to.equal(2);
		expect(edit.range.end).to.equal(3);
		expect(edit.newCells.length).to.equal(0);

		expect(notebookEdits[3]).to.be.instanceOf(NotebookEdit);
		edit = notebookEdits[3] as NotebookEdit;
		expect(edit.range.start).to.equal(3);
		expect(edit.range.end).to.equal(4);
		expect(edit.newCells.length).to.equal(0);
	});
	test(`Update empty cell`, async () => {
		const notebookEdits: (NotebookEdit | [Uri, TextEdit])[] = [];
		const notebook = createNotebook();
		const [editTool, workspaceService] = initialize(notebook.document);

		const cell2 = notebook.document.cellAt(2);
		const promise = invokeTool(notebook, editTool, [
			{ filePath: notebook.uri.toString(), editType: 'edit', cellId: getCellId(cell2), newCode: 'print("Foo Bar")' }
		], notebookEdits);
		await waitForEditCount(1, notebookEdits);
		workspaceService.didChangeTextDocumentEmitter.fire({
			document: cell2.document,
			contentChanges: [
				{
					range: new Range(0, 0, 0, 0),
					rangeLength: 0,
					rangeOffset: 0,
					text: 'print("Foo Bar")',
				}
			],
			reason: undefined,
			detailedReason: undefined,
		});
		workspaceService.didChangeNotebookDocumentEmitter.fire({
			cellChanges: [
				{
					cell: cell2,
					document: cell2.document,
					metadata: undefined,
					outputs: [],
					executionSummary: undefined,
				}
			],
			contentChanges: [{
				addedCells: [],
				removedCells: [],
				range: new NotebookRange(0, 0),
			}],
			metadata: undefined,
			notebook: notebook.document,
		});
		await promise;

		expect(notebookEdits.length).to.equal(1);
		const edit = notebookEdits[0] as [Uri, TextEdit];
		expect(edit[0].toString()).to.equal(cell2.document.uri.toString());
		expect(edit[1].newText).to.include('print("Foo Bar")');
	});
});
