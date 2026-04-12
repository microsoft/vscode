/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var NotebookViewEventType;
(function (NotebookViewEventType) {
    NotebookViewEventType[NotebookViewEventType["LayoutChanged"] = 1] = "LayoutChanged";
    NotebookViewEventType[NotebookViewEventType["MetadataChanged"] = 2] = "MetadataChanged";
    NotebookViewEventType[NotebookViewEventType["CellStateChanged"] = 3] = "CellStateChanged";
})(NotebookViewEventType || (NotebookViewEventType = {}));
export class NotebookLayoutChangedEvent {
    constructor(source, value) {
        this.source = source;
        this.value = value;
        this.type = NotebookViewEventType.LayoutChanged;
    }
}
export class NotebookMetadataChangedEvent {
    constructor(source) {
        this.source = source;
        this.type = NotebookViewEventType.MetadataChanged;
    }
}
export class NotebookCellStateChangedEvent {
    constructor(source, cell) {
        this.source = source;
        this.cell = cell;
        this.type = NotebookViewEventType.CellStateChanged;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tWaWV3RXZlbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va1ZpZXdFdmVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUF1Q2hHLE1BQU0sQ0FBTixJQUFZLHFCQUlYO0FBSkQsV0FBWSxxQkFBcUI7SUFDaEMsbUZBQWlCLENBQUE7SUFDakIsdUZBQW1CLENBQUE7SUFDbkIseUZBQW9CLENBQUE7QUFDckIsQ0FBQyxFQUpXLHFCQUFxQixLQUFyQixxQkFBcUIsUUFJaEM7QUFFRCxNQUFNLE9BQU8sMEJBQTBCO0lBR3RDLFlBQXFCLE1BQWlDLEVBQVcsS0FBeUI7UUFBckUsV0FBTSxHQUFOLE1BQU0sQ0FBMkI7UUFBVyxVQUFLLEdBQUwsS0FBSyxDQUFvQjtRQUYxRSxTQUFJLEdBQUcscUJBQXFCLENBQUMsYUFBYSxDQUFDO0lBSTNELENBQUM7Q0FDRDtBQUdELE1BQU0sT0FBTyw0QkFBNEI7SUFHeEMsWUFBcUIsTUFBZ0M7UUFBaEMsV0FBTSxHQUFOLE1BQU0sQ0FBMEI7UUFGckMsU0FBSSxHQUFHLHFCQUFxQixDQUFDLGVBQWUsQ0FBQztJQUk3RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sNkJBQTZCO0lBR3pDLFlBQXFCLE1BQXFDLEVBQVcsSUFBMkI7UUFBM0UsV0FBTSxHQUFOLE1BQU0sQ0FBK0I7UUFBVyxTQUFJLEdBQUosSUFBSSxDQUF1QjtRQUZoRixTQUFJLEdBQUcscUJBQXFCLENBQUMsZ0JBQWdCLENBQUM7SUFJOUQsQ0FBQztDQUNEIn0=