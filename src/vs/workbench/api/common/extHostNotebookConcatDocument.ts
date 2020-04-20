/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as types from 'vs/workbench/api/common/extHostTypes';
import * as vscode from 'vscode';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostNotebookDocument, ExtHostNotebookController, ExtHostCell } from 'vs/workbench/api/common/extHostNotebook';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { ExtHostDocumentData } from 'vs/workbench/api/common/extHostDocumentData';
import { Range, LanguageSelector } from 'vs/workbench/api/common/extHostTypeConverters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { score } from 'vs/editor/common/modes/languageSelector';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotImplementedProxy } from 'vs/base/common/types';
import { MainThreadDocumentsShape } from 'vs/workbench/api/common/extHost.protocol';


//todo@jrieken ConcatDiagnosticsCollection...

export class ExtHostNotebookConcatDocument implements vscode.NotebookConcatTextDocument {

	private _disposables = new DisposableStore();

	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;

	private _versionId = 0;
	private _delegate!: ExtHostDocumentData;
	private _selectedCells!: ExtHostCell[];
	private _cellStarts!: PrefixSumComputer;

	constructor(
		extHostNotebooks: ExtHostNotebookController,
		extHostDocuments: ExtHostDocuments,
		private readonly _notebook: ExtHostNotebookDocument,
		private readonly _selector: vscode.DocumentSelector | undefined,
	) {
		this._init();

		extHostDocuments.onDidChangeDocument(e => {
			const cellIdx = this._selectedCells.findIndex(candidate => candidate.uri.toString() === e.document.uri.toString());
			if (cellIdx < 0) {
				return;
			}
			// todo@jrieken reuse raw event!
			this._versionId += 1;
			this._delegate.onEvents({
				versionId: this._versionId,
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
			this._cellStarts.changeValue(cellIdx, e.document.getText().length + 1);

			this._onDidChange.fire(this);

		}, undefined, this._disposables);

		extHostNotebooks.onDidChangeNotebookDocument(e => {
			if (e.document !== this._notebook) {
				return;
			}
			//todo@jrieken update instead of flushing...
			this._versionId += 1;
			this._init();
			this._onDidChange.fire(this);
		}, undefined, this._disposables);
	}

	dispose(): void {
		this._disposables.dispose();
		this._delegate.dispose();
	}

	private _init() {

		// only allow Code-cells and those that are selected by the language selector
		this._selectedCells = this._notebook.cells
			.filter(cell => cell.cellKind === CellKind.Code && (!this._selector || score(LanguageSelector.from(this._selector), cell.uri, cell.language, true)));

		const lines: string[] = [];
		const cellLengths = new Uint32Array(this._selectedCells.length);

		for (let i = 0; i < this._selectedCells.length; i++) {
			const cell = this._selectedCells[i];
			// update prefix sum
			cellLengths[i] = cell.document.getText().length + 1; // 1 is newline
			//todo@jrieken reuse lines!
			for (let line = 0; line < cell.document.lineCount; line++) {
				lines.push(cell.document.lineAt(line).text);
			}
		}

		this._cellStarts = new PrefixSumComputer(cellLengths);
		this._delegate = new ExtHostDocumentData(
			new class extends NotImplementedProxy<MainThreadDocumentsShape>('MainThreadDocumentsShape') { },
			this._notebook.uri.with({ scheme: 'vscode-concatdoc' }),
			lines,
			'\n',
			this._notebook.languages[0],
			this._versionId,
			false
		);
	}

	get version() {
		return this._versionId;
	}

	getText(range?: vscode.Range) {
		return this._delegate.document.getText(range);
	}

	locationAt(positionOrRange: vscode.Position | vscode.Range): vscode.Location {

		if (!types.Range.isRange(positionOrRange)) {
			positionOrRange = new types.Range(<types.Position>positionOrRange, <types.Position>positionOrRange);
		}

		const start = this._delegate.document.offsetAt(positionOrRange.start);
		const startIndex = this._cellStarts.getIndexOf(start);
		const startCell = this._selectedCells[startIndex.index];
		if (!startCell) {
			// do better? throw an error insead? return undefined?
			return new types.Location(this._notebook.uri, new types.Position(0, 0));
		}

		let endCell = startCell;
		let endIndex = startIndex;
		if (!positionOrRange.isEmpty) {
			const end = this._delegate.document.offsetAt(positionOrRange.end);
			endIndex = this._cellStarts.getIndexOf(end);
			endCell = this._selectedCells[endIndex.index];
		}

		const startPos = startCell.document.positionAt(startIndex.remainder);
		let endPos = startPos;
		if (endCell && endCell.handle === startCell.handle) {
			endPos = endCell.document.positionAt(endIndex.remainder);
		}

		return new types.Location(startCell.uri, new types.Range(startPos.line, startPos.character, endPos.line, endPos.character));
	}

	positionAt(offsetOrLocation: number | vscode.Location): vscode.Position {
		if (typeof offsetOrLocation === 'number') {
			return this._delegate.document.positionAt(offsetOrLocation);
		}
		const idx = this._selectedCells.findIndex(candidate => candidate.uri.toString() === offsetOrLocation.uri.toString());
		if (idx < 0) {
			// do better?
			// return undefined;
			return new types.Position(0, 0);
		}
		const docOffset = this._selectedCells[idx].document.offsetAt(offsetOrLocation.range.start);
		const cellOffset = this._cellStarts.getAccumulatedValue(idx - 1);
		return this._delegate.document.positionAt(docOffset + cellOffset);
	}

	offsetAt(position: vscode.Position): number {
		return this._delegate.document.offsetAt(position);
	}
}
