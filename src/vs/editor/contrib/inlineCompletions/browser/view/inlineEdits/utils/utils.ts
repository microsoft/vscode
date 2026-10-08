/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { numberComparator } from '../../../../../../../base/common/arrays.js';
import { findFirstMin } from '../../../../../../../base/common/arraysFind.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { DebugLocation, derived, derivedObservableWithCache, derivedOpts, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../../../../base/common/observable.js';
import { splitLines } from '../../../../../../../base/common/strings.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { observableCodeEditor, ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../common/core/2d/point.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/ranges/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { TextReplacement, TextEdit } from '../../../../../../common/core/edits/textEdit.js';
import { RangeMapping } from '../../../../../../common/diff/rangeMapping.js';
import { ITextModel } from '../../../../../../common/model.js';
import { indentOfLine } from '../../../../../../common/model/textModel.js';
import { CharCode } from '../../../../../../../base/common/charCode.js';
import { BugIndicatingError } from '../../../../../../../base/common/errors.js';
import { Size2D } from '../../../../../../common/core/2d/size.js';

/**
 * Warning: might return 0.
*/
export function maxContentWidthInRange(editor: ObservableCodeEditor, range: LineRange, reader: IReader | undefined): number {
	const model = editor.model.read(reader);
	if (!model) { return 0; }
	let maxContentWidth = 0;

	for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
		const lineContentWidth = editor.getWidthOfLine(i, reader);
		maxContentWidth = Math.max(maxContentWidth, lineContentWidth);
	}
	const lines = range.mapToLineArray(l => model.getLineContent(l));

	if (maxContentWidth < 5 && lines.some(l => l.length > 0) && model.uri.scheme !== 'file') {
		console.log('unexpected width');
	}
	return maxContentWidth;
}

export function getContentSizeOfLines(editor: ObservableCodeEditor, range: LineRange, reader: IReader | undefined): Size2D[] {
	observableSignalFromEvent(editor, editor.editor.onDidChangeLineHeight).read(reader);

	const model = editor.model.read(reader);
	if (!model) { throw new BugIndicatingError('Model is required'); }

	const sizes: Size2D[] = [];

	for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
		let lineContentWidth = editor.getWidthOfLine(i, reader);
		if (lineContentWidth === -1) {
			// approximation
			const column = model.getLineMaxColumn(i);
			const typicalHalfwidthCharacterWidth = editor.editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
			const approximation = column * typicalHalfwidthCharacterWidth;
			lineContentWidth = approximation;
		}

		const height = editor.editor.getLineHeightForPosition(new Position(i, 1));
		sizes.push(new Size2D(lineContentWidth, height));
	}

	return sizes;
}

export function getOffsetForPos(editor: ObservableCodeEditor, pos: Position, reader: IReader): number {
	editor.layoutInfo.read(reader);
	editor.value.read(reader);

	const model = editor.model.read(reader);
	if (!model) { return 0; }

	editor.scrollTop.read(reader);
	const lineContentWidth = editor.editor.getOffsetForColumn(pos.lineNumber, pos.column);

	return lineContentWidth;
}

export function getPrefixTrim(diffRanges: Range[], originalLinesRange: LineRange, modifiedLines: string[], editor: ICodeEditor, reader: IReader | undefined = undefined): { prefixTrim: number; prefixLeftOffset: number } {
	const textModel = editor.getModel();
	if (!textModel) {
		return { prefixTrim: 0, prefixLeftOffset: 0 };
	}

	const replacementStart = diffRanges.map(r => r.isSingleLine() ? r.startColumn - 1 : 0);
	const originalIndents = originalLinesRange.mapToLineArray(line => indentOfLine(textModel.getLineContent(line)));
	const modifiedIndents = modifiedLines.filter(line => line !== '').map(line => indentOfLine(line));
	const prefixTrim = Math.min(...replacementStart, ...originalIndents, ...modifiedIndents);

	let prefixLeftOffset;
	const startLineIndent = textModel.getLineIndentColumn(originalLinesRange.startLineNumber);
	if (startLineIndent >= prefixTrim + 1) {
		// We can use the editor to get the offset
		// TODO go through other usages of getOffsetForColumn and come up with a robust reactive solution to read it
		observableCodeEditor(editor).scrollTop.read(reader); // getOffsetForColumn requires the line number to be visible. This might change on scroll top.
		prefixLeftOffset = editor.getOffsetForColumn(originalLinesRange.startLineNumber, prefixTrim + 1);
	} else if (modifiedLines.length > 0) {
		// Content is not in the editor, we can use the content width to calculate the offset
		prefixLeftOffset = getContentRenderWidth(modifiedLines[0].slice(0, prefixTrim), editor, textModel);
	} else {
		// unable to approximate the offset
		return { prefixTrim: 0, prefixLeftOffset: 0 };
	}

	return { prefixTrim, prefixLeftOffset };
}

export function getContentRenderWidth(content: string, editor: ICodeEditor, textModel: ITextModel) {
	const w = editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
	const tabSize = textModel.getOptions().tabSize * w;

	const numTabs = content.split('\t').length - 1;
	const numNoneTabs = content.length - numTabs;
	return numNoneTabs * w + numTabs * tabSize;
}

export function getEditorValidOverlayRect(editor: ObservableCodeEditor): IObservable<Rect> {
	const contentLeft = editor.layoutInfoContentLeft;

	const width = derived({ name: 'editor.validOverlay.width' }, r => {
		const hasMinimapOnTheRight = editor.layoutInfoMinimap.read(r).minimapLeft !== 0;
		const editorWidth = Math.max(0, editor.layoutInfoWidth.read(r) - contentLeft.read(r));

		if (hasMinimapOnTheRight) {
			const minimapAndScrollbarWidth = editor.layoutInfoMinimap.read(r).minimapWidth + editor.layoutInfoVerticalScrollbarWidth.read(r);
			return Math.max(0, editorWidth - minimapAndScrollbarWidth);
		}

		return editorWidth;
	});

	const height = derived({ name: 'editor.validOverlay.height' }, r => editor.layoutInfoHeight.read(r) + editor.contentHeight.read(r));

	return derived({ name: 'editor.validOverlay' }, r => Rect.fromLeftTopWidthHeight(contentLeft.read(r), 0, width.read(r), height.read(r)));
}

export function applyEditToModifiedRangeMappings(rangeMapping: RangeMapping[], edit: TextEdit): RangeMapping[] {
	const updatedMappings: RangeMapping[] = [];
	for (const m of rangeMapping) {
		const updatedRange = edit.mapRange(m.modifiedRange);
		updatedMappings.push(new RangeMapping(m.originalRange, updatedRange));
	}
	return updatedMappings;
}


export function classNames(...classes: (string | false | undefined | null)[]) {
	return classes.filter(c => typeof c === 'string').join(' ');
}

function offsetRangeToRange(columnOffsetRange: OffsetRange, startPos: Position): Range {
	return new Range(
		startPos.lineNumber,
		startPos.column + columnOffsetRange.start,
		startPos.lineNumber,
		startPos.column + columnOffsetRange.endExclusive,
	);
}

/**
 * Calculates the indentation size (in spaces) of a given line,
 * interpreting tabs as the specified tab size.
 */
function getIndentationSize(line: string, tabSize: number): number {
	let currentSize = 0;
	loop: for (let i = 0, len = line.length; i < len; i++) {
		switch (line.charCodeAt(i)) {
			case CharCode.Tab: currentSize += tabSize; break;
			case CharCode.Space: currentSize++; break;
			default: break loop;
		}
	}
	// if currentSize % tabSize !== 0,
	// then there are spaces which are not part of the indentation
	return currentSize - (currentSize % tabSize);
}

/**
 * Calculates the number of characters at the start of a line that correspond to a given indentation size,
 * taking into account both tabs and spaces.
 */
function indentSizeToIndentLength(line: string, indentSize: number, tabSize: number): number {
	let remainingSize = indentSize - (indentSize % tabSize);
	let i = 0;
	for (; i < line.length; i++) {
		if (remainingSize === 0) {
			break;
		}
		switch (line.charCodeAt(i)) {
			case CharCode.Tab: remainingSize -= tabSize; break;
			case CharCode.Space: remainingSize--; break;
			default: throw new BugIndicatingError('Unexpected character found while calculating indent length');
		}
	}
	return i;
}

export function createReindentEdit(text: string, range: LineRange, tabSize: number): TextEdit {
	const newLines = splitLines(text);
	const edits: TextReplacement[] = [];
	const minIndentSize = findFirstMin(range.mapToLineArray(l => getIndentationSize(newLines[l - 1], tabSize)), numberComparator)!;
	range.forEach(lineNumber => {
		const indentLength = indentSizeToIndentLength(newLines[lineNumber - 1], minIndentSize, tabSize);
		edits.push(new TextReplacement(offsetRangeToRange(new OffsetRange(0, indentLength), new Position(lineNumber, 1)), ''));
	});
	return new TextEdit(edits);
}

export class PathBuilder {
	private _data: string = '';

	public moveTo(point: Point): this {
		this._data += `M ${point.x} ${point.y} `;
		return this;
	}

	public lineTo(point: Point): this {
		this._data += `L ${point.x} ${point.y} `;
		return this;
	}

	public build(): string {
		return this._data;
	}
}

type RemoveFalsy<T> = T extends false | undefined | null ? never : T;
type Falsy<T> = T extends false | undefined | null ? T : never;

export function mapOutFalsy<T>(obs: IObservable<T>): IObservable<IObservable<RemoveFalsy<T>> | Falsy<T>> {
	const nonUndefinedObs = derivedObservableWithCache<T | undefined | null | false>(undefined, (reader, lastValue) => obs.read(reader) || lastValue);

	return derivedOpts({
		debugName: () => `${obs.debugName}.mapOutFalsy`
	}, reader => {
		nonUndefinedObs.read(reader);
		const val = obs.read(reader);
		if (!val) {
			return undefined as Falsy<T>;
		}

		return nonUndefinedObs as IObservable<RemoveFalsy<T>>;
	});
}

export function rectToProps(fn: (reader: IReader) => Rect | undefined, debugLocation: DebugLocation = DebugLocation.ofCaller()) {
	return {
		left: derived({ name: 'editor.validOverlay.left' }, reader => /** @description left */ fn(reader)?.left, debugLocation),
		top: derived({ name: 'editor.validOverlay.top' }, reader => /** @description top */ fn(reader)?.top, debugLocation),
		width: derived({ name: 'editor.validOverlay.width' }, reader => {
			/** @description width */
			const val = fn(reader);
			if (!val) {
				return undefined;
			}
			return val.width;
		}, debugLocation),
		height: derived({ name: 'editor.validOverlay.height' }, reader => {
			/** @description height */
			const val = fn(reader);
			if (!val) {
				return undefined;
			}
			return val.height;
		}, debugLocation),
	};
}

export type FirstFnArg<T> = T extends (arg: infer U) => any ? U : never;


export function observeEditorBoundingClientRect(editor: ICodeEditor, store: DisposableStore): IObservable<DOMRectReadOnly> {
	const dom = editor.getContainerDomNode()!;
	const initialDomRect = observableValue('domRect', dom.getBoundingClientRect());
	store.add(editor.onDidLayoutChange(e => {
		initialDomRect.set(dom.getBoundingClientRect(), undefined);
	}));
	return initialDomRect;
}
