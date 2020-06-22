/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as types from 'vs/workbench/api/common/extHostTypes';
import * as vscode from 'vscode';
import { Event, Emitter } from 'vs/base/common/event';
import { ExtHostNotebookController, ExtHostCell } from 'vs/workbench/api/common/extHostNotebook';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { score } from 'vs/editor/common/modes/languageSelector';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { basename } from 'vs/base/common/resources';
import { ResourceMap } from 'vs/base/common/map';
import { ExtHostDocumentLine } from 'vs/workbench/api/common/extHostDocumentData';
import { ExtHostDocumentContentProvider } from 'vs/workbench/api/common/extHostDocumentContentProviders';


export class ExtHostNotebookConcatDocuments {

	private readonly _onDidAddConcatDocument = new Emitter<vscode.NotebookConcatTextDocument>();
	private readonly _onDidRemoveConcatDocument = new Emitter<vscode.NotebookConcatTextDocument>();
	private readonly _onDidChangeConcatDocument = new Emitter<vscode.TextDocumentChangeEvent>();

	readonly onDidAddConcatDocument: Event<vscode.NotebookConcatTextDocument> = this._onDidAddConcatDocument.event;
	readonly onDidRemoveConcatDocument: Event<vscode.NotebookConcatTextDocument> = this._onDidRemoveConcatDocument.event;
	readonly onDidChangeConcatDocument: Event<vscode.TextDocumentChangeEvent> = this._onDidChangeConcatDocument.event;

	private readonly _notebookDocuments = new ResourceMap<ExtHostNotebookConcatDocument>();

	constructor(
		private readonly _extHostNotebooks: ExtHostNotebookController,
		private readonly _extHostDocuments: ExtHostDocuments,
		extHostDocumentContentProvider: ExtHostDocumentContentProvider
	) {
		const that = this;

		extHostDocumentContentProvider.registerTextDocumentContentProvider(ExtHostNotebookConcatDocument.scheme, new class implements vscode.TextDocumentContentProvider {

			private readonly _onDidChange = new Emitter<vscode.Uri>();
			readonly onDidChange: Event<vscode.Uri> = this._onDidChange.event;

			provideTextDocumentContent(uri: vscode.Uri) {
				// todo@jrieken BIG problem... this duplicates the whole concat document
				// and also makes it appear twice in the extension host
				// console.log('HERE', uri.toString());
				const doc = that._notebookDocuments.get(uri);
				if (!doc) {
					return;
				}
				// LEAK
				doc.onDidChange(() => {
					console.log('onDidChange');
					this._onDidChange.fire(uri);
				});
				return doc.getText();
			}
		});
	}

	allConcatDocuments(): vscode.NotebookConcatTextDocument[] {
		return [...this._notebookDocuments.values()];
	}

	createNotebookConcatDocument(notebook: vscode.NotebookDocument, selector: vscode.DocumentSelector | undefined) {
		const disposables = new DisposableStore();
		const result = new ExtHostNotebookConcatDocument(this._extHostNotebooks, this._extHostDocuments, notebook, selector);
		disposables.add(result);
		disposables.add(result.onDidChange((changes) => this._onDidChangeConcatDocument.fire({ document: result, contentChanges: changes })));
		disposables.add(this._extHostNotebooks.onDidCloseNotebookDocument(candidate => {
			if (candidate === notebook) {
				disposables.dispose();
				this._notebookDocuments.delete(result.uri);
				this._onDidRemoveConcatDocument.fire(result);
			}
		}));
		this._notebookDocuments.set(result.uri, result);
		this._onDidAddConcatDocument.fire(result);
		return result;
	}
}

export class ExtHostNotebookConcatDocument implements vscode.NotebookConcatTextDocument, vscode.TextDocument {

	static scheme = 'vscode-concat-doc';

	private _disposables = new DisposableStore();
	private _isClosed = false;

	private _cells!: ExtHostCell[];
	private _cellByUri!: ResourceMap<number>;
	private _cellLengths!: PrefixSumComputer;
	private _cellLines!: PrefixSumComputer;
	private _versionId = 0;

	private readonly _onDidChange = new Emitter<readonly vscode.TextDocumentContentChangeEvent[]>();
	readonly onDidChange: Event<readonly vscode.TextDocumentContentChangeEvent[]> = this._onDidChange.event;

	readonly uri: vscode.Uri;
	readonly fileName: string;
	readonly languageId: string;
	readonly isUntitled: boolean = false;
	readonly isDirty: boolean = false;

	constructor(
		extHostNotebooks: ExtHostNotebookController,
		extHostDocuments: ExtHostDocuments,
		private readonly _notebook: vscode.NotebookDocument,
		private readonly _selector: vscode.DocumentSelector | undefined,
	) {
		this.uri = _notebook.uri.with({ scheme: ExtHostNotebookConcatDocument.scheme, path: `${_notebook.uri.path}.css` });
		this.fileName = basename(this.uri);
		this.languageId = this._createLanguageId();

		this._init();

		this._disposables.add(extHostDocuments.onDidChangeDocument(e => {
			const cellIdx = this._cellByUri.get(e.document.uri);
			if (typeof cellIdx === 'number') {
				this._cellLengths.changeValue(cellIdx, this._cells[cellIdx].document.getText().length + 1);
				this._cellLines.changeValue(cellIdx, this._cells[cellIdx].document.lineCount);
				this._versionId += 1;
				// this._onDidChange.fire(e.contentChanges); //todo@jrieken make adjust the event properly, range and rangeOffset
				this._onDidChange.fire([]);
			}
		}));
		const documentChange = (document: vscode.NotebookDocument) => {
			if (document === this._notebook) {
				this._init();
				this._versionId += 1;
				this._onDidChange.fire([]);
			}
		};

		this._disposables.add(extHostNotebooks.onDidChangeCellLanguage(e => documentChange(e.document)));
		this._disposables.add(extHostNotebooks.onDidChangeCellOutputs(e => documentChange(e.document)));
		this._disposables.add(extHostNotebooks.onDidChangeNotebookCells(e => documentChange(e.document)));
	}

	dispose(): void {
		this._disposables.dispose();
		this._isClosed = true;
	}

	get isClosed() {
		return this._isClosed;
	}

	private _init() {
		this._cells = [];
		this._cellByUri = new ResourceMap();
		const cellLengths: number[] = [];
		const cellLineCounts: number[] = [];
		for (let cell of this._notebook.cells) {
			if (cell.cellKind === CellKind.Code && (!this._selector || score(this._selector, cell.uri, cell.language, true))) {
				this._cellByUri.set(cell.uri, this._cells.length);
				this._cells.push(<ExtHostCell>cell);
				cellLengths.push(cell.document.getText().length + 1);
				cellLineCounts.push(cell.document.lineCount);
			}
		}
		this._cellLengths = new PrefixSumComputer(new Uint32Array(cellLengths));
		this._cellLines = new PrefixSumComputer(new Uint32Array(cellLineCounts));
	}

	private _createLanguageId(): string {
		const languageIds = new Set<string>();
		(function fillInLanguageIds(selector: vscode.DocumentSelector | undefined) {
			if (Array.isArray(selector)) {
				selector.forEach(fillInLanguageIds);
			} else if (typeof selector === 'string') {
				languageIds.add(selector);
			} else if (selector?.language) {
				languageIds.add(selector.language);
			}
		})(this._selector);

		if (languageIds.size === 0) {
			return 'unknown';
		}
		return [...languageIds.values()].sort().join(';');
	}

	save(): Thenable<boolean> {
		// todo@jrieken throw error instead?
		return Promise.resolve(false);
	}

	get eol(): vscode.EndOfLine {
		return types.EndOfLine.LF;
	}

	get lineCount(): number {
		let total = 0;
		for (let cell of this._cells) {
			total += cell.document.lineCount;
		}
		return total;
	}

	lineAt(lineOrPosition: number | vscode.Position): vscode.TextLine {
		const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
		const cellIdx = this._cellLines.getIndexOf(line);
		return new ExtHostDocumentLine(
			line,
			this._cells[cellIdx.index].document.lineAt(cellIdx.remainder).text,
			line >= this.lineCount
		);
	}

	getWordRangeAtPosition(position: vscode.Position, regex?: RegExp | undefined): vscode.Range | undefined {
		const cellIdx = this._cellLines.getIndexOf(position.line);
		return this._cells[cellIdx.index].document.getWordRangeAtPosition(position.with({ line: cellIdx.remainder }), regex);
	}

	validateRange(range: vscode.Range): vscode.Range {
		const start = this.validatePosition(range.start);
		const end = this.validatePosition(range.end);
		return range.with({ start, end });
	}

	validatePosition(position: vscode.Position): vscode.Position {
		const cellIdx = this._cellLines.getIndexOf(position.line);
		return this._cells[cellIdx.index].document.validatePosition(position.with({ line: cellIdx.remainder }));
	}

	get version(): number {
		return this._versionId;
	}

	getText(range?: vscode.Range): string {
		if (!range) {
			let result = '';
			for (let cell of this._cells) {
				result += cell.document.getText() + '\n';
			}
			// remove last newline again
			result = result.slice(0, -1);
			return result;
		}

		if (range.isEmpty) {
			return '';
		}

		// get start and end locations and create substrings
		const start = this.locationAt(range.start);
		const end = this.locationAt(range.end);
		const startCell = this._cells[this._cellByUri.get(start.uri) ?? -1];
		const endCell = this._cells[this._cellByUri.get(end.uri) ?? -1];

		if (!startCell || !endCell) {
			return '';
		} else if (startCell === endCell) {
			return startCell.document.getText(new types.Range(start.range.start, end.range.end));
		} else {
			let a = startCell.document.getText(new types.Range(start.range.start, new types.Position(startCell.document.lineCount, 0)));
			let b = endCell.document.getText(new types.Range(new types.Position(0, 0), end.range.end));
			return a + '\n' + b;
		}
	}

	offsetAt(position: vscode.Position): number {
		const idx = this._cellLines.getIndexOf(position.line);
		const offset1 = this._cellLengths.getAccumulatedValue(idx.index - 1);
		const offset2 = this._cells[idx.index].document.offsetAt(position.with(idx.remainder));
		return offset1 + offset2;
	}

	positionAt(locationOrOffset: vscode.Location | number): vscode.Position {
		if (typeof locationOrOffset === 'number') {
			const idx = this._cellLengths.getIndexOf(locationOrOffset);
			const lineCount = this._cellLines.getAccumulatedValue(idx.index - 1);
			return this._cells[idx.index].document.positionAt(idx.remainder).translate(lineCount);
		}

		const idx = this._cellByUri.get(locationOrOffset.uri);
		if (typeof idx === 'number') {
			let line = this._cellLines.getAccumulatedValue(idx - 1);
			return new types.Position(line + locationOrOffset.range.start.line, locationOrOffset.range.start.character);
		}
		// do better?
		// return undefined;
		return new types.Position(0, 0);
	}

	locationAt(positionOrRange: vscode.Range | vscode.Position): types.Location {
		if (!types.Range.isRange(positionOrRange)) {
			positionOrRange = new types.Range(<types.Position>positionOrRange, <types.Position>positionOrRange);
		}

		const startIdx = this._cellLines.getIndexOf(positionOrRange.start.line);
		let endIdx = startIdx;
		if (!positionOrRange.isEmpty) {
			endIdx = this._cellLines.getIndexOf(positionOrRange.end.line);
		}

		let startPos = new types.Position(startIdx.remainder, positionOrRange.start.character);
		let endPos = new types.Position(endIdx.remainder, positionOrRange.end.character);
		let range = new types.Range(startPos, endPos);

		const startCell = this._cells[startIdx.index];
		return new types.Location(startCell.uri, <types.Range>startCell.document.validateRange(range));
	}
}
