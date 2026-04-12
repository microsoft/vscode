/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
    isBefore(other) { return false; }
    isBeforeOrEqual(other) { return false; }
    isAfter(other) { return false; }
    isAfterOrEqual(other) { return false; }
    isEqual(other) { return false; }
    compareTo(other) { return 0; }
    translate(_, _2) { return new Position(0, 0); }
    with(_) { return new Position(0, 0); }
}
export class Range {
    constructor(startLine, startCol, endLine, endCol) {
        this.isEmpty = false;
        this.isSingleLine = false;
        this.start = new Position(startLine, startCol);
        this.end = new Position(endLine, endCol);
    }
    contains(positionOrRange) { return false; }
    isEqual(other) { return false; }
    intersection(range) { return undefined; }
    union(other) { return new Range(0, 0, 0, 0); }
    with(_) { return new Range(0, 0, 0, 0); }
}
/**
 * The main match information for a {@link TextSearchResult2}.
 */
export class TextSearchMatch2 {
    /**
     * @param uri The uri for the matching document.
     * @param ranges The ranges associated with this match.
     * @param previewText The text that is used to preview the match. The highlighted range in `previewText` is specified in `ranges`.
     */
    constructor(uri, ranges, previewText) {
        this.uri = uri;
        this.ranges = ranges;
        this.previewText = previewText;
    }
}
/**
 * The potential context information for a {@link TextSearchResult2}.
 */
export class TextSearchContext2 {
    /**
     * @param uri The uri for the matching document.
     * @param text The line of context text.
     * @param lineNumber The line number of this line of context.
     */
    constructor(uri, text, lineNumber) {
        this.uri = uri;
        this.text = text;
        this.lineNumber = lineNumber;
    }
}
/**
/**
 * Keyword suggestion for AI search.
 */
export class AISearchKeyword {
    /**
     * @param keyword The keyword associated with the search.
     */
    constructor(keyword) {
        this.keyword = keyword;
    }
}
/**
 * Options for following search.exclude and files.exclude settings.
 */
export var ExcludeSettingOptions;
(function (ExcludeSettingOptions) {
    /*
     * Don't use any exclude settings.
     */
    ExcludeSettingOptions[ExcludeSettingOptions["None"] = 1] = "None";
    /*
     * Use:
     * - files.exclude setting
     */
    ExcludeSettingOptions[ExcludeSettingOptions["FilesExclude"] = 2] = "FilesExclude";
    /*
     * Use:
     * - files.exclude setting
     * - search.exclude setting
     */
    ExcludeSettingOptions[ExcludeSettingOptions["SearchAndFilesExclude"] = 3] = "SearchAndFilesExclude";
})(ExcludeSettingOptions || (ExcludeSettingOptions = {}));
export var TextSearchCompleteMessageType;
(function (TextSearchCompleteMessageType) {
    TextSearchCompleteMessageType[TextSearchCompleteMessageType["Information"] = 1] = "Information";
    TextSearchCompleteMessageType[TextSearchCompleteMessageType["Warning"] = 2] = "Warning";
})(TextSearchCompleteMessageType || (TextSearchCompleteMessageType = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRXh0VHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2hFeHRUeXBlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxNQUFNLE9BQU8sUUFBUTtJQUNwQixZQUFxQixJQUFZLEVBQVcsU0FBaUI7UUFBeEMsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUFXLGNBQVMsR0FBVCxTQUFTLENBQVE7SUFBSSxDQUFDO0lBRWxFLFFBQVEsQ0FBQyxLQUFlLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3BELGVBQWUsQ0FBQyxLQUFlLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzNELE9BQU8sQ0FBQyxLQUFlLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ25ELGNBQWMsQ0FBQyxLQUFlLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzFELE9BQU8sQ0FBQyxLQUFlLElBQWEsT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ25ELFNBQVMsQ0FBQyxLQUFlLElBQVksT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBR2hELFNBQVMsQ0FBQyxDQUFPLEVBQUUsRUFBUSxJQUFjLE9BQU8sSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUdyRSxJQUFJLENBQUMsQ0FBTSxJQUFjLE9BQU8sSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUNyRDtBQUVELE1BQU0sT0FBTyxLQUFLO0lBSWpCLFlBQVksU0FBaUIsRUFBRSxRQUFnQixFQUFFLE9BQWUsRUFBRSxNQUFjO1FBS2hGLFlBQU8sR0FBRyxLQUFLLENBQUM7UUFDaEIsaUJBQVksR0FBRyxLQUFLLENBQUM7UUFMcEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLFFBQVEsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLFFBQVEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUlELFFBQVEsQ0FBQyxlQUFpQyxJQUFhLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN0RSxPQUFPLENBQUMsS0FBWSxJQUFhLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNoRCxZQUFZLENBQUMsS0FBWSxJQUF1QixPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDbkUsS0FBSyxDQUFDLEtBQVksSUFBVyxPQUFPLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUk1RCxJQUFJLENBQUMsQ0FBTSxJQUFXLE9BQU8sSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQ3JEO0FBc1BEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLGdCQUFnQjtJQUM1Qjs7OztPQUlHO0lBQ0gsWUFDUSxHQUFRLEVBQ1IsTUFBcUQsRUFDckQsV0FBbUI7UUFGbkIsUUFBRyxHQUFILEdBQUcsQ0FBSztRQUNSLFdBQU0sR0FBTixNQUFNLENBQStDO1FBQ3JELGdCQUFXLEdBQVgsV0FBVyxDQUFRO0lBQUksQ0FBQztDQUVoQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLGtCQUFrQjtJQUM5Qjs7OztPQUlHO0lBQ0gsWUFDUSxHQUFRLEVBQ1IsSUFBWSxFQUNaLFVBQWtCO1FBRmxCLFFBQUcsR0FBSCxHQUFHLENBQUs7UUFDUixTQUFJLEdBQUosSUFBSSxDQUFRO1FBQ1osZUFBVSxHQUFWLFVBQVUsQ0FBUTtJQUFJLENBQUM7Q0FDL0I7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sZUFBZTtJQUMzQjs7T0FFRztJQUNILFlBQW1CLE9BQWU7UUFBZixZQUFPLEdBQVAsT0FBTyxDQUFRO0lBQUksQ0FBQztDQUN2QztBQTJLRDs7R0FFRztBQUNILE1BQU0sQ0FBTixJQUFZLHFCQWdCWDtBQWhCRCxXQUFZLHFCQUFxQjtJQUNoQzs7T0FFRztJQUNILGlFQUFRLENBQUE7SUFDUjs7O09BR0c7SUFDSCxpRkFBZ0IsQ0FBQTtJQUNoQjs7OztPQUlHO0lBQ0gsbUdBQXlCLENBQUE7QUFDMUIsQ0FBQyxFQWhCVyxxQkFBcUIsS0FBckIscUJBQXFCLFFBZ0JoQztBQUVELE1BQU0sQ0FBTixJQUFZLDZCQUdYO0FBSEQsV0FBWSw2QkFBNkI7SUFDeEMsK0ZBQWUsQ0FBQTtJQUNmLHVGQUFXLENBQUE7QUFDWixDQUFDLEVBSFcsNkJBQTZCLEtBQTdCLDZCQUE2QixRQUd4QyJ9