/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class StickyRange {
    constructor(startLineNumber, endLineNumber) {
        this.startLineNumber = startLineNumber;
        this.endLineNumber = endLineNumber;
    }
}
export class StickyElement {
    constructor(
    /**
     * Range of line numbers spanned by the current scope
     */
    range, 
    /**
     * Must be sorted by start line number
    */
    children, 
    /**
     * Parent sticky outline element
     */
    parent) {
        this.range = range;
        this.children = children;
        this.parent = parent;
    }
}
export class StickyModel {
    constructor(uri, version, element, outlineProviderId) {
        this.uri = uri;
        this.version = version;
        this.element = element;
        this.outlineProviderId = outlineProviderId;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RpY2t5U2Nyb2xsRWxlbWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3N0aWNreVNjcm9sbC9icm93c2VyL3N0aWNreVNjcm9sbEVsZW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsTUFBTSxPQUFPLFdBQVc7SUFDdkIsWUFDaUIsZUFBdUIsRUFDdkIsYUFBcUI7UUFEckIsb0JBQWUsR0FBZixlQUFlLENBQVE7UUFDdkIsa0JBQWEsR0FBYixhQUFhLENBQVE7SUFDbEMsQ0FBQztDQUNMO0FBRUQsTUFBTSxPQUFPLGFBQWE7SUFFekI7SUFDQzs7T0FFRztJQUNhLEtBQThCO0lBQzlDOztNQUVFO0lBQ2MsUUFBeUI7SUFDekM7O09BRUc7SUFDYSxNQUFpQztRQVJqQyxVQUFLLEdBQUwsS0FBSyxDQUF5QjtRQUk5QixhQUFRLEdBQVIsUUFBUSxDQUFpQjtRQUl6QixXQUFNLEdBQU4sTUFBTSxDQUEyQjtJQUVsRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sV0FBVztJQUN2QixZQUNVLEdBQVEsRUFDUixPQUFlLEVBQ2YsT0FBa0MsRUFDbEMsaUJBQXFDO1FBSHJDLFFBQUcsR0FBSCxHQUFHLENBQUs7UUFDUixZQUFPLEdBQVAsT0FBTyxDQUFRO1FBQ2YsWUFBTyxHQUFQLE9BQU8sQ0FBMkI7UUFDbEMsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtJQUMzQyxDQUFDO0NBQ0wifQ==