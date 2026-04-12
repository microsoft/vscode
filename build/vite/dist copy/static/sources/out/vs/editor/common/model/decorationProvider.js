/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class LineHeightChangingDecoration {
    static toKey(obj) {
        return `${obj.ownerId};${obj.decorationId};${obj.lineNumber}`;
    }
    constructor(ownerId, decorationId, lineNumber, lineHeight) {
        this.ownerId = ownerId;
        this.decorationId = decorationId;
        this.lineNumber = lineNumber;
        this.lineHeight = lineHeight;
    }
}
export class LineFontChangingDecoration {
    static toKey(obj) {
        return `${obj.ownerId};${obj.decorationId};${obj.lineNumber}`;
    }
    constructor(ownerId, decorationId, lineNumber) {
        this.ownerId = ownerId;
        this.decorationId = decorationId;
        this.lineNumber = lineNumber;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvblByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9tb2RlbC9kZWNvcmF0aW9uUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUF5QmhHLE1BQU0sT0FBTyw0QkFBNEI7SUFFakMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFpQztRQUNwRCxPQUFPLEdBQUcsR0FBRyxDQUFDLE9BQU8sSUFBSSxHQUFHLENBQUMsWUFBWSxJQUFJLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUMvRCxDQUFDO0lBRUQsWUFDaUIsT0FBZSxFQUNmLFlBQW9CLEVBQ3BCLFVBQWtCLEVBQ2xCLFVBQXlCO1FBSHpCLFlBQU8sR0FBUCxPQUFPLENBQVE7UUFDZixpQkFBWSxHQUFaLFlBQVksQ0FBUTtRQUNwQixlQUFVLEdBQVYsVUFBVSxDQUFRO1FBQ2xCLGVBQVUsR0FBVixVQUFVLENBQWU7SUFDdEMsQ0FBQztDQUNMO0FBRUQsTUFBTSxPQUFPLDBCQUEwQjtJQUUvQixNQUFNLENBQUMsS0FBSyxDQUFDLEdBQStCO1FBQ2xELE9BQU8sR0FBRyxHQUFHLENBQUMsT0FBTyxJQUFJLEdBQUcsQ0FBQyxZQUFZLElBQUksR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQy9ELENBQUM7SUFFRCxZQUNpQixPQUFlLEVBQ2YsWUFBb0IsRUFDcEIsVUFBa0I7UUFGbEIsWUFBTyxHQUFQLE9BQU8sQ0FBUTtRQUNmLGlCQUFZLEdBQVosWUFBWSxDQUFRO1FBQ3BCLGVBQVUsR0FBVixVQUFVLENBQVE7SUFDL0IsQ0FBQztDQUNMIn0=