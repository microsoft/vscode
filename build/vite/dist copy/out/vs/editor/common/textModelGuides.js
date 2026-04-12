/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var HorizontalGuidesState;
(function (HorizontalGuidesState) {
    HorizontalGuidesState[HorizontalGuidesState["Disabled"] = 0] = "Disabled";
    HorizontalGuidesState[HorizontalGuidesState["EnabledForActive"] = 1] = "EnabledForActive";
    HorizontalGuidesState[HorizontalGuidesState["Enabled"] = 2] = "Enabled";
})(HorizontalGuidesState || (HorizontalGuidesState = {}));
export class IndentGuide {
    constructor(visibleColumn, column, className, 
    /**
     * If set, this indent guide is a horizontal guide (no vertical part).
     * It starts at visibleColumn and continues until endColumn.
    */
    horizontalLine, 
    /**
     * If set (!= -1), only show this guide for wrapped lines that don't contain this model column, but are after it.
    */
    forWrappedLinesAfterColumn, forWrappedLinesBeforeOrAtColumn) {
        this.visibleColumn = visibleColumn;
        this.column = column;
        this.className = className;
        this.horizontalLine = horizontalLine;
        this.forWrappedLinesAfterColumn = forWrappedLinesAfterColumn;
        this.forWrappedLinesBeforeOrAtColumn = forWrappedLinesBeforeOrAtColumn;
        if ((visibleColumn !== -1) === (column !== -1)) {
            throw new Error();
        }
    }
}
export class IndentGuideHorizontalLine {
    constructor(top, endColumn) {
        this.top = top;
        this.endColumn = endColumn;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsR3VpZGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxHdWlkZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUE2QmhHLE1BQU0sQ0FBTixJQUFZLHFCQUlYO0FBSkQsV0FBWSxxQkFBcUI7SUFDaEMseUVBQVEsQ0FBQTtJQUNSLHlGQUFnQixDQUFBO0lBQ2hCLHVFQUFPLENBQUE7QUFDUixDQUFDLEVBSlcscUJBQXFCLEtBQXJCLHFCQUFxQixRQUloQztBQVFELE1BQU0sT0FBTyxXQUFXO0lBQ3ZCLFlBQ2lCLGFBQTBCLEVBQzFCLE1BQW1CLEVBQ25CLFNBQWlCO0lBQ2pDOzs7TUFHRTtJQUNjLGNBQWdEO0lBQ2hFOztNQUVFO0lBQ2MsMEJBQXVDLEVBQ3ZDLCtCQUE0QztRQVo1QyxrQkFBYSxHQUFiLGFBQWEsQ0FBYTtRQUMxQixXQUFNLEdBQU4sTUFBTSxDQUFhO1FBQ25CLGNBQVMsR0FBVCxTQUFTLENBQVE7UUFLakIsbUJBQWMsR0FBZCxjQUFjLENBQWtDO1FBSWhELCtCQUEwQixHQUExQiwwQkFBMEIsQ0FBYTtRQUN2QyxvQ0FBK0IsR0FBL0IsK0JBQStCLENBQWE7UUFFNUQsSUFBSSxDQUFDLGFBQWEsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNoRCxNQUFNLElBQUksS0FBSyxFQUFFLENBQUM7UUFDbkIsQ0FBQztJQUNGLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyx5QkFBeUI7SUFDckMsWUFDaUIsR0FBWSxFQUNaLFNBQWlCO1FBRGpCLFFBQUcsR0FBSCxHQUFHLENBQVM7UUFDWixjQUFTLEdBQVQsU0FBUyxDQUFRO0lBQzlCLENBQUM7Q0FDTCJ9