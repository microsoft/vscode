/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'vitest';
import type { NotebookCell, NotebookDocument, TextDocument } from 'vscode';
import { ILogger, ILogService } from '../../../../platform/log/common/logService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { StringSHA1 } from '../../../../util/vs/base/common/hash';
import { NotebookCellKind, Uri } from '../../../../vscodeTypes';
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

	function createMockNotebookDocument(cells: NotebookCell[]): NotebookDocument {
		return {
			uri: Uri.file('/test/notebook.ipynb'),
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
});
