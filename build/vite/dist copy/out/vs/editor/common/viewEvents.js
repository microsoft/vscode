/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var ViewEventType;
(function (ViewEventType) {
    ViewEventType[ViewEventType["ViewCompositionStart"] = 0] = "ViewCompositionStart";
    ViewEventType[ViewEventType["ViewCompositionEnd"] = 1] = "ViewCompositionEnd";
    ViewEventType[ViewEventType["ViewConfigurationChanged"] = 2] = "ViewConfigurationChanged";
    ViewEventType[ViewEventType["ViewCursorStateChanged"] = 3] = "ViewCursorStateChanged";
    ViewEventType[ViewEventType["ViewDecorationsChanged"] = 4] = "ViewDecorationsChanged";
    ViewEventType[ViewEventType["ViewFlushed"] = 5] = "ViewFlushed";
    ViewEventType[ViewEventType["ViewFocusChanged"] = 6] = "ViewFocusChanged";
    ViewEventType[ViewEventType["ViewLanguageConfigurationChanged"] = 7] = "ViewLanguageConfigurationChanged";
    ViewEventType[ViewEventType["ViewLineMappingChanged"] = 8] = "ViewLineMappingChanged";
    ViewEventType[ViewEventType["ViewLinesChanged"] = 9] = "ViewLinesChanged";
    ViewEventType[ViewEventType["ViewLinesDeleted"] = 10] = "ViewLinesDeleted";
    ViewEventType[ViewEventType["ViewLinesInserted"] = 11] = "ViewLinesInserted";
    ViewEventType[ViewEventType["ViewRevealRangeRequest"] = 12] = "ViewRevealRangeRequest";
    ViewEventType[ViewEventType["ViewScrollChanged"] = 13] = "ViewScrollChanged";
    ViewEventType[ViewEventType["ViewThemeChanged"] = 14] = "ViewThemeChanged";
    ViewEventType[ViewEventType["ViewTokensChanged"] = 15] = "ViewTokensChanged";
    ViewEventType[ViewEventType["ViewTokensColorsChanged"] = 16] = "ViewTokensColorsChanged";
    ViewEventType[ViewEventType["ViewZonesChanged"] = 17] = "ViewZonesChanged";
})(ViewEventType || (ViewEventType = {}));
export class ViewCompositionStartEvent {
    constructor() {
        this.type = 0 /* ViewEventType.ViewCompositionStart */;
    }
}
export class ViewCompositionEndEvent {
    constructor() {
        this.type = 1 /* ViewEventType.ViewCompositionEnd */;
    }
}
export class ViewConfigurationChangedEvent {
    constructor(source) {
        this.type = 2 /* ViewEventType.ViewConfigurationChanged */;
        this._source = source;
    }
    hasChanged(id) {
        return this._source.hasChanged(id);
    }
}
export class ViewCursorStateChangedEvent {
    constructor(selections, modelSelections, reason) {
        this.selections = selections;
        this.modelSelections = modelSelections;
        this.reason = reason;
        this.type = 3 /* ViewEventType.ViewCursorStateChanged */;
    }
}
export class ViewDecorationsChangedEvent {
    constructor(source) {
        this.type = 4 /* ViewEventType.ViewDecorationsChanged */;
        if (source) {
            this.affectsMinimap = source.affectsMinimap;
            this.affectsOverviewRuler = source.affectsOverviewRuler;
            this.affectsGlyphMargin = source.affectsGlyphMargin;
            this.affectsLineNumber = source.affectsLineNumber;
        }
        else {
            this.affectsMinimap = true;
            this.affectsOverviewRuler = true;
            this.affectsGlyphMargin = true;
            this.affectsLineNumber = true;
        }
    }
}
export class ViewFlushedEvent {
    constructor() {
        this.type = 5 /* ViewEventType.ViewFlushed */;
        // Nothing to do
    }
}
export class ViewFocusChangedEvent {
    constructor(isFocused) {
        this.type = 6 /* ViewEventType.ViewFocusChanged */;
        this.isFocused = isFocused;
    }
}
export class ViewLanguageConfigurationEvent {
    constructor() {
        this.type = 7 /* ViewEventType.ViewLanguageConfigurationChanged */;
    }
}
export class ViewLineMappingChangedEvent {
    constructor() {
        this.type = 8 /* ViewEventType.ViewLineMappingChanged */;
        // Nothing to do
    }
}
export class ViewLinesChangedEvent {
    constructor(
    /**
     * The first line that has changed.
     */
    fromLineNumber, 
    /**
     * The number of lines that have changed.
     */
    count) {
        this.fromLineNumber = fromLineNumber;
        this.count = count;
        this.type = 9 /* ViewEventType.ViewLinesChanged */;
    }
}
export class ViewLinesDeletedEvent {
    constructor(fromLineNumber, toLineNumber) {
        this.type = 10 /* ViewEventType.ViewLinesDeleted */;
        this.fromLineNumber = fromLineNumber;
        this.toLineNumber = toLineNumber;
    }
}
export class ViewLinesInsertedEvent {
    constructor(fromLineNumber, toLineNumber) {
        this.type = 11 /* ViewEventType.ViewLinesInserted */;
        this.fromLineNumber = fromLineNumber;
        this.toLineNumber = toLineNumber;
    }
}
export var VerticalRevealType;
(function (VerticalRevealType) {
    VerticalRevealType[VerticalRevealType["Simple"] = 0] = "Simple";
    VerticalRevealType[VerticalRevealType["Center"] = 1] = "Center";
    VerticalRevealType[VerticalRevealType["CenterIfOutsideViewport"] = 2] = "CenterIfOutsideViewport";
    VerticalRevealType[VerticalRevealType["Top"] = 3] = "Top";
    VerticalRevealType[VerticalRevealType["Bottom"] = 4] = "Bottom";
    VerticalRevealType[VerticalRevealType["NearTop"] = 5] = "NearTop";
    VerticalRevealType[VerticalRevealType["NearTopIfOutsideViewport"] = 6] = "NearTopIfOutsideViewport";
})(VerticalRevealType || (VerticalRevealType = {}));
export class ViewRevealRangeRequestEvent {
    constructor(
    /**
     * Source of the call that caused the event.
     */
    source, 
    /**
     * Reduce the revealing to a minimum (e.g. avoid scrolling if the bounding box is visible and near the viewport edge).
     */
    minimalReveal, 
    /**
     * Range to be reavealed.
     */
    range, 
    /**
     * Selections to be revealed.
     */
    selections, 
    /**
     * The vertical reveal strategy.
     */
    verticalType, 
    /**
     * If true: there should be a horizontal & vertical revealing.
     * If false: there should be just a vertical revealing.
     */
    revealHorizontal, 
    /**
     * The scroll type.
     */
    scrollType) {
        this.source = source;
        this.minimalReveal = minimalReveal;
        this.range = range;
        this.selections = selections;
        this.verticalType = verticalType;
        this.revealHorizontal = revealHorizontal;
        this.scrollType = scrollType;
        this.type = 12 /* ViewEventType.ViewRevealRangeRequest */;
    }
}
export class ViewScrollChangedEvent {
    constructor(source) {
        this.type = 13 /* ViewEventType.ViewScrollChanged */;
        this.scrollWidth = source.scrollWidth;
        this.scrollLeft = source.scrollLeft;
        this.scrollHeight = source.scrollHeight;
        this.scrollTop = source.scrollTop;
        this.scrollWidthChanged = source.scrollWidthChanged;
        this.scrollLeftChanged = source.scrollLeftChanged;
        this.scrollHeightChanged = source.scrollHeightChanged;
        this.scrollTopChanged = source.scrollTopChanged;
    }
}
export class ViewThemeChangedEvent {
    constructor(theme) {
        this.theme = theme;
        this.type = 14 /* ViewEventType.ViewThemeChanged */;
    }
}
export class ViewTokensChangedEvent {
    constructor(ranges) {
        this.type = 15 /* ViewEventType.ViewTokensChanged */;
        this.ranges = ranges;
    }
}
export class ViewTokensColorsChangedEvent {
    constructor() {
        this.type = 16 /* ViewEventType.ViewTokensColorsChanged */;
        // Nothing to do
    }
}
export class ViewZonesChangedEvent {
    constructor() {
        this.type = 17 /* ViewEventType.ViewZonesChanged */;
        // Nothing to do
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0V2ZW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vdmlld0V2ZW50cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVdoRyxNQUFNLENBQU4sSUFBa0IsYUFtQmpCO0FBbkJELFdBQWtCLGFBQWE7SUFDOUIsaUZBQW9CLENBQUE7SUFDcEIsNkVBQWtCLENBQUE7SUFDbEIseUZBQXdCLENBQUE7SUFDeEIscUZBQXNCLENBQUE7SUFDdEIscUZBQXNCLENBQUE7SUFDdEIsK0RBQVcsQ0FBQTtJQUNYLHlFQUFnQixDQUFBO0lBQ2hCLHlHQUFnQyxDQUFBO0lBQ2hDLHFGQUFzQixDQUFBO0lBQ3RCLHlFQUFnQixDQUFBO0lBQ2hCLDBFQUFnQixDQUFBO0lBQ2hCLDRFQUFpQixDQUFBO0lBQ2pCLHNGQUFzQixDQUFBO0lBQ3RCLDRFQUFpQixDQUFBO0lBQ2pCLDBFQUFnQixDQUFBO0lBQ2hCLDRFQUFpQixDQUFBO0lBQ2pCLHdGQUF1QixDQUFBO0lBQ3ZCLDBFQUFnQixDQUFBO0FBQ2pCLENBQUMsRUFuQmlCLGFBQWEsS0FBYixhQUFhLFFBbUI5QjtBQUVELE1BQU0sT0FBTyx5QkFBeUI7SUFFckM7UUFEZ0IsU0FBSSw4Q0FBc0M7SUFDMUMsQ0FBQztDQUNqQjtBQUVELE1BQU0sT0FBTyx1QkFBdUI7SUFFbkM7UUFEZ0IsU0FBSSw0Q0FBb0M7SUFDeEMsQ0FBQztDQUNqQjtBQUVELE1BQU0sT0FBTyw2QkFBNkI7SUFNekMsWUFBWSxNQUFpQztRQUo3QixTQUFJLGtEQUEwQztRQUs3RCxJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBRU0sVUFBVSxDQUFDLEVBQWdCO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDcEMsQ0FBQztD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