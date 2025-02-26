/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDomNodePagePosition, h } from '../../../../../../../base/browser/dom.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { numberComparator } from '../../../../../../../base/common/arrays.js';
import { findFirstMin } from '../../../../../../../base/common/arraysFind.js';
import { DisposableStore, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { derived, derivedObservableWithCache, derivedOpts, IObservable, IReader, observableValue, transaction } from '../../../../../../../base/common/observable.js';
import { OS } from '../../../../../../../base/common/platform.js';
import { getIndentationLength, splitLines } from '../../../../../../../base/common/strings.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { MenuEntryActionViewItem } from '../../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ICodeEditor } from '../../../../../../browser/editorBrowser.js';
import { ObservableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../../browser/point.js';
import { Rect } from '../../../../../../browser/rect.js';
import { EditorOption } from '../../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../../common/core/offsetRange.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { SingleTextEdit, TextEdit } from '../../../../../../common/core/textEdit.js';
import { RangeMapping } from '../../../../../../common/diff/rangeMapping.js';
import { indentOfLine } from '../../../../../../common/model/textModel.js';

export enum InlineEditTabAction {
	Jump = 'jump',
	Accept = 'accept',
	Inactive = 'inactive'
}

export function maxContentWidthInRange(editor: ObservableCodeEditor, range: LineRange, reader: IReader | undefined): number {
	editor.layoutInfo.read(reader);
	editor.value.read(reader);

	const model = editor.model.read(reader);
	if (!model) { return 0; }
	let maxContentWidth = 0;

	editor.scrollTop.read(reader);
	for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
		const column = model.getLineMaxColumn(i);
		let lineContentWidth = editor.editor.getOffsetForColumn(i, column);
		if (lineContentWidth === -1) {
			// approximation
			const typicalHalfwidthCharacterWidth = editor.editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
			const approximation = column * typicalHalfwidthCharacterWidth;
			lineContentWidth = approximation;
		}
		maxContentWidth = Math.max(maxContentWidth, lineContentWidth);
	}
	const lines = range.mapToLineArray(l => model.getLineContent(l));

	if (maxContentWidth < 5 && lines.some(l => l.length > 0) && model.uri.scheme !== 'file') {
		console.error('unexpected width');
	}
	return maxContentWidth;
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

export function getPrefixTrim(diffRanges: Range[], originalLinesRange: LineRange, modifiedLines: string[], editor: ICodeEditor): { prefixTrim: number; prefixLeftOffset: number } {
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
		prefixLeftOffset = editor.getOffsetForColumn(originalLinesRange.startLineNumber, prefixTrim + 1);
	} else if (startLineIndent !== 1) {
		// We need to approximate the offset as the editor does not contain the modified lines yet
		const startLineIndentOffset = editor.getOffsetForColumn(originalLinesRange.startLineNumber, startLineIndent);
		prefixLeftOffset = startLineIndentOffset / (startLineIndent - 1) * prefixTrim;
	} else {
		// unable to approximate the offset
		return { prefixTrim: 0, prefixLeftOffset: 0 };
	}

	return { prefixTrim, prefixLeftOffset };
}

export class StatusBarViewItem extends MenuEntryActionViewItem {
	protected readonly _updateLabelListener = this._register(this._contextKeyService.onDidChangeContext(() => {
		this.updateLabel();
	}));

	protected override updateLabel() {
		const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService, true);
		if (!kb) {
			return super.updateLabel();
		}
		if (this.label) {
			const div = h('div.keybinding').root;
			const keybindingLabel = this._register(new KeybindingLabel(div, OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
			keybindingLabel.set(kb);
			this.label.textContent = this._action.label;
			this.label.appendChild(div);
			this.label.classList.add('inlineSuggestionStatusBarItemLabel');
		}
	}

	protected override updateTooltip(): void {
		// NOOP, disable tooltip
	}
}

export class UniqueUriGenerator {
	private static _modelId = 0;

	constructor(
		public readonly scheme: string
	) { }

	public getUniqueUri(): URI {
		return URI.from({ scheme: this.scheme, path: new Date().toString() + String(UniqueUriGenerator._modelId++) });
	}
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

export function createReindentEdit(text: string, range: LineRange): TextEdit {
	const newLines = splitLines(text);
	const edits: SingleTextEdit[] = [];
	const minIndent = findFirstMin(range.mapToLineArray(l => getIndentationLength(newLines[l - 1])), numberComparator)!;
	range.forEach(lineNumber => {
		edits.push(new SingleTextEdit(offsetRangeToRange(new OffsetRange(0, minIndent), new Position(lineNumber, 1)), ''));
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

	public curveTo(cp: Point, to: Point): this {
		this._data += `Q ${cp.x} ${cp.y} ${to.x} ${to.y} `;
		return this;
	}

	public curveTo2(cp1: Point, cp2: Point, to: Point): this {
		this._data += `C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${to.x} ${to.y} `;
		return this;
	}

	public build(): string {
		return this._data;
	}
}

// Arguments are a bit messy currently, could be improved
export function createRectangle(
	layout: { topLeft: Point; width: number; height: number },
	padding: number | { top: number; right: number; bottom: number; left: number },
	borderRadius: number | { topLeft: number; topRight: number; bottomLeft: number; bottomRight: number },
	options: { hideLeft?: boolean; hideRight?: boolean; hideTop?: boolean; hideBottom?: boolean } = {}
): string {

	const topLeftInner = layout.topLeft;
	const topRightInner = topLeftInner.deltaX(layout.width);
	const bottomLeftInner = topLeftInner.deltaY(layout.height);
	const bottomRightInner = bottomLeftInner.deltaX(layout.width);

	// padding
	const { top: paddingTop, bottom: paddingBottom, left: paddingLeft, right: paddingRight } = typeof padding === 'number' ?
		{ top: padding, bottom: padding, left: padding, right: padding }
		: padding;

	// corner radius
	const { topLeft: radiusTL, topRight: radiusTR, bottomLeft: radiusBL, bottomRight: radiusBR } = typeof borderRadius === 'number' ?
		{ topLeft: borderRadius, topRight: borderRadius, bottomLeft: borderRadius, bottomRight: borderRadius } :
		borderRadius;

	const totalHeight = layout.height + paddingTop + paddingBottom;
	const totalWidth = layout.width + paddingLeft + paddingRight;

	// The path is drawn from bottom left at the end of the rounded corner in a clockwise direction
	// Before: before the rounded corner
	// After: after the rounded corner
	const topLeft = topLeftInner.deltaX(-paddingLeft).deltaY(-paddingTop);
	const topRight = topRightInner.deltaX(paddingRight).deltaY(-paddingTop);
	const topLeftBefore = topLeft.deltaY(Math.min(radiusTL, totalHeight / 2));
	const topLeftAfter = topLeft.deltaX(Math.min(radiusTL, totalWidth / 2));
	const topRightBefore = topRight.deltaX(-Math.min(radiusTR, totalWidth / 2));
	const topRightAfter = topRight.deltaY(Math.min(radiusTR, totalHeight / 2));

	const bottomLeft = bottomLeftInner.deltaX(-paddingLeft).deltaY(paddingBottom);
	const bottomRight = bottomRightInner.deltaX(paddingRight).deltaY(paddingBottom);
	const bottomLeftBefore = bottomLeft.deltaX(Math.min(radiusBL, totalWidth / 2));
	const bottomLeftAfter = bottomLeft.deltaY(-Math.min(radiusBL, totalHeight / 2));
	const bottomRightBefore = bottomRight.deltaY(-Math.min(radiusBR, totalHeight / 2));
	const bottomRightAfter = bottomRight.deltaX(-Math.min(radiusBR, totalWidth / 2));

	const path = new PathBuilder();

	if (!options.hideLeft) {
		path.moveTo(bottomLeftAfter).lineTo(topLeftBefore);
	}

	if (!options.hideLeft && !options.hideTop) {
		path.curveTo(topLeft, topLeftAfter);
	} else {
		path.moveTo(topLeftAfter);
	}

	if (!options.hideTop) {
		path.lineTo(topRightBefore);
	}

	if (!options.hideTop && !options.hideRight) {
		path.curveTo(topRight, topRightAfter);
	} else {
		path.moveTo(topRightAfter);
	}

	if (!options.hideRight) {
		path.lineTo(bottomRightBefore);
	}

	if (!options.hideRight && !options.hideBottom) {
		path.curveTo(bottomRight, bottomRightAfter);
	} else {
		path.moveTo(bottomRightAfter);
	}

	if (!options.hideBottom) {
		path.lineTo(bottomLeftBefore);
	}

	if (!options.hideBottom && !options.hideLeft) {
		path.curveTo(bottomLeft, bottomLeftAfter);
	} else {
		path.moveTo(bottomLeftAfter);
	}

	return path.build();
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

export function observeElementPosition(element: HTMLElement, store: DisposableStore) {
	const topLeft = getDomNodePagePosition(element);
	const top = observableValue<number>('top', topLeft.top);
	const left = observableValue<number>('left', topLeft.left);

	const resizeObserver = new ResizeObserver(() => {
		transaction(tx => {
			const topLeft = getDomNodePagePosition(element);
			top.set(topLeft.top, tx);
			left.set(topLeft.left, tx);
		});
	});

	resizeObserver.observe(element);

	store.add(toDisposable(() => resizeObserver.disconnect()));

	return {
		top,
		left
	};
}

export function rectToProps(fn: (reader: IReader) => Rect) {
	return {
		left: derived(reader => /** @description left */ fn(reader).left),
		top: derived(reader => /** @description top */ fn(reader).top),
		width: derived(reader => /** @description width */ fn(reader).right - fn(reader).left),
		height: derived(reader => /** @description height */ fn(reader).bottom - fn(reader).top),
	};
}

export type FirstFnArg<T> = T extends (arg: infer U) => any ? U : never;
