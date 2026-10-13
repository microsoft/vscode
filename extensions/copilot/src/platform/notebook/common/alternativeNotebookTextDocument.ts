/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NotebookCell, NotebookDocument, NotebookDocumentContentChange, TextDocument, TextDocumentContentChangeEvent } from 'vscode';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { findLastIdxMonotonous } from '../../../util/vs/base/common/arraysFind';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { NotebookCellKind, Position, Range } from '../../../vscodeTypes';
import { stringEditFromTextContentChange } from '../../editing/common/edit';
import { PositionOffsetTransformer } from '../../editing/common/positionOffsetTransformer';
import { generateCellTextMarker, getBlockComment, getLineCommentStart } from './alternativeContentProvider.text';
import { EOL, summarize } from './helpers';
import { CrLfOffsetTranslator } from './offsetTranslator';


class AlternativeNotebookCellSnapshot {
	private readonly positionTransformer: PositionOffsetTransformer;
	private readonly crlfTranslator: CrLfOffsetTranslator;
	public readonly lineCount: number;
	/** Range of the alternative cell code */
	public readonly altRange: Range;
	/** Last line in the actual cell code */
	private readonly lastLineLength: number;
	public static fromNotebookCell(cell: NotebookCell, blockComment: [string, string], lineCommentStart: string): AlternativeNotebookCellSnapshot {
		const summary = summarize(cell);
		const cellMarker = generateCellTextMarker(summary, lineCommentStart);
		const code = cell.document.getText().replace(/\r\n|\n/g, EOL);
		const prefix = cell.kind === NotebookCellKind.Markup ? `${cellMarker}${EOL}${blockComment[0]}${EOL}` : `${cellMarker}${EOL}`;
		const suffix = cell.kind === NotebookCellKind.Markup ? `${EOL}${blockComment[1]}` : '';
		return new AlternativeNotebookCellSnapshot(cell, blockComment, lineCommentStart, code, prefix, suffix);
	}
	constructor(
		public readonly cell: NotebookCell,
		private readonly blockComment: [string, string],
		private readonly lineCommentStart: string,
		private readonly code: string,
		private readonly prefix: string,
		private readonly suffix: string
	) {
		this.crlfTranslator = new CrLfOffsetTranslator(cell.document.getText(), cell.document.eol);
		this.positionTransformer = new PositionOffsetTransformer(`${prefix}${code}${suffix}`);
		const lastPosition = this.positionTransformer.getPosition(this.positionTransformer.getText().length);
		this.altRange = new Range(0, 0, lastPosition.line, lastPosition.character);
		this.lineCount = this.altRange.end.line + 1;
		this.lastLineLength = this.suffix.length === 0 ? this.altRange.end.character : this.positionTransformer.getPosition(this.positionTransformer.getText().length - this.suffix.length).character;
	}

	public normalizeEdits(edits: readonly TextDocumentContentChangeEvent[]): TextDocumentContentChangeEvent[] {
		return edits.map(e => {
			const range = this.toAltRange(e.range);
			const rangeOffset = this.crlfTranslator.translate(e.rangeOffset);
			const endOffset = this.crlfTranslator.translate(e.rangeOffset + e.rangeLength);
			return {
				range,
				rangeLength: endOffset - rangeOffset,
				rangeOffset,
				text: e.text.replace(/\r\n|\n/g, EOL), // Normalize line endings to EOL
			};
		});
	}

	public withTextEdit(edit: StringEdit): AlternativeNotebookCellSnapshot {
		const newCode = edit.apply(this.code);
		return new AlternativeNotebookCellSnapshot(this.cell, this.blockComment, this.lineCommentStart, newCode, this.prefix, this.suffix);
	}

	public get altText(): string {
		return this.positionTransformer.getText();
	}

	public toAltOffsetRange(range: Range): OffsetRange {
		const startOffset = this.toAltOffset(range.start);
		const endOffset = this.toAltOffset(range.end);
		return new OffsetRange(startOffset, endOffset);
	}

	public toAltOffset(position: Position): number {
		// Remove the lines we've added for the cell marker and block comments
		const extraLinesAdded = this.cell.kind === NotebookCellKind.Markup ? 2 : 1;
		return this.positionTransformer.getOffset(new Position(position.line + extraLinesAdded, position.character));
	}

	public toAltRange(range: Range): Range {
		// Remove the lines we've added for the cell marker and block comments
		const extraLinesAdded = this.cell.kind === NotebookCellKind.Markup ? 2 : 1;
		return new Range(range.start.line + extraLinesAdded, range.start.character, range.end.line + extraLinesAdded, range.end.character);
	}

	public fromAltOffsetRange(offsetRange: OffsetRange): Range {
		const startOffset = offsetRange.start;
		const endOffset = offsetRange.endExclusive;
		const startPosition = this.positionTransformer.getPosition(startOffset);
		const endPosition = this.positionTransformer.getPosition(endOffset);

		// Remove the lines we've added for the cell marker and block comments
		const extraLinesAddedAtStart = this.cell.kind === NotebookCellKind.Markup ? 2 : 1;
		const extraLinesAddedAtEnd = this.cell.kind === NotebookCellKind.Markup ? 1 : 0;

		const startLine = Math.max(startPosition.line - extraLinesAddedAtStart, 0);
		const lastLineIndex = (this.lineCount - extraLinesAddedAtEnd) - 1;
		let endLine = endPosition.line;
		let endLineEndColumn = endPosition.character;
		if (endLine > lastLineIndex) {
			endLineEndColumn = endLineEndColumn === 0 ? endLineEndColumn : -1;
			endLine = lastLineIndex - extraLinesAddedAtStart;
		} else {
			endLine = Math.max(endPosition.line - extraLinesAddedAtStart, 0);
		}
		if (endLine === (lastLineIndex - extraLinesAddedAtStart)) {
			if (endLineEndColumn !== 0 && endLineEndColumn === -1 || this.lastLineLength < endLineEndColumn) {
				endLineEndColumn = this.lastLineLength;
			}
		}
		// If the original start was in a line that part of the prefix, then we need to start from line 0, character 0.
		const startCharacter = startPosition.line - extraLinesAddedAtStart >= 0 ? startPosition.character : 0;
		return new Range(startLine, startCharacter, endLine, endLineEndColumn);
	}
	public fromAltRange(range: Range): Range {
		// Remove the lines we've added for the cell marker and block comments
		const extraLinesAdded = this.cell.kind === NotebookCellKind.Markup ? 2 : 1;
		const extraLinesAddedAtEnd = this.cell.kind === NotebookCellKind.Markup ? 1 : 0;

		const startLine = Math.max(range.start.line - extraLinesAdded, 0);
		const isInvalidStartLine = extraLinesAdded ? (range.start.line + 1) <= extraLinesAdded : false;
		const startCharacter = isInvalidStartLine ? 0 : range.start.character;
		const isEndLineInvalid = extraLinesAddedAtEnd > 0 && (range.end.line === this.lineCount - 1);
		const endLine = isEndLineInvalid ? (this.lineCount - extraLinesAdded - extraLinesAddedAtEnd - 1) : Math.max(range.end.line - extraLinesAdded, 0);
		const lastLineIndex = (this.lineCount - extraLinesAdded - extraLinesAddedAtEnd) - 1;
		const endLineCharacter = isEndLineInvalid ? this.lastLineLength : (endLine === lastLineIndex) ? Math.min(range.end.character, this.lastLineLength) : range.end.character;
		return new Range(startLine, startCharacter, endLine, endLineCharacter);
	}
}

function buildAlternativeCells<T>(cellItems: readonly T[], altCelBuilder: (cellItem: T) => AlternativeNotebookCellSnapshot) {
	let lineCount = 0;
	let offset = 0;
	return cellItems.map(item => {
		const altCell = altCelBuilder(item);
		const startLine = lineCount;
		const startOffset = offset;
		lineCount += altCell.lineCount;
		offset += altCell.altText.length + EOL.length; // EOL is added between cells
		return { altCell, startLine, startOffset };
	});
}

type AltCellInfo = {
	altCell: AlternativeNotebookCellSnapshot;
	/** Line number at which this cell starts within the Alternative Notebook */
	startLine: number;
	/** Character offset at which this cell starts within the Alternative Notebook */
	startOffset: number;
};

abstract class AbstractAlternativeNotebookDocument {
	private readonly cellTextDocuments = new Map<TextDocument, NotebookCell>();
	public constructor(public readonly notebook: NotebookDocument,
		public readonly excludeMarkdownCells: boolean,
		public readonly blockComment: [string, string],
		public readonly lineCommentStart: string,
		public readonly cells: readonly AltCellInfo[]) {
		for (const { altCell } of this.cells) {
			this.cellTextDocuments.set(altCell.cell.document, altCell.cell);
		}
	}

	/**
	 * Get the cell associated with a text document.
	 * @param textDocument The text document to find the cell for.
	 * @returns The notebook cell associated with the text document, or undefined if not found.
	 * If a cell was inserted into the notebook and this instance hasn't been updated yet, it will return undefined.
	 */
	public getCell(textDocument: TextDocument): NotebookCell | undefined {
		return this.cellTextDocuments.get(textDocument);
	}

	public getText(range?: OffsetRange): string {
		const altText = this.cells.map(cell => cell.altCell.altText).join(EOL);
		return range ? range.substring(altText) : altText;
	}

	public fromAltRange(range: Range): [NotebookCell, Range][] {
		const firstIdx = findLastIdxMonotonous(this.cells, c => c.startLine <= range.start.line);
		if (firstIdx === -1) {
			return [];
		}
		const cells: [NotebookCell, Range][] = [];

		for (let i = firstIdx; i < this.cells.length; i++) {
			const { altCell, startLine } = this.cells[i];
			if (i === firstIdx) {
				const cellStartLine = range.start.line - startLine;
				const cellEndLine = range.end.line - startLine;
				const cellEnd = cellEndLine <= (altCell.lineCount - 1) ? cellEndLine : altCell.lineCount - 1;
				let cellEndChar = range.end.character;
				if (cellEnd !== cellEndLine) {
					cellEndChar = altCell.altRange.end.character;
				}
				const cellRange = new Range(cellStartLine, range.start.character, cellEnd, cellEndChar);
				cells.push([altCell.cell, altCell.fromAltRange(cellRange)]);
			} else if (startLine + altCell.lineCount <= range.end.line) {
				const cellRange = new Range(0, 0, altCell.altRange.end.line, altCell.altRange.end.character);
				cells.push([altCell.cell, altCell.fromAltRange(cellRange)]);
			} else if (startLine < range.end.line) {
				const cellRange = new Range(0, 0, range.end.line - startLine, range.end.character);
				cells.push([altCell.cell, altCell.fromAltRange(cellRange)]);
			}
		}

		return cells;
	}

	public fromAltOffsetRange(offsetRange: OffsetRange): [NotebookCell, Range][] {
		const firstIdx = findLastIdxMonotonous(this.cells, c => c.startOffset <= offsetRange.start);
		if (firstIdx === -1) {
			return [];
		}
		const cells: [NotebookCell, Range][] = [];

		for (let i = firstIdx; i < this.cells.length; i++) {
			const { altCell, startOffset } = this.cells[i];
			if (i === firstIdx) {
				const endOffset = offsetRange.endExclusive > (startOffset + altCell.altText.length) ? (startOffset + altCell.altText.length) : offsetRange.endExclusive;
				const offset = new OffsetRange(offsetRange.start - startOffset, endOffset - startOffset);
				cells.push([altCell.cell, altCell.fromAltOffsetRange(offset)]);
			} else if ((startOffset + altCell.altText.length) < offsetRange.endExclusive) {
				const offset = new OffsetRange(0, altCell.altText.length);
				cells.push([altCell.cell, altCell.fromAltOffsetRange(offset)]);
			} else if (startOffset < offsetRange.endExclusive) {
				const offset = new OffsetRange(0, offsetRange.endExclusive - startOffset);
				cells.push([altCell.cell, altCell.fromAltOffsetRange(offset)]);
			}
		}

		return cells;
	}

	public toAltOffset(cell: NotebookCell, position: Position): number | undefined {
		const altCell = this.cells.find(c => c.altCell.cell === cell);
		if (altCell) {
			return altCell.altCell.toAltOffset(position);
		} else {
			return undefined;
		}
	}

	public toAltOffsetRange(cell: NotebookCell, ranges: readonly Range[]): OffsetRange[] {
		let offset = 0;
		for (const { altCell } of this.cells) {
			if (altCell.cell === cell) {
				return ranges.map(range => {
					const offsetRange = altCell.toAltOffsetRange(range);
					const adjustedRange = new OffsetRange(offset + offsetRange.start, offset + offsetRange.endExclusive);
					return adjustedRange;
				});
			} else {
				offset += altCell.altText.length + EOL.length; // EOL is added between cells
			}
		}
		return [];
	}

	public toAltRange(cell: NotebookCell, ranges: readonly Range[]): Range[] {
		let offset = 0;
		for (const { altCell, startLine } of this.cells) {
			if (altCell.cell === cell) {
				return ranges.map(range => {
					const altCellRange = altCell.toAltRange(range);
					const adjustedRange = new Range(altCellRange.start.line + startLine, altCellRange.start.character, altCellRange.end.line + startLine, altCellRange.end.character);
					return adjustedRange;
				});
			} else {
				offset += altCell.altText.length + EOL.length; // EOL is added between cells
			}
		}
		return [];
	}
}

export interface IAlternativeNotebookDocumentSnapshot extends AbstractAlternativeNotebookDocument {
	withNotebookChanges(events: readonly NotebookDocumentContentChange[]): AlternativeNotebookDocumentSnapshot;
	withCellChanges(cellTextDoc: TextDocument, edit: readonly TextDocumentContentChangeEvent[]): AlternativeNotebookDocumentSnapshot;
}

class AlternativeNotebookDocumentSnapshot extends AbstractAlternativeNotebookDocument implements IAlternativeNotebookDocumentSnapshot {
	public static create(notebook: NotebookDocument, excludeMarkdownCells: boolean): AlternativeNotebookDocumentSnapshot {
		const blockComment = getBlockComment(notebook);
		const lineCommentStart = getLineCommentStart(notebook);
		const notebookCells = notebook.getCells().filter(cell => !excludeMarkdownCells || cell.kind !== NotebookCellKind.Markup);
		const altCells = buildAlternativeCells(notebookCells, cell => AlternativeNotebookCellSnapshot.fromNotebookCell(cell, blockComment, lineCommentStart));

		return new AlternativeNotebookDocumentSnapshot(notebook, excludeMarkdownCells, blockComment, lineCommentStart, altCells);
	}
	constructor(notebook: NotebookDocument,
		excludeMarkdownCells: boolean,
		blockComment: [string, string],
		lineCommentStart: string,
		altCells: readonly AltCellInfo[]) {
		super(notebook, excludeMarkdownCells, blockComment, lineCommentStart, altCells);
	}

	public withNotebookChanges(events: readonly NotebookDocumentContentChange[]): AlternativeNotebookDocumentSnapshot {
		const cells = withNotebookChangesAndEdit(this.cells, this.blockComment, this.lineCommentStart, events, this.excludeMarkdownCells)[0];
		return new AlternativeNotebookDocumentSnapshot(this.notebook, this.excludeMarkdownCells, this.blockComment, this.lineCommentStart, cells);
	}

	public withCellChanges(cellTextDoc: TextDocument, edit: readonly TextDocumentContentChangeEvent[]): AlternativeNotebookDocumentSnapshot {
		if (edit instanceof StringEdit ? edit.isEmpty() : edit.length === 0) {
			return this;
		}
		const [altCells,] = withCellChangesAndEdit(this.cells, cellTextDoc, edit) || [undefined, undefined] as const;
		if (!altCells) {
			return this;
		}
		return new AlternativeNotebookDocumentSnapshot(this.notebook, this.excludeMarkdownCells, this.blockComment, this.lineCommentStart, altCells);
	}
}

export interface IAlternativeNotebookDocument extends AbstractAlternativeNotebookDocument {
	applyNotebookChanges(events: readonly NotebookDocumentContentChange[]): void;
	applyCellChanges(cellTextDoc: TextDocument, edit: readonly TextDocumentContentChangeEvent[]): void;
}


class AlternativeNotebookDocument extends AbstractAlternativeNotebookDocument implements IAlternativeNotebookDocument {
	public static create(notebook: NotebookDocument, excludeMarkdownCells: boolean): AlternativeNotebookDocument {
		const blockComment = getBlockComment(notebook);
		const lineCommentStart = getLineCommentStart(notebook);
		const notebookCells = notebook.getCells().filter(cell => !excludeMarkdownCells || cell.kind !== NotebookCellKind.Markup);
		const altCells = buildAlternativeCells(notebookCells, cell => AlternativeNotebookCellSnapshot.fromNotebookCell(cell, blockComment, lineCommentStart));

		return new AlternativeNotebookDocument(notebook, excludeMarkdownCells, blockComment, lineCommentStart, altCells);
	}
	constructor(notebook: NotebookDocument,
		excludeMarkdownCells: boolean,
		blockComment: [string, string],
		lineCommentStart: string,
		public override cells: AltCellInfo[]) {
		super(notebook, excludeMarkdownCells, blockComment, lineCommentStart, cells);
	}

	private updateCells(cells: readonly AltCellInfo[]) {
		this.cells.splice(0, this.cells.length, ...cells);
	}
	public applyNotebookChanges(events: readonly NotebookDocumentContentChange[]) {
		const cells = withNotebookChangesAndEdit(this.cells, this.blockComment, this.lineCommentStart, events, this.excludeMarkdownCells)[0];
		this.updateCells(cells);
	}

	public applyCellChanges(cellTextDoc: TextDocument, edit: readonly TextDocumentContentChangeEvent[]) {
		if (edit instanceof StringEdit ? edit.isEmpty() : edit.length === 0) {
			return;
		}
		const [cells,] = withCellChangesAndEdit(this.cells, cellTextDoc, edit) || [undefined, undefined] as const;
		if (!cells) {
			return;
		}
		this.updateCells(cells);
	}
}

function withCellChangesAndEdit(cells: readonly AltCellInfo[], cellTextDoc: TextDocument, edit: readonly TextDocumentContentChangeEvent[]) {
	if (edit instanceof StringEdit ? edit.isEmpty() : edit.length === 0) {
		return undefined;
	}
	const cell = cells.find(c => c.altCell.cell.document === cellTextDoc);
	if (!cell) {
		return undefined;
	}
	const cellEdit = edit instanceof StringEdit ? edit : stringEditFromTextContentChange(cell.altCell.normalizeEdits(edit));
	const altCells = buildAlternativeCells(cells, cell => cell.altCell.cell.document === cellTextDoc ? cell.altCell.withTextEdit(cellEdit) : cell.altCell);
	return [altCells, edit] as const;
}

function withNotebookChangesAndEdit(cells: readonly AltCellInfo[], blockComment: [string, string], lineCommentStart: string, events: readonly NotebookDocumentContentChange[], excludeMarkdownCells: boolean): [readonly AltCellInfo[], StringEdit | undefined] {
	if (!events.length) {
		return [cells, undefined];
	}
	// If we've only added md cells, then its a noop.
	if (events.every(e => e.removedCells.length === 0 && e.addedCells.every(c => c.kind === NotebookCellKind.Markup))) {
		return [cells, undefined];
	}
	let altCells = cells.slice();
	let edit = StringEdit.empty;
	for (const event of events) {
		const newCells = event.addedCells.filter(c => excludeMarkdownCells ? c.kind === NotebookCellKind.Code : true).map(cell => ({ altCell: AlternativeNotebookCellSnapshot.fromNotebookCell(cell, blockComment, lineCommentStart), startLine: 0, startOffset: 0 }));

		const removedCells = altCells.slice(event.range.start, event.range.end);
		let firstUnChangedCellIndex = -1;
		if (event.range.isEmpty) {
			firstUnChangedCellIndex = event.range.start === 0 ? -1 : event.range.start - 1;
		} else {
			firstUnChangedCellIndex = event.range.start === 0 ? -1 : event.range.start - 1;
		}
		const startOffset = firstUnChangedCellIndex === -1 ? 0 : altCells[firstUnChangedCellIndex].startOffset + altCells[firstUnChangedCellIndex].altCell.altText.length + EOL.length;
		let offsetLength = removedCells.map((cell) => cell.altCell.altText).join(EOL).length;
		let newCellsContent = newCells.map((cell) => cell.altCell.altText).join(EOL);
		if (startOffset !== 0) {
			if (!(event.range.end < altCells.length)) {
				newCellsContent = `${EOL}${newCellsContent}`;
			}
		}
		// if we have some cells after the insertion, then we need to insert an EOL at the end.
		if (event.range.end < altCells.length) {
			if (newCellsContent) {
				newCellsContent += EOL;
			}
			if (offsetLength) {
				offsetLength += EOL.length;
			}
		}
		edit = edit.compose(StringEdit.replace(new OffsetRange(startOffset, startOffset + offsetLength), newCellsContent));

		altCells.splice(event.range.start, event.range.end - event.range.start, ...newCells);
		altCells = buildAlternativeCells(altCells, cell => cell.altCell);
	}

	return [altCells, edit];
}

/**
 * Represents the Notebook as a alternative text (Jupytext like) document that is mutable.
 * Not to be used when dealing with agents for editing or reading notebooks.
 * Use only with NES or other exceptional cases.
 */
export function createAlternativeNotebookDocument(notebook: NotebookDocument, excludeMarkdownCells: boolean = true): IAlternativeNotebookDocument {
	return AlternativeNotebookDocument.create(notebook, excludeMarkdownCells);
}

/**
 * Represents the Notebook as an alternative text (Jupytext like) document that is immutable.
 * Not to be used when dealing with agents for editing or reading notebooks.
 * Use only with NES or other exceptional cases.
 */
export function createAlternativeNotebookDocumentSnapshot(notebook: NotebookDocument, excludeMarkdownCells: boolean = true): IAlternativeNotebookDocumentSnapshot {
	return AlternativeNotebookDocumentSnapshot.create(notebook, excludeMarkdownCells);
}

export function toAltNotebookCellChangeEdit(notebook: AbstractAlternativeNotebookDocument, cellTextDocument: TextDocument, events: readonly TextDocumentContentChangeEvent[]): StringEdit {
	const replacementsInApplicationOrder = toAltCellTextDocumentContentChangeEvents(notebook, cellTextDocument, events);
	return stringEditFromTextContentChange(replacementsInApplicationOrder);
}

export function toAltNotebookChangeEdit(notebook: AbstractAlternativeNotebookDocument, events: readonly NotebookDocumentContentChange[]): StringEdit | undefined {
	return withNotebookChangesAndEdit(notebook.cells, notebook.blockComment, notebook.lineCommentStart, events, notebook.excludeMarkdownCells)[1];
}

function toAltCellTextDocumentContentChangeEvents(notebook: AbstractAlternativeNotebookDocument, cellTextDocument: TextDocument, events: readonly TextDocumentContentChangeEvent[]): TextDocumentContentChangeEvent[] {
	return coalesce(events.map(e => {
		const cell = notebook.getCell(cellTextDocument);
		if (!cell) {
			return undefined;
		}
		const ranges = notebook.toAltRange(cell, [e.range]);
		const rangeOffsets = notebook.toAltOffsetRange(cell, [e.range]);
		if (!ranges.length || !rangeOffsets.length) {
			return undefined;
		}
		const range = ranges[0];
		const rangeOffset = rangeOffsets[0];
		return {
			range,
			rangeLength: rangeOffset.endExclusive - rangeOffset.start,
			rangeOffset: rangeOffset.start,
			text: e.text.replace(/\r\n|\n/g, EOL), // Normalize line endings to EOL
		} as typeof e;
	}));
}
