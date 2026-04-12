/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './currentLineHighlight.css';
import { DynamicViewOverlay } from '../../view/dynamicViewOverlay.js';
import { editorLineHighlight, editorInactiveLineHighlight, editorLineHighlightBorder } from '../../../common/core/editorColorRegistry.js';
import * as arrays from '../../../../base/common/arrays.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { Selection } from '../../../common/core/selection.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { Position } from '../../../common/core/position.js';
export class AbstractLineHighlightOverlay extends DynamicViewOverlay {
    constructor(context) {
        super();
        this._context = context;
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this._renderLineHighlight = options.get(110 /* EditorOption.renderLineHighlight */);
        this._renderLineHighlightOnlyWhenFocus = options.get(111 /* EditorOption.renderLineHighlightOnlyWhenFocus */);
        this._wordWrap = layoutInfo.isViewportWrapping;
        this._contentLeft = layoutInfo.contentLeft;
        this._contentWidth = layoutInfo.contentWidth;
        this._selectionIsEmpty = true;
        this._focused = false;
        this._cursorLineNumbers = [1];
        this._selections = [new Selection(1, 1, 1, 1)];
        this._renderData = null;
        this._context.addEventHandler(this);
    }
    dispose() {
        this._context.removeEventHandler(this);
        super.dispose();
    }
    _readFromSelections() {
        let hasChanged = false;
        const lineNumbers = new Set();
        for (const selection of this._selections) {
            lineNumbers.add(selection.positionLineNumber);
        }
        const cursorsLineNumbers = Array.from(lineNumbers);
        cursorsLineNumbers.sort((a, b) => a - b);
        if (!arrays.equals(this._cursorLineNumbers, cursorsLineNumbers)) {
            this._cursorLineNumbers = cursorsLineNumbers;
            hasChanged = true;
        }
        const selectionIsEmpty = this._selections.every(s => s.isEmpty());
        if (this._selectionIsEmpty !== selectionIsEmpty) {
            this._selectionIsEmpty = selectionIsEmpty;
            hasChanged = true;
        }
        return hasChanged;
    }
    // --- begin event handlers
    onThemeChanged(e) {
        return this._readFromSelections();
    }
    onConfigurationChanged(e) {
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this._renderLineHighlight = options.get(110 /* EditorOption.renderLineHighlight */);
        this._renderLineHighlightOnlyWhenFocus = options.get(111 /* EditorOption.renderLineHighlightOnlyWhenFocus */);
        this._wordWrap = layoutInfo.isViewportWrapping;
        this._contentLeft = layoutInfo.contentLeft;
        this._contentWidth = layoutInfo.contentWidth;
        return true;
    }
    onCursorStateChanged(e) {
        this._selections = e.selections;
        return this._readFromSelections();
    }
    onFlushed(e) {
        return true;
    }
    onLinesDeleted(e) {
        return true;
    }
    onLinesInserted(e) {
        return true;
    }
    onScrollChanged(e) {
        return e.scrollWidthChanged || e.scrollTopChanged;
    }
    onZonesChanged(e) {
        return true;
    }
    onFocusChanged(e) {
        if (!this._renderLineHighlightOnlyWhenFocus) {
            return false;
        }
        this._focused = e.isFocused;
        return true;
    }
    // --- end event handlers
    prepareRender(ctx) {
        if (!this._shouldRenderThis()) {
            this._renderData = null;
            return;
        }
        const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
        const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
        // initialize renderData
        const renderData = [];
        for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
            const lineIndex = lineNumber - visibleStartLineNumber;
            renderData[lineIndex] = '';
        }
        if (this._wordWrap) {
            // do a first pass to render wrapped lines
            const renderedLineWrapped = this._renderOne(ctx, false);
            for (const cursorLineNumber of this._cursorLineNumbers) {
                const coordinatesConverter = this._context.viewModel.coordinatesConverter;
                const modelLineNumber = coordinatesConverter.convertViewPositionToModelPosition(new Position(cursorLineNumber, 1)).lineNumber;
                const firstViewLineNumber = coordinatesConverter.convertModelPositionToViewPosition(new Position(modelLineNumber, 1)).lineNumber;
                const lastViewLineNumber = coordinatesConverter.convertModelPositionToViewPosition(new Position(modelLineNumber, this._context.viewModel.model.getLineMaxColumn(modelLineNumber))).lineNumber;
                const firstLine = Math.max(firstViewLineNumber, visibleStartLineNumber);
                const lastLine = Math.min(lastViewLineNumber, visibleEndLineNumber);
                for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
                    const lineIndex = lineNumber - visibleStartLineNumber;
                    renderData[lineIndex] = renderedLineWrapped;
                }
            }
        }
        // do a second pass to render exact lines
        const renderedLineExact = this._renderOne(ctx, true);
        for (const cursorLineNumber of this._cursorLineNumbers) {
            if (cursorLineNumber < visibleStartLineNumber || cursorLineNumber > visibleEndLineNumber) {
                continue;
            }
            const lineIndex = cursorLineNumber - visibleStartLineNumber;
            renderData[lineIndex] = renderedLineExact;
        }
        this._renderData = renderData;
    }
    render(startLineNumber, lineNumber) {
        if (!this._renderData) {
            return '';
        }
        const lineIndex = lineNumber - startLineNumber;
        if (lineIndex >= this._renderData.length) {
            return '';
        }
        return this._renderData[lineIndex];
    }
    _shouldRenderInMargin() {
        return ((this._renderLineHighlight === 'gutter' || this._renderLineHighlight === 'all')
            && (!this._renderLineHighlightOnlyWhenFocus || this._focused));
    }
    _shouldRenderInContent() {
        return ((this._renderLineHighlight === 'line' || this._renderLineHighlight === 'all')
            && this._selectionIsEmpty
            && (!this._renderLineHighlightOnlyWhenFocus || this._focused));
    }
}
/**
 * Emphasizes the current line by drawing a border around it.
 */
export class CurrentLineHighlightOverlay extends AbstractLineHighlightOverlay {
    _renderOne(ctx, exact) {
        const className = 'current-line' + (this._shouldRenderInMargin() ? ' current-line-both' : '') + (exact ? ' current-line-exact' : '');
        return `<div class="${className}" style="width:${Math.max(ctx.scrollWidth, this._contentWidth)}px;"></div>`;
    }
    _shouldRenderThis() {
        return this._shouldRenderInContent();
    }
    _shouldRenderOther() {
        return this._shouldRenderInMargin();
    }
}
/**
 * Emphasizes the current line margin/gutter by drawing a border around it.
 */
export class CurrentLineMarginHighlightOverlay extends AbstractLineHighlightOverlay {
    _renderOne(ctx, exact) {
        const className = 'current-line' + (this._shouldRenderInMargin() ? ' current-line-margin' : '') + (this._shouldRenderOther() ? ' current-line-margin-both' : '') + (this._shouldRenderInMargin() && exact ? ' current-line-exact-margin' : '');
        return `<div class="${className}" style="width:${this._contentLeft}px"></div>`;
    }
    _shouldRenderThis() {
        return true;
    }
    _shouldRenderOther() {
        return this._shouldRenderInContent();
    }
}
registerThemingParticipant((theme, collector) => {
    const lineHighlight = theme.getColor(editorLineHighlight);
    const inactiveLineHighlight = theme.getColor(editorInactiveLineHighlight);
    // Apply active line highlight when editor is focused
    if (lineHighlight) {
        collector.addRule(`.monaco-editor.focused .view-overlays .current-line { background-color: ${lineHighlight}; }`);
        collector.addRule(`.monaco-editor.focused .margin-view-overlays .current-line-margin { background-color: ${lineHighlight}; border: none; }`);
    }
    // Apply inactive line highlight when editor is not focused
    if (inactiveLineHighlight) {
        collector.addRule(`.monaco-editor .view-overlays .current-line { background-color: ${inactiveLineHighlight}; }`);
        collector.addRule(`.monaco-editor .margin-view-overlays .current-line-margin { background-color: ${inactiveLineHighlight}; border: none; }`);
    }
    if (!lineHighlight || lineHighlight.isTransparent() || theme.defines(editorLineHighlightBorder)) {
        const lineHighlightBorder = theme.getColor(editorLineHighlightBorder);
        if (lineHighlightBorder) {
            collector.addRule(`.monaco-editor .view-overlays .current-line-exact { border: 2px solid ${lineHighlightBorder}; }`);
            collector.addRule(`.monaco-editor .margin-view-overlays .current-line-exact-margin { border: 2px solid ${lineHighlightBorder}; }`);
            if (isHighContrast(theme.type)) {
                collector.addRule(`.monaco-editor .view-overlays .current-line-exact { border-width: 1px; }`);
                collector.addRule(`.monaco-editor .margin-view-overlays .current-line-exact-margin { border-width: 1px; }`);
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VycmVudExpbmVIaWdobGlnaHQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci92aWV3UGFydHMvY3VycmVudExpbmVIaWdobGlnaHQvY3VycmVudExpbmVIaWdobGlnaHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyw0QkFBNEIsQ0FBQztBQUNwQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsMkJBQTJCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUkxSSxPQUFPLEtBQUssTUFBTSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTVELE1BQU0sT0FBZ0IsNEJBQTZCLFNBQVEsa0JBQWtCO0lBZ0I1RSxZQUFZLE9BQW9CO1FBQy9CLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFFeEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO1FBQ3BELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLG1DQUF5QixDQUFDO1FBQ3hELElBQUksQ0FBQyxvQkFBb0IsR0FBRyxPQUFPLENBQUMsR0FBRyw0Q0FBa0MsQ0FBQztRQUMxRSxJQUFJLENBQUMsaUNBQWlDLEdBQUcsT0FBTyxDQUFDLEdBQUcseURBQStDLENB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