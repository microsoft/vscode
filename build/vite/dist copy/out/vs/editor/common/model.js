/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { equals } from '../../base/common/objects.js';
/**
 * Vertical Lane in the overview ruler of the editor.
 */
export var OverviewRulerLane;
(function (OverviewRulerLane) {
    OverviewRulerLane[OverviewRulerLane["Left"] = 1] = "Left";
    OverviewRulerLane[OverviewRulerLane["Center"] = 2] = "Center";
    OverviewRulerLane[OverviewRulerLane["Right"] = 4] = "Right";
    OverviewRulerLane[OverviewRulerLane["Full"] = 7] = "Full";
})(OverviewRulerLane || (OverviewRulerLane = {}));
/**
 * Vertical Lane in the glyph margin of the editor.
 */
export var GlyphMarginLane;
(function (GlyphMarginLane) {
    GlyphMarginLane[GlyphMarginLane["Left"] = 1] = "Left";
    GlyphMarginLane[GlyphMarginLane["Center"] = 2] = "Center";
    GlyphMarginLane[GlyphMarginLane["Right"] = 3] = "Right";
})(GlyphMarginLane || (GlyphMarginLane = {}));
/**
 * Position in the minimap to render the decoration.
 */
export var MinimapPosition;
(function (MinimapPosition) {
    MinimapPosition[MinimapPosition["Inline"] = 1] = "Inline";
    MinimapPosition[MinimapPosition["Gutter"] = 2] = "Gutter";
})(MinimapPosition || (MinimapPosition = {}));
/**
 * Section header style.
 */
export var MinimapSectionHeaderStyle;
(function (MinimapSectionHeaderStyle) {
    MinimapSectionHeaderStyle[MinimapSectionHeaderStyle["Normal"] = 1] = "Normal";
    MinimapSectionHeaderStyle[MinimapSectionHeaderStyle["Underlined"] = 2] = "Underlined";
})(MinimapSectionHeaderStyle || (MinimapSectionHeaderStyle = {}));
/**
 * Text Direction for a decoration.
 */
export var TextDirection;
(function (TextDirection) {
    TextDirection[TextDirection["LTR"] = 0] = "LTR";
    TextDirection[TextDirection["RTL"] = 1] = "RTL";
})(TextDirection || (TextDirection = {}));
export var InjectedTextCursorStops;
(function (InjectedTextCursorStops) {
    InjectedTextCursorStops[InjectedTextCursorStops["Both"] = 0] = "Both";
    InjectedTextCursorStops[InjectedTextCursorStops["Right"] = 1] = "Right";
    InjectedTextCursorStops[InjectedTextCursorStops["Left"] = 2] = "Left";
    InjectedTextCursorStops[InjectedTextCursorStops["None"] = 3] = "None";
})(InjectedTextCursorStops || (InjectedTextCursorStops = {}));
/**
 * End of line character preference.
 */
export var EndOfLinePreference;
(function (EndOfLinePreference) {
    /**
     * Use the end of line character identified in the text buffer.
     */
    EndOfLinePreference[EndOfLinePreference["TextDefined"] = 0] = "TextDefined";
    /**
     * Use line feed (\n) as the end of line character.
     */
    EndOfLinePreference[EndOfLinePreference["LF"] = 1] = "LF";
    /**
     * Use carriage return and line feed (\r\n) as the end of line character.
     */
    EndOfLinePreference[EndOfLinePreference["CRLF"] = 2] = "CRLF";
})(EndOfLinePreference || (EndOfLinePreference = {}));
/**
 * The default end of line to use when instantiating models.
 */
export var DefaultEndOfLine;
(function (DefaultEndOfLine) {
    /**
     * Use line feed (\n) as the end of line character.
     */
    DefaultEndOfLine[DefaultEndOfLine["LF"] = 1] = "LF";
    /**
     * Use carriage return and line feed (\r\n) as the end of line character.
     */
    DefaultEndOfLine[DefaultEndOfLine["CRLF"] = 2] = "CRLF";
})(DefaultEndOfLine || (DefaultEndOfLine = {}));
/**
 * End of line character preference.
 */
export var EndOfLineSequence;
(function (EndOfLineSequence) {
    /**
     * Use line feed (\n) as the end of line character.
     */
    EndOfLineSequence[EndOfLineSequence["LF"] = 0] = "LF";
    /**
     * Use carriage return and line feed (\r\n) as the end of line character.
     */
    EndOfLineSequence[EndOfLineSequence["CRLF"] = 1] = "CRLF";
})(EndOfLineSequence || (EndOfLineSequence = {}));
export class TextModelResolvedOptions {
    get originalIndentSize() {
        return this._indentSizeIsTabSize ? 'tabSize' : this.indentSize;
    }
    /**
     * @internal
     */
    constructor(src) {
        this._textModelResolvedOptionsBrand = undefined;
        this.tabSize = Math.max(1, src.tabSize | 0);
        if (src.indentSize === 'tabSize') {
            this.indentSize = this.tabSize;
            this._indentSizeIsTabSize = true;
        }
        else {
            this.indentSize = Math.max(1, src.indentSize | 0);
            this._indentSizeIsTabSize = false;
        }
        this.insertSpaces = Boolean(src.insertSpaces);
        this.defaultEOL = src.defaultEOL | 0;
        this.trimAutoWhitespace = Boolean(src.trimAutoWhitespace);
        this.bracketPairColorizationOptions = src.bracketPairColorizationOptions;
    }
    /**
     * @internal
     */
    equals(other) {
        return (this.tabSize === other.tabSize
            && this._indentSizeIsTabSize === other._indentSizeIsTabSize
            && this.indentSize === other.indentSize
            && this.insertSpaces === other.insertSpaces
            && this.defaultEOL === other.defaultEOL
            && this.trimAutoWhitespace === other.trimAutoWhitespace
            && equals(this.bracketPairColorizationOptions, other.bracketPairColorizationOptions));
    }
    /**
     * @internal
     */
    createChangeEvent(newOpts) {
        return {
            tabSize: this.tabSize !== newOpts.tabSize,
            indentSize: this.indentSize !== newOpts.indentSize,
            insertSpaces: this.insertSpaces !== newOpts.insertSpaces,
            trimAutoWhitespace: this.trimAutoWhitespace !== newOpts.trimAutoWhitespace,
        };
    }
}
export class FindMatch {
    /**
     * @internal
     */
    constructor(range, matches) {
        this._findMatchBrand = undefined;
        this.range = range;
        this.matches = matches;
    }
}
/**
 * Describes the behavior of decorations when typing/editing near their edges.
 * Note: Please do not edit the values, as they very carefully match `DecorationRangeBehavior`
 */
export var TrackedRangeStickiness;
(function (TrackedRangeStickiness) {
    TrackedRangeStickiness[TrackedRangeStickiness["AlwaysGrowsWhenTypingAtEdges"] = 0] = "AlwaysGrowsWhenTypingAtEdges";
    TrackedRangeStickiness[TrackedRangeStickiness["NeverGrowsWhenTypingAtEdges"] = 1] = "NeverGrowsWhenTypingAtEdges";
    TrackedRangeStickiness[TrackedRangeStickiness["GrowsOnlyWhenTypingBefore"] = 2] = "GrowsOnlyWhenTypingBefore";
    TrackedRangeStickiness[TrackedRangeStickiness["GrowsOnlyWhenTypingAfter"] = 3] = "GrowsOnlyWhenTypingAfter";
})(TrackedRangeStickiness || (TrackedRangeStickiness = {}));
/**
 * @internal
 */
export function isITextSnapshot(obj) {
    return (!!obj && typeof obj.read === 'function');
}
/**
 * @internal
 */
export function isITextModel(obj) {
    return Boolean(obj && obj.uri);
}
export var PositionAffinity;
(function (PositionAffinity) {
    /**
     * Prefers the left most position.
    */
    PositionAffinity[PositionAffinity["Left"] = 0] = "Left";
    /**
     * Prefers the right most position.
    */
    PositionAffinity[PositionAffinity["Right"] = 1] = "Right";
    /**
     * No preference.
    */
    PositionAffinity[PositionAffinity["None"] = 2] = "None";
    /**
     * If the given position is on injected text, prefers the position left of it.
    */
    PositionAffinity[PositionAffinity["LeftOfInjectedText"] = 3] = "LeftOfInjectedText";
    /**
     * If the given position is on injected text, prefers the position right of it.
    */
    PositionAffinity[PositionAffinity["RightOfInjectedText"] = 4] = "RightOfInjectedText";
})(PositionAffinity || (PositionAffinity = {}));
/**
 * @internal
 */
export var ModelConstants;
(function (ModelConstants) {
    ModelConstants[ModelConstants["FIRST_LINE_DETECTION_LENGTH_LIMIT"] = 1000] = "FIRST_LINE_DETECTION_LENGTH_LIMIT";
})(ModelConstants || (ModelConstants = {}));
/**
 * @internal
 */
export class ValidAnnotatedEditOperation {
    constructor(identifier, range, text, forceMoveMarkers, isAutoWhitespaceEdit, _isTracked) {
        this.identifier = identifier;
        this.range = range;
        this.text = text;
        this.forceMoveMarkers = forceMoveMarkers;
        this.isAutoWhitespaceEdit = isAutoWhitespaceEdit;
        this._isTracked = _isTracked;
    }
}
/**
 * @internal
 */
export class SearchData {
    constructor(regex, wordSeparators, simpleSearch) {
        this.regex = regex;
        this.wordSeparators = wordSeparators;
        this.simpleSearch = simpleSearch;
    }
}
/**
 * @internal
 */
export class ApplyEditsResult {
    constructor(reverseEdits, changes, trimAutoWhitespaceLineNumbers) {
        this.reverseEdits = reverseEdits;
        this.changes = changes;
        this.trimAutoWhitespaceLineNumbers = trimAutoWhitespaceLineNumbers;
    }
}
/**
 * @internal
 */
export function shouldSynchronizeModel(model) {
    return (!model.isTooLargeForSyncing() && !model.isForSimpleWidget);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL21vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQXdCdEQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBWSxpQkFLWDtBQUxELFdBQVksaUJBQWlCO0lBQzVCLHlEQUFRLENBQUE7SUFDUiw2REFBVSxDQUFBO0lBQ1YsMkRBQVMsQ0FBQTtJQUNULHlEQUFRLENBQUE7QUFDVCxDQUFDLEVBTFcsaUJBQWlCLEtBQWpCLGlCQUFpQixRQUs1QjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksZUFJWDtBQUpELFdBQVksZUFBZTtJQUMxQixxREFBUSxDQUFBO0lBQ1IseURBQVUsQ0FBQTtJQUNWLHVEQUFTLENBQUE7QUFDVixDQUFDLEVBSlcsZUFBZSxLQUFmLGVBQWUsUUFJMUI7QUEwQkQ7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBa0IsZUFHakI7QUFIRCxXQUFrQixlQUFlO0lBQ2hDLHlEQUFVLENBQUE7SUFDVix5REFBVSxDQUFBO0FBQ1gsQ0FBQyxFQUhpQixlQUFlLEtBQWYsZUFBZSxRQUdoQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLHlCQUdqQjtBQUhELFdBQWtCLHlCQUF5QjtJQUMxQyw2RUFBVSxDQUFBO0lBQ1YscUZBQWMsQ0FBQTtBQUNmLENBQUMsRUFIaUIseUJBQXlCLEtBQXpCLHlCQUF5QixRQUcxQztBQW1PRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLGFBSVg7QUFKRCxXQUFZLGFBQWE7SUFDeEIsK0NBQU8sQ0FBQTtJQUVQLCtDQUFPLENBQUE7QUFDUixDQUFDLEVBSlcsYUFBYSxLQUFiLGFBQWEsUUFJeEI7QUF1Q0QsTUFBTSxDQUFOLElB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