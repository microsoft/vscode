/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getDomNodePagePosition, h } from '../../../../../../../base/browser/dom.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { numberComparator } from '../../../../../../../base/common/arrays.js';
import { findFirstMin } from '../../../../../../../base/common/arraysFind.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { DebugLocation, derived, derivedObservableWithCache, derivedOpts, observableSignalFromEvent, observableValue, transaction } from '../../../../../../../base/common/observable.js';
import { OS } from '../../../../../../../base/common/platform.js';
import { splitLines } from '../../../../../../../base/common/strings.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { MenuEntryActionViewItem } from '../../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { observableCodeEditor } from '../../../../../../browser/observableCodeEditor.js';
import { Rect } from '../../../../../../common/core/2d/rect.js';
import { OffsetRange } from '../../../../../../common/core/ranges/offsetRange.js';
import { Position } from '../../../../../../common/core/position.js';
import { Range } from '../../../../../../common/core/range.js';
import { TextReplacement, TextEdit } from '../../../../../../common/core/edits/textEdit.js';
import { RangeMapping } from '../../../../../../common/diff/rangeMapping.js';
import { indentOfLine } from '../../../../../../common/model/textModel.js';
import { BugIndicatingError } from '../../../../../../../base/common/errors.js';
import { Size2D } from '../../../../../../common/core/2d/size.js';
/**
 * Warning: might return 0.
*/
export function maxContentWidthInRange(editor, range, reader) {
    const model = editor.model.read(reader);
    if (!model) {
        return 0;
    }
    let maxContentWidth = 0;
    for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
        const lineContentWidth = editor.getWidthOfLine(i, reader);
        maxContentWidth = Math.max(maxContentWidth, lineContentWidth);
    }
    const lines = range.mapToLineArray(l => model.getLineContent(l));
    if (maxContentWidth < 5 && lines.some(l => l.length > 0) && model.uri.scheme !== 'file') {
        console.error('unexpected width');
    }
    return maxContentWidth;
}
export function getContentSizeOfLines(editor, range, reader) {
    observableSignalFromEvent(editor, editor.editor.onDidChangeLineHeight).read(reader);
    const model = editor.model.read(reader);
    if (!model) {
        throw new BugIndicatingError('Model is required');
    }
    const sizes = [];
    for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
        let lineContentWidth = editor.getWidthOfLine(i, reader);
        if (lineContentWidth === -1) {
            // approximation
            const column = model.getLineMaxColumn(i);
            const typicalHalfwidthCharacterWidth = editor.editor.getOption(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
            const approximation = column * typicalHalfwidthCharacterWidth;
            lineContentWidth = approximation;
        }
        const height = editor.editor.getLineHeightForPosition(new Position(i, 1));
        sizes.push(new Size2D(lineContentWidth, height));
    }
    return sizes;
}
export function getOffsetForPos(editor, pos, reader) {
    editor.layoutInfo.read(reader);
    editor.value.read(reader);
    const model = editor.model.read(reader);
    if (!model) {
        return 0;
    }
    editor.scrollTop.read(reader);
    const lineContentWidth = editor.editor.getOffsetForColumn(pos.lineNumber, pos.column);
    return lineContentWidth;
}
export function getPrefixTrim(diffRanges, originalLinesRange, modifiedLines, editor, reader = undefined) {
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
    }
    else if (modifiedLines.length > 0) {
        // Content is not in the editor, we can use the content width to calculate the offset
        prefixLeftOffset = getContentRenderWidth(modifiedLines[0].slice(0, prefixTrim), editor, textModel);
    }
    else {
        // unable to approximate the offset
        return { prefixTrim: 0, prefixLeftOffset: 0 };
    }
    return { prefixTrim, prefixLeftOffset };
}
export function getContentRenderWidth(content, editor, textModel) {
    const w = editor.getOption(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
    const tabSize = textModel.getOptions().tabSize * w;
    const numTabs = content.split('\t').length - 1;
    const numNoneTabs = content.length - numTabs;
    return numNoneTabs * w + numTabs * tabSize;
}
export function getEditorValidOverlayRect(editor) {
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
export class StatusBarViewItem extends MenuEntryActionViewItem {
    constructor() {
        super(...arguments);
        this._updateLabelListener = this._register(this._contextKeyService.onDidChangeContext(() => {
            this.updateLabel();
        }));
    }
    updateLabel() {
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
    updateTooltip() {
        // NOOP, disable tooltip
    }
}
export class UniqueUriGenerator {
    static { this._modelId = 0; }
    constructor(scheme) {
        this.scheme = scheme;
    }
    getUniqueUri() {
        return URI.from({ scheme: this.scheme, path: new Date().toString() + String(UniqueUriGenerator._modelId++) });
    }
}
export function applyEditToModifiedRangeMappings(rangeMapping, edit) {
    const updatedMappings = [];
    for (const m of rangeMapping) {
        const updatedRange = edit.mapRange(m.modifiedRange);
        updatedMappings.push(new RangeMapping(m.originalRange, updatedRange));
    }
    return updatedMappings;
}
export function classNames(...classes) {
    return classes.filter(c => typeof c === 'string').join(' ');
}
function offsetRangeToRange(columnOffsetRange, startPos) {
    return new Range(startPos.lineNumber, startPos.column + columnOffsetRange.start, startPos.lineNumber, startPos.column + columnOffsetRange.endExclusive);
}
/**
 * Calculates the indentation size (in spaces) of a given line,
 * interpreting tabs as the specified tab size.
 */
function getIndentationSize(line, tabSize) {
    let currentSize = 0;
    loop: for (let i = 0, len = line.length; i < len; i++) {
        switch (line.charCodeAt(i)) {
            case 9 /* CharCode.Tab */:
                currentSize += tabSize;
                break;
            case 32 /* CharCode.Space */:
                currentSize++;
                break;
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
function indentSizeToIndentLength(line, indentSize, tabSize) {
    let remainingSize = indentSize - (indentSize % tabSize);
    let i = 0;
    for (; i < line.length; i++) {
        if (remainingSize === 0) {
            break;
        }
        switch (line.charCodeAt(i)) {
            case 9 /* CharCode.Tab */:
                remainingSize -= tabSize;
                break;
            case 32 /* CharCode.Space */:
                remainingSize--;
                break;
            default: throw new BugIndicatingError('Unexpected character found while calculating indent length');
        }
    }
    return i;
}
export function createReindentEdit(text, range, tabSize) {
    const newLines = splitLines(text);
    const edits = [];
    const minIndentSize = findFirstMin(range.mapToLineArray(l => getIndentationSize(newLines[l - 1], tabSize)), numberComparator);
    range.forEach(lineNumber => {
        const indentLength = indentSizeToIndentLength(newLines[lineNumber - 1], minIndentSize, tabSize);
        edits.push(new TextReplacement(offsetRangeToRange(new OffsetRange(0, indentLength), new Position(lineNumber, 1)), ''));
    });
    return new TextEdit(edits);
}
export class PathBuilder {
    constructor() {
        this._data = '';
    }
    moveTo(point) {
        this._data += `M ${point.x} ${point.y} `;
        return this;
    }
    lineTo(point) {
        this._data += `L ${point.x} ${point.y} `;
        return this;
    }
    curveTo(cp, to) {
        this._data += `Q ${cp.x} ${cp.y} ${to.x} ${to.y} `;
        return this;
    }
    curveTo2(cp1, cp2, to) {
        this._data += `C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${to.x} ${to.y} `;
        return this;
    }
    build() {
        return this._data;
    }
}
// Arguments are a bit messy currently, could be improved
export function createRectangle(layout, padding, borderRadius, options = {}) {
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
    }
    else {
        path.moveTo(topLeftAfter);
    }
    if (!options.hideTop) {
        path.lineTo(topRightBefore);
    }
    if (!options.hideTop && !options.hideRight) {
        path.curveTo(topRight, topRightAfter);
    }
    else {
        path.moveTo(topRightAfter);
    }
    if (!options.hideRight) {
        path.lineTo(bottomRightBefore);
    }
    if (!options.hideRight && !options.hideBottom) {
        path.curveTo(bottomRight, bottomRightAfter);
    }
    else {
        path.moveTo(bottomRightAfter);
    }
    if (!options.hideBottom) {
        path.lineTo(bottomLeftBefore);
    }
    if (!options.hideBottom && !options.hideLeft) {
        path.curveTo(bottomLeft, bottomLeftAfter);
    }
    else {
        path.moveTo(bottomLeftAfter);
    }
    return path.build();
}
export function mapOutFalsy(obs) {
    const nonUndefinedObs = derivedObservableWithCache(undefined, (reader, lastValue) => obs.read(reader) || lastValue);
    return derivedOpts({
        debugName: () => `${obs.debugName}.mapOutFalsy`
    }, reader => {
        nonUndefinedObs.read(reader);
        const val = obs.read(reader);
        if (!val) {
            return undefined;
        }
        return nonUndefinedObs;
    });
}
export function observeElementPosition(element, store) {
    const topLeft = getDomNodePagePosition(element);
    const top = observableValue('top', topLeft.top);
    const left = observableValue('left', topLeft.left);
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
export function rectToProps(fn, debugLocation = DebugLocation.ofCaller()) {
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
export function observeEditorBoundingClientRect(editor, store) {
    const dom = editor.getContainerDomNode();
    const initialDomRect = observableValue('domRect', dom.getBoundingClientRect());
    store.add(editor.onDidLayoutChange(e => {
        initialDomRect.set(dom.getBoundingClientRect(), undefined);
    }));
    return initialDomRect;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL3ZpZXcvaW5saW5lRWRpdHMvdXRpbHMvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLENBQUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUMxSSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDOUUsT0FBTyxFQUFtQixZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM5RixPQUFPLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxXQUFXLEVBQXdCLHlCQUF5QixFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoTixPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUVuSCxPQUFPLEVBQUUsb0JBQW9CLEVBQXdCLE1BQU0sbURBQW1ELENBQUM7QUFFL0csT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR2hFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0s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