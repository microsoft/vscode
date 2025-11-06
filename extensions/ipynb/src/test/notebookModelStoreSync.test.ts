/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { CancellationTokenSource, Disposable, EventEmitter, ExtensionContext, NotebookCellKind, NotebookDocumentChangeEvent, NotebookDocumentWillSaveEvent, NotebookEdit, NotebookRange, TextDocumentSaveReason, workspace, type CancellationToken, type NotebookCell, type NotebookDocument, type WorkspaceEdit, type WorkspaceEditMetadata } from 'vscode';
import { activate } from '../notebookModelStoreSync';

suite(`Notebook Model Store Sync`, () => {
	let disposables: Disposable[] = [];
	let onDidChangeNotebookDocument: EventEmitter<NotebookDocumentChangeEvent>;
	let onWillSaveNotebookDocument: AsyncEmitter<NotebookDocumentWillSaveEvent>;
	let notebook: NotebookDocument;
	let token: CancellationTokenSource;
	let editsApplied: WorkspaceEdit[] = [];
	let pendingPromises: Promise<void>[] = [];
	let cellMetadataUpdates: NotebookEdit[] = [];
	let applyEditStub: sinon.SinonStub<[edit: WorkspaceEdit, metadata?: WorkspaceEditMetadata | undefined], Thenable<boolean>>;
	setup(() => {
		disposables = [];
		notebook = {
			notebookType: '',
			metadata: {}
		} as NotebookDocument;
		token = new CancellationTokenSource();
		disposables.push(token);
		sinon.stub(notebook, 'notebookType').get(() => 'jupyter-notebook');
		applyEditStub = sinon.stub(workspace, 'applyEdit').callsFake((edit: WorkspaceEdit) => {
			editsApplied.push(edit);
			return Promise.resolve(true);
		});
		const context = { subscriptions: [] as Disposable[] } as ExtensionContext;
		onDidChangeNotebookDocument = new EventEmitter<NotebookDocumentChangeEvent>();
		disposables.push(onDidChangeNotebookDocument);
		onWillSaveNotebookDocument = new AsyncEmitter<NotebookDocumentWillSaveEvent>();

		sinon.stub(NotebookEdit, 'updateCellMetadata').callsFake((index, metadata) => {
			// eslint-disable-next-line local/code-no-any-casts
			const edit = (NotebookEdit.updateCellMetadata as any).wrappedMethod.call(NotebookEdit, index, metadata);
			cellMetadataUpdates.push(edit);
			return edit;
		}
		);
		sinon.stub(workspace, 'onDidChangeNotebookDocument').callsFake(cb =>
			onDidChangeNotebookDocument.event(cb)
		);
		sinon.stub(workspace, 'onWillSaveNotebookDocument').callsFake(cb =>
			onWillSaveNotebookDocument.event(cb)
		);
		activate(context);
	});
	teardown(async () => {
		await Promise.allSettled(pendingPromises);
		editsApplied = [];
		pendingPromises = [];
		cellMetadataUpdates = [];
		disposables.forEach(d => d.dispose());
		disposables = [];
		sinon.restore();
	});

	test('Empty cell will not result in any updates', async () => {
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [],
			cellChanges: []
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 0);
	});
	test('Adding cell for non Jupyter Notebook will not result in any updates', async () => {
		sinon.stub(notebook, 'notebookType').get(() => 'some-other-type');
		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [
				{
					range: new NotebookRange(0, 0),
					removedCells: [],
					addedCells: [cell]
				}
			],
			cellChanges: []
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 0);
		assert.strictEqual(cellMetadataUpdates.length, 0);
	});
	test('Adding cell to nbformat 4.2 notebook will result in adding empty metadata', async () => {
		sinon.stub(notebook, 'metadata').get(() => ({ nbformat: 4, nbformat_minor: 2 }));
		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [
				{
					range: new NotebookRange(0, 0),
					removedCells: [],
					addedCells: [cell]
				}
			],
			cellChanges: []
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 1);
		assert.strictEqual(cellMetadataUpdates.length, 1);
		const newMetadata = cellMetadataUpdates[0].newCellMetadata;
		assert.deepStrictEqual(newMetadata, { execution_count: null, metadata: {} });
	});
	test('Added cell will have a cell id if nbformat is 4.5', async () => {
		sinon.stub(notebook, 'metadata').get(() => ({ nbformat: 4, nbformat_minor: 5 }));
		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [
				{
					range: new NotebookRange(0, 0),
					removedCells: [],
					addedCells: [cell]
				}
			],
			cellChanges: []
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 1);
		assert.strictEqual(cellMetadataUpdates.length, 1);
		const newMetadata = cellMetadataUpdates[0].newCellMetadata || {};
		assert.strictEqual(Object.keys(newMetadata).length, 3);
		assert.deepStrictEqual(newMetadata.execution_count, null);
		assert.deepStrictEqual(newMetadata.metadata, {});
		assert.ok(newMetadata.id);
	});
	test('Do not add cell id if one already exists', async () => {
		sinon.stub(notebook, 'metadata').get(() => ({ nbformat: 4, nbformat_minor: 5 }));
		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {
				id: '1234'
			},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [
				{
					range: new NotebookRange(0, 0),
					removedCells: [],
					addedCells: [cell]
				}
			],
			cellChanges: []
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 1);
		assert.strictEqual(cellMetadataUpdates.length, 1);
		const newMetadata = cellMetadataUpdates[0].newCellMetadata || {};
		assert.strictEqual(Object.keys(newMetadata).length, 3);
		assert.deepStrictEqual(newMetadata.execution_count, null);
		assert.deepStrictEqual(newMetadata.metadata, {});
		assert.strictEqual(newMetadata.id, '1234');
	});
	test('Do not perform any updates if cell id and metadata exists', async () => {
		sinon.stub(notebook, 'metadata').get(() => ({ nbformat: 4, nbformat_minor: 5 }));
		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {
				id: '1234',
				metadata: {}
			},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [
				{
					range: new NotebookRange(0, 0),
					removedCells: [],
					addedCells: [cell]
				}
			],
			cellChanges: []
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 0);
		assert.strictEqual(cellMetadataUpdates.length, 0);
	});
	test('Store language id in custom metadata, whilst preserving existing metadata', async () => {
		sinon.stub(notebook, 'metadata').get(() => ({
			nbformat: 4, nbformat_minor: 5,
			metadata: {
				language_info: { name: 'python' }
			}
		}));
		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {
				languageId: 'javascript'
			} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {
				id: '1234',
				metadata: {
					collapsed: true, scrolled: true
				}
			},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [],
			cellChanges: [
				{
					cell,
					// eslint-disable-next-line local/code-no-any-casts
					document: {
						languageId: 'javascript'
					} as any,
					metadata: undefined,
					outputs: undefined,
					executionSummary: undefined
				}
			]
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 1);
		assert.strictEqual(cellMetadataUpdates.length, 1);
		const newMetadata = cellMetadataUpdates[0].newCellMetadata || {};
		assert.strictEqual(Object.keys(newMetadata).length, 3);
		assert.deepStrictEqual(newMetadata.execution_count, null);
		assert.deepStrictEqual(newMetadata.metadata, { collapsed: true, scrolled: true, vscode: { languageId: 'javascript' } });
		assert.strictEqual(newMetadata.id, '1234');
	});
	test('No changes when language is javascript', async () => {
		sinon.stub(notebook, 'metadata').get(() => ({
			nbformat: 4, nbformat_minor: 5,
			metadata: {
				language_info: { name: 'javascript' }
			}
		}));
		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {
				languageId: 'javascript'
			} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {
				id: '1234',
				metadata: {
					collapsed: true, scrolled: true
				}
			},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [],
			cellChanges: [
				{
					cell,
					document: undefined,
					metadata: undefined,
					outputs: undefined,
					executionSummary: undefined
				}
			]
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 0);
		assert.strictEqual(cellMetadataUpdates.length, 0);
	});
	test('Remove language from metadata when cell language matches kernel language', async () => {
		sinon.stub(notebook, 'metadata').get(() => ({
			nbformat: 4, nbformat_minor: 5,
			metadata: {
				language_info: { name: 'javascript' }
			}
		}));
		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {
				languageId: 'javascript'
			} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {
				id: '1234',
				metadata: {
					vscode: { languageId: 'python' },
					collapsed: true, scrolled: true
				}
			},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [],
			cellChanges: [
				{
					cell,
					// eslint-disable-next-line local/code-no-any-casts
					document: {
						languageId: 'javascript'
					} as any,
					metadata: undefined,
					outputs: undefined,
					executionSummary: undefined
				}
			]
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 1);
		assert.strictEqual(cellMetadataUpdates.length, 1);
		const newMetadata = cellMetadataUpdates[0].newCellMetadata || {};
		assert.strictEqual(Object.keys(newMetadata).length, 3);
		assert.deepStrictEqual(newMetadata.execution_count, null);
		assert.deepStrictEqual(newMetadata.metadata, { collapsed: true, scrolled: true });
		assert.strictEqual(newMetadata.id, '1234');
	});
	test('Update language in metadata', async () => {
		sinon.stub(notebook, 'metadata').get(() => ({
			nbformat: 4, nbformat_minor: 5,
			metadata: {
				language_info: { name: 'javascript' }
			}
		}));
		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {
				languageId: 'powershell'
			} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {
				id: '1234',
				metadata: {
					vscode: { languageId: 'python' },
					collapsed: true, scrolled: true
				}
			},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [],
			cellChanges: [
				{
					cell,
					// eslint-disable-next-line local/code-no-any-casts
					document: {
						languageId: 'powershell'
					} as any,
					metadata: undefined,
					outputs: undefined,
					executionSummary: undefined
				}
			]
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 1);
		assert.strictEqual(cellMetadataUpdates.length, 1);
		const newMetadata = cellMetadataUpdates[0].newCellMetadata || {};
		assert.strictEqual(Object.keys(newMetadata).length, 3);
		assert.deepStrictEqual(newMetadata.execution_count, null);
		assert.deepStrictEqual(newMetadata.metadata, { collapsed: true, scrolled: true, vscode: { languageId: 'powershell' } });
		assert.strictEqual(newMetadata.id, '1234');
	});

	test('Will save event without any changes', async () => {
		await onWillSaveNotebookDocument.fireAsync({ notebook, reason: TextDocumentSaveReason.Manual }, token.token);
	});
	test('Wait for pending updates to complete when saving', async () => {
		let resolveApplyEditPromise: (value: boolean) => void;
		const promise = new Promise<boolean>((resolve) => resolveApplyEditPromise = resolve);
		applyEditStub.restore();
		sinon.stub(workspace, 'applyEdit').callsFake((edit: WorkspaceEdit) => {
			editsApplied.push(edit);
			return promise;
		});

		const cell: NotebookCell = {
			// eslint-disable-next-line local/code-no-any-casts
			document: {} as any,
			executionSummary: {},
			index: 0,
			kind: NotebookCellKind.Code,
			metadata: {},
			notebook,
			outputs: []
		};
		const e: NotebookDocumentChangeEvent = {
			notebook,
			metadata: undefined,
			contentChanges: [
				{
					range: new NotebookRange(0, 0),
					removedCells: [],
					addedCells: [cell]
				}
			],
			cellChanges: []
		};

		onDidChangeNotebookDocument.fire(e);

		assert.strictEqual(editsApplied.length, 1);
		assert.strictEqual(cellMetadataUpdates.length, 1);

		// Try to save.
		let saveCompleted = false;
		const saved = onWillSaveNotebookDocument.fireAsync({
			notebook,
			reason: TextDocumentSaveReason.Manual
		}, token.token);
		saved.finally(() => saveCompleted = true);
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Verify we have not yet completed saving.
		assert.strictEqual(saveCompleted, false);

		resolveApplyEditPromise!(true);
		await new Promise((resolve) => setTimeout(resolve, 1));

		// Should have completed saving.
		saved.finally(() => saveCompleted = true);
	});

	interface IWaitUntil {
		token: CancellationToken;
		waitUntil(thenable: Promise<unknown>): void;
	}

	interface IWaitUntil {
		token: CancellationToken;
		waitUntil(thenable: Promise<unknown>): void;
	}
	type IWaitUntilData<T> = Omit<Omit<T, 'waitUntil'>, 'token'>;

	class AsyncEmitter<T extends IWaitUntil> {
		private listeners: ((d: T) => void)[] = [];
		get event(): (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => Disposable {

			return (listener, thisArgs, _disposables) => {
				this.listeners.push(listener.bind(thisArgs));
				return {
					dispose: () => {
						//
					}
				};
			};
		}
		dispose() {
			this.listeners = [];
		}
		async fireAsync(data: IWaitUntilData<T>, token: CancellationToken): Promise<void> {
			if (!this.listeners.length) {
				return;
			}

			const promises: Promise<unknown>[] = [];
			this.listeners.forEach(cb => {
				const event = {
					...data,
					token,
					waitUntil: (thenable: Promise<WorkspaceEdit>) => {
						promises.push(thenable);
					}
				} as T;
				cb(event);
			});

			await Promise.all(promises);
		}
	}
});
