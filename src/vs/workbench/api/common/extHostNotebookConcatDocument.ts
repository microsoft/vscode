/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as types from 'vs/workbench/api/common/extHostTypes';
import * as vscode from 'vscode';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostNotebookDocument } from 'vs/workbench/api/common/extHostNotebook';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { ExtHostDocumentData } from 'vs/workbench/api/common/extHostDocumentData';
import { Range } from 'vs/workbench/api/common/extHostTypeConverters';

//todo@jrieken ConcatDiagnosticsCollection...

export interface INotebookConcatDocument {
	readonly versionId: number;
	readonly onDidChange: Event<void>;
	dispose(): void;
	getText(): string;
	locationAt(position: types.Position): types.Location;
	positionAt(location: types.Location): types.Position;
}

export async function createConcatDocument(document: ExtHostNotebookDocument, extHostDocument: ExtHostDocuments) {

	// const cells = new Map<string, ExtHostCell>();

	const _onDidChange = new Emitter<void>();
	const listener = extHostDocument.onDidChangeDocument(e => {
		const key = e.document.uri.toString();
		const cell = document.cells.find(candidate => candidate.uri.toString() === key);
		if (cell) {

			// todo@jrieken reuse raw event!
			concatDocument.onEvents({
				versionId: concatDocument.version + 1,
				eol: '\n',
				changes: e.contentChanges.map(change => {
					return {
						range: Range.from(change.range),
						rangeOffset: change.rangeOffset,
						rangeLength: change.rangeLength,
						text: change.text,
					};
				})
			});

			_onDidChange.fire();
		}
	});

	function dispose(): void {
		listener.dispose();
		concatDocument.dispose();
	}

	const lines: string[] = [];
	const values = new Uint32Array(document.cells.length);
	for (let i = 0; i < document.cells.length; i++) {

		const cell = document.cells[i];

		// update prefix sum
		values[i] = cell.document.getText().length + 1; // 1 is newline

		//todo@jrieken reuse lines!
		for (let line = 0; line < cell.document.lineCount; line++) {
			lines.push(cell.document.lineAt(line).text);
		}
	}

	const cellStarts = new PrefixSumComputer(values);
	const concatDocument = new ExtHostDocumentData(
		null!,
		document.uri.with({ scheme: 'vscode-concatdoc' }),
		lines, '\n',
		document.languages[0],
		0, false
	);

	return {
		get versionId() { return concatDocument.version; },
		onDidChange: _onDidChange.event,
		dispose,
		getText() { return concatDocument.getText(); },
		locationAt(position: types.Position): types.Location {
			const offset = concatDocument.document.offsetAt(position);
			const index = cellStarts.getIndexOf(offset);
			const cell = document.cells[index.index];
			const cellPosi = cell.document.positionAt(index.remainder);
			return new types.Location(cell.uri, <any>cellPosi);
		},
		positionAt(location: types.Location): vscode.Position | undefined {
			const idx = document.cells.findIndex(candidate => candidate.uri.toString() === location.uri.toString());
			if (idx > 0) {
				return undefined;
			}
			const docOffset = document.cells[idx].document.offsetAt(location.range.start);
			const cellOffset = cellStarts.getAccumulatedValue(idx);
			return concatDocument.document.positionAt(docOffset + cellOffset);
		}
	};
}


