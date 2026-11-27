/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import type { Event, NotebookCell, NotebookDocument, NotebookDocumentChangeEvent, TextDocument } from 'vscode';
import { getCellId } from '../../../../platform/notebook/common/helpers';
import { ILogger, ILogService } from '../../../../platform/log/common/logService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { StringSHA1 } from '../../../../util/vs/base/common/hash';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { NotebookCellKind, NotebookRange, Uri } from '../../../../vscodeTypes';
import { LinkifiedPart, LinkifyLocationAnchor } from '../../common/linkifiedText';
import { NotebookCellLinkifier } from '../../vscode-node/notebookCellLinkifier';
import { assertPartsEqual } from '../node/util';

suite('Notebook Cell Linkifier', () => {

	// The cell ID prefix from helpers.ts
	const CELL_ID_PREFIX = '#VSC-';

	function createMockNotebookCell(uri: Uri, index: number): NotebookCell {
		return {
			index,
			kind: NotebookCellKind.Code,
			document: {
				uri,
				lineCount: 1,
				lineAt: () => ({ text: 'print("hello")' }),
				languageId: 'python'
			} as unknown as TextDocument,
			metadata: {},
			outputs: [],
			executionSummary: undefined
		} as unknown as NotebookCell;
	}

	function createMockNotebookDocument(cells: NotebookCell[], uri = Uri.file('/test/notebook.ipynb')): NotebookDocument {
		return {
			uri,
			getCells: () => cells,
			cellCount: cells.length,
			cellAt: (index: number) => cells[index],
			notebookType: 'jupyter-notebook',
			isDirty: false,
			isUntitled: false,
			isClosed: false,
			metadata: {},
			version: 1,
			save: () => Promise.resolve(true)
		} as NotebookDocument;
	}

	function createMockWorkspaceService(notebooks: NotebookDocument[]): IWorkspaceService {
		return new TestWorkspaceService([], [], notebooks);
	}

	function generateCellId(cellUri: Uri): string {
		const hash = new StringSHA1();
		hash.update(cellUri.toString());
		return `${CELL_ID_PREFIX}${hash.digest().substring(0, 8)}`;
	}

	const logger: ILogger = {
		error: () => { /* no-op */ },
		warn: () => { /* no-op */ },
		info: () => { /* no-op */ },
		debug: () => { /* no-op */ },
		trace: () => { /* no-op */ },
		show: () => { /* no-op */ },
		createSubLogger(): ILogger { return logger; },
		withExtraTarget(): ILogger { return logger; }
	};
	const mockLogger = new class implements ILogService {
		_serviceBrand: undefined;
		internal = logger;
		logger = logger;
		trace = logger.trace;
		debug = logger.debug;
		info = logger.info;
		warn = logger.warn;
		error = logger.error;
		show(preserveFocus?: boolean): void {
			//
		}
		createSubLogger(): ILogger {
			return this;
		}
		withExtraTarget(): ILogger {
			return this;
		}
	}();

	function normalizeParts(parts: readonly LinkifiedPart[]): LinkifiedPart[] {
		const normalized: LinkifiedPart[] = [];
		for (const part of parts) {
			if (part === '') {
				continue;
			}
			if (typeof part === 'string' && normalized.length && typeof normalized[normalized.length - 1] === 'string') {
				normalized[normalized.length - 1] += part; // Concatenate strings
			} else {
				normalized.push(part);
			}
		}
		return normalized;
	}
	test('Should linkify actual cell IDs', async () => {
		// Create mock cells with specific URIs
		const cellUri1 = Uri.parse('vscode-notebook-cell:/test/notebook.ipynb#cell1');
		const cellUri2 = Uri.parse('vscode-notebook-cell:/test/notebook.ipynb#cell2');

		const cell1 = createMockNotebookCell(cellUri1, 0);
		const cell2 = createMockNotebookCell(cellUri2, 1);

		const notebook = createMockNotebookDocument([cell1, cell2]);
		const workspaceService = createMockWorkspaceService([notebook]);

		// Generate the expected cell IDs
		const cellId1 = generateCellId(cellUri1);
		const cellId2 = generateCellId(cellUri2);

		const linkifier = new NotebookCellLinkifier(workspaceService, mockLogger);

		const testText = `Below is a list of the cells that were executed\n* Cell Id ${cellId1}\n* Cell Id ${cellId2}\n Cell 1: code cell, id=${cellId1}, nor markdown, language=Python\n Cell 2(${cellId2}), nor markdown, language=Python`;

		const result = await linkifier.linkify(testText, { requestId: undefined, references: [] }, CancellationToken.None);

		// Should have linkified both cell IDs
		assertPartsEqual(
			normalizeParts(result.parts),
			[
				`Below is a list of the cells that were executed\n* Cell Id ${cellId1} `,
				new LinkifyLocationAnchor(cellUri1, 'Cell 1'),
				`\n* Cell Id ${cellId2} `,
				new LinkifyLocationAnchor(cellUri2, 'Cell 2'),
				`\n Cell 1: code cell, id=#VSC-c6b3ce64 `,
				new LinkifyLocationAnchor(cellUri1, 'Cell 1'),
				`, nor markdown, language=Python\n Cell 2(#VSC-f9c1928a `,
				new LinkifyLocationAnchor(cellUri2, 'Cell 2'),
				`), nor markdown, language=Python`
			]
		);
	});

	for (const remainingNotebookCount of [0, 1]) {
		test(`Should remove closed notebook tracking with ${remainingNotebookCount} notebooks remaining`, async () => {
			const cellUri = Uri.parse('vscode-notebook-cell:/test/notebook.ipynb#cell1');
			const notebook = createMockNotebookDocument([createMockNotebookCell(cellUri, 0)]);
			const notebooks = [notebook, ...Array.from({ length: remainingNotebookCount }, () => createMockNotebookDocument([]))];
			const store = new DisposableStore();
			try {
				const workspaceService = store.add(new TestWorkspaceService([], [], notebooks));
				const linkifier = store.add(new NotebookCellLinkifier(workspaceService, mockLogger));
				const tracking = linkifier as unknown as {
					notebookCellIds: WeakMap<NotebookDocument, Map<string, WeakRef<NotebookCell>>>;
					cells: Map<string, Set<WeakRef<NotebookCell>>>;
				};
				await linkifier.linkify(`Cell Id ${generateCellId(cellUri)}`, { requestId: undefined, references: [] }, CancellationToken.None);
				assert.strictEqual(tracking.notebookCellIds.has(notebook), true);

				notebooks.shift();
				workspaceService.didCloseNotebookDocumentEmitter.fire(notebook);

				assert.deepStrictEqual({
					tracksClosedNotebook: tracking.notebookCellIds.has(notebook),
					cellCount: tracking.cells.size,
				}, {
					tracksClosedNotebook: false,
					cellCount: 0,
				});
			} finally {
				store.dispose();
			}
		});
	}

	for (const [closedIndex, change] of [[0, 'close'], [1, 'close'], [0, 'remove cell'], [1, 'remove cell']] as const) {
		test(`Should preserve colliding cell IDs after ${change} in notebook ${closedIndex}`, async () => {
			const store = new DisposableStore();
			try {
				const cells = [10720, 86058].map(id => createMockNotebookCell(Uri.parse(`vscode-notebook-cell:/c%3A/review/collision-${id}.ipynb#W0sZmlsZQ`), 0));
				const notebooks = cells.map(cell => createMockNotebookDocument([cell], cell.document.uri.with({ scheme: 'file', fragment: '' })));
				const workspace = store.add(new TestWorkspaceService([], [], notebooks));
				const linkifier = store.add(new NotebookCellLinkifier(workspace, mockLogger));
				const text = 'Cell Id #VSC-52bae137';
				assert.deepStrictEqual(cells.map(getCellId), ['#VSC-52bae137', '#VSC-52bae137']);
				const initial = await linkifier.linkify(text, { requestId: undefined, references: [] }, CancellationToken.None);
				assertPartsEqual(normalizeParts(initial.parts), [text + ' ', new LinkifyLocationAnchor(cells[1].document.uri, 'Cell 1')]);

				if (change === 'close') {
					const [closed] = notebooks.splice(closedIndex, 1);
					workspace.didCloseNotebookDocumentEmitter.fire(closed);
				} else {
					const notebook = notebooks[closedIndex];
					const removedCells = notebook.getCells().splice(0, 1);
					workspace.didChangeNotebookDocumentEmitter.fire({ notebook, metadata: undefined, contentChanges: [{ range: new NotebookRange(0, 1), addedCells: [], removedCells }], cellChanges: [] });
				}
				const result = await linkifier.linkify(text, { requestId: undefined, references: [] }, CancellationToken.None);
				assertPartsEqual(normalizeParts(result.parts), [text + ' ', new LinkifyLocationAnchor(cells[1 - closedIndex].document.uri, 'Cell 1')]);
			} finally {
				store.dispose();
			}
		});
	}

	test('Should remove stale IDs when notebook cells are replaced', async () => {
		const store = new DisposableStore();
		try {
			const oldCell = createMockNotebookCell(Uri.parse('vscode-notebook-cell:/test/notebook.ipynb#old'), 0);
			const replacement = createMockNotebookCell(Uri.parse('vscode-notebook-cell:/test/notebook.ipynb#new'), 0);
			const cells = [oldCell];
			const notebook = createMockNotebookDocument(cells);
			const workspace = store.add(new TestWorkspaceService([], [], [notebook]));
			const linkifier = store.add(new NotebookCellLinkifier(workspace, mockLogger));
			const oldText = `Cell Id ${getCellId(oldCell)}`;
			await linkifier.linkify(oldText, { requestId: undefined, references: [] }, CancellationToken.None);

			cells.splice(0, 1, replacement);
			workspace.didChangeNotebookDocumentEmitter.fire({ notebook, metadata: undefined, contentChanges: [{ range: new NotebookRange(0, 1), addedCells: [replacement], removedCells: [oldCell] }], cellChanges: [] });
			const tracking = linkifier as unknown as {
				notebookCellIds: WeakMap<NotebookDocument, Map<string, WeakRef<NotebookCell>>>;
				cells: Map<string, Set<WeakRef<NotebookCell>>>;
			};
			const oldResult = await linkifier.linkify(oldText, { requestId: undefined, references: [] }, CancellationToken.None);
			const newText = `Cell Id ${getCellId(replacement)}`;
			const newResult = await linkifier.linkify(newText, { requestId: undefined, references: [] }, CancellationToken.None);
			assert.deepStrictEqual({
				trackedIds: [...tracking.notebookCellIds.get(notebook)!.keys()],
				indexedIds: [...tracking.cells.keys()],
				oldParts: normalizeParts(oldResult.parts),
			}, {
				trackedIds: [getCellId(replacement)],
				indexedIds: [getCellId(replacement)],
				oldParts: [oldText],
			});
			assertPartsEqual(normalizeParts(newResult.parts), [newText + ' ', new LinkifyLocationAnchor(replacement.document.uri, 'Cell 1')]);
		} finally {
			store.dispose();
		}
	});

	test('Should only subscribe to notebook events once per instance', async () => {
		const cellUri = Uri.parse('vscode-notebook-cell:/test/notebook.ipynb#cell1');
		const cell = createMockNotebookCell(cellUri, 0);
		const notebook = createMockNotebookDocument([cell]);
		const cellId = generateCellId(cellUri);

		const createCountingEvent = <T>() => {
			let listenerCount = 0;
			const event = ((listener: (e: T) => unknown) => {
				listenerCount++;
				return {
					dispose: () => {
						listenerCount--;
					}
				};
			}) as Event<T>;
			return {
				event,
				get listenerCount() {
					return listenerCount;
				}
			};
		};

		const openNotebookEvent = createCountingEvent<NotebookDocument>();
		const closeNotebookEvent = createCountingEvent<NotebookDocument>();
		const changeNotebookEvent = createCountingEvent<NotebookDocumentChangeEvent>();

		const workspaceService = {
			notebookDocuments: [notebook],
			onDidOpenNotebookDocument: openNotebookEvent.event,
			onDidCloseNotebookDocument: closeNotebookEvent.event,
			onDidChangeNotebookDocument: changeNotebookEvent.event,
		} as unknown as IWorkspaceService;

		const linkifier = new NotebookCellLinkifier(workspaceService, mockLogger);
		await linkifier.linkify(`Cell Id ${cellId}`, { requestId: undefined, references: [] }, CancellationToken.None);
		await linkifier.linkify(`Cell Id ${cellId}`, { requestId: undefined, references: [] }, CancellationToken.None);

		assert.deepStrictEqual({
			open: openNotebookEvent.listenerCount,
			close: closeNotebookEvent.listenerCount,
			change: changeNotebookEvent.listenerCount,
		}, { open: 1, close: 1, change: 1 });

		linkifier.dispose();

		assert.deepStrictEqual({
			open: openNotebookEvent.listenerCount,
			close: closeNotebookEvent.listenerCount,
			change: changeNotebookEvent.listenerCount,
		}, { open: 0, close: 0, change: 0 });
	});
});
