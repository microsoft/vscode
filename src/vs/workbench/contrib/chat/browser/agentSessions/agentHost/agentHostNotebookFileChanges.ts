/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../../../base/common/arrays.js';
import { findLastIdxMonotonous } from '../../../../../../base/common/arraysFind.js';
import { getNodeValue, Node, ParseError, parseTree } from '../../../../../../base/common/json.js';
import { equals as objectEquals } from '../../../../../../base/common/objects.js';
import { splitLines } from '../../../../../../base/common/strings.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { LineRange } from '../../../../../../editor/common/core/ranges/lineRange.js';
import { linesDiffComputers } from '../../../../../../editor/common/diff/linesDiffComputers.js';
import { LineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';

/*
 * The agent host keeps and undoes the changes of a range of the lines of a file, and a notebook is
 * reviewed by its cells. An ipynb file holds its cells one after the other, each with the lines of
 * its source, so the change of a cell is located in the lines of the notebook's file here.
 *
 * The agent host decides on whole hunks of its own diff of the lines of the file, which need not be
 * the change of a cell: cells added one after the other are one hunk, and a cell added before
 * others can compare as a change to each of the cells after it. A change is only located if keeping
 * or undoing the hunks in its lines keeps or undoes that change and nothing else. That is told by
 * comparing the lines as the agent host of VS Code does; the protocol doesn't tell the hunks of a host.
 */

/** How long the versions of a notebook's file may take to compare, which happens on the main thread. */
const DIFF_TIMEOUT_MS = 500;

/** What a cell of a notebook holds. */
interface INotebookCellContent {
	/** The lines of the cell's source. */
	readonly source: readonly string[];
	/** What the cell holds apart from its source. */
	readonly rest: unknown;
}

/** A cell of a notebook, in the lines of the notebook's ipynb file. */
export interface INotebookFileCell extends INotebookCellContent {
	/** The lines that hold the cell. */
	readonly lines: LineRange;
	/** The lines that hold the cell's source, from the one that starts it to the one that ends it. */
	readonly sourceLines: LineRange;
	/** For each line of the cell's source, the line of the file that holds it. */
	readonly sourceLineNumbers: readonly number[];
}

/** An ipynb file: its lines, and the cells they hold. */
export interface INotebookFile {
	readonly lines: readonly string[];
	readonly cells: readonly INotebookFileCell[];
	/** What the notebook holds apart from its cells. */
	readonly rest: unknown;
}

/** Lines of the source of a cell that changed: `original` in the notebook that is compared with, `modified` in the notebook. Lines are numbered from one. */
export interface INotebookSourceChange {
	readonly original: LineRange;
	readonly modified: LineRange;
}

/** A change to a notebook that its editor shows on its own. Cells are numbered from zero. */
export type NotebookFileChange =
	/** The changes `hunks`, in the order of their lines, to the source of the cell `cell` of the notebook, which is the cell `originalCell` of the notebook it is compared with. */
	| { readonly kind: 'modified'; readonly cell: number; readonly originalCell: number; readonly hunks: readonly INotebookSourceChange[] }
	/** The cell `cell` of the notebook, which the notebook it is compared with doesn't have. */
	| { readonly kind: 'insert'; readonly cell: number }
	/** The cell `cell` of the notebook it is compared with, which the notebook doesn't have. */
	| { readonly kind: 'delete'; readonly cell: number };

/** Lines of a notebook's file, in the version that it is compared with or in its current one. */
export interface INotebookFileLines {
	readonly side: 'before' | 'after';
	readonly lines: LineRange;
}

/** Why a change to a notebook isn't located in the lines of its file. */
export const enum NotebookFileChangeFailure {
	/** The change isn't found in the lines of the file. */
	Unmatched,
	/** The agent host wouldn't decide on the change alone: its file holds it along with other changes. */
	Inseparable,
}

/** Reads the cells of the ipynb file `text`, or `undefined` if it isn't one whose cells are located. */
export function readNotebookFile(text: string): INotebookFile | undefined {
	const errors: ParseError[] = [];
	const root: Node | undefined = parseTree(text, errors, { disallowComments: true });
	const notebook = errors.length === 0 && root ? splitProperty(root, 'cells') : undefined;
	if (notebook?.property.type !== 'array') {
		return undefined;
	}
	const lineStarts = getLineStarts(text);
	const getLineNumber = (offset: number) => findLastIdxMonotonous(lineStarts, start => start <= offset) + 1;
	const getNodeLines = (node: Node) => new LineRange(getLineNumber(node.offset), getLineNumber(node.offset + node.length - 1) + 1);
	const cells: INotebookFileCell[] = [];
	for (const cellNode of notebook.property.children ?? []) {
		const cell = splitProperty(cellNode, 'source');
		const sourceNode = cell?.property;
		const items = sourceNode?.type === 'string' ? [sourceNode] : sourceNode?.type === 'array' ? sourceNode.children ?? [] : undefined;
		if (!cell || !sourceNode || !items?.every(item => item.type === 'string')) {
			return undefined;
		}
		// As the ipynb extension reads it: the items of a source are its lines, each ended by a line break unless it is the last one.
		let source = '';
		const itemStarts: number[] = [];
		items.forEach((item, index) => {
			itemStarts.push(source.length);
			const value: string = item.value;
			source += index < items.length - 1 && !value.endsWith('\n') ? `${value}\n` : value;
		});
		const sourceLines = getNodeLines(sourceNode);
		cells.push({
			lines: getNodeLines(cellNode),
			sourceLines,
			source: splitLines(source),
			rest: cell.rest,
			sourceLineNumbers: getLineStarts(source).map(start => {
				// A source without items has one empty line.
				const item: Node | undefined = items[findLastIdxMonotonous(itemStarts, itemStart => itemStart <= start)];
				return item ? getLineNumber(item.offset) : sourceLines.startLineNumber;
			}),
		});
	}
	return { lines: splitLines(text), cells, rest: notebook.rest };
}

/** The value of the object `node` without its property `name`, and the node of that property's value. `undefined` unless it has that property once. */
function splitProperty(node: Node, name: string): { readonly property: Node; readonly rest: unknown } | undefined {
	if (node.type !== 'object') {
		return undefined;
	}
	const rest: Record<string, unknown> = Object.create(null);
	let property: Node | undefined;
	for (const child of node.children ?? []) {
		const [key, value] = child.children ?? [];
		if (!value || (key.value === name && property)) {
			return undefined;
		}
		if (key.value === name) {
			property = value;
		} else {
			rest[key.value] = getNodeValue(value);
		}
	}
	return property && { property, rest };
}

/** Whether `cells` have the sources of the cells of `file`, in their order. */
export function hasNotebookFileSources(cells: readonly { getValue(): string }[], file: INotebookFile): boolean {
	return cells.length === file.cells.length && cells.every((cell, index) => equals(splitLines(cell.getValue()), file.cells[index].source));
}

/**
 * The lines of a notebook's file that the agent host is asked to keep or undo the changes of, for
 * the change `change` between the versions `baseline` and `current` of the file.
 */
export function locateNotebookFileChange(baseline: INotebookFile, current: INotebookFile, change: NotebookFileChange): INotebookFileLines | NotebookFileChangeFailure {
	const located = getChangeLines(baseline, current, change);
	const expected = located && getExpectedCells(baseline, current, change);
	const hunks = expected && computeHunks(baseline, current);
	if (!located || !expected || !hunks) {
		return NotebookFileChangeFailure.Unmatched;
	}
	const selected = hunks.filter(hunk => isSelected(located.side === 'before' ? hunk.original : hunk.modified, located.lines));
	if (selected.length === 0) {
		return NotebookFileChangeFailure.Unmatched;
	}
	// Keeping the hunks changes what the notebook is compared with, and undoing them changes its file.
	const kept = readNotebookFile(replaceLines(baseline.lines, selected.map(hunk => ({ lines: hunk.original, replacement: getLines(current.lines, hunk.modified) }))).join('\n'));
	const undone = readNotebookFile(replaceLines(current.lines, selected.map(hunk => ({ lines: hunk.modified, replacement: getLines(baseline.lines, hunk.original) }))).join('\n'));
	if (!kept || !undone || !objectEquals(kept.rest, baseline.rest) || !objectEquals(undone.rest, current.rest) || !expected.isKept(kept.cells) || !expected.isUndone(undone.cells)) {
		return NotebookFileChangeFailure.Inseparable;
	}
	return located;
}

/** Tells the cells of a notebook with only `change` kept, and of one with only `change` undone. `undefined` if the versions of the file don't have the change. */
function getExpectedCells(baseline: INotebookFile, current: INotebookFile, change: NotebookFileChange): { isKept(cells: readonly INotebookCellContent[]): boolean; isUndone(cells: readonly INotebookCellContent[]): boolean } | undefined {
	if (change.kind === 'insert') {
		const cell: INotebookFileCell | undefined = current.cells[change.cell];
		return cell && {
			isKept: cells => hasCellsWith(cells, baseline.cells, cell),
			isUndone: cells => hasCells(cells, current.cells.filter(candidate => candidate !== cell)),
		};
	}
	if (change.kind === 'delete') {
		const cell: INotebookFileCell | undefined = baseline.cells[change.cell];
		return cell && {
			isKept: cells => hasCells(cells, baseline.cells.filter(candidate => candidate !== cell)),
			isUndone: cells => hasCellsWith(cells, current.cells, cell),
		};
	}
	const original: INotebookFileCell | undefined = baseline.cells[change.originalCell];
	const modified: INotebookFileCell | undefined = current.cells[change.cell];
	if (!original || !modified || change.hunks.length === 0) {
		return undefined;
	}
	let originalLine = 1;
	let modifiedLine = 1;
	for (const hunk of change.hunks) {
		if (hunk.original.startLineNumber < originalLine || hunk.modified.startLineNumber < modifiedLine) {
			return undefined;
		}
		originalLine = hunk.original.endLineNumberExclusive;
		modifiedLine = hunk.modified.endLineNumberExclusive;
	}
	if (originalLine > original.source.length + 1 || modifiedLine > modified.source.length + 1) {
		return undefined;
	}
	const kept: INotebookCellContent = { rest: original.rest, source: replaceLines(original.source, change.hunks.map(hunk => ({ lines: hunk.original, replacement: getLines(modified.source, hunk.modified) }))) };
	const undone: INotebookCellContent = { rest: modified.rest, source: replaceLines(modified.source, change.hunks.map(hunk => ({ lines: hunk.modified, replacement: getLines(original.source, hunk.original) }))) };
	return {
		isKept: cells => hasCells(cells, baseline.cells.map(cell => cell === original ? kept : cell)),
		isUndone: cells => hasCells(cells, current.cells.map(cell => cell === modified ? undone : cell)),
	};
}

function isCell(cell: INotebookCellContent, expected: INotebookCellContent): boolean {
	return equals(cell.source, expected.source) && objectEquals(cell.rest, expected.rest);
}

function hasCells(cells: readonly INotebookCellContent[], expected: readonly INotebookCellContent[]): boolean {
	return equals(cells, expected, isCell);
}

/** Whether `cells` are the cells `others` with the cell `added` between them. */
function hasCellsWith(cells: readonly INotebookCellContent[], others: readonly INotebookCellContent[], added: INotebookCellContent): boolean {
	if (cells.length !== others.length + 1) {
		return false;
	}
	// Where equal cells follow each other, the place of the added one among them makes no difference.
	const index = others.findIndex((cell, index) => !isCell(cells[index], cell));
	const position = index < 0 ? others.length : index;
	return isCell(cells[position], added) && hasCells(cells.slice(position + 1), others.slice(position));
}

/** The lines of the file that hold `change`: a removed cell is in the version `baseline` of the file, other changes are in the version `current`. */
function getChangeLines(baseline: INotebookFile, current: INotebookFile, change: NotebookFileChange): INotebookFileLines | undefined {
	if (change.kind === 'delete') {
		const cell: INotebookFileCell | undefined = baseline.cells[change.cell];
		return cell && { side: 'before', lines: cell.lines };
	}
	const cell: INotebookFileCell | undefined = current.cells[change.cell];
	if (change.kind === 'insert') {
		return cell && { side: 'after', lines: cell.lines };
	}
	const lines = cell ? change.hunks.map(hunk => getSourceFileLines(cell, hunk.modified)) : [];
	return lines.length > 0 && lines.every(isDefined) ? { side: 'after', lines: LineRange.join(lines) } : undefined;
}

/** The lines of the file that hold the lines `lines` of the source of `cell`, which start at one. */
function getSourceFileLines(cell: INotebookFileCell, lines: LineRange): LineRange | undefined {
	const count = cell.source.length;
	if (lines.startLineNumber < 1 || lines.endLineNumberExclusive > count + 1) {
		return undefined;
	}
	if (!lines.isEmpty) {
		return new LineRange(cell.sourceLineNumbers[lines.startLineNumber - 1], cell.sourceLineNumbers[lines.endLineNumberExclusive - 2] + 1);
	}
	// Lines were removed between two lines of the source. The file changes at either: a line of a source ends with a comma unless it is the last one.
	const before = lines.startLineNumber > 1 ? cell.sourceLineNumbers[lines.startLineNumber - 2] : cell.sourceLines.startLineNumber;
	const after = lines.startLineNumber <= count ? cell.sourceLineNumbers[lines.startLineNumber - 1] : cell.sourceLines.endLineNumberExclusive - 1;
	return new LineRange(before, after + 1);
}

/** The hunks between the versions of a file, as the agent host computes them, or `undefined` if that takes too long. */
function computeHunks(baseline: INotebookFile, current: INotebookFile): readonly LineRangeMapping[] | undefined {
	const diff = linesDiffComputers.getDefault().computeDiff([...baseline.lines], [...current.lines], { ignoreTrimWhitespace: false, maxComputationTimeMs: DIFF_TIMEOUT_MS, computeMoves: false });
	return diff.hitTimeout ? undefined : diff.changes;
}

/** Whether the agent host decides on a hunk with the lines `hunk` when asked to for `lines`: a hunk without lines sits before its line, and touches the lines on either side. */
function isSelected(hunk: LineRange, lines: LineRange): boolean {
	return hunk.isEmpty
		? lines.startLineNumber <= hunk.startLineNumber && hunk.startLineNumber <= lines.endLineNumberExclusive
		: hunk.intersectsStrict(lines);
}

function getLines(lines: readonly string[], range: LineRange): readonly string[] {
	return lines.slice(range.startLineNumber - 1, range.endLineNumberExclusive - 1);
}

/** `lines` with each of the `replacements`, which are in the order of their lines. */
function replaceLines(lines: readonly string[], replacements: readonly { readonly lines: LineRange; readonly replacement: readonly string[] }[]): string[] {
	const result: (readonly string[])[] = [];
	let line = 1;
	for (const { lines: replaced, replacement } of replacements) {
		result.push(getLines(lines, new LineRange(line, replaced.startLineNumber)), replacement);
		line = replaced.endLineNumberExclusive;
	}
	result.push(lines.slice(line - 1));
	return result.flat();
}

/** The offsets at which the lines of `text` start, as {@link splitLines} splits them. */
function getLineStarts(text: string): number[] {
	const starts = [0];
	const lineBreaks = /\r\n|\r|\n/g;
	for (let lineBreak = lineBreaks.exec(text); lineBreak; lineBreak = lineBreaks.exec(text)) {
		starts.push(lineBreak.index + lineBreak[0].length);
	}
	return starts;
}
